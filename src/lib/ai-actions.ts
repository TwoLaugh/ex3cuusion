import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { nextId } from "./ids";
import type { AiAction, AppState, ClarificationKind, CompletionBehavior, CompletionMode, InboxEntry, Task } from "./types";

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
  const actions = parsed.actions.map((action) => buildAction(action, state, entryId, parsed.model));

  return {
    id: entryId,
    createdAt: timestampForState(state),
    input,
    actions,
    summary: parsed.summary || `${actions.length} structured action${actions.length === 1 ? "" : "s"} proposed.`
  };
}

async function defaultInterpreter(input: string, state: AppState): Promise<ParsedAiResponse & { model?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.EX3CUUSION_AI_MODE === "fixture" || (!apiKey && process.env.NODE_ENV !== "production")) {
    return fixtureInterpreter(input, state);
  }

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.parse({
    model,
    instructions:
      "You turn messy personal execution input into structured JSON actions for an execution planner. " +
      "The durable unit is a task; chat exists only to clarify ambiguity before creating good task state. " +
      "For explicit requests to add or create an ordinary obvious task, return create_task. " +
      "For broad work where done-state is unclear, return ask_clarification, not create_task. Examples: clean the house, sort backend, fix the app, organize life admin. " +
      "For ask_clarification actions: title must be the canonical future task title, not the question text. question must contain the user-facing question. definitionOfDone must be null. " +
      "For 'clean the house', use title 'Clean house', clarificationKind 'definition_of_done', and ask what would count as enough cleaning. " +
      "For reusable relationship ideas like 'ideas for things to do with Emma', use ask_clarification with title 'Ideas for things to do with Emma', completionBehavior keep_as_suggestion, completionMode suggestion_used, and ask whether to keep it as a reusable suggestion list. " +
      "For timeboxed work like 'work on Diet App for two hours', return create_task with completionBehavior repeatable, completionMode timebox, effortMinutes 120, and the matching existing project. " +
      "For explicit clock times, set scheduledDate and scheduledTime in 24-hour HH:mm format. If there is no exact clock time, scheduledTime must be null. Never output ':null' or string null values. " +
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
  if (/book dentist|dentist/.test(lower) && /next week|sometime/.test(lower)) {
    actions.push(baseAction("ask_clarification", "Clarify dentist timing", "Book dentist", state, {
      domainName: findDomainName(state, /health/i),
      effortMinutes: 15,
      energy: "low",
      strictness: "normal",
      priority: 3,
      importance: 4,
      urgency: 2,
      question: "When next week should this be planned or followed up?",
      clarificationKind: "date",
      clarificationOptions: ["Monday", "Tuesday", "Any weekday", "Just keep it in next week backlog"]
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

function buildAction(rawAction: ParsedAiAction, state: AppState, inboxItemId: string, model?: string): AiAction {
  const action = normalizeParsedAction(rawAction, state);
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
            ? taskPayload(state, action, inboxItemId, projectId)
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
                  draftActionType: "create_task",
                  draftAction: taskPayload(state, { ...action, type: "create_task" }, inboxItemId, projectId)
                }
  };
}

function normalizeParsedAction(action: ParsedAiAction, state: AppState): ParsedAiAction {
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
  const combined = `${normalized.title} ${normalized.label} ${normalized.question ?? ""}`.toLowerCase();
  const definitionLooksLikeQuestion = Boolean(normalized.definitionOfDone && /\\?|what counts|what should|include/i.test(normalized.definitionOfDone));

  if (normalized.scheduledTime && !/^\d{2}:\d{2}$/.test(normalized.scheduledTime)) {
    normalized.scheduledTime = null;
  }

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
  projectId?: string
): Omit<Task, "id"> {
  const completionBehavior = inferCompletionBehavior(action);
  const completionMode = inferCompletionMode(action, projectId, completionBehavior);
  const dueDate = action.dueDate ?? undefined;
  const scheduledDate = action.scheduledDate ?? undefined;
  const scheduledTime = action.scheduledTime && /^\d{2}:\d{2}$/.test(action.scheduledTime) ? action.scheduledTime : undefined;
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
