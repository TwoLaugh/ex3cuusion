"use client";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Folder,
  GripVertical,
  ListChecks,
  Pin,
  Plus,
  Repeat,
  Settings2,
  Sparkles,
  Sun,
  Undo2,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DayListEntryView, DayListView } from "@/lib/day-list";
import type { AppState, DayPlan, PlanItem } from "@/lib/types";
import { EditableBadge } from "./components/EditableBadge";
import { InboxSession } from "./components/InboxSession";
import { PlanItemActions } from "./components/PlanItemActions";
import { ReviewDayDialog } from "./components/ReviewDayDialog";
import { PlanItemMeta, SecondaryPanel, type SecondaryView } from "./components/SecondaryPanel";
import { addClockMinutes, formatDate, formatShortDate, fromMinutes, isClockTime, localNowParts, normalizeMoveTime, toMinutes } from "./lib/format";
import { applyPendingTimelineMoves, buildTimeline, pixelsPerMinute, removePendingTimelineMove, type PendingTimelineMove } from "./lib/plan-view";
import { childStats, clientBlockFolderId, dateIntentLabel } from "./lib/task-view";

// T092: the day-list endpoints return dayList alongside state+plan; older mutation endpoints
// (structure, time, plan/*) still return only state+plan, so dayList is optional here and post()
// backfills it (see post below).
type ApiPayload = { state: AppState; plan: DayPlan; dayList?: DayListView };

// T092: list rows open the same task drawer the timeline uses. When the task has no plan item
// today, the drawer gets a minimal synthetic PlanItem (prefixed id) — the drawer's complete
// action detects the prefix and ticks via /api/day-list/complete instead of /api/plan/complete.
const dayListItemPrefix = "daylist_";

function dayListPlanItem(entry: DayListEntryView): PlanItem {
  return {
    id: `${dayListItemPrefix}${entry.taskId}`,
    type: "atomic_task",
    title: entry.title,
    section: "later",
    status: entry.completedToday ? "completed" : "planned",
    startTime: entry.pinnedTime ?? "",
    endTime: "",
    folderId: entry.folderId,
    taskId: entry.taskId,
    estimatedMinutes: entry.effortMinutes,
    reason: "On today's list"
  };
}

// T092 balance gauge: each pillar gets a stable muted warm tone from a fixed palette of
// desaturated warm grays/browns (hash of the folder id, so the assignment never shifts).
const pillarTones = ["#8a7d66", "#6e6353", "#9c8872", "#5d564a", "#7d6f5e", "#a89b85"];

function pillarTone(folderId: string): string {
  let hash = 0;
  for (let index = 0; index < folderId.length; index += 1) hash = (hash * 31 + folderId.charCodeAt(index)) >>> 0;
  return pillarTones[hash % pillarTones.length];
}
type MainView = "Today" | SecondaryView;

const navItems: { label: string; view: MainView; ariaLabel: string; Icon: typeof Sun }[] = [
  { label: "Today", view: "Today", ariaLabel: "Today", Icon: Sun },
  { label: "Tasks", view: "Tasks", ariaLabel: "Tasks", Icon: ListChecks },
  { label: "Folders", view: "Folders", ariaLabel: "Folders", Icon: Folder },
  { label: "AI activity", view: "AI activity", ariaLabel: "AI activity", Icon: Sparkles },
  { label: "Preferences", view: "Planning preferences", ariaLabel: "Planning preferences", Icon: Settings2 }
];

interface TimelineDragState {
  itemId: string;
  taskId: string;
  pointerId: number;
  startClientY: number;
  grabOffsetY: number;
  originTop: number;
  originHeight: number;
  originLeft: number;
  originWidth: number;
  durationMinutes: number;
  previewTop: number;
  previewTime: string;
  originalTime: string;
  moved: boolean;
}

export default function Home() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [view, setView] = useState<MainView>("Today");
  const [aiOpen, setAiOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  // T092 list-first Today: inline-add draft, HTML5-DnD reorder state (mirrors BacklogBoard's
  // draggable pattern), and the optimistic order applied while a reorder POST is in flight.
  const [listDraft, setListDraft] = useState("");
  const [listDragId, setListDragId] = useState<string | null>(null);
  const [listDragOverId, setListDragOverId] = useState<string | null>(null);
  const [optimisticListOrder, setOptimisticListOrder] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanItem | null>(null);
  const [notDoneItem, setNotDoneItem] = useState<PlanItem | null>(null);
  const [moveItem, setMoveItem] = useState<PlanItem | null>(null);
  const [moveDateDraft, setMoveDateDraft] = useState("");
  const [moveTimeDraft, setMoveTimeDraft] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notDoneReason, setNotDoneReason] = useState("no_time");
  const [notDoneNote, setNotDoneNote] = useState("");
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({});
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ id: string; source: string; summary: string; createdAt: string }[]>([]);
  // T078: transient post-action toast (one at a time, latest wins). The latest-history-id ref
  // is primed on the first history fetch so pre-existing entries never toast; undo paths set
  // the suppress ref so the resulting history shrink does not re-toast an older entry.
  const [toast, setToast] = useState<{ key: number; message: string; undoId?: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHistoryIdRef = useRef<string | null>(null);
  const historyPrimedRef = useRef(false);
  const suppressHistoryToastRef = useRef(false);
  // T089: the AI session drawer auto-surfaces when a new clarification question appears.
  // Tracking the last-seen pending question id keeps a manual close sticky until the AI
  // actually asks something new.
  const lastPendingQuestionRef = useRef<string | null>(null);
  // True while the view should track real "today" (T068). Manual day navigation turns it off so
  // the live tick does not yank the user back; the "Today" control turns it back on.
  const followingTodayRef = useRef(true);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const timelineDragRef = useRef<TimelineDragState | null>(null);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDragState | null>(null);
  const [pendingTimelineMoves, setPendingTimelineMoves] = useState<Record<string, PendingTimelineMove>>({});

  function timelineTimeFromClientY(clientY: number, grabOffsetY: number) {
    if (!timeline || !calendarGridRef.current) return { top: 0, time: "08:30" };
    const rect = calendarGridRef.current.getBoundingClientRect();
    const rawTop = clientY - rect.top - grabOffsetY;
    const rawMinutes = timeline.startMinutes + rawTop / pixelsPerMinute;
    const snapped = Math.max(timeline.startMinutes, Math.min(timeline.endMinutes - 5, Math.round(rawMinutes / 15) * 15));
    return {
      top: (snapped - timeline.startMinutes) * pixelsPerMinute,
      time: fromMinutes(snapped)
    };
  }

  function beginTimelineDrag(
    event: ReactPointerEvent<HTMLElement>,
    item: PlanItem,
    layout: { top: number; height: number; left: number; width: number }
  ) {
    if (!item.taskId || !timeline) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, label")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const grabOffsetY = event.clientY - rect.top;
    const preview = timelineTimeFromClientY(event.clientY, grabOffsetY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    event.preventDefault();
    const nextDrag = {
      itemId: item.id,
      taskId: item.taskId,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      grabOffsetY,
      originTop: layout.top,
      originHeight: layout.height,
      originLeft: layout.left,
      originWidth: layout.width,
      durationMinutes: Math.max(5, item.clockMinutes ?? item.estimatedMinutes),
      previewTop: preview.top,
      previewTime: isClockTime(item.startTime) ? item.startTime : preview.time,
      originalTime: isClockTime(item.startTime) ? item.startTime : preview.time,
      moved: false
    };
    timelineDragRef.current = nextDrag;
    setTimelineDrag(nextDrag);
  }

  function updateTimelineDragAt(clientY: number, itemId: string) {
    if (!timeline || !calendarGridRef.current) return;
    setTimelineDrag((drag) => {
      if (!drag || drag.itemId !== itemId) return drag;
      const preview = timelineTimeFromClientY(clientY, drag.grabOffsetY);
      const nextDrag = {
        ...drag,
        previewTop: preview.top,
        previewTime: preview.time,
        moved: drag.moved || Math.abs(clientY - drag.startClientY) > 4 || preview.time !== drag.originalTime
      };
      timelineDragRef.current = nextDrag;
      return nextDrag;
    });
  }

  function finishTimelineDrag(itemId: string) {
    const drag = timelineDragRef.current;
    if (!drag || drag.itemId !== itemId) return;
    timelineDragRef.current = null;
    if (!plan || !drag.moved || drag.previewTime === drag.originalTime) {
      setTimelineDrag(null);
      return;
    }
    const pendingMove = {
      date: plan.date,
      startTime: drag.previewTime,
      endTime: addClockMinutes(drag.previewTime, drag.durationMinutes)
    };
    setPendingTimelineMoves((moves) => ({ ...moves, [drag.taskId]: pendingMove }));
    setTimelineDrag(null);
    void commitTimelineMove(drag.taskId, pendingMove);
  }

  function cancelTimelineDrag(itemId: string) {
    const drag = timelineDragRef.current;
    if (!drag || drag.itemId !== itemId) return;
    timelineDragRef.current = null;
    setTimelineDrag(null);
  }

  function releaseTimelinePointer(target: EventTarget | null, pointerId: number) {
    const pointerTarget = target as (Element & { releasePointerCapture?: (pointerId: number) => void }) | null;
    try {
      pointerTarget?.releasePointerCapture?.(pointerId);
    } catch {}
  }

  useEffect(() => {
    timelineDragRef.current = timelineDrag;
  }, [timelineDrag]);

  useEffect(() => {
    if (!timelineDrag) return;

    function handlePointerMove(event: PointerEvent) {
      const drag = timelineDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      updateTimelineDragAt(event.clientY, drag.itemId);
    }

    function handlePointerEnd(event: PointerEvent) {
      const drag = timelineDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      releaseTimelinePointer(event.target, drag.pointerId);
      finishTimelineDrag(drag.itemId);
    }

    function handlePointerCancel(event: PointerEvent) {
      const drag = timelineDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      releaseTimelinePointer(event.target, drag.pointerId);
      cancelTimelineDrag(drag.itemId);
    }

    function handleWindowBlur() {
      const drag = timelineDragRef.current;
      if (!drag) return;
      cancelTimelineDrag(drag.itemId);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [timelineDrag]);

  function timelineBlockStyle(layout: { item: PlanItem; top: number; height: number; left: number; width: number }): CSSProperties {
    const style: CSSProperties = { top: layout.top, height: layout.height, left: `${layout.left}%`, width: `${layout.width}%` };
    if (!timelineDrag) return style;
    if (layout.item.id === timelineDrag.itemId) {
      return {
        ...style,
        top: timelineDrag.previewTop,
        left: `${timelineDrag.originLeft}%`,
        width: `${timelineDrag.originWidth}%`,
        zIndex: 20
      };
    }
    const shift = timelineDragDisplacement(layout.top);
    return shift ? { ...style, transform: `translateY(${shift}px)` } : style;
  }

  function timelineDragDisplacement(itemTop: number): number {
    if (!timelineDrag) return 0;
    const displacement = timelineDrag.originHeight + 10;
    if (timelineDrag.previewTop > timelineDrag.originTop) {
      return itemTop > timelineDrag.originTop && itemTop <= timelineDrag.previewTop ? -displacement : 0;
    }
    if (timelineDrag.previewTop < timelineDrag.originTop) {
      return itemTop >= timelineDrag.previewTop && itemTop < timelineDrag.originTop ? displacement : 0;
    }
    return 0;
  }

  function dragPlaceholderStyle(): CSSProperties {
    if (!timelineDrag) return {};
    return {
      top: timelineDrag.previewTop,
      height: timelineDrag.originHeight,
      left: `calc(${timelineDrag.originLeft}% + 16px)`,
      width: `calc(${timelineDrag.originWidth}% - 16px)`
    };
  }

  async function commitTimelineMove(taskId: string, move: PendingTimelineMove) {
    try {
      const response = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "task",
          action: "update",
          id: taskId,
          patch: { scheduledDate: move.date, scheduledTime: move.startTime }
        })
      });
      if (!response.ok) {
        const message = await responseError(response);
        throw new Error(message || `Request failed with ${response.status}`);
      }
      const nextPayload = (await response.json()) as ApiPayload;
      setPayload(nextPayload);
      setPendingTimelineMoves((moves) => removePendingTimelineMove(moves, taskId, move));
    } catch {
      setPendingTimelineMoves((moves) => removePendingTimelineMove(moves, taskId, move));
    }
  }

  async function refresh() {
    const response = await fetch("/api/state", { cache: "no-store" });
    setPayload(await response.json());
  }

  // Anchor the app to the user's real local time. Sets "following today" so the guarded tick
  // (below) keeps it current until the user navigates to another day.
  async function syncClock() {
    followingTodayRef.current = true;
    const { date, time } = localNowParts();
    await post("/api/time", { date, time });
  }

  // Return to today and resume auto-following (T068).
  async function goToToday() {
    await syncClock();
  }

  // Undo an AI change (auto-apply-with-undo, T061). post() updates the plan/state; the
  // [payload] effect below refreshes the change list. Suppresses the history-diff toast (T078)
  // and shows a plain confirmation instead.
  async function undoChange(id: string) {
    suppressHistoryToastRef.current = true;
    try {
      await post("/api/history", { id });
      showToast("Change undone");
    } catch {
      // ignore — list refresh will reflect actual state
      suppressHistoryToastRef.current = false;
    }
  }

  // T078: show a transient toast (~6s auto-dismiss, manual X, one at a time — latest wins).
  function showToast(message: string, undoId?: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ key: Date.now(), message, undoId });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  function dismissToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Trigger a proactive maintenance pass (T066). Result is one undoable "organizer" change.
  async function runOrganizer() {
    setSending(true);
    setInboxError(null);
    try {
      await post("/api/organizer", {});
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Tidy-up failed.");
    } finally {
      setSending(false);
    }
  }

  async function updateCapacity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/settings", { availableMinutes: Number(form.get("availableMinutes")) });
  }

  // Keep the recent-AI-changes list in sync after any state change. Every successful mutating
  // post() lands here (post() sets payload), so this is also the single funnel for post-action
  // toasts (T078): a new latest history entry means an undoable change just happened. Pure
  // reads and the live clock tick leave the latest id unchanged, so they never toast.
  useEffect(() => {
    if (!payload) return;
    let active = true;
    fetch("/api/history")
      .then((response) => (response.ok ? response.json() : { history: [] }))
      .then((data: { history?: { id: string; source: string; summary: string; createdAt: string }[] }) => {
        if (!active) return;
        const entries = data.history ?? [];
        setHistory(entries);
        const latestId = entries[0]?.id ?? null;
        const previousId = lastHistoryIdRef.current;
        lastHistoryIdRef.current = latestId;
        if (!historyPrimedRef.current) {
          historyPrimedRef.current = true;
          return;
        }
        if (suppressHistoryToastRef.current) {
          suppressHistoryToastRef.current = false;
          return;
        }
        if (latestId && latestId !== previousId) {
          showToast(entries[0].summary, latestId);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [payload]);

  // T089: surface the AI session drawer whenever the latest capture session has a freshly
  // pending clarification question. Closing the drawer only hides it — nothing is reset.
  useEffect(() => {
    if (!payload) return;
    const entry = payload.state.inbox[0];
    const session = entry ? payload.state.captureSessions.find((candidate) => candidate.id === entry.captureSessionId) : undefined;
    const pendingId = session?.questions.find((question) => question.status === "pending")?.id ?? null;
    if (pendingId && pendingId !== lastPendingQuestionRef.current) setAiOpen(true);
    lastPendingQuestionRef.current = pendingId;
  }, [payload]);

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
    const data = (await response.json()) as ApiPayload;
    if (data.dayList) {
      setPayload(data);
      return;
    }
    // T092: endpoints that predate the day list (structure, time, plan/*) return state+plan only.
    // Re-read /api/day-list (also fresh state+plan) so the list-first Today never goes stale —
    // crucial for day navigation, where the list for the new date must materialize.
    try {
      const listResponse = await fetch("/api/day-list", { cache: "no-store" });
      if (listResponse.ok) {
        setPayload((await listResponse.json()) as ApiPayload);
        return;
      }
    } catch {}
    setPayload((previous) => (previous?.dayList ? { ...data, dayList: previous.dayList } : data));
  }

  useEffect(() => {
    syncClock().catch(() => {
      void refresh();
    });
  }, []);

  // Guarded live clock tick (T068): keep "today" current and roll past midnight, but only while
  // the user is following today (manual day navigation pauses it).
  useEffect(() => {
    const id = setInterval(() => {
      if (!followingTodayRef.current) return;
      const { date, time } = localNowParts();
      post("/api/time", { date, time }).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const plan = payload?.plan;
  const state = payload?.state;
  const dayList = payload?.dayList;
  // Rows in `order` (renderDayList pre-sorts); while a reorder POST is in flight the optimistic
  // order wins, with any entries it does not know about appended (e.g. a concurrent add).
  const listEntries = useMemo(() => {
    const entries = dayList?.entries ?? [];
    if (!optimisticListOrder) return entries;
    const byId = new Map(entries.map((entry) => [entry.taskId, entry]));
    const ordered = optimisticListOrder.flatMap((taskId) => {
      const entry = byId.get(taskId);
      if (!entry) return [];
      byId.delete(taskId);
      return [entry];
    });
    return [...ordered, ...byId.values()];
  }, [dayList, optimisticListOrder]);
  const selectedTasks = useMemo(() => {
    if (!state || !selected?.selectedTaskIds) return [];
    return selected.selectedTaskIds
      .map((taskId) => state.tasks.find((task) => task.id === taskId))
      .filter((task): task is AppState["tasks"][number] => Boolean(task));
  }, [state, selected]);
  const selectedFolder = selected?.folderId ? state?.folders?.find((folder) => folder.id === selected.folderId) : undefined;
  const selectedTask = selected?.taskId ? state?.tasks.find((task) => task.id === selected.taskId) : undefined;
  // T079: label for the editable due-date badge in the task drawer.
  const selectedDueLabel = selectedTask?.dueDate ? `due ${formatShortDate(selectedTask.dueDate)}` : "due —";
  const selectedBacklog = useMemo(() => {
    if (!state || !selected?.folderId) return [];
    const selectedIds = new Set(selected.selectedTaskIds ?? []);
    return state.tasks
      .filter(
        (task) =>
          clientBlockFolderId(state, task) === selected.folderId &&
          !selectedIds.has(task.id) &&
          !["archived", "blocked", "waiting"].includes(task.status)
      )
      .sort((a, b) => b.priority + b.importance + b.urgency - (a.priority + a.importance + a.urgency));
  }, [state, selected]);
  const timelineItems = useMemo(
    () => (plan ? applyPendingTimelineMoves(plan.items, plan.date, pendingTimelineMoves) : []),
    [pendingTimelineMoves, plan]
  );
  const timeline = useMemo(() => (plan ? buildTimeline(timelineItems, state?.currentTime) : null), [plan, state?.currentTime, timelineItems]);

  useEffect(() => {
    if (!selected || !plan) return;
    // T092: synthetic day-list drawer items refresh from the day list (field-compared to avoid
    // a setSelected loop on the freshly built object); plan items refresh from the plan as before.
    if (selected.id.startsWith(dayListItemPrefix)) {
      const entry = dayList?.entries.find((candidate) => `${dayListItemPrefix}${candidate.taskId}` === selected.id);
      if (!entry) return;
      const rebuilt = dayListPlanItem(entry);
      if (
        rebuilt.status !== selected.status ||
        rebuilt.title !== selected.title ||
        rebuilt.estimatedMinutes !== selected.estimatedMinutes ||
        rebuilt.startTime !== selected.startTime
      ) {
        setSelected(rebuilt);
      }
      return;
    }
    const refreshed = plan.items.find((item) => item.id === selected.id);
    if (refreshed && refreshed !== selected) setSelected(refreshed);
  }, [dayList, plan, selected]);

  useEffect(() => {
    if (!moveItem) {
      setMoveError(null);
      return;
    }
    setMoveDateDraft(plan?.date ?? "");
    setMoveTimeDraft(isClockTime(moveItem.startTime) ? moveItem.startTime : "");
    setMoveError(null);
  }, [moveItem, plan?.date]);

  if (!payload || !plan || !state || !dayList) {
    return <main className="loading">Building today...</main>;
  }

  // T092 inline instant add (documented capture→enrich contract in api/day-list/capture): the
  // input clears IMMEDIATELY, the capture POST lands as one undoable change, and enrichment is
  // fired without awaiting — when it resolves, post() refreshes state quietly and the history
  // funnel toasts what the AI decided.
  async function submitListAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = listDraft.trim();
    if (!title) return;
    setListDraft("");
    try {
      const response = await fetch("/api/day-list/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error((await responseError(response)) || `Request failed with ${response.status}`);
      const data = (await response.json()) as ApiPayload & { taskId?: string };
      setPayload(data);
      if (data.taskId) void post("/api/day-list/enrich", { taskId: data.taskId }).catch(() => {});
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Could not add to the list.");
    }
  }

  // Row click opens the same task drawer the timeline uses: prefer the real plan item for the
  // task (full actions), else a minimal synthetic item (see dayListPlanItem).
  function openListEntry(entry: DayListEntryView) {
    const planItem = plan?.items.find((item) => item.taskId === entry.taskId);
    setSelected(planItem ?? dayListPlanItem(entry));
  }

  // Drop a dragged list row onto a target row: reorder locally first (optimistic), then POST the
  // full order through the post() funnel so the change toasts and is undoable; the response (or a
  // failure) reconciles by clearing the optimistic order.
  function dropListRow(targetTaskId: string) {
    const draggedId = listDragId;
    setListDragId(null);
    setListDragOverId(null);
    if (!draggedId || draggedId === targetTaskId) return;
    const orderedTaskIds = listEntries.map((entry) => entry.taskId);
    const from = orderedTaskIds.indexOf(draggedId);
    const to = orderedTaskIds.indexOf(targetTaskId);
    if (from < 0 || to < 0) return;
    orderedTaskIds.splice(from, 1);
    orderedTaskIds.splice(to, 0, draggedId);
    setOptimisticListOrder(orderedTaskIds);
    void post("/api/day-list", { action: "reorder", orderedTaskIds })
      .catch(() => {})
      .finally(() => setOptimisticListOrder(null));
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

  async function sendFollowUp(sessionId: string) {
    const message = followUpDrafts[sessionId]?.trim();
    if (!message) return;
    await post(`/api/capture-sessions/${sessionId}/message`, { message });
    setFollowUpDrafts((drafts) => {
      const next = { ...drafts };
      delete next[sessionId];
      return next;
    });
  }

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moveItem?.taskId) return;
    const scheduledTime = normalizeMoveTime(moveTimeDraft);
    if (moveTimeDraft.trim() && !scheduledTime) {
      setMoveError("Use HH:mm");
      return;
    }
    await post("/api/structure", {
      entity: "task",
      action: "update",
      id: moveItem.taskId,
      patch: {
        scheduledDate: moveDateDraft,
        scheduledTime: scheduledTime ?? ""
      }
    });
    setMoveItem(null);
  }

  function nudgeMoveTime(minutes: number) {
    const fallbackTime = state?.currentTime ?? "08:30";
    const normalized = normalizeMoveTime(moveTimeDraft || (isClockTime(moveItem?.startTime ?? "") ? moveItem!.startTime : fallbackTime));
    const base = normalized ?? fallbackTime;
    setMoveTimeDraft(fromMinutes((toMinutes(base) + minutes + 24 * 60) % (24 * 60)));
    setMoveError(null);
  }

  // T092 list-first composition: the hand-authored list is the primary surface; the timeline is
  // a secondary section. The Now card / Next-3 / Later rows are gone — the slim now-emphasis on
  // the top unticked list row replaces them.
  const newCandidateCount = plan.newCandidateCount ?? 0;
  const capacityLeft = Math.max(0, plan.availableMinutes - plan.estimatedTotalMinutes);
  const firstUntickedId = listEntries.find((entry) => !entry.completedToday)?.taskId;
  const untickedCount = listEntries.filter((entry) => !entry.completedToday).length;
  const { capacityMinutes, listMinutes } = dayList.gauges;
  const overfull = listMinutes > capacityMinutes;
  const capacityRatio = capacityMinutes > 0 ? Math.min(1, listMinutes / capacityMinutes) : listMinutes > 0 ? 1 : 0;
  const firstMissingPillar = dayList.gauges.missingPillars[0];
  const trayGroups = [
    ["due", dayList.tray.due],
    ["balance", dayList.tray.balance],
    ["backlog", dayList.tray.backlog]
  ] as const;
  const traySuggestionCount = dayList.tray.due.length + dayList.tray.balance.length + dayList.tray.backlog.length;
  const latestEntry = state.inbox[0];
  const latestSession = latestEntry ? state.captureSessions.find((session) => session.id === latestEntry.captureSessionId) : undefined;
  const hasPendingClarification = (latestSession?.questions ?? []).some((question) => question.status === "pending");

  return (
    <div className="appShell">
      <aside className="navRail" aria-label="Primary navigation">
        <p className="wordmark">ex3cuusion</p>
        <nav className="railNav">
          {navItems.map(({ label, view: navView, ariaLabel, Icon }) => (
            <button
              key={navView}
              className={view === navView ? "navItem activeNavItem" : "navItem"}
              onClick={() => setView(navView)}
              aria-label={ariaLabel}
              aria-current={view === navView ? "page" : undefined}
            >
              <Icon size={17} />
              <span className="navLabel">{label}</span>
            </button>
          ))}
        </nav>
        <div className="railFooter">
          <p className="railCapacity" data-testid="load-level">
            {formatDuration(capacityLeft)} left
          </p>
          <button className="tidyButton" onClick={runOrganizer} disabled={sending} aria-label="Run a tidy-up maintenance pass">
            Run tidy-up
          </button>
        </div>
      </aside>

      <main className="mainColumn">
        {view !== "Today" ? (
          <SecondaryPanel
            view={view}
            state={state}
            plan={plan}
            post={post}
            runOrganizer={runOrganizer}
            organizerRunning={sending}
            updateCapacity={updateCapacity}
          />
        ) : (
          <>
            <header className="todayHeader">
              <div>
                <h1 aria-label={formatDate(plan.date)}>{formatDate(plan.date)}</h1>
                <p className="capacityLine">your list · committed {dayList.committedAt.slice(11, 16)}</p>
              </div>
              <div className="dayNav">
                <button
                  className="pill pillQuiet iconPill"
                  onClick={() => {
                    followingTodayRef.current = false;
                    post("/api/time", { retreat: true });
                  }}
                  aria-label="Previous day"
                >
                  <ChevronLeft size={16} />
                </button>
                {plan.date !== localNowParts().date && (
                  <button className="pill pillQuiet" onClick={goToToday} aria-label="Jump to today">
                    Today
                  </button>
                )}
                <button
                  className="pill pillQuiet iconPill"
                  onClick={() => {
                    followingTodayRef.current = false;
                    post("/api/time", { advance: true });
                  }}
                  aria-label="Next day"
                >
                  <ChevronRight size={16} />
                </button>
                <button type="button" className="pill pillQuiet iconPill aiPill" onClick={() => setAiOpen(true)} aria-label="Open AI session">
                  <Sparkles size={15} />
                  {hasPendingClarification && <span className="aiPendingDot" aria-hidden="true" />}
                </button>
                <button className="pill pillSecondary" onClick={() => setReviewOpen(true)} aria-label="Review day">
                  Review day
                </button>
              </div>
            </header>

            <section className="gaugesRow" aria-label="Capacity and balance gauges">
              <div className="gauge">
                <div className="gaugeHead">
                  <span className="gaugeLabel">capacity</span>
                  <span className={overfull ? "gaugeValue gaugeAmber" : "gaugeValue"}>
                    {formatDuration(listMinutes)} of {formatDuration(capacityMinutes)}
                  </span>
                </div>
                <div className="gaugeTrack" aria-hidden="true">
                  <div className="gaugeFill" style={{ width: `${Math.round(capacityRatio * 100)}%` }} />
                </div>
              </div>
              <div className="gauge">
                <div className="gaugeHead">
                  <span className="gaugeLabel">balance</span>
                  {firstMissingPillar && <span className="gaugeValue gaugeAmber">no {firstMissingPillar} yet</span>}
                </div>
                <div className="gaugeTrack balanceTrack" aria-hidden="true">
                  {dayList.gauges.balance.map((pillar) => (
                    <div
                      key={pillar.folderId}
                      className="balanceSegment"
                      style={{ width: `${Math.round(pillar.share * 100)}%`, background: pillarTone(pillar.folderId) }}
                      title={pillar.name}
                    />
                  ))}
                </div>
              </div>
            </section>

            {dayList.habits.length > 0 && (
              <section className="habitStrip" aria-label="Habits">
                <span className="habitLabel">Habits</span>
                {dayList.habits.map((habit) => (
                  <button
                    key={habit.taskId}
                    className={habit.completedToday ? "habitChip habitDone" : "habitChip"}
                    onClick={() => void post("/api/day-list/complete", { taskId: habit.taskId })}
                    aria-label={habit.completedToday ? `Untick habit ${habit.title}` : `Tick habit ${habit.title}`}
                  >
                    {habit.completedToday && <Check size={12} aria-hidden="true" />}
                    {habit.title} · {habit.effortMinutes}m
                    {habit.streak >= 2 && (
                      <span className="habitStreak" aria-label={`${habit.streak} day streak`}>
                        <Flame size={11} aria-hidden="true" />
                        {habit.streak}
                      </span>
                    )}
                  </button>
                ))}
              </section>
            )}

            <section className="dayListSection" aria-label="Day list">
              <div className="dayList">
                {listEntries.map((entry) => {
                  const folderName = entry.folderId ? state.folders?.find((folder) => folder.id === entry.folderId)?.name : undefined;
                  const rowClass = [
                    "listRow",
                    entry.completedToday ? "tickedRow" : "",
                    entry.taskId === firstUntickedId ? "nowRow" : "",
                    listDragId && listDragId !== entry.taskId && listDragOverId === entry.taskId ? "dragOverRow" : ""
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div
                      key={entry.taskId}
                      className={rowClass}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest(".listCheck, .listHandle, .listRemove")) return;
                        openListEntry(entry);
                      }}
                      onDragOver={(event) => {
                        if (!listDragId) return;
                        event.preventDefault();
                        setListDragOverId(entry.taskId);
                      }}
                      onDrop={() => dropListRow(entry.taskId)}
                    >
                      <span
                        className="listHandle"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setListDragId(entry.taskId);
                        }}
                        onDragEnd={() => {
                          setListDragId(null);
                          setListDragOverId(null);
                        }}
                        aria-hidden="true"
                      >
                        <GripVertical size={14} />
                      </span>
                      <button
                        className={entry.taskId === firstUntickedId ? "listCheck nowCheck" : "listCheck"}
                        onClick={() => void post("/api/day-list/complete", { taskId: entry.taskId })}
                        aria-label={entry.completedToday ? `Untick ${entry.title}` : `Tick ${entry.title}`}
                      >
                        {entry.completedToday && <Check size={13} aria-hidden="true" />}
                      </button>
                      <button className="listTitle" onClick={() => openListEntry(entry)} aria-label={`Details for ${entry.title}`}>
                        {entry.source === "recurring" && <Repeat size={11} className="sourceGlyph" aria-hidden="true" />}
                        {entry.source === "carried" && <ArrowRight size={11} className="sourceGlyph" aria-hidden="true" />}
                        <span className="listTitleText">{entry.title}</span>
                      </button>
                      <span className={entry.missedPin ? "listMeta missedMeta" : "listMeta"}>
                        {entry.pinnedTime ? (
                          <>
                            <Pin size={11} aria-hidden="true" />
                            {entry.pinnedTime}
                          </>
                        ) : (
                          `${folderName ? `${folderName} · ` : ""}${entry.effortMinutes}m`
                        )}
                      </span>
                      <button
                        className="listRemove"
                        onClick={() => void post("/api/day-list", { action: "remove", taskId: entry.taskId })}
                        aria-label={`Remove ${entry.title} to tray`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                <form className="listAddRow" onSubmit={(event) => void submitListAdd(event)}>
                  <input
                    className="listAddInput"
                    value={listDraft}
                    onChange={(event) => setListDraft(event.target.value)}
                    placeholder="type to add — files itself in the background"
                    aria-label="Add to today's list"
                  />
                </form>
              </div>
            </section>

            {traySuggestionCount > 0 && (
              <details className="traySection" open={untickedCount < 3}>
                <summary className="trayLabel">
                  Tray · {traySuggestionCount} suggestion{traySuggestionCount === 1 ? "" : "s"}
                </summary>
                <div className="trayRows">
                  {trayGroups.map(([group, tasks]) =>
                    tasks.map((task) => (
                      <div className="trayRow" key={`${group}_${task.taskId}`}>
                        <span className={`trayTag trayTag_${group}`}>{group}</span>
                        <span className="trayTitle">{task.title}</span>
                        <span className="trayMeta">
                          {group === "balance" && task.pillarName ? `${task.pillarName} · ` : ""}
                          {task.effortMinutes}m
                        </span>
                        <button
                          className="trayAdd"
                          onClick={() => void post("/api/day-list", { action: "add", taskId: task.taskId, source: "tray" })}
                          aria-label={`Add ${task.title} to today's list`}
                        >
                          add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </details>
            )}

            <details className="laterSection" open={laterOpen} onToggle={(event) => setLaterOpen(event.currentTarget.open)}>
              <summary className="sectionEyebrow timelineSummary">
                <span>Timeline &amp; schedule</span>
                {newCandidateCount > 0 && (
                  <button
                    className="hintChip"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void post("/api/plan/replan");
                    }}
                    aria-label={`Replan to include ${newCandidateCount} new candidate${newCandidateCount === 1 ? "" : "s"}`}
                  >
                    {newCandidateCount} new candidate{newCandidateCount === 1 ? "" : "s"} · Replan?
                  </button>
                )}
                <button
                  className="pill pillQuiet timelineReplan"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void post("/api/plan/replan");
                  }}
                  aria-label="Replan rest of day"
                >
                  Replan rest of day
                </button>
              </summary>
              <section className="calendarTimeline" aria-label="Timed day plan">
                <div className="calendarScroll">
                  <div className="timeColumn" style={{ height: timeline?.height }}>
                    {timeline?.hours.map((hour) => (
                      <div className="hourLabel" key={hour.time} style={{ top: hour.top }}>
                        {hour.time}
                      </div>
                    ))}
                  </div>
                  <div
                    className={timelineDrag ? "calendarGrid draggingTimeline" : "calendarGrid"}
                    ref={calendarGridRef}
                    style={{ height: timeline?.height }}
                  >
                    {timeline?.hours.map((hour) => <div className="hourLine" key={hour.time} style={{ top: hour.top }} />)}
                    {timelineDrag && (
                      <div className="dragPlaceholder" style={dragPlaceholderStyle()} aria-hidden="true">
                        <span>{timelineDrag.previewTime}</span>
                      </div>
                    )}
                    {timeline?.items.map(({ item, top, height, left, width, laneCount }) => (
                      <article
                        className={`timelineBlock ${item.status} ${item.estimatedMinutes < 30 ? "compactBlock" : ""} ${
                          item.estimatedMinutes <= 15 ? "microBlock" : ""
                        } ${laneCount > 1 ? "overlapBlock" : ""} ${
                          item.schedulingMode && item.schedulingMode !== "exclusive" ? `mode-${item.schedulingMode}` : ""
                        } ${timelineDrag?.itemId === item.id ? "draggingBlock" : ""} ${
                          timelineDrag && timelineDrag.itemId !== item.id ? "dragAwareBlock" : ""
                        }`}
                        key={item.id}
                        data-testid={`plan-item-${item.title}`}
                        aria-grabbed={timelineDrag?.itemId === item.id}
                        onPointerDown={(event) => beginTimelineDrag(event, item, { top, height, left, width })}
                        style={timelineBlockStyle({ item, top, height, left, width })}
                      >
                        <div className="blockContent">
                          <div>
                            <div className="blockTime">
                              {item.startTime} - {item.endTime}
                            </div>
                            <h2>{item.title}</h2>
                            <PlanItemMeta item={item} />
                            {item.status !== "planned" && <strong className="statusPill">{statusLabel(item.status)}</strong>}
                          </div>
                          <PlanItemActions item={item} post={post} setSelected={setSelected} setNotDoneItem={setNotDoneItem} setMoveItem={setMoveItem} />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                {timeline?.unscheduled.map((item) => (
                  <article className={`unscheduledItem ${item.status}`} key={item.id} data-testid={`plan-item-${item.title}`}>
                    <div>
                      <h2>{item.title}</h2>
                      <PlanItemMeta item={item} />
                      {item.status !== "planned" && <strong className="statusPill">{statusLabel(item.status)}</strong>}
                    </div>
                    <PlanItemActions item={item} post={post} setSelected={setSelected} setNotDoneItem={setNotDoneItem} setMoveItem={setMoveItem} />
                  </article>
                ))}
              </section>
            </details>

            {inboxError && (
              <p className="errorMessage" role="alert">
                {inboxError}
              </p>
            )}
          </>
        )}
      </main>

      {selected && selected.type === "folder_block" && (
        <div className="drawer" role="dialog" aria-label={`${selected.title} folder drawer`}>
          <button className="iconButton closeButton" onClick={() => setSelected(null)} aria-label="Close folder drawer">
            <X size={18} />
          </button>
          <p className="eyebrow">Focus block</p>
          <h2>{selected.title}</h2>
          <p className="drawerNote">{selected.reason}</p>
          {selectedFolder && (
            <div className="drawerStats">
              <span>{selectedFolder.defaultBlockMinutes ?? 30}m block</span>
              <span>
                {selectedTasks.filter((task) => isTaskCompletedToday(task, state.currentDate)).length}/{selectedTasks.length} selected done
              </span>
            </div>
          )}
          <div className="drawerActions">
            <button onClick={() => post("/api/folder-block-selection", { planItemId: selected.id, action: "regenerate" })}>
              Regenerate selection
            </button>
          </div>
          <h3>Selected subtasks</h3>
          <div className="subtasks">
            {selectedTasks.length === 0 && <p className="emptyPanel">No selected subtasks yet.</p>}
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
                    <span>
                      {task.effortMinutes}m - {task.energy} - {task.status}
                    </span>
                  </div>
                  <button
                    className="subtaskRemove"
                    onClick={() => post("/api/folder-block-selection", { planItemId: selected.id, action: "remove", taskId: task.id })}
                    aria-label={`Remove ${task.title} from block`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <h3>Folder backlog</h3>
          <div className="subtasks backlogSubtasks">
            {selectedBacklog.length === 0 && <p className="emptyPanel">No extra active tasks in this block.</p>}
            {selectedBacklog.slice(0, 6).map((task) => (
              <div className="subtaskRow" key={task.id}>
                <button
                  className="subtaskCheck"
                  onClick={() => post("/api/folder-block-selection", { planItemId: selected.id, action: "add", taskId: task.id })}
                  aria-label={`Add ${task.title} to block`}
                >
                  <Plus size={15} />
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {task.effortMinutes}m - {dateIntentLabel(task)} - p{task.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && selected.type !== "folder_block" && (
        <div className="drawer" role="dialog" aria-label={`${selected.title} details`}>
          <button className="iconButton closeButton" onClick={() => setSelected(null)} aria-label="Close details">
            <X size={18} />
          </button>
          <p className="eyebrow">Task</p>
          <h2>{selected.title}</h2>
          <div className="drawerStats">
            <span>{isClockTime(selected.startTime) ? `${selected.startTime}${isClockTime(selected.endTime) ? ` - ${selected.endTime}` : ""}` : "Unscheduled"}</span>
            <span>{selectedTask?.effortMinutes ?? selected.estimatedMinutes}m</span>
            <span>{statusLabel(selected.status)}</span>
          </div>
          {selectedTask && (
            <>
              <div className="badgeRow">
                {dateIntentLabel(selectedTask) !== selectedDueLabel && <span className="taskBadge">{dateIntentLabel(selectedTask)}</span>}
                <EditableBadge
                  taskId={selectedTask.id}
                  field="dueDate"
                  inputType="date"
                  value={selectedTask.dueDate}
                  display={selectedDueLabel}
                  ariaLabel={`Edit due date ${selectedTask.title}`}
                  post={post}
                />
                <span className="taskBadge">{selectedTask.energy}</span>
                <EditableBadge
                  taskId={selectedTask.id}
                  field="priority"
                  inputType="number"
                  min={1}
                  max={10}
                  value={selectedTask.priority}
                  display={`p${selectedTask.priority}`}
                  ariaLabel={`Edit priority ${selectedTask.title}`}
                  post={post}
                />
                <span className="taskBadge">i{selectedTask.importance}/u{selectedTask.urgency}</span>
                <EditableBadge
                  taskId={selectedTask.id}
                  field="effortMinutes"
                  inputType="number"
                  min={1}
                  max={720}
                  value={selectedTask.effortMinutes}
                  display={`${selectedTask.effortMinutes}m`}
                  ariaLabel={`Edit minutes ${selectedTask.title}`}
                  post={post}
                />
                {selectedTask.scheduling?.mode && selectedTask.scheduling.mode !== "exclusive" && (
                  <span className="taskBadge highlightBadge">{selectedTask.scheduling.mode}</span>
                )}
                {(selectedTask.tags ?? []).map((tag) => (
                  <span className="taskBadge" key={tag}>#{tag}</span>
                ))}
                {childStats(state, selectedTask.id).count > 0 && (
                  <span className="taskBadge highlightBadge">
                    {childStats(state, selectedTask.id).count} subtasks · {childStats(state, selectedTask.id).done} done
                  </span>
                )}
              </div>
              {selectedTask.definitionOfDone && (
                <p className="drawerNote">
                  <strong>Done when:</strong> {selectedTask.definitionOfDone}
                </p>
              )}
              {selectedTask.notes && <p className="drawerNote">{selectedTask.notes}</p>}
            </>
          )}
          <div className="drawerActions">
            {selected.taskId && <button onClick={() => setMoveItem(selected)}>Reschedule</button>}
            <button
              onClick={() =>
                selected.id.startsWith(dayListItemPrefix) && selected.taskId
                  ? post("/api/day-list/complete", { taskId: selected.taskId })
                  : post("/api/plan/complete", { planItemId: selected.id })
              }
            >
              {selected.status === "completed" ? "Mark not done" : "Mark done"}
            </button>
          </div>
        </div>
      )}

      {aiOpen && (
        <aside className="drawer aiDrawer" role="dialog" aria-label="AI session">
          <button className="iconButton closeButton" onClick={() => setAiOpen(false)} aria-label="Close AI session">
            <X size={18} />
          </button>
          <p className="eyebrow">AI session</p>
          {inboxError && (
            <p className="errorMessage" role="alert">
              {inboxError}
            </p>
          )}
          {history.length > 0 && (
            <div className="changeHistory">
              <span className="changeHistoryTitle">Recent AI changes</span>
              {history.slice(0, 5).map((change) => (
                <div key={change.id} className="changeRow">
                  <span className="changeSummary">{change.summary}</span>
                  <button className="undoButton" onClick={() => undoChange(change.id)} aria-label={`Undo ${change.summary}`}>
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="inboxLog">
            {state.inbox.length === 0 && <p className="emptyPanel">No captures yet — type into the list on Today.</p>}
            {/* T087: keep the session drawer fresh — only the current/most-recent exchange shows
                here; earlier sessions are logged on the AI activity page. */}
            {state.inbox.slice(0, 1).map((entry, index) => (
              <InboxSession
                key={`${entry.id}_${index}`}
                entry={entry}
                session={state.captureSessions.find((session) => session.id === entry.captureSessionId)}
                clarificationDrafts={clarificationDrafts}
                setClarificationDrafts={setClarificationDrafts}
                followUpDrafts={followUpDrafts}
                setFollowUpDrafts={setFollowUpDrafts}
                answerClarification={answerClarification}
                sendFollowUp={sendFollowUp}
                post={post}
              />
            ))}
            {state.inbox.length > 1 && (
              <button
                className="inboxHistoryLink"
                onClick={() => {
                  setAiOpen(false);
                  setView("AI activity");
                }}
              >
                View {state.inbox.length - 1} earlier session{state.inbox.length - 1 === 1 ? "" : "s"} in AI activity
              </button>
            )}
          </div>
        </aside>
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

      {moveItem && (
        <div className="overlay" role="dialog" aria-label={`Move ${moveItem.title}`}>
          <section className="movePanel">
            <button className="iconButton closeButton" onClick={() => setMoveItem(null)} aria-label="Close move">
              <X size={18} />
            </button>
            <p className="eyebrow">Move task</p>
            <h2>{moveItem.title}</h2>
            <form className="moveForm" onSubmit={submitMove}>
              <input name="scheduledDate" type="date" value={moveDateDraft} onChange={(event) => setMoveDateDraft(event.target.value)} aria-label="Move date" />
              <div className="moveTimeRow">
                <button type="button" className="timeNudge" onClick={() => nudgeMoveTime(-15)} aria-label="Move 15 minutes earlier">
                  -15
                </button>
                <input
                  name="scheduledTime"
                  type="text"
                  inputMode="numeric"
                  value={moveTimeDraft}
                  onChange={(event) => {
                    setMoveTimeDraft(event.target.value);
                    setMoveError(null);
                  }}
                  placeholder="17:30"
                  aria-label="Move time"
                />
                <button type="button" className="timeNudge" onClick={() => nudgeMoveTime(15)} aria-label="Move 15 minutes later">
                  +15
                </button>
              </div>
              {moveError && <p className="errorMessage">{moveError}</p>}
              <button className="sendButton" type="submit">
                Move
              </button>
            </form>
          </section>
        </div>
      )}

      {reviewOpen && <ReviewDayDialog state={state} post={post} onClose={() => setReviewOpen(false)} />}

      <div className="toastRegion" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.key} data-testid="toast">
            <span className="toastMessage">{toast.message}</span>
            {toast.undoId && (
              <button className="toastUndo" onClick={() => void undoChange(toast.undoId!)}>
                <Undo2 size={13} />
                Undo
              </button>
            )}
            <button className="toastDismiss" onClick={dismissToast} aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
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

function statusLabel(status: PlanItem["status"]): string {
  if (status === "deferred") return "not done";
  return status;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function isTaskCompletedToday(task: AppState["tasks"][number], date: string): boolean {
  return task.completedAt?.slice(0, 10) === date || task.lastCompletedAt?.slice(0, 10) === date;
}
