export type Energy = "low" | "medium" | "high";
export type Strictness = "flexible" | "normal" | "strict";
export type TaskStatus = "active" | "scheduled" | "completed" | "deferred" | "blocked" | "waiting" | "archived";
export type PlanItemType = "routine" | "atomic_task" | "folder_block" | "soft_invitation";
export type PlanItemStatus = "planned" | "completed" | "deferred" | "unscheduled" | "missed";
export type LoadLevel = "light" | "normal" | "heavy" | "overloaded";
export type CompletionBehavior = "exhaust_once" | "repeatable" | "keep_as_suggestion" | "regenerate_after_completion";
export type CompletionMode =
  | "simple_done"
  | "outcome_done"
  | "timebox"
  | "repeatable_checkoff"
  | "progress_accumulating"
  | "suggestion_used";
export type IntentType = "obligation" | "maintenance" | "progress" | "relationship" | "idea" | "admin" | "health" | "recovery";
export type PressureLevel = "fixed" | "due" | "scheduled" | "soft" | "someday";
export type DateIntentKind = "none" | "today" | "tomorrow" | "specific_date" | "deadline" | "week_window" | "someday" | "recurring";
export type SchedulingMode = "exclusive" | "background" | "concurrent" | "phased";
export type AttentionLoad = "full" | "partial" | "passive";
export type OverlapKind = "phone" | "audio" | "passive_waiting" | "ai_running" | "travel" | "cooking" | "household" | "computer";
export type TaskPhaseKind = "active" | "passive" | "return";
export type ExecutionEventType =
  | "completed"
  | "worked_on"
  | "partially_completed"
  | "deferred"
  | "blocked"
  | "waiting_on"
  | "skipped"
  | "canceled"
  | "marked_not_important";
export type BlockedBy = "person" | "decision" | "missing_info" | "materials" | "money" | "date" | "external_event" | "emotional_resistance";
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
export type CaptureSessionStatus = "open" | "waiting_for_user" | "applied" | "dismissed";
export type CaptureSource = "inbox" | "not_done" | "daily_review";
export type ClarificationKind =
  | "definition_of_done"
  | "completion_behavior"
  | "container_kind"
  | "repeat_policy"
  | "date"
  | "split"
  | "next_action";
export type ClarificationMode = "blocking" | "optional" | "batch" | "refinement";
export type DailyReviewEnergy = "low" | "normal" | "high";
export type DailyReviewPlanFit = "underfilled" | "realistic" | "overplanned";

// T088: a single recursive folder concept replacing the legacy Domain + Project model. Old saved
// states are migrated into `folders` one-way in normalizeState (migrateLegacyToFolders).
export interface Folder {
  id: string;
  name: string;
  parentFolderId?: string;
  weight?: number;
  canBlock?: boolean;
  defaultBlockMinutes?: number;
  contextNote?: string;
  status?: "active" | "archived";
}

export interface FolderBlockSelection {
  date: string;
  folderId: string;
  selectedTaskIds: string[];
  updatedAt: string;
}

export type RepeatPolicy =
  | { type: "none" }
  | {
      type: "daily" | "weekly";
      days?: number[];
      preferredWindow?: "morning" | "afternoon" | "evening";
      carryover: "skip" | "reschedule" | "stack";
      cooldownDays?: number;
    };

export interface PlannerFields {
  intentType: IntentType;
  pressureLevel: PressureLevel;
  location?: "home" | "work" | "outside" | "phone" | "computer" | "anywhere";
  setupCost?: "low" | "medium" | "high";
}

export interface PlannerSignals {
  avoidanceRisk?: number;
  momentumValue?: number;
  relationshipValue?: number;
  deadlineRisk?: number;
  recoveryValue?: number;
  cognitiveLoad?: number;
}

export interface BlockedMetadata {
  blockedBy: BlockedBy;
  note?: string;
  unblockAction?: string;
}

export interface WaitingMetadata {
  waitingOn: string;
  requestedAt?: string;
  followUpDate?: string;
  context?: string;
}

export interface DelegationMetadata {
  outcomeOwner: string;
  nextActionOwner?: string;
  checkInDate?: string;
  note?: string;
}

export interface DateIntent {
  kind: DateIntentKind;
  originalText?: string;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  scheduledDate?: string;
  confidence: number;
}

export interface TaskPhase {
  id: string;
  title: string;
  kind: TaskPhaseKind;
  effortMinutes: number;
  offsetMinutes?: number;
  attentionLoad: AttentionLoad;
  canOverlap?: boolean;
  overlapKinds?: OverlapKind[];
}

export interface SchedulingMetadata {
  mode: SchedulingMode;
  attentionLoad: AttentionLoad;
  canOverlap: boolean;
  overlapKinds?: OverlapKind[];
  phases?: TaskPhase[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: "atomic" | "project_task" | "routine_instance" | "soft_invitation";
  folderId?: string; // T088: canonical placement. Unset = unfiled/top-level.
  parentTaskId?: string;
  sourceInboxItemId?: string;
  status: TaskStatus;
  repeatPolicy: RepeatPolicy;
  completionBehavior: CompletionBehavior;
  completionMode?: CompletionMode;
  definitionOfDone?: string;
  plannerFields: PlannerFields;
  plannerSignals?: PlannerSignals;
  tags?: string[];
  fieldConfidence?: Record<string, number>;
  priority: number;
  importance: number;
  urgency: number;
  dueDate?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  dateIntent?: DateIntent;
  scheduling?: SchedulingMetadata;
  effortMinutes: number;
  minMinutes?: number;
  maxMinutes?: number;
  estimateConfidence?: number;
  energy: Energy;
  strictness: Strictness;
  notes?: string;
  blockedReason?: string;
  blocked?: BlockedMetadata;
  waiting?: WaitingMetadata;
  delegation?: DelegationMetadata;
  completedAt?: string;
  lastCompletedAt?: string;
  source?: string;
}


export interface PlanItem {
  id: string;
  type: PlanItemType;
  title: string;
  section: "routines" | "main_blocks" | "quick_tasks" | "soft_invitations" | "later";
  status: PlanItemStatus;
  startTime: string;
  endTime: string;
  fixedStartTime?: string;
  folderId?: string;
  taskId?: string;
  routineId?: string;
  selectedTaskIds?: string[];
  estimatedMinutes: number;
  clockMinutes?: number;
  blockingMinutes?: number;
  schedulingMode?: SchedulingMode;
  attentionLoad?: AttentionLoad;
  canOverlap?: boolean;
  overlapKinds?: OverlapKind[];
  phaseKind?: TaskPhaseKind;
  phaseIndex?: number;
  parentTaskId?: string;
  hardAnchor?: boolean;
  reason: string;
}

export interface DayPlan {
  date: string;
  loadLevel: LoadLevel;
  estimatedTotalMinutes: number;
  availableMinutes: number;
  summary: string;
  items: PlanItem[];
  // T090: set when the plan is a committed-day projection (dayView), absent on pure generation.
  committedAt?: string;
  // T090: plannable-today items in a fresh generation that are not in the committed plan.
  newCandidateCount?: number;
}

// T090: snapshot of the PlanItem fields needed to re-render a committed item. Status is NOT
// stored — it is overlaid live from completions/deferrals/executionEvents and the clock.
export interface CommittedPlanItem {
  id: string;
  type: PlanItemType;
  title: string;
  section: PlanItem["section"];
  startTime: string;
  endTime: string;
  fixedStartTime?: string;
  hardAnchor?: boolean;
  taskId?: string;
  folderId?: string;
  selectedTaskIds?: string[];
  estimatedMinutes: number;
  clockMinutes?: number;
  blockingMinutes?: number;
  schedulingMode?: SchedulingMode;
  attentionLoad?: AttentionLoad;
  canOverlap?: boolean;
  overlapKinds?: OverlapKind[];
  phaseKind?: TaskPhaseKind;
  phaseIndex?: number;
  parentTaskId?: string;
  reason: string;
}

// T090: the day plan the user committed to. While one exists for a date, the day view renders it
// with live status overlays instead of regenerating; "replan rest of day" is the only reshuffler.
export interface CommittedDayPlan {
  date: string;
  committedAt: string;
  items: CommittedPlanItem[];
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
  taskIds?: string[];
  actualMinutes?: number;
}

export interface DailyReview {
  id: string;
  date: string;
  createdAt: string;
  energy: DailyReviewEnergy;
  planFit: DailyReviewPlanFit;
  note?: string;
  affectPlanning: boolean;
  capacityAdjustmentMinutes: number;
  completedCount: number;
  partialCount: number;
  deferredCount: number;
  blockedCount: number;
  skippedCount: number;
  calibrationSignals: string[];
}

export interface WeekPlanDay {
  date: string;
  plan: DayPlan;
}

export interface WeekBacklogItem {
  taskId: string;
  title: string;
  dateIntent: DateIntent;
  dueDate?: string;
  scheduledDate?: string;
  folderId?: string;
  effortMinutes: number;
}

export interface WeekPlan {
  startDate: string;
  endDate: string;
  days: WeekPlanDay[];
  thisWeekBacklog: WeekBacklogItem[];
  nextWeekBacklog: WeekBacklogItem[];
  someday: WeekBacklogItem[];
}

export interface ExecutionEvent {
  id: string;
  date: string;
  createdAt: string;
  type: ExecutionEventType;
  taskId?: string;
  taskIds?: string[];
  planItemId?: string;
  reason?: DeferralReason | "did_part" | "waiting_on" | "skipped" | "canceled";
  note?: string;
  actualMinutes?: number;
  nextAction?: string;
  blocked?: BlockedMetadata;
  waiting?: WaitingMetadata;
  delegation?: DelegationMetadata;
}

export interface AiAction {
  id: string;
  type:
    | "create_task"
    | "create_folder"
    | "schedule_block"
    | "schedule_task"
    | "update_task"
    | "archive_task"
    | "move_deadline"
    | "mark_task_done"
    | "replace_today_plan"
    | "bulk_update_tasks"
    | "lower_priority_or_prune"
    | "ask_clarification"
    | "propose_task_split"
    | "summarize_today"
    | "interpret_review";
  label: string;
  payload: Record<string, unknown>;
  safety: "auto_apply" | "needs_confirmation";
  status: "proposed" | "applied" | "rejected" | "failed";
  appliedEntityId?: string;
  skippedReason?: string;
  validationErrors?: string[];
  model?: string;
  createdAt?: string;
  captureSessionId?: string;
  sourceMessageId?: string;
  pendingQuestionId?: string;
  // Intended folder name/path for a create_task whose folder may be created in the same
  // batch (T088 grouping). Resolved to a real folderId at apply time, after create_folder runs.
  pendingFolderName?: string;
}

export interface InboxEntry {
  id: string;
  createdAt: string;
  input: string;
  actions: AiAction[];
  summary: string;
  captureSessionId?: string;
  debugTrace?: AiDebugTrace;
}

export interface AiDebugTrace {
  calls: AiDebugCall[];
}

export interface AiDebugCall {
  label: string;
  model?: string;
  createdAt: string;
  instructions: string;
  input: string;
  response: string;
  parsedResponse?: unknown;
}

export interface CaptureMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ClarificationQuestion {
  id: string;
  actionId: string;
  question: string;
  kind: ClarificationKind;
  mode: ClarificationMode;
  status: "pending" | "answered" | "dismissed";
  options?: string[];
  materiality?: "low" | "medium" | "high";
  rationale?: string;
  answer?: string;
  createdAt: string;
  answeredAt?: string;
}

export interface CaptureRevisionEvent {
  id: string;
  createdAt: string;
  source: "clarification_answer" | "follow_up" | "fallback";
  taskId?: string;
  actionId?: string;
  model?: string;
  confidence?: number;
  summary: string;
  changes: string[];
  before?: Partial<Task>;
  after?: Partial<Task>;
}

export interface CaptureSession {
  id: string;
  status: CaptureSessionStatus;
  source: CaptureSource;
  createdAt: string;
  updatedAt: string;
  messages: CaptureMessage[];
  questions: ClarificationQuestion[];
  actionIds: string[];
  draftActionIds: string[];
  appliedEntityIds: string[];
  answeredFields: string[];
  revisionEvents: CaptureRevisionEvent[];
  unresolvedFields: string[];
  summary: string;
}

export interface AppState {
  currentDate: string;
  currentTime: string;
  availableMinutes: number;
  folders: Folder[]; // T088: canonical recursive structure store
  folderBlockSelections: FolderBlockSelection[];
  tasks: Task[];
  deferrals: DeferralLog[];
  completions: CompletionEvent[];
  executionEvents: ExecutionEvent[];
  dailyReviews: DailyReview[];
  inbox: InboxEntry[];
  captureSessions: CaptureSession[];
  // T090: committed day plans, one per date, created on first view of a day or by explicit
  // commit/replan. Source of truth for today's actionable plan once committed.
  committedPlans: CommittedDayPlan[];
  // Local date of the last guarded organizer pass (T069); used only by the explicit auto route.
  lastAutoOrganizeDate?: string;
  // Reserved for the guarded auto organizer route. The client uses an explicit button by default.
  autoOrganizeEnabled?: boolean;
}
