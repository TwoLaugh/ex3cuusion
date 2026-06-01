import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { addDays, nextDayOfWeek, nextWeekRange, weekRange } from "./dates";
import { nextId } from "./ids";
import { buildDayPlan } from "./planner";
import { buildWeekPlan } from "./week-plan";
import type { AiAction, AiDebugTrace, AppState, CaptureSession, ClarificationKind, CompletionBehavior, CompletionMode, DateIntent, InboxEntry, SchedulingMetadata, Task } from "./types";

const aiActionSchema = z.object({
  summary: z.string(),
  actions: z.array(
    z.object({
      type: z.enum(["create_task", "create_routine", "create_project", "schedule_block", "schedule_task", "archive_task", "ask_clarification"]),
      label: z.string(),
      title: z.string(),
      targetTaskId: z.string().nullable().optional(),
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
      clarificationOptions: z.array(z.string()).nullable(),
      schedulingMode: z.enum(["exclusive", "concurrent", "background"]).nullable()
    })
  )
});

type ParsedAiResponse = z.infer<typeof aiActionSchema>;
type ParsedAiAction = ParsedAiResponse["actions"][number];
export type AiInterpreter = (input: string, state: AppState) => Promise<ParsedAiResponse & { model?: string; debugTrace?: AiDebugTrace }>;

const captureRevisionSchema = z.object({
  summary: z.string(),
  shouldApply: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().nullable(),
  projectName: z.string().nullable(),
  domainName: z.string().nullable(),
  dateIntent: z.enum(["unchanged", "today", "tomorrow", "this_week", "next_week", "someday", "specific_date", "deadline"]).nullable(),
  scheduledDate: z.string().nullable(),
  scheduledTime: z.string().nullable(),
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
  const entryId = nextId("inbox");
  const parsed = await interpreter(input, state);
  const actions = parsed.actions.map((action) => buildAction(action, state, entryId, parsed.model, input));

  return {
    id: entryId,
    createdAt: timestampForState(state),
    input,
    actions,
    summary: parsed.summary || `${actions.length} structured action${actions.length === 1 ? "" : "s"} proposed.`,
    debugTrace: parsed.debugTrace
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

async function defaultInterpreter(input: string, state: AppState): Promise<ParsedAiResponse & { model?: string; debugTrace?: AiDebugTrace }> {
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

  // Single full-context interpreter. The model owns interpretation; deterministic
  // code downstream only enforces well-formedness, validation, and safety. Do not
  // reintroduce a second competing interpreter that races/shadows this one.
  return defaultActionInterpreter(input, state, openai, model);
}

async function defaultActionInterpreter(input: string, state: AppState, openai: OpenAI, model: string): Promise<ParsedAiResponse & { model?: string; debugTrace?: AiDebugTrace }> {
  const instructions =
    "You are the state-editing brain for a personal execution planner. " +
    "You receive the user's full current app state, current day plan, and week plan as JSON. Use that context directly; do not guess blindly from the latest message. " +
    "Decide what should change in the existing state. Prefer editing, archiving, rescheduling, or asking a useful clarification over creating duplicates. " +
    "The durable unit is a task; chat exists only to clarify ambiguity before creating good task state. " +
    "Think through the task silently first. Ask a follow-up only when the answer materially changes storage, recurrence, scheduling, completion behavior, project placement, splitting, or definition of done. " +
    "When the user asks to remove, delete, cancel, dedupe, keep only one, or get rid of an old/original task, use archive_task with the exact targetTaskId from context. " +
    "When the user asks to move or change timing for an existing task, use schedule_task with the exact targetTaskId from context. " +
    "If two tasks overlap nonsensically or a request would create a bad day, either return several edits that fix the day or ask one worthwhile clarification. " +
    "Do not ask low-value questions for obvious simple tasks; infer reasonable defaults and create the task. " +
    "For an explicit, ordinary, well-understood task, return create_task with sensible defaults and do not ask a question. " +
    "For broad outcome work with no clear finish line — a request that names a result or a whole space but no concrete action or stopping point, such as tidying or cleaning an entire space, sorting or organizing a broad area, or open-ended 'sort out' / 'deal with' work — return ask_clarification with clarificationKind 'definition_of_done' before creating, even when you could guess a reasonable scope. Prefer asking once here over silently creating a vague task. " +
    "For ask_clarification actions: title must be the canonical future task title, not the question text. question must contain the user-facing question. definitionOfDone must be null. " +
    "For a request to collect reusable ideas or suggestions — a list the user would draw from repeatedly rather than complete once — use ask_clarification with completionBehavior keep_as_suggestion and completionMode suggestion_used, asking whether to keep it as a reusable suggestion list. Such a list is never 'done', so do not frame it as clarificationKind definition_of_done; use completion_behavior. " +
    "For time-boxed work (wording like 'work on X for N hours/minutes'), return create_task with completionBehavior repeatable, completionMode timebox, the stated effort in minutes, and the matching existing project if one exists. " +
    "For explicit clock times, set scheduledDate and scheduledTime in 24-hour HH:mm format. If there is no exact clock time, scheduledTime must be null. Never output ':null' or string null values. " +
    "Interpret colloquial clock times into 24-hour HH:mm (for example an evening 'half past eleven' is 23:30) unless the user clearly means another time. " +
    "Do not invent exact dates for broad windows like 'sometime next week' or 'at some point this week'; set scheduledDate and dueDate to null and keep the date intent as a week-level window unless the user names a specific day or deadline. " +
    "Do not ask a clarification merely to pin down a vague but acceptable time window such as 'sometime next week' — store it as a week-level window without asking. Only ask about dates when the wording is genuinely contradictory or there is a hard deadline conflict. " +
    "For deadline wording such as 'by <day>' or 'before <day>', set dueDate, not scheduledDate. For execution wording such as 'on <day>' or 'today', set scheduledDate. " +
    "For explicit recurring habits, return create_routine with recurrenceDays when known, mapping weekday names to 0-6 with Sunday as 0. " +
    "For sleep or bed time, return create_task titled 'Sleep', not schedule_block. " +
    "Set schedulingMode on every create_task: 'exclusive' for normal focused work (the default), 'concurrent' for a light-attention activity the user does while something else runs, and 'background' for work that proceeds largely unattended. " +
    "When the user describes doing one thing WHILE another runs — for example automated or passive work running while they do a hands-on activity — return TWO create_task actions, each with its own effort: the hands-on activity as 'concurrent' and the unattended one as 'background'. Do not merge them into a single combined task. " +
    "Use existing domain/project names and target task IDs when they fit. Return only actions that help choose, schedule, split, defer, prioritize, or prune work. " +
    "projectName must be null unless it exactly refers to an existing project/container from the provided list. " +
    "For archive_task and schedule_task, targetTaskId is required and must be an existing task ID. " +
    "Nullable fields must be real JSON null, not strings like 'null', ':null', 'none', or 'N/A'. " +
    "Use strictness flexible, normal, or strict. Score priority, importance, and urgency from 1 to 5.";
  const modelInput =
    `User input: ${input}\n\n` +
    `Current planner context JSON:\n${JSON.stringify(buildInboxModelContext(state), null, 2)}`;
  const response = await openai.responses.parse({
    model,
    instructions,
    input: [
      {
        role: "user",
        content: modelInput
      }
    ],
    text: {
      format: zodTextFormat(aiActionSchema, "execution_actions")
    }
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI response did not match the expected execution action schema");
  }

  return {
    ...response.output_parsed,
    model,
    debugTrace: debugTraceForCall("Full-context actions", model, instructions, modelInput, responseText(response), response.output_parsed)
  };
}

function debugTraceForCall(
  label: string,
  model: string,
  instructions: string,
  input: string,
  response: string,
  parsedResponse: unknown
): AiDebugTrace | undefined {
  if (!aiDebugEnabled()) return undefined;
  return {
    calls: [
      {
        label,
        model,
        createdAt: new Date().toISOString(),
        instructions,
        input,
        response,
        parsedResponse
      }
    ]
  };
}

function mergeDebugTraces(...traces: Array<AiDebugTrace | undefined>): AiDebugTrace | undefined {
  const calls = traces.flatMap((trace) => trace?.calls ?? []);
  return calls.length ? { calls } : undefined;
}

function aiDebugEnabled(): boolean {
  return process.env.EX3CUUSION_AI_DEBUG === "1" || (process.env.NODE_ENV !== "production" && process.env.EX3CUUSION_AI_DEBUG !== "0");
}

function responseText(response: unknown): string {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText;
  const parsed = (response as { output_parsed?: unknown }).output_parsed;
  return JSON.stringify(parsed, null, 2);
}

function buildInboxModelContext(state: AppState) {
  return {
    currentDate: state.currentDate,
    currentTime: state.currentTime,
    availableMinutes: state.availableMinutes,
    domains: state.domains,
    projects: state.projects,
    tasks: state.tasks,
    routines: state.routines,
    deferrals: state.deferrals,
    completions: state.completions,
    executionEvents: state.executionEvents,
    projectBlockSelections: state.projectBlockSelections,
    dailyReviews: state.dailyReviews,
    currentDayPlan: buildDayPlan(state),
    weekPlan: buildWeekPlan(state),
    recentInbox: state.inbox.slice(0, 10).map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      input: entry.input,
      summary: entry.summary,
      actions: entry.actions.map((action) => ({
        id: action.id,
        type: action.type,
        label: action.label,
        status: action.status,
        safety: action.safety,
        appliedEntityId: action.appliedEntityId,
        payload: action.payload
      }))
    })),
    captureSessions: state.captureSessions.slice(0, 10).map((session) => ({
      id: session.id,
      status: session.status,
      source: session.source,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      summary: session.summary,
      actionIds: session.actionIds,
      draftActionIds: session.draftActionIds,
      appliedEntityIds: session.appliedEntityIds,
      unresolvedFields: session.unresolvedFields,
      answeredFields: session.answeredFields,
      questions: session.questions,
      recentMessages: session.messages.slice(-6),
      revisionEvents: session.revisionEvents.slice(-6)
    }))
  };
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
      "Set title to null unless the follow-up explicitly asks to rename, retitle, call, or name the task. " +
      "Use projectName only when it exactly matches an existing project/person/container. " +
      "For broad date windows like 'next week' set dateIntent to next_week and leave scheduledDate/dueDate null. " +
      "For deadline wording like 'by Friday' use dueDate. For execution wording like 'tomorrow' or 'today' use scheduledDate/dateIntent. " +
      "For explicit clock-time corrections like 'at 5pm' or 'make it 17:00', set scheduledTime in HH:mm. Preserve the existing date unless the user changes it. " +
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
            scheduledTime: task.scheduledTime,
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
    scheduledTime: null,
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

  const scheduledTime = parseClockTime(message);
  if (scheduledTime) {
    revision.scheduledTime = scheduledTime;
    if (!revision.dateIntent && !revision.scheduledDate) {
      revision.dateIntent = "today";
      revision.scheduledDate = state.currentDate;
    }
    changes.push(`scheduled for ${scheduledTime}`);
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

// DETERMINISTIC TEST DOUBLE — not production behavior. Its canned, phrase-keyed responses
// exist only to exercise the state/apply/audit pipeline offline (unit tests + `eval:ai`
// smoke). The live interpretation path (defaultInterpreter) must NOT mirror these phrases,
// and the fixture must never be used as a model-quality signal. See AGENTS.md.
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
          schedulingMode: "concurrent",
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
          schedulingMode: "background",
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
    schedulingMode: null,
    ...overrides
  };
}

function buildAction(
  rawAction: ParsedAiAction,
  state: AppState,
  inboxItemId: string,
  model?: string,
  sourceText = ""
): AiAction {
  // The model decides intent (including whether to ask a clarification). Deterministic
  // code only normalizes shape/dates and validates — it never rewrites the action type
  // or overrides the model's clarification decision based on specific user phrases.
  const action = normalizeParsedAction(rawAction, state, sourceText);
  const validationErrors = validateStructuredAction(action, state);
  const safety = classifyRisk(action, validationErrors);
  const domainId = findDomainId(state, action.domainName, "domain_work");
  const projectId = findProjectId(state, action.projectName);
  const targetTask = action.targetTaskId ? state.tasks.find((task) => task.id === action.targetTaskId) : undefined;
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
              : normalizedType === "schedule_task"
                ? {
                    taskId: action.targetTaskId,
                    title: targetTask?.title ?? action.title,
                    scheduledDate: normalizeDate(action.scheduledDate ?? undefined, state.currentDate),
                    scheduledTime: action.scheduledTime && /^\d{2}:\d{2}$/.test(action.scheduledTime) ? action.scheduledTime : undefined,
                    dueDate: normalizeDate(action.dueDate ?? undefined, state.currentDate),
                    effortMinutes: action.effortMinutes
                  }
                : normalizedType === "archive_task"
                  ? {
                      taskId: action.targetTaskId,
                      title: targetTask?.title ?? action.title,
                      reason: action.label
                    }
                  : {
                      question: action.question ?? "What should this become?",
                      questionKind: action.clarificationKind ?? "next_action",
                      options: action.clarificationOptions ?? [],
                      rationale: clarificationRationale(action),
                      materiality: clarificationMateriality(action),
                      draftActionType: "create_task",
                      draftAction: taskPayload(state, { ...action, type: "create_task" }, inboxItemId, projectId, sourceText)
                    }
  };
}

// Materiality/rationale are derived from the model's own clarificationKind and effort
// estimate — never from matching specific user phrases. They are display metadata for a
// clarification the model already decided to ask; they do not gate whether it is asked.
function clarificationMateriality(action: ParsedAiAction): "low" | "medium" | "high" {
  // A question about whether to keep something as a reusable suggestion list is optional by
  // nature and must never block — regardless of which clarificationKind the model tagged it
  // with. Keyed on the model's own keep_as_suggestion signal, not on phrases.
  if (action.completionBehavior === "keep_as_suggestion" || action.completionMode === "suggestion_used") return "medium";
  const kind = action.clarificationKind ?? "next_action";
  if (kind === "definition_of_done" || kind === "split" || action.effortMinutes >= 90) return "high";
  if (kind === "completion_behavior" || kind === "repeat_policy" || kind === "container_kind") return "medium";
  return "low";
}

function clarificationRationale(action: ParsedAiAction): string {
  const kind = action.clarificationKind ?? "next_action";
  if (kind === "definition_of_done") return "The answer changes what completion means.";
  if (kind === "completion_behavior") return "The answer changes whether this is one-off, repeatable, or a reusable suggestion.";
  if (kind === "container_kind") return "The answer changes where this belongs.";
  if (kind === "repeat_policy") return "The answer changes recurrence.";
  if (kind === "split") return "The answer changes whether this should become several tasks.";
  if (kind === "date") return "The answer changes scheduling or deadline pressure.";
  return "The answer changes the next concrete action.";
}

function normalizeParsedAction(action: ParsedAiAction, state: AppState, sourceText = ""): ParsedAiAction {
  // Structural normalization only: clean shapes, validate formats, and resolve relative
  // date/time wording to concrete values. No branching on specific user phrases or task
  // semantics — the model already decided the type, title, project, and clarification.
  const normalized = normalizeParsedActionShape(action, state);
  const actionSource = relevantSourceText(normalized, sourceText);

  if (normalized.scheduledTime && !/^\d{2}:\d{2}$/.test(normalized.scheduledTime)) {
    normalized.scheduledTime = null;
  }

  applyRelativeDateHints(normalized, state, actionSource);
  clearInventedDateForBroadWeekWindow(normalized, actionSource);

  return normalized;
}

function normalizeParsedActionShape(action: ParsedAiAction, state: AppState): ParsedAiAction {
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
  if (normalized.scheduledTime && !/^\d{2}:\d{2}$/.test(normalized.scheduledTime)) normalized.scheduledTime = null;
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

function buildScheduling(action: ParsedAiAction): SchedulingMetadata {
  // Overlap semantics are now model-owned via action.schedulingMode (the model is told to
  // split "do X while Y" into two tasks and tag them). Deterministic code only maps the
  // chosen mode onto the planner's attention/overlap fields — it does NOT guess from keywords.
  switch (action.schedulingMode) {
    case "concurrent":
      // Light-attention activity that can run alongside a passive/background task.
      return { mode: "concurrent", attentionLoad: "partial", canOverlap: true, overlapKinds: [] };
    case "background":
      // Runs largely unattended (e.g. a process working while the user does something else).
      return { mode: "background", attentionLoad: "passive", canOverlap: true, overlapKinds: [] };
    default:
      return { mode: "exclusive", attentionLoad: "full", canOverlap: false };
  }
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
  if (action.type === "schedule_task" || action.type === "archive_task") {
    if (!action.targetTaskId) {
      errors.push("Target task is required.");
    } else if (!state.tasks.some((task) => task.id === action.targetTaskId && task.status !== "archived")) {
      errors.push("Target task is missing or archived.");
    }
  }
  if (action.type === "schedule_task" && !action.scheduledDate && !action.scheduledTime && !action.dueDate) {
    errors.push("Schedule task needs a date, time, or deadline change.");
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
  const scheduling = buildScheduling(action);
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
      intentType: projectId ? "progress" : completionBehavior === "keep_as_suggestion" ? "idea" : "obligation",
      pressureLevel: scheduledTime ? "scheduled" : dueDate ? "due" : action.strictness === "flexible" ? "soft" : "someday"
    },
    plannerSignals: {
      cognitiveLoad: action.energy === "high" ? 7 : action.energy === "medium" ? 5 : 2
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
  return projectId ? "outcome_done" : "simple_done";
}

function findDomainName(state: AppState, pattern: RegExp): string {
  return state.domains.find((domain) => pattern.test(domain.name))?.name ?? state.domains[0]?.name ?? "Job Work";
}

function findProjectName(state: AppState, pattern: RegExp): string | null {
  return state.projects.find((project) => pattern.test(project.name))?.name ?? null;
}

function findDomainId(state: AppState, name: string, fallback: string): string {
  const lower = name.toLowerCase();
  const matched = state.domains.find((domain) => domain.name.toLowerCase().includes(lower) || lower.includes(domain.name.toLowerCase()));
  if (matched) return matched.id;
  if (state.domains.some((domain) => domain.id === fallback)) return fallback;
  return state.domains[0]?.id ?? fallback;
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

function parseClockTime(sourceText: string): string | undefined {
  const lower = sourceText.toLowerCase();
  const colon = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;

  const meridiem = lower.match(/\b(1[0-2]|0?[1-9])(?:[.:]([0-5]\d))?\s*(am|pm)\b/);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = meridiem[2] ?? "00";
    if (meridiem[3] === "pm" && hour !== 12) hour += 12;
    if (meridiem[3] === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  const atHour = lower.match(/\b(?:at|for)\s+(1[0-2]|0?[1-9])\b/);
  if (atHour) {
    const hour = Number(atHour[1]);
    return `${String(hour >= 7 ? hour : hour + 12).padStart(2, "0")}:00`;
  }

  return undefined;
}

function timestampForState(state: AppState): string {
  return new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
}
