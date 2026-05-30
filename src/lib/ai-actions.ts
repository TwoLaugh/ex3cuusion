import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { nextId } from "./ids";
import type { AiAction, AppState, InboxEntry, Task } from "./types";

const aiActionSchema = z.object({
  summary: z.string(),
  actions: z.array(
    z.object({
      type: z.enum(["create_task", "create_routine", "ask_clarification"]),
      label: z.string(),
      title: z.string(),
      domainName: z.string(),
      projectName: z.string().nullable(),
      dueDate: z.string().nullable(),
      scheduledDate: z.string().nullable(),
      scheduledTime: z.string().nullable(),
      effortMinutes: z.number().int().min(5).max(480),
      energy: z.enum(["low", "medium", "high"]),
      strictness: z.enum(["soft", "normal", "strict"]),
      priority: z.number().int().min(1).max(10),
      importance: z.number().int().min(1).max(10),
      urgency: z.number().int().min(1).max(10),
      question: z.string().nullable(),
      safety: z.enum(["auto_apply", "needs_confirmation"])
    })
  )
});

function findDomainId(state: AppState, name: string, fallback: string): string {
  const lower = name.toLowerCase();
  return state.domains.find((domain) => domain.name.toLowerCase().includes(lower) || lower.includes(domain.name.toLowerCase()))?.id ?? fallback;
}

function findProjectId(state: AppState, name: string | null): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return state.projects.find((project) => project.name.toLowerCase().includes(lower) || lower.includes(project.name.toLowerCase()))?.id;
}

export async function interpretInboxInput(input: string, state: AppState): Promise<InboxEntry> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    instructions:
      "You turn messy personal execution input into structured JSON actions for an execution planner. " +
      "For explicit requests to add or create an ordinary task, return create_task with safety auto_apply. " +
      "For explicit clock times, set scheduledDate and scheduledTime in 24-hour HH:mm format. " +
      "Interpret sleep/bed at 'half 11' as 23:30 unless the user clearly means morning. " +
      "For explicit recurring habits, return create_routine with safety auto_apply. Ask clarification only when intent is vague. " +
      "Use existing domain/project names when they fit. Return only actions that help choose, schedule, split, defer, prioritize, or prune work.",
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

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("OpenAI response did not match the expected execution action schema");
  }

  const actions = parsed.actions.map((action): AiAction => {
    const domainId = findDomainId(state, action.domainName, "domain_work");
    return {
      id: nextId("action"),
      type: action.type,
      label: action.label,
      safety: action.safety,
      status: "proposed",
      payload:
        action.type === "create_routine"
          ? {
              title: action.title,
              domainId,
              recurrence: { type: "daily" },
              defaultEffortMinutes: action.effortMinutes,
              energy: action.energy,
              strictness: action.strictness
            }
          : action.type === "create_task"
            ? taskPayload(
                state,
                action.title,
                action.domainName,
                action.effortMinutes,
                action.energy,
                action.strictness,
                action.priority,
                action.importance,
                action.urgency,
                action.dueDate ?? undefined,
                findProjectId(state, action.projectName),
                action.scheduledDate ?? undefined,
                action.scheduledTime ?? undefined
              )
            : { question: action.question ?? "What should this become?" }
    };
  });

  return {
    id: nextId("inbox"),
    createdAt: new Date(`${state.currentDate}T09:00:00.000Z`).toISOString(),
    input,
    actions,
    summary: parsed.summary || `${actions.length} structured action${actions.length === 1 ? "" : "s"} proposed.`
  };
}

function taskPayload(
  state: AppState,
  title: string,
  domainNeedle: string,
  effortMinutes: number,
  energy: Task["energy"],
  strictness: Task["strictness"],
  priority: number,
  importance: number,
  urgency: number,
  dueDate?: string,
  projectId?: string,
  scheduledDate?: string,
  scheduledTime?: string
) {
  return {
    title,
    domainId: findDomainId(state, domainNeedle, "domain_work"),
    projectId,
    status: "active",
    priority,
    importance,
    urgency,
    dueDate: normalizeDate(dueDate, state.currentDate),
    scheduledDate: normalizeDate(scheduledDate, state.currentDate) ?? (scheduledTime ? state.currentDate : undefined),
    scheduledTime,
    effortMinutes,
    energy,
    strictness
  };
}

function normalizeDate(value: string | undefined, currentDate: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/today|tonight/i.test(value)) return currentDate;
  return undefined;
}
