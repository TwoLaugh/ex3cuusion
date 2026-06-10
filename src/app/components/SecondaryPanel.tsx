"use client";

import { Archive, Layers3, Plus, Save } from "lucide-react";
import { FormEvent } from "react";
import type { AppState, DayPlan, PlanItem } from "@/lib/types";
import { folderPath } from "../lib/folders";
import { formatShortDate } from "../lib/format";
import { submitStructureForm, type PostFn } from "../lib/structure-forms";
import { buildBacklogSummary, buildTaskGroups, childStats, dateIntentLabel, isDescendantOfClient, sortTasks } from "../lib/task-view";
import { BacklogBoard } from "./BacklogBoard";
import { EditableBadge } from "./EditableBadge";
import { FolderPicker, FoldersPanel } from "./FoldersPanel";

export type SecondaryView = "Folders" | "Tasks" | "Planning preferences" | "AI activity";

const taskStatuses = ["active", "scheduled", "completed", "deferred", "blocked", "waiting", "archived"] as const;
const completionBehaviors = ["exhaust_once", "repeatable", "keep_as_suggestion", "regenerate_after_completion"] as const;
const completionModes = ["simple_done", "outcome_done", "timebox", "repeatable_checkoff", "progress_accumulating", "suggestion_used"] as const;

type Task = AppState["tasks"][number];

// T083: cap how deep the subtask tree renders (defensive alongside the ancestor cycle guard).
const maxTreeDepth = 5;

// T089: renders inline in the app shell's main column (the shell's nav rail owns switching),
// so there is no overlay positioning or close-button chrome here anymore.
export function SecondaryPanel({
  view,
  state,
  plan,
  post,
  runOrganizer,
  organizerRunning,
  updateCapacity
}: {
  view: SecondaryView;
  state: AppState;
  plan: DayPlan;
  post: PostFn;
  runOrganizer: () => Promise<void>;
  organizerRunning: boolean;
  updateCapacity: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const taskGroups = buildTaskGroups(state, plan);
  const backlogSummary = buildBacklogSummary(state, plan);

  // T083: nest subtasks under their parent card. A task renders as a child when its parent is
  // visible somewhere in the groups (the parent's group stays authoritative; the child is not
  // duplicated as a flat sibling). Children of hidden parents stay flat in their own group.
  const shownTaskIds = new Set(taskGroups.flatMap((group) => group.tasks.map((task) => task.id)));
  const childrenByParent = new Map<string, Task[]>();
  for (const task of sortTasks(state.tasks.filter((candidate) => !["completed", "archived"].includes(candidate.status)))) {
    if (!task.parentTaskId || !shownTaskIds.has(task.parentTaskId)) continue;
    childrenByParent.set(task.parentTaskId, [...(childrenByParent.get(task.parentTaskId) ?? []), task]);
  }

  return (
    <section className="secondaryPanel" aria-label={view}>
      <h1 className="viewTitle">{view}</h1>
      {view === "Folders" && <FoldersPanel state={state} post={post} />}
      {view === "Tasks" && (
        <div className="taskSections">
          <details className="backlogBoardWrap" open>
            <summary>Backlog board — drag to reschedule</summary>
            <BacklogBoard state={state} post={post} />
          </details>
          <form className="structureForm wideStructureForm" aria-label="Create task" onSubmit={(event) => submitStructureForm(event, post, "task", "create")}>
            <h2>New task</h2>
            <input name="title" placeholder="Task title" aria-label="Task title" />
            <FolderPicker state={state} ariaLabel="Task folder" defaultValue="" includeNone />
            <input name="effortMinutes" type="number" min="1" max="720" defaultValue="30" aria-label="Task minutes" />
            <input name="dueDate" type="date" aria-label="Task due date" />
            <button type="submit">
              <Plus size={15} />
              Add
            </button>
          </form>
          {taskGroups.map((group) => {
            const roots = group.tasks.filter((task) => !(task.parentTaskId && shownTaskIds.has(task.parentTaskId)));
            return (
              <section className="taskSection" aria-label={group.title} key={group.title}>
                <div className="sectionHeader">
                  <div>
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <span>{group.tasks.length}</span>
                </div>
                <div className="taskCards">
                  {roots.length === 0 && <p className="emptyPanel">Nothing here.</p>}
                  {roots.map((task) => (
                    <TaskTree
                      key={`${group.title}_${task.id}`}
                      state={state}
                      post={post}
                      task={task}
                      childrenByParent={childrenByParent}
                      depth={0}
                      ancestors={new Set()}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {view === "Planning preferences" && (
        <div className="panelGrid">
          <article>
            <h2>Capacity</h2>
            <p>{plan.summary}</p>
            <span>
              {plan.loadLevel} - committed {plan.estimatedTotalMinutes}/{plan.availableMinutes}m
            </span>
            <form className="inlineForm" onSubmit={updateCapacity}>
              <label>
                Focus capacity
                <input name="availableMinutes" type="number" min="90" max="960" step="15" defaultValue={state.availableMinutes} aria-label="Focus capacity minutes" />
              </label>
              <button aria-label="Save focus capacity">
                <Save size={14} />
              </button>
            </form>
          </article>
          <article>
            <h2>Time Model</h2>
            <p>{schedulingSummary(state)}</p>
            <span>{state.currentDate} - {state.currentTime}</span>
          </article>
          <article>
            <h2>Backlog</h2>
            <p>{backlogSummary.text}</p>
            <span>
              {backlogSummary.thisWeek} this week - {backlogSummary.nextWeek} next week - {backlogSummary.someday} someday
            </span>
          </article>
          <article>
            <h2>Automation</h2>
            <p>Run a conservative tidy-up only when you ask for it.</p>
            <button className="tidyButton" onClick={runOrganizer} disabled={organizerRunning} aria-label="Run a tidy-up maintenance pass">
              {organizerRunning ? "Tidying..." : "Run tidy-up"}
            </button>
          </article>
        </div>
      )}
      {view === "AI activity" && (
        <div className="panelList">
          {state.captureSessions.length === 0 && <p className="emptyPanel">No AI activity yet.</p>}
          {state.captureSessions.map((session) => (
            <article key={session.id}>
              <div>
                <h2>{session.summary}</h2>
                <p>{session.questions[0]?.question ?? session.messages[0]?.content ?? "No open questions."}</p>
                {session.revisionEvents.length > 0 && (
                  <small>
                    Last revision: {session.revisionEvents[session.revisionEvents.length - 1].changes.join(", ") || session.revisionEvents[session.revisionEvents.length - 1].summary}
                  </small>
                )}
              </div>
              <span>
                {session.status} - {session.actionIds.length} action{session.actionIds.length === 1 ? "" : "s"} - {session.appliedEntityIds.length} applied -{" "}
                {session.revisionEvents.length} revision{session.revisionEvents.length === 1 ? "" : "s"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// T083: a task card plus its nested subtasks, depth-limited and cycle-guarded via the
// accumulated ancestor set.
function TaskTree({
  state,
  post,
  task,
  childrenByParent,
  depth,
  ancestors
}: {
  state: AppState;
  post: PostFn;
  task: Task;
  childrenByParent: Map<string, Task[]>;
  depth: number;
  ancestors: Set<string>;
}) {
  const children = depth < maxTreeDepth && !ancestors.has(task.id) ? (childrenByParent.get(task.id) ?? []) : [];
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(task.id);
  return (
    <div className="taskTreeNode">
      <TaskCard state={state} post={post} task={task} nested={depth > 0} />
      {children.length > 0 && (
        <div className="subtaskChildren">
          {children.map((child) => (
            <TaskTree
              key={child.id}
              state={state}
              post={post}
              task={child}
              childrenByParent={childrenByParent}
              depth={depth + 1}
              ancestors={nextAncestors}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ state, post, task, nested }: { state: AppState; post: PostFn; task: Task; nested: boolean }) {
  // T079: priority / effort / due render as click-to-edit badges. The plain date-intent badge
  // is kept unless it would duplicate the editable due badge.
  const dueLabel = task.dueDate ? `due ${formatShortDate(task.dueDate)}` : "due —";
  const intentLabel = dateIntentLabel(task);
  return (
    <article className="taskCard">
      <div>
        <h3>{task.title}</h3>
        <p>{task.definitionOfDone || task.notes || task.plannerFields.intentType}</p>
      </div>
      <div className="badgeRow">
        <span className="taskBadge">{task.status}</span>
        {intentLabel !== dueLabel && <span className="taskBadge">{intentLabel}</span>}
        <EditableBadge
          taskId={task.id}
          field="priority"
          inputType="number"
          min={1}
          max={10}
          value={task.priority}
          display={`p${task.priority}`}
          ariaLabel={`Edit priority ${task.title}`}
          post={post}
        />
        <EditableBadge
          taskId={task.id}
          field="effortMinutes"
          inputType="number"
          min={1}
          max={720}
          value={task.effortMinutes}
          display={`${task.effortMinutes}m`}
          ariaLabel={`Edit minutes ${task.title}`}
          post={post}
        />
        <EditableBadge
          taskId={task.id}
          field="dueDate"
          inputType="date"
          value={task.dueDate}
          display={dueLabel}
          ariaLabel={`Edit due date ${task.title}`}
          post={post}
        />
        {task.folderId && <span className="taskBadge">{folderPath(state, task.folderId)}</span>}
        {!nested && task.parentTaskId && <span className="taskBadge">↳ subtask</span>}
        {task.repeatPolicy?.type && task.repeatPolicy.type !== "none" && (
          <span className="taskBadge">↻ {task.repeatPolicy.type}</span>
        )}
        {childStats(state, task.id).count > 0 && (
          <span className="taskBadge highlightBadge">
            {childStats(state, task.id).count} subtasks · {childStats(state, task.id).done}/{childStats(state, task.id).count} done · {childStats(state, task.id).minutes}m
          </span>
        )}
        {task.scheduling?.mode && task.scheduling.mode !== "exclusive" && (
          <span className="taskBadge highlightBadge">
            {task.scheduling.mode}/{task.scheduling.attentionLoad}
          </span>
        )}
      </div>
      <details className="inlineEditor">
        <summary>Edit</summary>
        <form onSubmit={(event) => submitStructureForm(event, post, "task", "update", task.id)}>
          <input name="title" defaultValue={task.title} aria-label={`Title ${task.title}`} />
          <FolderPicker state={state} ariaLabel={`Folder ${task.title}`} defaultValue={task.folderId ?? ""} includeNone />
          <select name="status" defaultValue={task.status} aria-label={`Status ${task.title}`}>
            {taskStatuses.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
          <div className="compactFields">
            <label className="fieldLabel">
              Priority
              <input name="priority" type="number" min="1" max="10" defaultValue={task.priority} aria-label={`Priority ${task.title}`} />
            </label>
            <label className="fieldLabel">
              Effort (min)
              <input name="effortMinutes" type="number" min="1" max="720" defaultValue={task.effortMinutes} aria-label={`Minutes ${task.title}`} />
            </label>
          </div>
          <div className="compactFields">
            <input name="dueDate" type="date" defaultValue={task.dueDate ?? ""} aria-label={`Due ${task.title}`} />
            <input name="scheduledDate" type="date" defaultValue={task.scheduledDate ?? ""} aria-label={`Scheduled ${task.title}`} />
            <input name="scheduledTime" type="time" defaultValue={task.scheduledTime ?? ""} aria-label={`Time ${task.title}`} />
          </div>
          <div className="compactFields">
            <select name="completionBehavior" defaultValue={task.completionBehavior} aria-label={`Behavior ${task.title}`}>
              {completionBehaviors.map((behavior) => (
                <option value={behavior} key={behavior}>
                  {behavior}
                </option>
              ))}
            </select>
            <select name="completionMode" defaultValue={task.completionMode ?? "simple_done"} aria-label={`Mode ${task.title}`}>
              {completionModes.map((mode) => (
                <option value={mode} key={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
          <details className="advancedFields">
            <summary>Advanced</summary>
            <div className="compactFields">
              <label className="fieldLabel">
                Importance
                <input name="importance" type="number" min="1" max="10" defaultValue={task.importance} aria-label={`Importance ${task.title}`} />
              </label>
              <label className="fieldLabel">
                Urgency
                <input name="urgency" type="number" min="1" max="10" defaultValue={task.urgency} aria-label={`Urgency ${task.title}`} />
              </label>
            </div>
            <div className="compactFields">
              <label className="fieldLabel">
                Energy
                <select name="energy" defaultValue={task.energy} aria-label={`Energy ${task.title}`}>
                  {["low", "medium", "high"].map((value) => (
                    <option value={value} key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="fieldLabel">
                Strictness
                <select name="strictness" defaultValue={task.strictness} aria-label={`Strictness ${task.title}`}>
                  {["flexible", "normal", "strict"].map((value) => (
                    <option value={value} key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="fieldLabel">
                Overlap
                <select
                  name="schedulingMode"
                  defaultValue={["concurrent", "background", "phased"].includes(task.scheduling?.mode ?? "") ? task.scheduling!.mode : "exclusive"}
                  aria-label={`Overlap mode ${task.title}`}
                >
                  {["exclusive", "concurrent", "background", "phased"].map((value) => (
                    <option value={value} key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="compactFields">
              <label className="fieldLabel">
                Min (min)
                <input name="minMinutes" type="number" min="1" max="720" defaultValue={task.minMinutes ?? ""} aria-label={`Min minutes ${task.title}`} />
              </label>
              <label className="fieldLabel">
                Max (min)
                <input name="maxMinutes" type="number" min="1" max="720" defaultValue={task.maxMinutes ?? ""} aria-label={`Max minutes ${task.title}`} />
              </label>
            </div>
            <div className="compactFields">
              <label className="fieldLabel">
                Repeats
                <select name="repeatType" defaultValue={task.repeatPolicy?.type ?? "none"} aria-label={`Repeats ${task.title}`}>
                  {["none", "daily", "weekly"].map((value) => (
                    <option value={value} key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="fieldLabel">
                Weekly days (0-6)
                <input
                  name="repeatDays"
                  defaultValue={task.repeatPolicy?.type === "weekly" ? (task.repeatPolicy.days ?? []).join(", ") : ""}
                  placeholder="1, 3, 5"
                  aria-label={`Repeat days ${task.title}`}
                />
              </label>
            </div>
            <input name="tags" defaultValue={(task.tags ?? []).join(", ")} placeholder="tags, comma, separated" aria-label={`Tags ${task.title}`} />
            <label className="fieldLabel">
              Parent task (subtask of)
              <select name="parentTaskId" defaultValue={task.parentTaskId ?? ""} aria-label={`Parent task ${task.title}`}>
                <option value="">No parent</option>
                {state.tasks
                  .filter(
                    (candidate) =>
                      candidate.id !== task.id &&
                      candidate.status !== "archived" &&
                      !isDescendantOfClient(state, candidate.id, task.id)
                  )
                  .map((candidate) => (
                    <option value={candidate.id} key={candidate.id}>{candidate.title}</option>
                  ))}
              </select>
            </label>
          </details>
          <textarea name="definitionOfDone" defaultValue={task.definitionOfDone ?? ""} aria-label={`Definition of done ${task.title}`} />
          <textarea name="notes" defaultValue={task.notes ?? ""} aria-label={`Notes ${task.title}`} />
          <div className="formActions">
            <button type="submit">
              <Save size={15} />
              Save
            </button>
            <button type="button" onClick={() => post("/api/structure", { entity: "task", action: "archive", id: task.id })}>
              <Archive size={15} />
              Archive
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

export function PlanItemMeta({ item }: { item: PlanItem }) {
  return (
    <div className="metaRow">
      <span>{item.estimatedMinutes}m - {labelForSection(item.section)}</span>
      {item.schedulingMode && item.schedulingMode !== "exclusive" && (
        <span className="modeBadge" title={schedulingLabel(item)}>
          <Layers3 size={13} />
          {item.schedulingMode}
        </span>
      )}
      {item.attentionLoad && item.attentionLoad !== "full" && <span className="loadPill">{item.attentionLoad}</span>}
    </div>
  );
}

export function labelForSection(section: PlanItem["section"]): string {
  return {
    routines: "routine",
    main_blocks: "main block",
    quick_tasks: "quick task",
    soft_invitations: "soft invitation",
    later: "later"
  }[section];
}

function schedulingLabel(item: PlanItem): string {
  const blocking = item.blockingMinutes ?? item.estimatedMinutes;
  const clock = item.clockMinutes ?? item.estimatedMinutes;
  return `${item.schedulingMode} - ${item.attentionLoad ?? "full"} attention - ${blocking}/${clock}m blocking`;
}

function schedulingSummary(state: AppState): string {
  const counts = state.tasks.reduce<Record<string, number>>((acc, task) => {
    const mode = task.scheduling?.mode ?? "exclusive";
    acc[mode] = (acc[mode] ?? 0) + 1;
    return acc;
  }, {});
  return `${counts.background ?? 0} background, ${counts.concurrent ?? 0} concurrent, ${counts.phased ?? 0} phased tasks tracked. Passive work can overlap; full-focus work still blocks the day.`;
}
