"use client";

import { Bot, Check, ChevronLeft, ChevronRight, Clock3, Menu, RotateCcw, Send, Undo2, X } from "lucide-react";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import type { AppState, DayPlan, DeferralReason, PlanItem } from "@/lib/types";

type ApiPayload = { state: AppState; plan: DayPlan };
type PostFn = (url: string, body?: Record<string, unknown>) => Promise<void>;

export default function Home() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanItem | null>(null);
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
      const message = await response.text();
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
    return state.tasks.filter((task) => selected.selectedTaskIds?.includes(task.id));
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

  return (
    <main className="shell">
      <aside className={menuOpen ? "sideNav sideNavOpen" : "sideNav"} aria-label="Secondary pages">
        <button className="iconButton closeButton" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <X size={19} />
        </button>
        <nav>
          {["Domains", "Projects", "Tasks", "Routines", "Planning preferences", "AI activity"].map((item) => (
            <button key={item} className="navItem">
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

      <section className="summaryBand">
        <p>{plan.summary}</p>
        <div className="summaryActions">
          <button onClick={() => post("/api/state")} aria-label="Reset week">
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </section>

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
            {timeline?.items.map(({ item, top, height }) => (
              <article
                className={`timelineBlock ${item.status} ${item.estimatedMinutes < 30 ? "compactBlock" : ""} ${
                  item.estimatedMinutes <= 15 ? "microBlock" : ""
                }`}
                key={item.id}
                data-testid={`plan-item-${item.title}`}
                style={{ top, height }}
              >
                <div className="blockContent">
                  <div>
                    <div className="blockTime">
                      {item.startTime} - {item.endTime}
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.reason}</p>
                    <span>{item.estimatedMinutes}m - {labelForSection(item.section)}</span>
                    {item.status !== "planned" && <strong className="statusPill">{item.status}</strong>}
                  </div>
                  <PlanItemActions item={item} post={post} setSelected={setSelected} />
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
              <span>{item.estimatedMinutes}m - {labelForSection(item.section)}</span>
              {item.status !== "planned" && <strong className="statusPill">{item.status}</strong>}
            </div>
            <PlanItemActions item={item} post={post} setSelected={setSelected} />
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
            {selectedTasks.map((task) => (
              <div key={task.id}>
                <strong>{task.title}</strong>
                <span>{task.effortMinutes}m - {task.energy}</span>
              </div>
            ))}
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
                <article key={entry.id}>
                  <p>{entry.summary}</p>
                  {entry.actions.map((action) => (
                    <span key={action.id}>
                      {action.label} - {action.type} - {action.safety} - {action.status}
                      {action.appliedEntityId ? ` - ${action.appliedEntityId}` : ""}
                      {action.skippedReason ? ` - ${action.skippedReason}` : ""}
                    </span>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PlanItemActions({
  item,
  post,
  setSelected
}: {
  item: PlanItem;
  post: PostFn;
  setSelected: Dispatch<SetStateAction<PlanItem | null>>;
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
        onClick={() => post("/api/plan/defer", { planItemId: item.id, reason: "overplanned" satisfies DeferralReason })}
      >
        {item.status === "deferred" ? "Deferred" : "Defer"}
      </button>
      {item.type === "project_block" && <button onClick={() => setSelected(item)}>Open</button>}
    </div>
  );
}

const pixelsPerMinute = 2;

function buildTimeline(items: PlanItem[], currentTime?: string) {
  const scheduled = items.filter((item) => isClockTime(item.startTime) && isClockTime(item.endTime));
  const unscheduled = items.filter((item) => !isClockTime(item.startTime) || !isClockTime(item.endTime));
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
    items: scheduled.map((item) => {
      const itemStart = absoluteStartMinutes(item, currentTime);
      const itemEnd = absoluteEndMinutes(item, currentTime);
      return {
        item,
        top: (itemStart - startMinutes) * pixelsPerMinute,
        height: Math.max(22, (itemEnd - itemStart) * pixelsPerMinute - 6)
      };
    })
  };
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
