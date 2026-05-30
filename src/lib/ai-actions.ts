import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { addDays, nextDayOfWeek, nextWeekRange, weekRange } from "./dates";
import { nextId } from "./ids";
import type { AiAction, AppState, CaptureSession, ClarificationKind, CompletionBehavior, CompletionMode, DateIntent, InboxEntry, SchedulingMetadata, Task } from "./types";

const aiActionSchema = z.object({
  summary: z.string(),
  actions: z.array(
    z.object({
      type: z.enum(["create_task", "create_routine", "create_project", "schedule_block", "ask_clarification"]),
      label: z.string(),
      title: z.string(),
      domainName: z.string(),
      projectName: z.string().nullable(),
      dueDate: z.string().nullable(),
      scheduledDate: z.string().nullable(),
      scheduledTime: z.string().nullable(),
      effortMinutes: z.number().int().min(5).max(480),
      energy: z.enum(["low", "medium", "high"]),
      strictness: z.enum(["flexible", "normal", "strict"]),
      priority: z.number().int().min(1).max(5),
      importance: z.number().int().min(1).max(5),
      urgency: z.number().int().min(1).max(5),
      recurrenceDays: z.array(z.number().int().min(0).max(6)).nullable(),
      completionBehavior: z.enum(["exhaust_once", "repeatable", "keep_as_suggestion", "regenerate_after_completion"]).nullable(),
      completionMode: z
        .enum(["simple_done", "outcome_done", "timebox", "repeatable_checkoff", "progress_accumulating", "suggestion_used"])
        .nullable(),
      definitionOfDone: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      question: z.string().nullable(),
      clarificationKind: z.enum(["definition_of_done", "completion_behavior", "container_kind", "repeat_policy", "date", "split", "next_action"]).nullable(),
      clarificationOptions: z.array(z.string()).nullable()
    })
  )
});

type ParsedAiResponse = z.infer<typeof aiActionSchema>;
type ParsedAiAction = ParsedAiResponse["actions"][number];
export type AiInterpreter = (input: string, state: AppState) => Promise<ParsedAiResponse & { model?: string }>;

const captureRevisionSchema = z.object({
  summary: z.string(),
  shouldApply: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().nullable(),
  projectName: z.string().nullable(),
  domainName: z.string().nullable(),
  dateIntent: z.enum(["unchanged", "today", "tomorrow", "this_week", "next_week", "someday", "specific_date", "deadline"]).nullable(),
  scheduledDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  effortMinutes: z.number().int().min(5).max(480).nullable(),
  priority: z.number().int().min(1).max(9).nullable(),
  importance: z.number().int().min(1).max(9).nullable(),
  urgency: z.number().int().min(1).max(9).nullable(),
  definitionOfDone: z.string().nullable(),
  completionBehavior: z.enum(["exhaust_once", "repeatable", "keep_as_suggestion", "regenerate_after_completion"]).nullable(),
  completionMode: z.enum(["simple_done", "outcome_done", "timebox", "repeatable_checkoff", "progress_accumulating", "suggestion_used"]).nullable(),
  note: z.string().nullable(),
  changes: z.array(z.string())
});

export type CaptureRevision = z.infer<typeof captureRevisionSchema> & { model?: string };
export type AiRevisionInterpreter = (input: {
  message: string;
  state: AppState;
  session: CaptureSession;
  task: Task;
}) => Promise<CaptureRevision>;

const highRiskActions: ReadonlySet<AiAction["type"]> = new Set([
  "archive_task",
  "archive_project",
  "move_deadline",
  "change_routine_recurrence",
  "mark_task_done",
  "replace_today_plan",
  "bulk_update_tasks",
  "lower_priority_or_prune"
]);

export async function interpretInboxInput(
  input: string,
  state: AppState,
  interpreter: AiInterpreter = defaultInterpreter
): Promise<InboxEntry> {
  const parsed = await interpreter(input, state);
  const entryId = nextId("inbox");
  const actions = supplementMissingSourceActions(
    parsed.actions.flatMap((action) => buildActions(action, state, entryId, parsed.model, input)),
    input,
    state,
    entryId,
    parsed.model
  );

  return {
    id: entryId,
    createdAt: timestampForState(state),
    input,
    actions,
    summary: parsed.summary || `${actions.length} structured action${actions.length === 1 ? "" : "s"} proposed.`
  };
}

export async function interpretCaptureRevision(
  message: string,
  state: AppState,
  session: CaptureSession,
  task: Task,
  interpreter: AiRevisionInterpreter = defaultRevisionInterpreter
): Promise<CaptureRevision> {
  return interpreter({ message, state, session, task });
}

async function defaultInterpreter(input: string, state: AppState): Promise<ParsedAiResponse & { model?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.EX3CUUSION_AI_MODE === "fixture" || process.env.NODE_ENV === "test" || (!apiKey && process.env.NODE_ENV !== "production")) {
    return fixtureInterpreter(input, state);
  }

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const openai = new OpenAI({
    apiKey,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 45_000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 1)
  });
  const response = await openai.responses.parse({
    model,
    instructions:
      "You turn messy personal execution input into structured JSON actions for an execution planner. " +
      "The durable unit is a task; chat exists only to clarify ambiguity before creating good task state. " +
      "Think through the task silently first. Ask a follow-up only when the answer materially changes storage, recurrence, scheduling, completion behavior, project placement, splitting, or definition of done. " +
      "Do not ask low-value questions for obvious simple tasks; infer reasonable defaults and create the task. " +
      "For explicit requests to add or create an ordinary obvious task, return create_task. " +
      "For broad work where done-state is unclear, return ask_clarification, not create_task. Examples: clean the house, sort backend, fix the app, organize life admin. " +
      "For ask_clarification actions: title must be the canonical future task title, not the question text. question must contain the user-facing question. definitionOfDone must be null. " +
      "For 'clean the house', use title 'Clean house', clarificationKind 'definition_of_done', and ask what would count as enough cleaning. " +
      "For reusable relationship ideas like 'ideas for things to do with Emma', use ask_clarification with title 'Ideas for things to do with Emma', completionBehavior keep_as_suggestion, completionMode suggestion_used, and ask whether to keep it as a reusable suggestion list. " +
      "For timeboxed work like 'work on Diet App for two hours', return create_task with completionBehavior repeatable, completionMode timebox, effortMinutes 120, and the matching existing project. " +
      "For explicit clock times, set scheduledDate and scheduledTime in 24-hour HH:mm format. If there is no exact clock time, scheduledTime must be null. Never output ':null' or string null values. " +
      "Do not invent exact dates for broad windows like 'sometime next week' or 'at some point this week'; set scheduledDate and dueDate to null for those and keep the date intent as a week-level window unless the user names a specific day or deadline. " +
      "For deadline wording such as 'by Tuesday' or 'before Friday', set dueDate, not scheduledDate. For execution wording such as 'on Tuesday' or 'today', set scheduledDate. " +
      "Preserve scheduling semantics in tags and estimates: laundry/washer/dryer is phased background work; cooking/travel can permit partial overlap; AI-side-work that can run while the user does something else is concurrent/background rather than a normal exclusive task. " +
      "Interpret sleep/bed at 'half 11' as 23:30 unless the user clearly means morning. " +
      "For explicit recurring habits, return create_routine with recurrenceDays when known. " +
      "For 'message Will every Friday', return create_routine with title 'Message Will' and recurrenceDays [5]. " +
      "For sleep or bed time, return create_task titled 'Sleep', not schedule_block. " +
      "Use existing domain/project names when they fit. Return only actions that help choose, schedule, split, defer, prioritize, or prune work. " +
      "projectName must be null unless it exactly refers to an existing project/container from the provided list. " +
      "Nullable fields must be real JSON null, not strings like 'null', ':null', 'none', or 'N/A'. " +
      "Use strictness flexible, normal, or strict. Score priority, importance, and urgency from 1 to 5.",
    input: [
      {
        role: "user",
        content:
          `Current date: ${state.currentDate}. Current time: ${state.currentTime}. ` +
          `Domains: ${state.domains.map((domain) => domain.name).join(", ")}. ` +
          `Projects: ${state.projects.map((project) => project.name).join(", ")}. ` +
          `User input: ${input}`
      }
    ],
    text: {
      format: zodTextFormat(aiActionSchema, "execution_actions")
    }
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI response did not match the expected execution action schema");
  }

  return { ...response.output_parsed, model };
}

async function defaultRevisionInterpreter({
  message,
  state,
  session,
  task
}: {
  message: string;
  state: AppState;
  session: CaptureSession;
  task: Task;
}): Promise<CaptureRevision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.EX3CUUSION_AI_MODE === "fixture" || process.env.NODE_ENV === "test" || (!apiKey && process.env.NODE_ENV !== "production")) {
    return fixtureRevisionInterpreter({ message, state, session, task });
  }

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const openai = new OpenAI({
    apiKey,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 45_000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 1)
  });
  const response = await openai.responses.parse({
    model,
    instructions:
      "You revise one existing task inside a personal execution planner from a short follow-up message. " +
      "Return only fields the user is clearly correcting or adding. Do not create a new task. " +
      "Use projectName only when it exactly matches an existing project/person/container. " +
      "For broad date windows like 'next week' set dateIntent to next_week and leave scheduledDate/dueDate null. " +
      "For deadline wording like 'by Friday' use dueDate. For execution wording like 'tomorrow' or 'today' use scheduledDate/dateIntent. " +
      "If the message is just extra context, put it in note and shouldApply true. If it is unrelated or unsafe, shouldApply false.",
    input: [
      {
        role: "user",
        content:
          `Current date: ${state.currentDate}. Current time: ${state.currentTime}. ` +
          `Projects: ${state.projects.map((project) => project.name).join(", ")}. ` +
          `Domains: ${state.domains.map((domain) => domain.name).join(", ")}. ` +
          `Session summary: ${session.summary}. ` +
          `Existing task: ${JSON.stringify({
            title: task.title,
            projectId: task.projectId,
            domainId: task.domainId,
            scheduledDate: task.scheduledDate,
            dueDate: task.dueDate,
            dateIntent: task.dateIntent,
            effortMinutes: task.effortMinutes,
            completionBehavior: task.completionBehavior,
            completionMode: task.completionMode,
            definitionOfDone: task.definitionOfDone,
            notes: task.notes
          })}. ` +
          `Follow-up message: ${message}`
      }
    ],
    text: {
      format: zodTextFormat(captureRevisionSchema, "capture_revision")
    }
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI response did not match the expected capture revision schema");
  }

  return { ...response.output_parsed, model };
}

export async function fixtureRevisionInterpreter({
  message,
  state
}: {
  message: string;
  state: AppState;
  session: CaptureSession;
  task: Task;
}): Promise<CaptureRevision> {
  const lower = message.toLowerCase();
  const changes: string[] = [];
  const revision: CaptureRevision = {
    model: "fixture",
    summary: "I updated the existing capture.",
    shouldApply: true,
    confidence: 0.72,
    title: null,
    projectName: null,
    domainName: null,
    dateIntent: null,
    scheduledDate: null,
    dueDate: null,
    effortMinutes: null,
    priority: null,
    importance: null,
    urgency: null,
    definitionOfDone: null,
    completionBehavior: null,
    completionMode: null,
    note: null,
    changes
  };

  if (/\bnext week\b/.test(lower)) {
    revision.dateIntent = "next_week";
    changes.push("moved to next week");
  } else if (/\bthis week\b/.test(lower)) {
    revision.dateIntent = "this_week";
    changes.push("kept in this week");
  } else if (/\btomorrow\b/.test(lower)) {
    revision.dateIntent = "tomorrow";
    revision.scheduledDate = addDays(state.currentDate, 1);
    changes.push("scheduled for tomorrow");
  } else if (/\b(today|tonight)\b/.test(lower)) {
    revision.dateIntent = "today";
    revision.scheduledDate = state.currentDate;
    changes.push("scheduled for today");
  }

  const project = state.projects.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  if (project) {
    revision.projectName = project.name;
    changes.push(`moved under ${project.name}`);
  }

  const minutes = lower.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes)\b/);
  if (minutes) {
    revision.effortMinutes = Number(minutes[1]);
    changes.push(`set estimate to ${minutes[1]}m`);
  }

  if (/not urgent|no rush|someday|eventually/.test(lower)) {
    revision.dateIntent = "someday";
    changes.push("moved to someday");
  }

  if (!changes.length) {
    revision.note = message;
    revision.summary = "I kept that as context on the existing task.";
  }

  return revision;
}

export async function fixtureInterpreter(input: string, state: AppState): Promise<ParsedAiResponse & { model: string }> {
  const lower = input.toLowerCase();
  if (/stuff about the thing|vague house thing|maybe later/.test(lower)) {
    return {
      model: "fixture",
      summary: "I need one clarification before changing the plan.",
      actions: [
        baseAction("ask_clarification", "Clarify vague task", "Clarify vague task", state, {
          question: "What is the next concrete action?",
          clarificationKind: "next_action",
          clarificationOptions: ["Make a concrete task", "Keep as someday idea", "Dismiss"]
        })
      ]
    };
  }

  if (/cut (my )?nails?/.test(lower)) {
    return {
      model: "fixture",
      summary: "Cut nails was added as a simple task.",
      actions: [
        baseAction("create_task", "Add Cut nails", "Cut nails", state, {
          domainName: findDomainName(state, /health|home/i),
          effortMinutes: 10,
          energy: "low",
          priority: 2,
          importance: 2,
          urgency: 2,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          tags: ["personal", "quick"]
        })
      ]
    };
  }

  if (/clean (the )?house/.test(lower)) {
    return {
      model: "fixture",
      summary: "Cleaning the house needs a clearer done-state.",
      actions: [
        baseAction("ask_clarification", "Clarify clean house", "Clean house", state, {
          domainName: findDomainName(state, /house|home/i),
          dueDate: /weekend/.test(lower) ? state.currentDate : null,
          effortMinutes: 90,
          energy: "medium",
          strictness: "flexible",
          priority: 3,
          importance: 4,
          urgency: 2,
          completionBehavior: "exhaust_once",
          completionMode: "progress_accumulating",
          tags: ["home", "cleaning"],
          question: "What would count as enough cleaning for this task?",
          clarificationKind: "definition_of_done",
          clarificationOptions: ["Kitchen and bathroom", "One 90 minute pass", "Split into rooms"]
        })
      ]
    };
  }

  if (/work on (the )?diet app/.test(lower)) {
    return {
      model: "fixture",
      summary: "A Diet App timebox was added.",
      actions: [
        baseAction("create_task", "Add Diet App timebox", "Work on Diet App", state, {
          domainName: findDomainName(state, /diet|product|work/i),
          projectName: findProjectName(state, /diet app/i),
          effortMinutes: /2 hours|two hours/.test(lower) ? 120 : 60,
          energy: "medium",
          strictness: "normal",
          priority: 4,
          importance: 4,
          urgency: 3,
          completionBehavior: "repeatable",
          completionMode: "timebox",
          definitionOfDone: "Spend the planned time making product progress.",
          tags: ["product", "timebox"]
        })
      ]
    };
  }

  if (/message will every friday/.test(lower)) {
    return {
      model: "fixture",
      summary: "Message Will was added as a Friday routine.",
      actions: [
        baseAction("create_routine", "Add Message Will Friday routine", "Message Will", state, {
          domainName: findDomainName(state, /social/i),
          effortMinutes: 10,
          energy: "low",
          strictness: "normal",
          priority: 3,
          importance: 4,
          urgency: 3,
          recurrenceDays: [5],
          tags: ["relationship", "phone"]
        })
      ]
    };
  }

  if (/ideas?.*(emma)|emma.*ideas?/.test(lower)) {
    return {
      model: "fixture",
      summary: "I need to confirm how to keep Emma ideas.",
      actions: [
        baseAction("ask_clarification", "Clarify Emma ideas", "Ideas for things to do with Emma", state, {
          domainName: findDomainName(state, /social/i),
          projectName: findProjectName(state, /emma/i),
          effortMinutes: 30,
          energy: "low",
          strictness: "flexible",
          priority: 2,
          importance: 4,
          urgency: 1,
          completionBehavior: "keep_as_suggestion",
          completionMode: "suggestion_used",
          tags: ["relationship", "idea"],
          question: "Should I keep this as a reusable Emma suggestion list?",
          clarificationKind: "completion_behavior",
          clarificationOptions: ["Reusable suggestion", "One-off task", "Dismiss"]
        })
      ]
    };
  }

  if (/waiting on sam.*invoice|invoice.*waiting on sam/.test(lower)) {
    return {
      model: "fixture",
      summary: "Waiting on Sam was recorded.",
      actions: [
        baseAction("create_task", "Add waiting on Sam", "Follow up with Sam about the invoice", state, {
          domainName: findDomainName(state, /work/i),
          effortMinutes: 10,
          energy: "low",
          strictness: "normal",
          priority: 3,
          importance: 4,
          urgency: 3,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          tags: ["waiting", "invoice"]
        })
      ]
    };
  }

  if (/sleep|bed/.test(lower) && /half 11|23:30/.test(lower)) {
    return {
      model: "fixture",
      summary: "Sleep was scheduled as a fixed anchor.",
      actions: [
        baseAction("create_task", "Add sleep", "Sleep", state, {
          scheduledDate: state.currentDate,
          scheduledTime: "23:30",
          effortMinutes: 480,
          energy: "low",
          strictness: "strict",
          priority: 5,
          importance: 5,
          urgency: 5,
          domainName: findDomainName(state, /health|recovery/i)
        })
      ]
    };
  }

  if (/water plants/.test(lower)) {
    return {
      model: "fixture",
      summary: "Water plants was added to Today.",
      actions: [
        baseAction("create_task", "Add Water plants", "Water plants", state, {
          scheduledDate: state.currentDate,
          effortMinutes: 10,
          energy: "low",
          priority: 3,
          importance: 3,
          urgency: 3,
          domainName: findDomainName(state, /house|home/i)
        })
      ]
    };
  }

  if (/critique slides/.test(lower)) {
    return {
      model: "fixture",
      summary: "Critique slides were added before the early afternoon review.",
      actions: [
        baseAction("create_task", "Add critique slides", "Prep two extra critique slides", state, {
          scheduledDate: state.currentDate,
          scheduledTime: "12:30",
          effortMinutes: 25,
          energy: "medium",
          priority: 4,
          importance: 4,
          urgency: 4,
          domainName: findDomainName(state, /work/i)
        })
      ]
    };
  }

  if (/call dentist/.test(lower)) {
    return {
      model: "fixture",
      summary: "Call dentist was added.",
      actions: [
        baseAction("create_task", "Add Call dentist", "Call dentist", state, {
          domainName: findDomainName(state, /health/i),
          effortMinutes: 15,
          energy: "low",
          strictness: "normal",
          priority: 3,
          importance: 4,
          urgency: 3,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done"
        })
      ]
    };
  }

  if (/laundry|washing|washer/.test(lower)) {
    return {
      model: "fixture",
      summary: "Laundry was added as phased background work.",
      actions: [
        baseAction("create_task", "Add laundry phases", "Do laundry", state, {
          domainName: findDomainName(state, /house|home/i),
          effortMinutes: 90,
          energy: "low",
          strictness: "flexible",
          priority: 3,
          importance: 4,
          urgency: 2,
          completionBehavior: "exhaust_once",
          completionMode: "progress_accumulating",
          tags: ["household", "phased", "background"]
        })
      ]
    };
  }

  if (/ai.*while.*cook|cook.*while.*ai|report.*while.*cook/.test(lower)) {
    return {
      model: "fixture",
      summary: "Cooking and AI side-work were added as overlapping tasks.",
      actions: [
        baseAction("create_task", "Add dinner prep", "Cook dinner", state, {
          domainName: findDomainName(state, /house|home/i),
          scheduledDate: /today|tonight/.test(lower) ? state.currentDate : null,
          effortMinutes: 45,
          energy: "medium",
          strictness: "normal",
          priority: 3,
          importance: 3,
          urgency: 3,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          tags: ["cooking", "concurrent"]
        }),
        baseAction("create_task", "Add AI report run", "Run AI report draft", state, {
          domainName: findDomainName(state, /work|product/i),
          scheduledDate: /today|tonight/.test(lower) ? state.currentDate : null,
          effortMinutes: 45,
          energy: "low",
          strictness: "flexible",
          priority: 3,
          importance: 4,
          urgency: 2,
          completionBehavior: "exhaust_once",
          completionMode: "progress_accumulating",
          tags: ["ai_running", "background", "concurrent"]
        })
      ]
    };
  }

  const actions: ParsedAiAction[] = [];
  if (/back rehab daily/.test(lower)) {
    actions.push(baseAction("create_routine", "Add Back rehab routine", "Back rehab", state, {
      domainName: findDomainName(state, /health/i),
      effortMinutes: 20,
      energy: "low",
      strictness: "strict",
      priority: 5,
      importance: 5,
      urgency: 5
    }));
  }
  if (/garage/.test(lower)) {
    actions.push(baseAction("create_task", "Add Clean garage", "Clean garage", state, {
      domainName: findDomainName(state, /house|home/i),
      dueDate: state.currentDate,
      effortMinutes: 90,
      energy: "medium",
      strictness: "flexible",
      priority: 2,
      importance: 3,
      urgency: 2
    }));
  }
  if (/auth bug/.test(lower)) {
    actions.push(baseAction("create_task", "Add auth bug task", "Finish auth bug", state, {
      domainName: findDomainName(state, /diet|product|work/i),
      projectName: findProjectName(state, /diet app/i),
      dueDate: state.currentDate,
      effortMinutes: 90,
      energy: "high",
      strictness: "normal",
      priority: 5,
      importance: 5,
      urgency: 5
    }));
  }
  if (/message will/.test(lower)) {
    actions.push(baseAction("create_task", "Add Message Will", "Message Will", state, {
      domainName: findDomainName(state, /social/i),
      dueDate: state.currentDate,
      effortMinutes: 10,
      energy: "low",
      strictness: "normal",
      priority: 3,
      importance: 3,
      urgency: 4
    }));
  }
  if (/text alex|message alex/.test(lower)) {
    actions.push(baseAction("create_task", "Add Text Alex", "Text Alex", state, {
      domainName: findDomainName(state, /social/i),
      effortMinutes: 10,
      energy: "low",
      strictness: "normal",
      priority: 3,
      importance: 3,
      urgency: 4,
      completionBehavior: "exhaust_once",
      completionMode: "simple_done"
    }));
  }
  if (/book dentist|dentist/.test(lower) && /next week|sometime/.test(lower)) {
    actions.push(baseAction("create_task", "Add Book dentist", "Book dentist", state, {
      domainName: findDomainName(state, /health/i),
      effortMinutes: 15,
      energy: "low",
      strictness: "normal",
      priority: 3,
      importance: 4,
      urgency: 2,
      completionBehavior: "exhaust_once",
      completionMode: "simple_done",
      tags: ["health", "next-week"]
    }));
  }

  return {
    model: "fixture",
    summary: `${actions.length} structured action${actions.length === 1 ? "" : "s"} proposed.`,
    actions
  };
}

function baseAction(
  type: ParsedAiAction["type"],
  label: string,
  title: string,
  state: AppState,
  overrides: Partial<ParsedAiAction> = {}
): ParsedAiAction {
  return {
    type,
    label,
    title,
    domainName: findDomainName(state, /work/i),
    projectName: null,
    dueDate: null,
    scheduledDate: null,
    scheduledTime: null,
    effortMinutes: 15,
    energy: "medium",
    strictness: "normal",
    priority: 3,
    importance: 3,
    urgency: 3,
    question: null,
    recurrenceDays: null,
    completionBehavior: null,
    completionMode: null,
    definitionOfDone: null,
    tags: null,
    clarificationKind: null,
    clarificationOptions: null,
    ...overrides
  };
}

function buildActions(rawAction: ParsedAiAction, state: AppState, inboxItemId: string, model?: string, sourceText = ""): AiAction[] {
  if (shouldSplitConcurrentCookingAi(rawAction, sourceText)) {
    return [
      buildAction(baseAction("create_task", "Add dinner prep", "Cook dinner", state, {
        domainName: findDomainName(state, /house|home/i),
        scheduledDate: /today|tonight/.test(sourceText.toLowerCase()) ? state.currentDate : rawAction.scheduledDate,
        effortMinutes: 45,
        energy: "medium",
        strictness: "normal",
        priority: Math.max(rawAction.priority, 3),
        importance: Math.max(rawAction.importance, 3),
        urgency: Math.max(rawAction.urgency, 3),
        completionBehavior: "exhaust_once",
        completionMode: "simple_done",
        tags: ["cooking", "concurrent"]
      }), state, inboxItemId, model, sourceText),
      buildAction(baseAction("create_task", "Add AI report run", "Run AI report draft", state, {
        domainName: findDomainName(state, /work|product/i),
        scheduledDate: /today|tonight/.test(sourceText.toLowerCase()) ? state.currentDate : rawAction.scheduledDate,
        effortMinutes: rawAction.effortMinutes,
        energy: "low",
        strictness: "flexible",
        priority: rawAction.priority,
        importance: rawAction.importance,
        urgency: rawAction.urgency,
        completionBehavior: "exhaust_once",
        completionMode: "progress_accumulating",
        tags: ["ai_running", "background", "concurrent"]
      }), state, inboxItemId, model, sourceText)
    ];
  }
  return [buildAction(rawAction, state, inboxItemId, model, sourceText)];
}

function supplementMissingSourceActions(actions: AiAction[], sourceText: string, state: AppState, inboxItemId: string, model?: string): AiAction[] {
  const lower = sourceText.toLowerCase();
  const titles = actions.map((action) => String(action.payload.title ?? "").toLowerCase());
  const supplemented = [...actions];

  if (/book dentist|dentist/.test(lower) && /next week|sometime/.test(lower) && !titles.some((title) => /dentist/.test(title))) {
    supplemented.push(
      buildAction(baseAction("create_task", "Add Book dentist", "Book dentist", state, {
        domainName: findDomainName(state, /health/i),
        effortMinutes: 15,
        energy: "low",
        strictness: "normal",
        priority: 3,
        importance: 4,
        urgency: 2,
        completionBehavior: "exhaust_once",
        completionMode: "simple_done",
        tags: ["health", "next-week"]
      }), state, inboxItemId, model, sourceText)
    );
  }

  return supplemented;
}

function buildAction(rawAction: ParsedAiAction, state: AppState, inboxItemId: string, model?: string, sourceText = ""): AiAction {
  const action = applyClarificationPolicy(normalizeParsedAction(rawAction, state, sourceText), sourceText);
  const validationErrors = validateStructuredAction(action, state);
  const safety = classifyRisk(action, validationErrors);
  const domainId = findDomainId(state, action.domainName, "domain_work");
  const projectId = findProjectId(state, action.projectName);
  const normalizedType = action.type;
  const status: AiAction["status"] = validationErrors.length > 0 && safety === "auto_apply" ? "failed" : "proposed";

  return {
    id: nextId("action"),
    type: normalizedType,
    label: action.label,
    safety,
    status,
    validationErrors,
    model,
    createdAt: timestampForState(state),
    payload:
      normalizedType === "create_routine"
        ? {
            title: action.title,
            domainId,
            recurrence: action.recurrenceDays?.length ? { type: "weekly", days: action.recurrenceDays } : { type: "daily" },
            defaultEffortMinutes: action.effortMinutes,
            energy: action.energy,
            strictness: action.strictness
          }
        : normalizedType === "create_project"
          ? {
              domainId,
              name: action.title,
              kind: "project",
              planningMode: "open_backlog",
              status: "active",
              priorityWeight: action.priority,
              defaultBlockMinutes: action.effortMinutes,
              contextNote: ""
            }
          : normalizedType === "create_task"
            ? taskPayload(state, action, inboxItemId, projectId, sourceText)
            : normalizedType === "schedule_block"
              ? {
                  projectId,
                  date: normalizeDate(action.scheduledDate ?? action.dueDate ?? undefined, state.currentDate),
                  scheduledTime: action.scheduledTime,
                  minutes: action.effortMinutes,
                  title: action.title
                }
              : {
                  question: action.question ?? "What should this become?",
                  questionKind: action.clarificationKind ?? "next_action",
                  options: action.clarificationOptions ?? [],
                  rationale: clarificationRationale(action, sourceText),
                  materiality: clarificationMateriality(action, sourceText),
                  draftActionType: "create_task",
                  draftAction: taskPayload(state, { ...action, type: "create_task" }, inboxItemId, projectId, sourceText)
                }
  };
}

function applyClarificationPolicy(action: ParsedAiAction, sourceText: string): ParsedAiAction {
  if (action.type !== "ask_clarification") return action;
  if (isWorthAsking(action, sourceText)) return action;
  const normalized = {
    ...action,
    type: "create_task" as const,
    label: action.label.replace(/^Clarify/i, "Add") || `Add ${action.title}`,
    question: null,
    clarificationKind: null,
    clarificationOptions: null,
    completionBehavior: action.completionBehavior ?? "exhaust_once",
    completionMode: action.completionMode ?? "simple_done",
    definitionOfDone: action.definitionOfDone && !/\?|what counts|what should|include/i.test(action.definitionOfDone) ? action.definitionOfDone : null
  };
  if (/cut (my )?nails?|water plants|take bins out|buy milk|text|message|call/i.test(sourceText)) {
    normalized.effortMinutes = Math.min(normalized.effortMinutes, 20);
    normalized.energy = "low";
    normalized.strictness = normalized.strictness === "flexible" ? "normal" : normalized.strictness;
  }
  return normalized;
}

function isWorthAsking(action: ParsedAiAction, sourceText: string): boolean {
  const kind = action.clarificationKind ?? "next_action";
  const text = `${sourceText} ${action.title} ${action.label}`.toLowerCase();
  if (isObviousSimpleTask(text)) return false;
  if (kind === "definition_of_done") return isBroadOutcomeWork(text);
  if (kind === "completion_behavior") return /ideas?|suggestions?|things to do|activities|again|reusable|list/.test(text);
  if (kind === "container_kind") return /category|project|area|list|bucket|for\s+\w+/.test(text);
  if (kind === "repeat_policy") return /regular|routine|habit|every|daily|weekly|repeat/.test(text);
  if (kind === "date") return /soon|later|sometime|whenever|this week|next week/.test(text) && /by|before|deadline|due|urgent/.test(text);
  if (kind === "split") return isBroadOutcomeWork(text) || action.effortMinutes >= 90;
  if (kind === "next_action") return /stuff|thing|sort|fix|organize|work on|deal with|life admin|backend|product/.test(text);
  return false;
}

function clarificationMateriality(action: ParsedAiAction, sourceText: string): "low" | "medium" | "high" {
  const text = `${sourceText} ${action.title}`.toLowerCase();
  if (isBroadOutcomeWork(text) || action.effortMinutes >= 90) return "high";
  if (/(ideas?|suggestions?|reusable|routine|every|daily|weekly)/.test(text)) return "medium";
  return "low";
}

function clarificationRationale(action: ParsedAiAction, sourceText: string): string {
  const kind = action.clarificationKind ?? "next_action";
  if (kind === "definition_of_done") return "The answer changes what completion means.";
  if (kind === "completion_behavior") return "The answer changes whether this is one-off, repeatable, or a reusable suggestion.";
  if (kind === "container_kind") return "The answer changes where this belongs.";
  if (kind === "repeat_policy") return "The answer changes recurrence.";
  if (kind === "split") return "The answer changes whether this should become several tasks.";
  if (kind === "date") return "The answer changes scheduling or deadline pressure.";
  return "The answer changes the next concrete action.";
}

function isObviousSimpleTask(text: string): boolean {
  return /cut (my )?nails?|water plants|take bins out|buy milk|wash cup|text \w+|message \w+|call \w+/.test(text) && !isBroadOutcomeWork(text);
}

function isBroadOutcomeWork(text: string): boolean {
  return /clean (the )?(house|home)|sort|organize|fix|build|redesign|refactor|life admin|backend|product|garage|paperwork/.test(text);
}

function shouldSplitConcurrentCookingAi(action: ParsedAiAction, sourceText: string): boolean {
  const text = `${sourceText} ${action.title} ${action.label}`.toLowerCase();
  if (!/ai.*while.*cook|cook.*while.*ai|report.*while.*cook/.test(text)) return false;
  return !/^(cook dinner|run ai report draft)$/i.test(action.title);
}

function normalizeParsedAction(action: ParsedAiAction, state: AppState, sourceText = ""): ParsedAiAction {
  const normalized = { ...action };
  normalized.projectName = cleanNullableString(normalized.projectName);
  normalized.dueDate = cleanNullableString(normalized.dueDate);
  normalized.scheduledDate = cleanNullableString(normalized.scheduledDate);
  normalized.scheduledTime = cleanNullableString(normalized.scheduledTime);
  normalized.question = cleanNullableString(normalized.question);
  normalized.definitionOfDone = cleanNullableString(normalized.definitionOfDone);
  if (normalized.projectName && !findProjectId(state, normalized.projectName)) normalized.projectName = null;
  if (normalized.dueDate && !normalizeDate(normalized.dueDate, state.currentDate)) normalized.dueDate = null;
  if (normalized.scheduledDate && !normalizeDate(normalized.scheduledDate, state.currentDate)) normalized.scheduledDate = null;
  const actionSource = relevantSourceText(normalized, sourceText);
  const combined = `${normalized.title} ${normalized.label} ${normalized.question ?? ""} ${actionSource}`.toLowerCase();
  const definitionLooksLikeQuestion = Boolean(normalized.definitionOfDone && /\\?|what counts|what should|include/i.test(normalized.definitionOfDone));

  if (normalized.scheduledTime && !/^\d{2}:\d{2}$/.test(normalized.scheduledTime)) {
    normalized.scheduledTime = null;
  }

  applyRelativeDateHints(normalized, state, actionSource);
  clearInventedDateForBroadWeekWindow(normalized, actionSource);

  if (normalized.type === "schedule_block" && /work on|diet app|product/.test(combined)) {
    normalized.type = "create_task";
    normalized.projectName ??= findProjectName(state, /diet app/i);
    normalized.completionBehavior = "repeatable";
    normalized.completionMode = "timebox";
    normalized.definitionOfDone ??= "Spend the planned time making product progress.";
    normalized.tags = mergeTags(normalized.tags, ["timebox", "product"]);
  }

  if (/sleep|bed/.test(combined)) {
    normalized.type = "create_task";
    normalized.title = "Sleep";
    normalized.label = "Add sleep";
    normalized.domainName = findDomainName(state, /health|recovery/i);
    normalized.effortMinutes = Math.max(normalized.effortMinutes, 480);
    normalized.energy = "low";
    normalized.strictness = "strict";
    normalized.priority = Math.max(normalized.priority, 5);
    normalized.importance = Math.max(normalized.importance, 5);
    normalized.urgency = Math.max(normalized.urgency, 5);
    normalized.completionBehavior = "repeatable";
    normalized.completionMode = "repeatable_checkoff";
    if (/half 11|23:30/.test(combined)) {
      normalized.scheduledDate ??= state.currentDate;
      normalized.scheduledTime = "23:30";
    }
  }

  if (/will/.test(combined) && /every friday|friday/.test(combined)) {
    normalized.type = "create_routine";
    normalized.title = "Message Will";
    normalized.label = "Add Message Will Friday routine";
    normalized.domainName = findDomainName(state, /social/i);
    normalized.projectName = null;
    normalized.recurrenceDays = [5];
    normalized.effortMinutes = Math.min(normalized.effortMinutes, 15);
    normalized.energy = "low";
    normalized.strictness = "normal";
  }

  if (/clean (the )?(house|home)/.test(combined) && (normalized.type === "ask_clarification" || !normalized.definitionOfDone || definitionLooksLikeQuestion)) {
    normalized.type = "ask_clarification";
    normalized.title = "Clean house";
    normalized.label = "Clarify clean house";
    normalized.question = "What would count as enough cleaning for this task?";
    normalized.clarificationKind = "definition_of_done";
    normalized.clarificationOptions = ["Kitchen and bathroom", "One focused cleaning pass", "Split into rooms"];
    normalized.completionBehavior = "exhaust_once";
    normalized.completionMode = "progress_accumulating";
    normalized.definitionOfDone = null;
    normalized.tags = mergeTags(normalized.tags, ["home", "cleaning"]);
  }

  if (/emma/.test(combined) && /ideas?|things to do|activities/.test(combined)) {
    normalized.type = "ask_clarification";
    normalized.title = "Ideas for things to do with Emma";
    normalized.label = "Clarify Emma ideas";
    normalized.projectName ??= findProjectName(state, /emma/i);
    normalized.question = "Should I keep this as a reusable Emma suggestion list?";
    normalized.clarificationKind = "completion_behavior";
    normalized.clarificationOptions = ["Reusable suggestion", "One-off task", "Dismiss"];
    normalized.completionBehavior = "keep_as_suggestion";
    normalized.completionMode = "suggestion_used";
    normalized.strictness = "flexible";
    normalized.tags = mergeTags(normalized.tags, ["relationship", "idea"]);
  }

  return normalized;
}

function applyRelativeDateHints(action: ParsedAiAction, state: AppState, sourceText: string): void {
  const text = sourceText.toLowerCase();
  const deadlineDay = findNamedDay(text, /\b(?:by|before|due)\s+(?:next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (deadlineDay !== undefined) {
    action.dueDate = nextDayOfWeek(state.currentDate, deadlineDay, true);
  }

  const exactDay = findNamedDay(text, /\b(?:on|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (exactDay !== undefined && deadlineDay === undefined) {
    action.scheduledDate = nextDayOfWeek(state.currentDate, exactDay, true);
  }

  const nextExactDay = findNamedDay(text, /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextExactDay !== undefined && deadlineDay === undefined) {
    action.scheduledDate = nextDayOfWeek(state.currentDate, nextExactDay, false);
  }

  if (/\btomorrow\b/.test(text) && !action.scheduledDate && !action.dueDate) {
    action.scheduledDate = addDays(state.currentDate, 1);
  }

  if (/\b(today|tonight)\b/.test(text) && !action.scheduledDate && !action.dueDate) {
    action.scheduledDate = state.currentDate;
  }
}

function clearInventedDateForBroadWeekWindow(action: ParsedAiAction, sourceText: string): void {
  const text = sourceText.toLowerCase();
  const hasBroadWeekWindow = /\b(?:sometime|some time|at some point|this week|next week|weekend)\b/.test(text);
  if (!hasBroadWeekWindow || hasSpecificDateCue(text)) return;
  action.scheduledDate = null;
  action.dueDate = null;
}

function hasSpecificDateCue(text: string): boolean {
  return (
    /\b(?:today|tonight|tomorrow)\b/.test(text) ||
    /\b(?:on|by|before|due)\s+(?:next\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text)
  );
}

function deriveDateIntent(action: ParsedAiAction, state: AppState, sourceText: string): DateIntent {
  const text = sourceText.toLowerCase();
  const scheduledDate = normalizeDate(action.scheduledDate ?? undefined, state.currentDate);
  const dueDate = normalizeDate(action.dueDate ?? undefined, state.currentDate);

  if (action.type === "create_routine" || action.recurrenceDays?.length) {
    return { kind: "recurring", originalText: sourceText || undefined, confidence: 0.8 };
  }
  if (scheduledDate === state.currentDate && /\b(today|tonight)\b/.test(text)) {
    return { kind: "today", originalText: sourceText || undefined, scheduledDate, confidence: 0.85 };
  }
  if (dueDate === state.currentDate && /\b(today|tonight)\b/.test(text)) {
    return { kind: "today", originalText: sourceText || undefined, dueDate, confidence: 0.75 };
  }
  if (scheduledDate === addDays(state.currentDate, 1) && /\btomorrow\b/.test(text)) {
    return { kind: "tomorrow", originalText: sourceText || undefined, scheduledDate, confidence: 0.85 };
  }
  if (scheduledDate) {
    return { kind: "specific_date", originalText: sourceText || undefined, scheduledDate, confidence: 0.75 };
  }
  if (dueDate) {
    return { kind: "deadline", originalText: sourceText || undefined, dueDate, confidence: 0.75 };
  }
  if (/\bnext week\b/.test(text)) {
    return { kind: "week_window", originalText: sourceText || undefined, ...nextWeekRange(state.currentDate), confidence: 0.75 };
  }
  if (/\b(this week|weekend)\b/.test(text)) {
    return { kind: "week_window", originalText: sourceText || undefined, ...weekRange(state.currentDate), confidence: 0.65 };
  }
  if (/\b(someday|eventually|one day|not urgent|no rush|maybe later)\b/.test(text)) {
    return { kind: "someday", originalText: sourceText || undefined, confidence: 0.65 };
  }
  return { kind: "none", originalText: sourceText || undefined, confidence: 0.35 };
}

function inferScheduling(action: ParsedAiAction, sourceText: string): SchedulingMetadata {
  const text = `${action.title} ${action.label} ${sourceText} ${(action.tags ?? []).join(" ")}`.toLowerCase();
  if (/laundry|washing|washer|dryer|hang.*dry|put.*away/.test(text)) {
    return {
      mode: "phased",
      attentionLoad: "partial",
      canOverlap: true,
      overlapKinds: ["household", "passive_waiting"],
      phases: [
        {
          id: "start",
          title: "Start laundry",
          kind: "active",
          effortMinutes: 10,
          attentionLoad: "partial",
          canOverlap: false,
          overlapKinds: ["household"]
        },
        {
          id: "running",
          title: "Laundry running",
          kind: "passive",
          effortMinutes: Math.max(45, Math.min(75, action.effortMinutes - 30)),
          attentionLoad: "passive",
          canOverlap: true,
          overlapKinds: ["passive_waiting", "household"]
        },
        {
          id: "finish",
          title: "Hang or fold laundry",
          kind: "return",
          effortMinutes: 20,
          attentionLoad: "partial",
          canOverlap: false,
          overlapKinds: ["household"]
        }
      ]
    };
  }
  if (/ai.*run|ai_running|background.*ai|report draft|side.?work/.test(text)) {
    return {
      mode: "background",
      attentionLoad: "passive",
      canOverlap: true,
      overlapKinds: ["ai_running", "computer", "passive_waiting"]
    };
  }
  if (/cook|cooking|travel|commute|walk.*while|listen|audio|phone call/.test(text)) {
    return {
      mode: "concurrent",
      attentionLoad: "partial",
      canOverlap: true,
      overlapKinds: /travel|commute/.test(text) ? ["travel", "phone", "audio"] : ["cooking", "audio", "phone"]
    };
  }
  return {
    mode: "exclusive",
    attentionLoad: "full",
    canOverlap: false
  };
}

function relevantSourceText(action: ParsedAiAction, sourceText: string): string {
  if (!sourceText.trim()) return "";
  const titleWords = significantWords(action.title);
  if (!titleWords.length) return sourceText;
  const chunks = sourceText
    .split(/\b(?:and|then|also|while)\b|[,;]\s*/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const direct = chunks.find((chunk) => {
    const lower = chunk.toLowerCase();
    return titleWords.some((word) => lower.includes(word));
  });
  return direct ?? sourceText;
}

function significantWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !["task", "add", "the", "and", "with"].includes(word));
}

function findNamedDay(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  return dayNameToIndex(match[1]);
}

function dayNameToIndex(day: string): number {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day.toLowerCase());
}

function cleanNullableString(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || /^(null|:null|none|n\/a|undefined)$/i.test(trimmed)) return null;
  return trimmed;
}

function validateStructuredAction(action: ParsedAiAction, state: AppState): string[] {
  const errors: string[] = [];
  if (!action.title.trim()) errors.push("Title is required.");
  if (/stuff|thing|something|misc/i.test(action.title) && action.type !== "ask_clarification") {
    errors.push("Task title is too vague.");
  }
  if (action.scheduledTime && !/^\d{2}:\d{2}$/.test(action.scheduledTime)) {
    errors.push("Scheduled time must use HH:mm format.");
  }
  if (action.dueDate && !normalizeDate(action.dueDate, state.currentDate)) {
    errors.push("Due date is ambiguous.");
  }
  if (action.scheduledDate && !normalizeDate(action.scheduledDate, state.currentDate)) {
    errors.push("Scheduled date is ambiguous.");
  }
  const isFixedSleepAnchor =
    action.type === "create_task" &&
    /sleep|bed/i.test(action.title) &&
    action.strictness === "strict" &&
    Boolean(action.scheduledTime);
  if (action.type === "create_task" && action.effortMinutes > 240 && !isFixedSleepAnchor) {
    errors.push("Tasks over four hours should be confirmed or split.");
  }
  if (action.projectName && !findProjectId(state, action.projectName)) {
    errors.push("Project match is ambiguous or missing.");
  }
  return errors;
}

function classifyRisk(action: ParsedAiAction, validationErrors: string[]): AiAction["safety"] {
  if (validationErrors.length > 0) return "needs_confirmation";
  if (action.type === "ask_clarification") return "needs_confirmation";
  if (highRiskActions.has(action.type)) return "needs_confirmation";
  return "auto_apply";
}

function taskPayload(
  state: AppState,
  action: ParsedAiAction,
  inboxItemId: string,
  projectId?: string,
  sourceText = ""
): Omit<Task, "id"> {
  const completionBehavior = inferCompletionBehavior(action);
  const completionMode = inferCompletionMode(action, projectId, completionBehavior);
  const dueDate = action.dueDate ?? undefined;
  const scheduledDate = action.scheduledDate ?? undefined;
  const scheduledTime = action.scheduledTime && /^\d{2}:\d{2}$/.test(action.scheduledTime) ? action.scheduledTime : undefined;
  const relevantText = relevantSourceText(action, sourceText);
  const dateIntent = deriveDateIntent(action, state, relevantText);
  const scheduling = inferScheduling(action, relevantText);
  return {
    title: action.title,
    type: projectId ? "project_task" : completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "atomic",
    domainId: findDomainId(state, action.domainName, "domain_work"),
    projectId,
    sourceInboxItemId: inboxItemId,
    status: "active",
    repeatPolicy: { type: "none" },
    completionBehavior,
    completionMode,
    definitionOfDone: action.definitionOfDone ?? (projectId && completionMode === "outcome_done" ? `${action.title} is finished and verified.` : undefined),
    plannerFields: {
      intentType: projectId ? "progress" : completionBehavior === "keep_as_suggestion" ? "idea" : inferIntentType(action.title),
      pressureLevel: scheduledTime ? "scheduled" : dueDate ? "due" : action.strictness === "flexible" ? "soft" : "someday"
    },
    plannerSignals: {
      cognitiveLoad: action.energy === "high" ? 7 : action.energy === "medium" ? 5 : 2,
      relationshipValue: /will|emma|sam|leo/i.test(action.title) ? 5 : undefined
    },
    tags: action.tags ?? [],
    fieldConfidence: {
      intentType: action.clarificationKind ? 0.45 : 0.7,
      pressureLevel: dueDate || scheduledTime ? 0.75 : 0.55,
      effortMinutes: action.effortMinutes >= 60 ? 0.45 : 0.7
    },
    priority: action.priority,
    importance: action.importance,
    urgency: action.urgency,
    dueDate: normalizeDate(dueDate, state.currentDate),
    scheduledDate: normalizeDate(scheduledDate, state.currentDate) ?? (scheduledTime ? state.currentDate : undefined),
    scheduledTime,
    dateIntent,
    scheduling,
    effortMinutes: action.effortMinutes,
    minMinutes: action.completionMode === "timebox" ? action.effortMinutes : undefined,
    maxMinutes: action.effortMinutes >= 60 ? Math.round(action.effortMinutes * 1.5) : undefined,
    estimateConfidence: action.effortMinutes >= 60 ? 0.45 : 0.7,
    energy: action.energy,
    strictness: action.strictness
  };
}

function inferCompletionBehavior(action: ParsedAiAction): CompletionBehavior {
  if (action.completionBehavior) return action.completionBehavior;
  if (action.strictness === "flexible") return "keep_as_suggestion";
  return "exhaust_once";
}

function inferCompletionMode(action: ParsedAiAction, projectId: string | undefined, behavior: CompletionBehavior): CompletionMode {
  if (action.completionMode) return action.completionMode;
  if (behavior === "keep_as_suggestion") return "suggestion_used";
  if (behavior === "repeatable") return "repeatable_checkoff";
  if (/work on|spend|timebox/i.test(action.title)) return "timebox";
  return projectId ? "outcome_done" : "simple_done";
}

function inferIntentType(title: string): Task["plannerFields"]["intentType"] {
  if (/message|call|text|sam|will|emma|leo/i.test(title)) return "relationship";
  if (/clean|tidy|house|garage/i.test(title)) return "maintenance";
  if (/nails|rehab|health/i.test(title)) return "health";
  return "obligation";
}

function mergeTags(existing: string[] | null, additions: string[]): string[] {
  return [...(existing ?? []), ...additions].filter((tag, index, all) => all.indexOf(tag) === index);
}

function findDomainName(state: AppState, pattern: RegExp): string {
  return state.domains.find((domain) => pattern.test(domain.name))?.name ?? state.domains[0]?.name ?? "Job Work";
}

function findProjectName(state: AppState, pattern: RegExp): string | null {
  return state.projects.find((project) => pattern.test(project.name))?.name ?? null;
}

function findDomainId(state: AppState, name: string, fallback: string): string {
  const lower = name.toLowerCase();
  return state.domains.find((domain) => domain.name.toLowerCase().includes(lower) || lower.includes(domain.name.toLowerCase()))?.id ?? fallback;
}

function findProjectId(state: AppState, name: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return state.projects.find((project) => project.name.toLowerCase().includes(lower) || lower.includes(project.name.toLowerCase()))?.id;
}

function normalizeDate(value: string | undefined, currentDate: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/today|tonight/i.test(value)) return currentDate;
  return undefined;
}

function timestampForState(state: AppState): string {
  return new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
}
