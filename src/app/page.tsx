"use client";

import { Bot, Check, ChevronLeft, ChevronRight, Clock3, Layers3, Menu, Send, Undo2, X } from "lucide-react";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { isDateInRange, nextWeekRange, weekRange } from "@/lib/dates";
import type { AppState, DayPlan, PlanItem } from "@/lib/types";

type ApiPayload = { state: AppState; plan: DayPlan };
type PostFn = (url: string, body?: Record<string, unknown>) => Promise<void>;
type SecondaryView = "Domains" | "Projects" | "Tasks" | "Routines" | "Planning preferences" | "AI activity";
const secondaryViews: SecondaryView[] = ["Domains", "Projects", "Tasks", "Routines", "Planning preferences", "AI activity"];

export default function Home() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<SecondaryView | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanItem | null>(null);
  const [notDoneItem, setNotDoneItem] = useState<PlanItem | null>(null);
  const [notDoneReason, setNotDoneReason] = useState("no_time");
  const [notDoneNote, setNotDoneNote] = useState("");
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({});
  const [todayIndex, setTodayIndex] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/state", { cache: "no-store" });
    setPayload(await response.json());
  }

  async function post(url: string, body: Record<string, unknown> = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const message = await responseError(response);
      throw new Error(message || `Request failed with ${response.status}`);
    }
    setPayload(await response.json());
  }

  useEffect(() => {
    refresh();
    setTodayIndex(systemWeekdayIndex());
  }, []);

  const plan = payload?.plan;
  const state = payload?.state;
  const selectedTasks = useMemo(() => {
    if (!state || !selected?.selectedTaskIds) return [];
    return selected.selectedTaskIds
      .map((taskId) => state.tasks.find((task) => task.id === taskId))
      .filter((task): task is AppState["tasks"][number] => Boolean(task));
  }, [state, selected]);
  const timeline = useMemo(() => (plan ? buildTimeline(plan.items, state?.currentTime) : null), [plan, state?.currentTime]);

  if (!payload || !plan || !state) {
    return <main className="loading">Building today...</main>;
  }

  async function submitInbox() {
    if (!draft.trim()) return;
    setSending(true);
    setInboxError(null);
    try {
      await post("/api/inbox", { input: draft.trim() });
      setDraft("");
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "AI request failed.");
    } finally {
      setSending(false);
    }
  }

  async function submitNotDone() {
    if (!notDoneItem) return;
    const outcomeByReason: Record<string, string> = {
      no_energy: "deferred",
      no_time: "deferred",
      blocked: "blocked",
      waiting_on: "waiting_on",
      too_vague: "partially_completed",
      did_part: "worked_on",
      not_important: "marked_not_important",
      moved_intentionally: "deferred",
      other: "skipped"
    };
    await post("/api/plan/outcome", {
      planItemId: notDoneItem.id,
      type: outcomeByReason[notDoneReason] ?? "skipped",
      reason: notDoneReason === "no_energy" ? "low_energy" : notDoneReason,
      note: notDoneNote || undefined,
      blocked: notDoneReason === "blocked" ? { blockedBy: "missing_info", note: notDoneNote || undefined } : undefined,
      waiting: notDoneReason === "waiting_on" ? { waitingOn: notDoneNote || "someone" } : undefined
    });
    setNotDoneItem(null);
    setNotDoneReason("no_time");
    setNotDoneNote("");
  }

  async function answerClarification(sessionId: string, questionId: string, answer: string) {
    if (!answer.trim()) return;
    await post(`/api/capture-sessions/${sessionId}/answer`, { questionId, answer: answer.trim() });
    setClarificationDrafts((drafts) => {
      const next = { ...drafts };
      delete next[questionId];
      return next;
    });
  }

  return (
    <main className="shell">
      <aside className={menuOpen ? "sideNav sideNavOpen" : "sideNav"} aria-label="Secondary pages">
        <button className="iconButton closeButton" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <X size={19} />
        </button>
        <nav>
          {secondaryViews.map((item) => (
            <button
              key={item}
              className={activeView === item ? "navItem activeNavItem" : "navItem"}
              onClick={() => {
                setActiveView(item);
                setMenuOpen(false);
              }}
            >
              {item}
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <button className="iconButton" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="dateNavigator">
          <div className="dayDots" aria-label="Week position">
            {weekDots(plan.date, todayIndex).map((dot) => (
              <span
                aria-label={dot.label}
                className={`${dot.viewed ? "viewedDot" : ""} ${dot.today ? "todayDot" : ""}`}
                key={dot.label}
                title={dot.label}
              />
            ))}
          </div>
          <div className="dateControls">
            <button className="iconButton dateStep" onClick={() => post("/api/time", { retreat: true })} aria-label="Previous day">
              <ChevronLeft size={20} />
            </button>
            <div className="dateDisplay">
              <h1 aria-label={formatDate(plan.date)}>{formatShortDate(plan.date)}</h1>
              <p>{formatDay(plan.date)}</p>
            </div>
            <button className="iconButton dateStep" onClick={() => post("/api/time", { advance: true })} aria-label="Next day">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="loadBadge" data-testid="load-level">
          <Clock3 size={16} />
          {plan.loadLevel} - {state.currentTime} - {plan.estimatedTotalMinutes}/{plan.availableMinutes}m
        </div>
      </header>

      {activeView && <SecondaryPanel view={activeView} state={state} plan={plan} onClose={() => setActiveView(null)} />}

      <section className="calendarTimeline" aria-label="Timed day plan">
        <div className="calendarScroll">
          <div className="timeColumn" style={{ height: timeline?.height }}>
            {timeline?.hours.map((hour) => (
              <div className="hourLabel" key={hour.time} style={{ top: hour.top }}>
                {hour.time}
              </div>
            ))}
          </div>
          <div className="calendarGrid" style={{ height: timeline?.height }}>
            {timeline?.hours.map((hour) => <div className="hourLine" key={hour.time} style={{ top: hour.top }} />)}
            {timeline?.items.map(({ item, top, height, left, width, laneCount }) => (
              <article
                className={`timelineBlock ${item.status} ${item.estimatedMinutes < 30 ? "compactBlock" : ""} ${
                  item.estimatedMinutes <= 15 ? "microBlock" : ""
                } ${laneCount > 1 ? "overlapBlock" : ""} ${
                  item.schedulingMode && item.schedulingMode !== "exclusive" ? `mode-${item.schedulingMode}` : ""
                }`}
                key={item.id}
                data-testid={`plan-item-${item.title}`}
                style={{ top, height, left: `${left}%`, width: `${width}%` }}
              >
                <div className="blockContent">
                  <div>
                    <div className="blockTime">
                      {item.startTime} - {item.endTime}
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.reason}</p>
                    <PlanItemMeta item={item} />
                    {item.status !== "planned" && <strong className="statusPill">{statusLabel(item.status)}</strong>}
                  </div>
                  <PlanItemActions item={item} post={post} setSelected={setSelected} setNotDoneItem={setNotDoneItem} />
                </div>
              </article>
            ))}
          </div>
        </div>
        {timeline?.unscheduled.map((item) => (
          <article className={`unscheduledItem ${item.status}`} key={item.id} data-testid={`plan-item-${item.title}`}>
            <div>
              <h2>{item.title}</h2>
              <p>{item.reason}</p>
              <PlanItemMeta item={item} />
              {item.status !== "planned" && <strong className="statusPill">{statusLabel(item.status)}</strong>}
            </div>
            <PlanItemActions item={item} post={post} setSelected={setSelected} setNotDoneItem={setNotDoneItem} />
          </article>
        ))}
      </section>

      {selected && (
        <div className="drawer" role="dialog" aria-label={`${selected.title} project drawer`}>
          <button className="iconButton closeButton" onClick={() => setSelected(null)} aria-label="Close project drawer">
            <X size={18} />
          </button>
          <p className="eyebrow">Project block</p>
          <h2>{selected.title}</h2>
          <div className="subtasks">
            {selectedTasks.map((task) => {
              const completedToday = isTaskCompletedToday(task, state.currentDate);
              return (
                <div className={completedToday ? "subtaskRow completedSubtask" : "subtaskRow"} key={task.id}>
                  <button
                    className={completedToday ? "subtaskCheck active" : "subtaskCheck"}
                    onClick={() => post("/api/plan/complete", { planItemId: selected.id, completedTaskIds: [task.id] })}
                    aria-label={completedToday ? `Undo complete ${task.title}` : `Complete ${task.title}`}
                  >
                    {completedToday ? <Undo2 size={15} /> : <Check size={15} />}
                  </button>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.effortMinutes}m - {task.energy}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button className="aiButton" onClick={() => setInboxOpen(true)} aria-label="Open AI inbox">
        <Bot size={28} />
      </button>

      {inboxOpen && (
        <div className="overlay" role="dialog" aria-label="AI inbox">
          <section className="inboxPanel">
            <button className="iconButton closeButton" onClick={() => setInboxOpen(false)} aria-label="Close AI inbox">
              <X size={18} />
            </button>
            <p className="eyebrow">AI inbox</p>
            <h2>Capture messy input</h2>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Need back rehab daily, clean garage this weekend, finish auth bug before Friday..."
              aria-label="Inbox input"
            />
            <button className="sendButton" onClick={submitInbox} disabled={sending}>
              <Send size={16} />
              {sending ? "Thinking..." : "Send to AI"}
            </button>
            {inboxError && (
              <p className="errorMessage" role="alert">
                {inboxError}
              </p>
            )}
            <div className="inboxLog">
              {state.inbox.map((entry) => (
                <InboxSession
                  key={entry.id}
                  entry={entry}
                  session={state.captureSessions.find((session) => session.id === entry.captureSessionId)}
                  clarificationDrafts={clarificationDrafts}
                  setClarificationDrafts={setClarificationDrafts}
                  answerClarification={answerClarification}
                  post={post}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {notDoneItem && (
        <div className="overlay" role="dialog" aria-label={`Not done ${notDoneItem.title}`}>
          <section className="notDonePanel">
            <button className="iconButton closeButton" onClick={() => setNotDoneItem(null)} aria-label="Close not done">
              <X size={18} />
            </button>
            <p className="eyebrow">Not done</p>
            <h2>{notDoneItem.title}</h2>
            <select value={notDoneReason} onChange={(event) => setNotDoneReason(event.target.value)} aria-label="Reason">
              <option value="no_time">No time</option>
              <option value="no_energy">No energy</option>
              <option value="blocked">Blocked</option>
              <option value="waiting_on">Waiting on someone</option>
              <option value="too_vague">Too vague</option>
              <option value="did_part">Did part</option>
              <option value="not_important">Not important</option>
              <option value="moved_intentionally">Moved intentionally</option>
              <option value="other">Other</option>
            </select>
            <textarea
              value={notDoneNote}
              onChange={(event) => setNotDoneNote(event.target.value)}
              placeholder="Optional note, blocker, or next action..."
              aria-label="Not done note"
            />
            <button className="sendButton" onClick={submitNotDone}>
              Save
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function InboxSession({
  entry,
  session,
  clarificationDrafts,
  setClarificationDrafts,
  answerClarification,
  post
}: {
  entry: AppState["inbox"][number];
  session?: AppState["captureSessions"][number];
  clarificationDrafts: Record<string, string>;
  setClarificationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  answerClarification: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  post: PostFn;
}) {
  const pendingQuestions = session?.questions.filter((question) => question.status === "pending") ?? [];
  const appliedActions = entry.actions.filter((action) => action.status === "applied" && action.type !== "ask_clarification");
  const proposedActions = entry.actions.filter(
    (action) => action.status === "proposed" && action.safety === "needs_confirmation" && action.type !== "ask_clarification"
  );

  return (
    <article className={pendingQuestions.length ? "inboxSession needsAnswer" : "inboxSession"}>
      <div className="chatMessage userMessage">
        <span>You</span>
        <p>{entry.input}</p>
      </div>
      {pendingQuestions.length === 0 && (
        <div className="chatMessage assistantMessage">
          <span>AI</span>
          <p>{entry.summary}</p>
        </div>
      )}
      {pendingQuestions.map((question) => (
        <div className="clarificationCard" key={question.id}>
          <div className="chatMessage assistantMessage">
            <span>AI</span>
            <strong>{question.question}</strong>
            {question.rationale && <small>{question.rationale}</small>}
          </div>
          {question.options?.length ? (
            <div className="clarificationOptions">
              {question.options.map((option) => (
                <button key={option} onClick={() => answerClarification(session!.id, question.id, option)}>
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          <div className="clarificationAnswer">
            <input
              value={clarificationDrafts[question.id] ?? ""}
              onChange={(event) => setClarificationDrafts((drafts) => ({ ...drafts, [question.id]: event.target.value }))}
              placeholder="Answer briefly..."
              aria-label={`Answer ${question.question}`}
            />
            <button onClick={() => answerClarification(session!.id, question.id, clarificationDrafts[question.id] ?? "")}>Answer</button>
          </div>
        </div>
      ))}
      {appliedActions.length > 0 && (
        <div className="actionSummary">
          <strong>Applied</strong>
          {appliedActions.map((action) => (
            <span key={action.id}>{actionSummary(action)}</span>
          ))}
        </div>
      )}
      {proposedActions.map((action) => (
        <div className="actionDecision" key={action.id}>
          <strong>Needs confirmation</strong>
          <span>{action.label}</span>
          <button onClick={() => post(`/api/ai-actions/${action.id}/confirm`)}>Confirm</button>
          <button onClick={() => post(`/api/ai-actions/${action.id}/reject`, { reason: "Rejected from inbox." })}>Reject</button>
        </div>
      ))}
    </article>
  );
}

function actionSummary(action: AppState["inbox"][number]["actions"][number]): string {
  if (action.type === "create_task") return `Task: ${String(action.payload.title ?? action.label)}`;
  if (action.type === "create_routine") return `Routine: ${String(action.payload.title ?? action.label)}`;
  if (action.type === "create_project") return `Project: ${String(action.payload.name ?? action.payload.title ?? action.label)}`;
  return action.label;
}

async function responseError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

function SecondaryPanel({
  view,
  state,
  plan,
  onClose
}: {
  view: SecondaryView;
  state: AppState;
  plan: DayPlan;
  onClose: () => void;
}) {
  const taskGroups = buildTaskGroups(state, plan);
  const projectSummaries = buildProjectSummaries(state);
  const backlogSummary = buildBacklogSummary(state, plan);

  return (
    <section className="secondaryPanel" aria-label={view}>
      <button className="iconButton closeButton" onClick={onClose} aria-label={`Close ${view}`}>
        <X size={18} />
      </button>
      <p className="eyebrow">{view}</p>
      {view === "Domains" && (
        <div className="panelGrid">
          {state.domains.map((domain) => (
            <article key={domain.id}>
              <h2>{domain.name}</h2>
              <span>Weight {domain.weight}</span>
            </article>
          ))}
        </div>
      )}
      {view === "Projects" && (
        <div className="panelGrid">
          {projectSummaries.map(({ project, activeTasks, nextTasks }) => (
            <article key={project.id} className="projectCard">
              <h2>{project.name}</h2>
              <p>{project.contextNote || project.planningMode}</p>
              <span>
                {project.kind} - {project.planningMode} - {activeTasks.length} active - {project.defaultBlockMinutes}m
              </span>
              <div className="projectTaskList">
                {nextTasks.length === 0 && <small>No active child tasks.</small>}
                {nextTasks.map((task) => (
                  <small key={task.id}>
                    {task.title} · {task.effortMinutes}m · {dateIntentLabel(task)}
                  </small>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {view === "Tasks" && (
        <div className="taskSections">
          {taskGroups.map((group) => (
            <section className="taskSection" aria-label={group.title} key={group.title}>
              <div className="sectionHeader">
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <span>{group.tasks.length}</span>
              </div>
              <div className="taskCards">
                {group.tasks.length === 0 && <p className="emptyPanel">Nothing here.</p>}
                {group.tasks.map((task) => (
                  <article className="taskCard" key={`${group.title}_${task.id}`}>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.definitionOfDone || task.notes || task.plannerFields.intentType}</p>
                    </div>
                    <div className="badgeRow">
                      <span className="taskBadge">{task.status}</span>
                      <span className="taskBadge">{dateIntentLabel(task)}</span>
                      <span className="taskBadge">{task.effortMinutes}m</span>
                      {task.projectId && <span className="taskBadge">{projectName(state, task.projectId)}</span>}
                      {task.scheduling?.mode && task.scheduling.mode !== "exclusive" && (
                        <span className="taskBadge highlightBadge">
                          {task.scheduling.mode}/{task.scheduling.attentionLoad}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {view === "Routines" && (
        <div className="panelGrid">
          {state.routines.map((routine) => (
            <article key={routine.id}>
              <h2>{routine.title}</h2>
              <p>{routine.recurrence.type === "daily" ? "Daily" : `Weekly: ${routine.recurrence.days.join(", ")}`}</p>
              <span>
                {routine.defaultEffortMinutes}m - {routine.energy} - {routine.strictness}
              </span>
            </article>
          ))}
        </div>
      )}
      {view === "Planning preferences" && (
        <div className="panelGrid">
          <article>
            <h2>Capacity</h2>
            <p>{plan.summary}</p>
            <span>
              {plan.loadLevel} - {plan.estimatedTotalMinutes}/{plan.availableMinutes}m
            </span>
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
              </div>
              <span>
                {session.status} - {session.actionIds.length} action{session.actionIds.length === 1 ? "" : "s"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PlanItemMeta({ item }: { item: PlanItem }) {
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

type Task = AppState["tasks"][number];

function buildTaskGroups(state: AppState, plan: DayPlan): { title: string; description: string; tasks: Task[] }[] {
  const plannedTaskIds = new Set(plan.items.flatMap((item) => [...(item.taskId ? [item.taskId] : []), ...(item.selectedTaskIds ?? [])]));
  const openTasks = state.tasks.filter((task) => !["completed", "archived"].includes(task.status));
  const plannedToday = openTasks.filter((task) => plannedTaskIds.has(task.id));
  const blockedWaiting = openTasks.filter((task) => ["blocked", "waiting"].includes(task.status));
  const background = openTasks.filter((task) => task.scheduling && task.scheduling.mode !== "exclusive");
  const nextWeek = openTasks.filter((task) => !plannedTaskIds.has(task.id) && isTaskInNamedWeek(task, state.currentDate, "next"));
  const thisWeek = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      isTaskInNamedWeek(task, state.currentDate, "this")
  );
  const someday = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      !thisWeek.some((candidate) => candidate.id === task.id) &&
      isSomedayTask(task)
  );
  const loose = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      !thisWeek.some((candidate) => candidate.id === task.id) &&
      !someday.some((candidate) => candidate.id === task.id) &&
      !blockedWaiting.some((candidate) => candidate.id === task.id)
  );

  return [
    { title: "Planned today", description: "Visible in the current day timeline or project block.", tasks: sortTasks(plannedToday) },
    { title: "This week backlog", description: "Due, scheduled, or windowed inside the current week but not on this day.", tasks: sortTasks(thisWeek) },
    { title: "Next week backlog", description: "Captured for next week without needing a full calendar view.", tasks: sortTasks(nextWeek) },
    { title: "Someday / suggestions", description: "Soft ideas and reusable suggestions that should not compete with urgent work.", tasks: sortTasks(someday) },
    { title: "Blocked / waiting", description: "Items that need an unblock action, person, or external event.", tasks: sortTasks(blockedWaiting) },
    { title: "Background / phased", description: "Work that can overlap, run passively, or return in phases.", tasks: sortTasks(background) },
    { title: "Loose backlog", description: "Active tasks without a strong date intent yet.", tasks: sortTasks(loose) }
  ];
}

function buildProjectSummaries(state: AppState) {
  return state.projects.map((project) => {
    const activeTasks = state.tasks.filter((task) => task.projectId === project.id && !["completed", "archived"].includes(task.status));
    return {
      project,
      activeTasks,
      nextTasks: sortTasks(activeTasks).slice(0, 3)
    };
  });
}

function buildBacklogSummary(state: AppState, plan: DayPlan) {
  const groups = buildTaskGroups(state, plan);
  const count = (title: string) => groups.find((group) => group.title === title)?.tasks.length ?? 0;
  const thisWeek = count("This week backlog");
  const nextWeek = count("Next week backlog");
  const someday = count("Someday / suggestions");
  const blocked = count("Blocked / waiting");
  return {
    thisWeek,
    nextWeek,
    someday,
    text: `${thisWeek + nextWeek} dated backlog tasks outside this day, ${someday} soft items, ${blocked} blocked or waiting.`
  };
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.priority + b.importance + b.urgency - (a.priority + a.importance + a.urgency));
}

function isTaskInNamedWeek(task: Task, currentDate: string, target: "this" | "next"): boolean {
  const range = target === "this" ? weekRange(currentDate) : nextWeekRange(currentDate);
  if (isDateInRange(task.scheduledDate, range.startDate, range.endDate)) return true;
  if (isDateInRange(task.dueDate, range.startDate, range.endDate)) return true;
  if (task.dateIntent?.kind === "week_window") {
    return Boolean(task.dateIntent.startDate && task.dateIntent.endDate && task.dateIntent.startDate <= range.endDate && task.dateIntent.endDate >= range.startDate);
  }
  if (task.dateIntent?.kind === "deadline") return isDateInRange(task.dateIntent.dueDate, range.startDate, range.endDate);
  if (task.dateIntent?.kind === "specific_date" || task.dateIntent?.kind === "today" || task.dateIntent?.kind === "tomorrow") {
    return isDateInRange(task.dateIntent.scheduledDate, range.startDate, range.endDate);
  }
  return false;
}

function isSomedayTask(task: Task): boolean {
  return (
    task.dateIntent?.kind === "someday" ||
    task.completionBehavior === "keep_as_suggestion" ||
    task.plannerFields.pressureLevel === "someday" ||
    task.plannerFields.pressureLevel === "soft"
  );
}

function dateIntentLabel(task: Task): string {
  if (task.dateIntent?.kind === "week_window" && task.dateIntent.startDate && task.dateIntent.endDate) {
    return `${formatShortDate(task.dateIntent.startDate)}-${formatShortDate(task.dateIntent.endDate)}`;
  }
  if (task.dateIntent?.kind === "deadline" && task.dateIntent.dueDate) return `due ${formatShortDate(task.dateIntent.dueDate)}`;
  if (task.dateIntent?.kind === "specific_date" && task.dateIntent.scheduledDate) return formatShortDate(task.dateIntent.scheduledDate);
  if (task.dateIntent?.kind && task.dateIntent.kind !== "none") return task.dateIntent.kind.replace("_", " ");
  if (task.scheduledDate) return formatShortDate(task.scheduledDate);
  if (task.dueDate) return `due ${formatShortDate(task.dueDate)}`;
  return task.plannerFields.pressureLevel;
}

function projectName(state: AppState, projectId: string): string {
  return state.projects.find((project) => project.id === projectId)?.name ?? "Project";
}

function PlanItemActions({
  item,
  post,
  setSelected,
  setNotDoneItem
}: {
  item: PlanItem;
  post: PostFn;
  setSelected: Dispatch<SetStateAction<PlanItem | null>>;
  setNotDoneItem: Dispatch<SetStateAction<PlanItem | null>>;
}) {
  return (
    <div className="itemActions">
      <button
        className={item.status === "completed" ? "doneButton active" : "doneButton"}
        onClick={() => post("/api/plan/complete", { planItemId: item.id })}
        aria-label={item.status === "completed" ? `Undo complete ${item.title}` : `Complete ${item.title}`}
      >
        {item.status === "completed" ? <Undo2 size={16} /> : <Check size={16} />}
      </button>
      <button
        className={item.status === "deferred" ? "deferButton active" : "deferButton"}
        onClick={() => setNotDoneItem(item)}
      >
        {item.status === "deferred" ? "Deferred" : "Not done"}
      </button>
      {item.type === "project_block" && <button onClick={() => setSelected(item)}>Open</button>}
    </div>
  );
}

const pixelsPerMinute = 2;

function buildTimeline(items: PlanItem[], currentTime?: string) {
  const scheduled = items.filter((item) => isClockTime(item.startTime) && isClockTime(item.endTime));
  const unscheduled = items.filter((item) => !isClockTime(item.startTime) || !isClockTime(item.endTime));
  const scheduledWithLanes = assignOverlapLanes(scheduled, currentTime);
  const fallbackStart = currentTime ? toMinutes(currentTime) : 8 * 60;
  const fallbackEnd = currentTime ? toMinutes(currentTime) : 17 * 60;
  const startMinutes = Math.max(0, Math.min(...scheduled.map((item) => absoluteStartMinutes(item, currentTime)), fallbackStart) - 30);
  const endMinutes = Math.max(...scheduled.map((item) => absoluteEndMinutes(item, currentTime)), fallbackEnd) + 30;
  const height = Math.max(480, (endMinutes - startMinutes) * pixelsPerMinute);
  const firstHour = Math.ceil(startMinutes / 60) * 60;
  const hours = [];

  for (let minute = firstHour; minute <= endMinutes; minute += 60) {
    hours.push({ time: fromMinutes(minute), top: (minute - startMinutes) * pixelsPerMinute });
  }

  return {
    height,
    hours,
    unscheduled,
    items: scheduledWithLanes.map(({ item, lane, laneCount }) => {
      const itemStart = absoluteStartMinutes(item, currentTime);
      const itemEnd = absoluteEndMinutes(item, currentTime);
      const gutter = laneCount > 1 ? 1.5 : 0;
      const width = laneCount > 1 ? 100 / laneCount - gutter : 100;
      return {
        item,
        top: (itemStart - startMinutes) * pixelsPerMinute,
        height: Math.max(22, (itemEnd - itemStart) * pixelsPerMinute - 6),
        left: laneCount > 1 ? lane * (100 / laneCount) : 0,
        width,
        laneCount
      };
    })
  };
}

function assignOverlapLanes(items: PlanItem[], currentTime?: string) {
  const sorted = [...items].sort((a, b) => absoluteStartMinutes(a, currentTime) - absoluteStartMinutes(b, currentTime));
  const laneEnds: number[] = [];
  const assigned = sorted.map((item) => {
    const start = absoluteStartMinutes(item, currentTime);
    const end = absoluteEndMinutes(item, currentTime);
    let lane = laneEnds.findIndex((candidateEnd) => candidateEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    return { item, lane, start, end, laneCount: 1 };
  });

  return assigned.map((entry) => {
    const laneCount = Math.max(
      1,
      ...assigned
        .filter((candidate) => candidate.start < entry.end && candidate.end > entry.start)
        .map((candidate) => candidate.lane + 1)
    );
    return { ...entry, laneCount };
  });
}

function isClockTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function endMinutesFor(item: PlanItem): number {
  const start = toMinutes(item.startTime);
  const end = toMinutes(item.endTime);
  return end <= start ? end + 24 * 60 : end;
}

function absoluteStartMinutes(item: PlanItem, currentTime?: string): number {
  const start = toMinutes(item.startTime);
  const current = currentTime ? toMinutes(currentTime) : 0;
  if (current >= 18 * 60 && start < 6 * 60) return start + 24 * 60;
  return start;
}

function absoluteEndMinutes(item: PlanItem, currentTime?: string): number {
  const start = absoluteStartMinutes(item, currentTime);
  const rawEnd = toMinutes(item.endTime);
  const normalizedEnd = rawEnd <= toMinutes(item.startTime) ? rawEnd + 24 * 60 : rawEnd;
  return normalizedEnd < start ? normalizedEnd + 24 * 60 : normalizedEnd;
}

function fromMinutes(minutes: number): string {
  const wrapped = minutes % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function formatDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateOnly}T12:00:00.000Z`));
}

function formatShortDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-");
  return `${day}.${month}.${year.slice(2)}`;
}

function formatDay(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short"
  }).format(new Date(`${dateOnly}T12:00:00.000Z`));
}

function weekDots(dateOnly: string, todayIndex: number | null) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const jsDay = new Date(`${dateOnly}T12:00:00.000Z`).getUTCDay();
  const mondayFirstIndex = (jsDay + 6) % 7;
  return labels.map((label, index) => ({
    label,
    viewed: index === mondayFirstIndex,
    today: index === todayIndex
  }));
}

function systemWeekdayIndex() {
  const jsDay = new Date().getDay();
  return (jsDay + 6) % 7;
}

function labelForSection(section: PlanItem["section"]): string {
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

function taskSummary(task: AppState["tasks"][number]): string {
  const scheduling = task.scheduling?.mode && task.scheduling.mode !== "exclusive" ? ` - ${task.scheduling.mode}/${task.scheduling.attentionLoad}` : "";
  return `${task.status} - ${task.effortMinutes}m - ${task.completionMode ?? task.completionBehavior}${scheduling}`;
}

function schedulingSummary(state: AppState): string {
  const counts = state.tasks.reduce<Record<string, number>>((acc, task) => {
    const mode = task.scheduling?.mode ?? "exclusive";
    acc[mode] = (acc[mode] ?? 0) + 1;
    return acc;
  }, {});
  return `${counts.background ?? 0} background, ${counts.concurrent ?? 0} concurrent, ${counts.phased ?? 0} phased tasks tracked. Passive work can overlap; full-focus work still blocks the day.`;
}

function statusLabel(status: PlanItem["status"]): string {
  if (status === "deferred") return "not done";
  return status;
}

function isTaskCompletedToday(task: AppState["tasks"][number], date: string): boolean {
  return task.completedAt?.slice(0, 10) === date || task.lastCompletedAt?.slice(0, 10) === date;
}
