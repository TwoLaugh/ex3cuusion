package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Mirrors the string-literal unions in src/lib/types.ts. @SerialName carries the exact wire
// literal so JSON round-trips byte-compatibly with the web app.

@Serializable
enum class Energy {
    @SerialName("low") Low,
    @SerialName("medium") Medium,
    @SerialName("high") High
}

@Serializable
enum class Strictness {
    @SerialName("flexible") Flexible,
    @SerialName("normal") Normal,
    @SerialName("strict") Strict
}

@Serializable
enum class TaskStatus {
    @SerialName("active") Active,
    @SerialName("scheduled") Scheduled,
    @SerialName("completed") Completed,
    @SerialName("deferred") Deferred,
    @SerialName("blocked") Blocked,
    @SerialName("waiting") Waiting,
    @SerialName("archived") Archived
}

@Serializable
enum class TaskType {
    @SerialName("atomic") Atomic,
    @SerialName("project_task") ProjectTask,
    @SerialName("routine_instance") RoutineInstance,
    @SerialName("soft_invitation") SoftInvitation
}

@Serializable
enum class PlanItemType {
    @SerialName("routine") Routine,
    @SerialName("atomic_task") AtomicTask,
    @SerialName("folder_block") FolderBlock,
    @SerialName("soft_invitation") SoftInvitation
}

@Serializable
enum class PlanItemStatus {
    @SerialName("planned") Planned,
    @SerialName("completed") Completed,
    @SerialName("deferred") Deferred,
    @SerialName("unscheduled") Unscheduled,
    @SerialName("missed") Missed
}

@Serializable
enum class PlanSection {
    @SerialName("routines") Routines,
    @SerialName("main_blocks") MainBlocks,
    @SerialName("quick_tasks") QuickTasks,
    @SerialName("soft_invitations") SoftInvitations,
    @SerialName("later") Later
}

@Serializable
enum class LoadLevel {
    @SerialName("light") Light,
    @SerialName("normal") Normal,
    @SerialName("heavy") Heavy,
    @SerialName("overloaded") Overloaded
}

@Serializable
enum class CompletionBehavior {
    @SerialName("exhaust_once") ExhaustOnce,
    @SerialName("repeatable") Repeatable,
    @SerialName("keep_as_suggestion") KeepAsSuggestion,
    @SerialName("regenerate_after_completion") RegenerateAfterCompletion
}

@Serializable
enum class CompletionMode {
    @SerialName("simple_done") SimpleDone,
    @SerialName("outcome_done") OutcomeDone,
    @SerialName("timebox") Timebox,
    @SerialName("repeatable_checkoff") RepeatableCheckoff,
    @SerialName("progress_accumulating") ProgressAccumulating,
    @SerialName("suggestion_used") SuggestionUsed
}

@Serializable
enum class IntentType {
    @SerialName("obligation") Obligation,
    @SerialName("maintenance") Maintenance,
    @SerialName("progress") Progress,
    @SerialName("relationship") Relationship,
    @SerialName("idea") Idea,
    @SerialName("admin") Admin,
    @SerialName("health") Health,
    @SerialName("recovery") Recovery
}

@Serializable
enum class PressureLevel {
    @SerialName("fixed") Fixed,
    @SerialName("due") Due,
    @SerialName("scheduled") Scheduled,
    @SerialName("soft") Soft,
    @SerialName("someday") Someday
}

@Serializable
enum class TaskLocation {
    @SerialName("home") Home,
    @SerialName("work") Work,
    @SerialName("outside") Outside,
    @SerialName("phone") Phone,
    @SerialName("computer") Computer,
    @SerialName("anywhere") Anywhere
}

@Serializable
enum class SetupCost {
    @SerialName("low") Low,
    @SerialName("medium") Medium,
    @SerialName("high") High
}

@Serializable
enum class DateIntentKind {
    @SerialName("none") None,
    @SerialName("today") Today,
    @SerialName("tomorrow") Tomorrow,
    @SerialName("specific_date") SpecificDate,
    @SerialName("deadline") Deadline,
    @SerialName("week_window") WeekWindow,
    @SerialName("someday") Someday,
    @SerialName("recurring") Recurring
}

@Serializable
enum class SchedulingMode {
    @SerialName("exclusive") Exclusive,
    @SerialName("background") Background,
    @SerialName("concurrent") Concurrent,
    @SerialName("phased") Phased
}

@Serializable
enum class AttentionLoad {
    @SerialName("full") Full,
    @SerialName("partial") Partial,
    @SerialName("passive") Passive
}

@Serializable
enum class OverlapKind {
    @SerialName("phone") Phone,
    @SerialName("audio") Audio,
    @SerialName("passive_waiting") PassiveWaiting,
    @SerialName("ai_running") AiRunning,
    @SerialName("travel") Travel,
    @SerialName("cooking") Cooking,
    @SerialName("household") Household,
    @SerialName("computer") Computer
}

@Serializable
enum class TaskPhaseKind {
    @SerialName("active") Active,
    @SerialName("passive") Passive,
    @SerialName("return") Return
}

@Serializable
enum class ExecutionEventType {
    @SerialName("completed") Completed,
    @SerialName("worked_on") WorkedOn,
    @SerialName("partially_completed") PartiallyCompleted,
    @SerialName("deferred") Deferred,
    @SerialName("blocked") Blocked,
    @SerialName("waiting_on") WaitingOn,
    @SerialName("skipped") Skipped,
    @SerialName("canceled") Canceled,
    @SerialName("marked_not_important") MarkedNotImportant
}

@Serializable
enum class BlockedBy {
    @SerialName("person") Person,
    @SerialName("decision") Decision,
    @SerialName("missing_info") MissingInfo,
    @SerialName("materials") Materials,
    @SerialName("money") Money,
    @SerialName("date") Date,
    @SerialName("external_event") ExternalEvent,
    @SerialName("emotional_resistance") EmotionalResistance
}

@Serializable
enum class DeferralReason {
    @SerialName("no_time") NoTime,
    @SerialName("low_energy") LowEnergy,
    @SerialName("blocked") Blocked,
    @SerialName("too_vague") TooVague,
    @SerialName("overplanned") Overplanned,
    @SerialName("avoidance") Avoidance,
    @SerialName("not_important") NotImportant,
    @SerialName("moved_intentionally") MovedIntentionally,
    @SerialName("other") Other
}

// TS: DeferralReason | "did_part" | "waiting_on" | "skipped" | "canceled" — flattened to one enum
// because Kotlin cannot union enums.
@Serializable
enum class ExecutionEventReason {
    @SerialName("no_time") NoTime,
    @SerialName("low_energy") LowEnergy,
    @SerialName("blocked") Blocked,
    @SerialName("too_vague") TooVague,
    @SerialName("overplanned") Overplanned,
    @SerialName("avoidance") Avoidance,
    @SerialName("not_important") NotImportant,
    @SerialName("moved_intentionally") MovedIntentionally,
    @SerialName("other") Other,
    @SerialName("did_part") DidPart,
    @SerialName("waiting_on") WaitingOn,
    @SerialName("skipped") Skipped,
    @SerialName("canceled") Canceled
}

@Serializable
enum class CaptureSessionStatus {
    @SerialName("open") Open,
    @SerialName("waiting_for_user") WaitingForUser,
    @SerialName("applied") Applied,
    @SerialName("dismissed") Dismissed
}

@Serializable
enum class CaptureSource {
    @SerialName("inbox") Inbox,
    @SerialName("not_done") NotDone,
    @SerialName("daily_review") DailyReview
}

@Serializable
enum class ClarificationKind {
    @SerialName("definition_of_done") DefinitionOfDone,
    @SerialName("completion_behavior") CompletionBehavior,
    @SerialName("container_kind") ContainerKind,
    @SerialName("repeat_policy") RepeatPolicy,
    @SerialName("date") Date,
    @SerialName("split") Split,
    @SerialName("next_action") NextAction
}

@Serializable
enum class ClarificationMode {
    @SerialName("blocking") Blocking,
    @SerialName("optional") Optional,
    @SerialName("batch") Batch,
    @SerialName("refinement") Refinement
}

@Serializable
enum class QuestionStatus {
    @SerialName("pending") Pending,
    @SerialName("answered") Answered,
    @SerialName("dismissed") Dismissed
}

@Serializable
enum class Materiality {
    @SerialName("low") Low,
    @SerialName("medium") Medium,
    @SerialName("high") High
}

@Serializable
enum class DailyReviewEnergy {
    @SerialName("low") Low,
    @SerialName("normal") Normal,
    @SerialName("high") High
}

@Serializable
enum class DailyReviewPlanFit {
    @SerialName("underfilled") Underfilled,
    @SerialName("realistic") Realistic,
    @SerialName("overplanned") Overplanned
}

@Serializable
enum class FolderStatus {
    @SerialName("active") Active,
    @SerialName("archived") Archived
}

@Serializable
enum class DayListSource {
    @SerialName("recurring") Recurring,
    @SerialName("manual") Manual,
    @SerialName("tray") Tray,
    @SerialName("ai") Ai,
    @SerialName("carried") Carried
}

@Serializable
enum class TrayOutcome {
    @SerialName("added") Added,
    @SerialName("ignored") Ignored,
    @SerialName("ejected") Ejected
}

@Serializable
enum class PreferredWindow {
    @SerialName("morning") Morning,
    @SerialName("afternoon") Afternoon,
    @SerialName("evening") Evening
}

@Serializable
enum class Carryover {
    @SerialName("skip") Skip,
    @SerialName("reschedule") Reschedule,
    @SerialName("stack") Stack
}

@Serializable
enum class MessageRole {
    @SerialName("user") User,
    @SerialName("assistant") Assistant
}

@Serializable
enum class RevisionSource {
    @SerialName("clarification_answer") ClarificationAnswer,
    @SerialName("follow_up") FollowUp,
    @SerialName("fallback") Fallback
}

@Serializable
enum class AiActionType {
    @SerialName("create_task") CreateTask,
    @SerialName("create_folder") CreateFolder,
    @SerialName("schedule_block") ScheduleBlock,
    @SerialName("schedule_task") ScheduleTask,
    @SerialName("update_task") UpdateTask,
    @SerialName("archive_task") ArchiveTask,
    @SerialName("move_deadline") MoveDeadline,
    @SerialName("mark_task_done") MarkTaskDone,
    @SerialName("replace_today_plan") ReplaceTodayPlan,
    @SerialName("bulk_update_tasks") BulkUpdateTasks,
    @SerialName("lower_priority_or_prune") LowerPriorityOrPrune,
    @SerialName("ask_clarification") AskClarification,
    @SerialName("propose_task_split") ProposeTaskSplit,
    @SerialName("summarize_today") SummarizeToday,
    @SerialName("interpret_review") InterpretReview
}

@Serializable
enum class AiActionSafety {
    @SerialName("auto_apply") AutoApply,
    @SerialName("needs_confirmation") NeedsConfirmation
}

@Serializable
enum class AiActionStatus {
    @SerialName("proposed") Proposed,
    @SerialName("applied") Applied,
    @SerialName("rejected") Rejected,
    @SerialName("failed") Failed
}
