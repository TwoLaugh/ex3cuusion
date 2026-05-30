export type Energy = "low" | "medium" | "high";
export type Strictness = "soft" | "normal" | "strict";
export type TaskStatus = "active" | "completed" | "deferred" | "archived";
export type PlanItemType = "routine" | "atomic_task" | "project_block" | "soft_invitation";
export type PlanItemStatus = "planned" | "completed" | "deferred" | "unscheduled";
export type LoadLevel = "light" | "normal" | "heavy" | "overloaded";
export type DeferralReason =
  | "no_time"
  | "low_energy"
  | "blocked"
  | "too_vague"
  | "overplanned"
  | "avoidance"
  | "not_important"
  | "moved_intentionally"
  | "other";

export interface Domain {
  id: string;
  name: string;
  weight: number;
}

export interface Project {
  id: string;
  domainId: string;
  name: string;
  status: "active" | "paused" | "completed";
  priorityWeight: number;
  defaultBlockMinutes: number;
  contextNote: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  domainId: string;
  projectId?: string;
  status: TaskStatus;
  priority: number;
  importance: number;
  urgency: number;
  dueDate?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  effortMinutes: number;
  energy: Energy;
  strictness: Strictness;
  source?: string;
}

export interface RoutineTemplate {
  id: string;
  title: string;
  domainId: string;
  recurrence: { type: "daily" } | { type: "weekly"; days: number[] };
  defaultEffortMinutes: number;
  energy: Energy;
  strictness: Strictness;
  preferredWindow?: "morning" | "afternoon" | "evening";
  active: boolean;
}

export interface PlanItem {
  id: string;
  type: PlanItemType;
  title: string;
  section: "routines" | "main_blocks" | "quick_tasks" | "soft_invitations" | "later";
  status: PlanItemStatus;
  startTime: string;
  endTime: string;
  domainId?: string;
  projectId?: string;
  taskId?: string;
  routineId?: string;
  selectedTaskIds?: string[];
  estimatedMinutes: number;
  reason: string;
}

export interface DayPlan {
  date: string;
  loadLevel: LoadLevel;
  estimatedTotalMinutes: number;
  availableMinutes: number;
  summary: string;
  items: PlanItem[];
}

export interface DeferralLog {
  id: string;
  date: string;
  planItemId: string;
  reason: DeferralReason;
  note?: string;
}

export interface CompletionEvent {
  id: string;
  date: string;
  planItemId: string;
  actualMinutes?: number;
}

export interface AiAction {
  id: string;
  type: "create_task" | "create_routine" | "create_project" | "schedule_block" | "ask_clarification";
  label: string;
  payload: Record<string, unknown>;
  safety: "auto_apply" | "needs_confirmation";
  status: "proposed" | "applied";
  appliedEntityId?: string;
  skippedReason?: string;
}

export interface InboxEntry {
  id: string;
  createdAt: string;
  input: string;
  actions: AiAction[];
  summary: string;
}

export interface AppState {
  currentDate: string;
  currentTime: string;
  availableMinutes: number;
  domains: Domain[];
  projects: Project[];
  tasks: Task[];
  routines: RoutineTemplate[];
  deferrals: DeferralLog[];
  completions: CompletionEvent[];
  inbox: InboxEntry[];
}
