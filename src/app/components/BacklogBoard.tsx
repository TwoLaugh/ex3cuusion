"use client";

import { useState } from "react";
import type { AppState } from "@/lib/types";
import { type PostFn } from "../lib/structure-forms";
import { BACKLOG_COLUMNS, taskBucket, type BacklogBucket } from "../lib/task-view";

// Drag-and-drop backlog board (T072): drag a task between date-intent columns to promote/demote
// it, sharing the same applyTaskDateIntent semantics as the AI. The per-card select is the
// keyboard-accessible fallback for the drag interaction.
//
// T082: bulk multi-select — per-card checkboxes (plus a per-column select-all) and a floating
// action bar that moves or archives every selected task. Bulk ops run sequentially; the first
// N-1 mutations bypass post() (raw fetch) so the UI only refreshes once, on the final post().
export function BacklogBoard({ state, post }: { state: AppState; post: PostFn }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const tasks = state.tasks.filter(
    (task) => !["archived", "completed"].includes(task.status) && !task.parentTaskId
  );
  const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));

  function move(taskId: string, bucket: BacklogBucket) {
    void post("/api/structure", { entity: "task", action: "update", id: taskId, patch: { dateIntentKind: bucket } });
  }

  function toggleSelected(taskId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function setColumnSelected(columnTasks: typeof tasks, selected: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const task of columnTasks) {
        if (selected) next.add(task.id);
        else next.delete(task.id);
      }
      return next;
    });
  }

  async function bulkApply(bodies: Record<string, unknown>[]) {
    if (bodies.length === 0) return;
    setBulkBusy(true);
    try {
      for (const body of bodies.slice(0, -1)) {
        await fetch("/api/structure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      await post("/api/structure", bodies[bodies.length - 1]);
    } catch {
      // The final post() refresh (or the next one) reflects whatever actually applied.
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
    }
  }

  function bulkMove(bucket: BacklogBucket) {
    void bulkApply(
      selectedTasks.map((task) => ({ entity: "task", action: "update", id: task.id, patch: { dateIntentKind: bucket } }))
    );
  }

  function bulkArchive() {
    void bulkApply(selectedTasks.map((task) => ({ entity: "task", action: "archive", id: task.id })));
  }

  return (
    <>
      <div className={selectedIds.size > 0 ? "backlogBoard hasSelection" : "backlogBoard"} aria-label="Backlog board">
        {BACKLOG_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => taskBucket(task, state.currentDate) === column.key);
          const allSelected = columnTasks.length > 0 && columnTasks.every((task) => selectedIds.has(task.id));
          return (
            <div
              key={column.key}
              className="backlogColumn"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragId) move(dragId, column.key);
                setDragId(null);
              }}
            >
              <h3>
                <label className="columnSelectAll">
                  <input
                    type="checkbox"
                    className="backlogSelect"
                    checked={allSelected}
                    disabled={columnTasks.length === 0}
                    onChange={(event) => setColumnSelected(columnTasks, event.target.checked)}
                    aria-label={`Select all in ${column.label}`}
                  />
                  {column.label}
                </label>
                <span>{columnTasks.length}</span>
              </h3>
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  className="backlogCard"
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <div className="backlogCardHead">
                    <input
                      type="checkbox"
                      className="backlogSelect"
                      checked={selectedIds.has(task.id)}
                      onChange={() => toggleSelected(task.id)}
                      aria-label={`Select ${task.title}`}
                    />
                    <span className="backlogCardTitle">{task.title}</span>
                  </div>
                  <select
                    value=""
                    aria-label={`Move ${task.title}`}
                    onChange={(event) => {
                      if (event.target.value) move(task.id, event.target.value as BacklogBucket);
                    }}
                  >
                    <option value="">Move…</option>
                    {BACKLOG_COLUMNS.filter((option) => option.key !== column.key).map((option) => (
                      <option value={option.key} key={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {selectedIds.size > 0 && (
        <div className="bulkBar" role="toolbar" aria-label="Bulk actions">
          <span className="bulkCount">{selectedIds.size} selected</span>
          <span className="bulkLabel">Move to ▸</span>
          {BACKLOG_COLUMNS.map((column) => (
            <button key={column.key} type="button" disabled={bulkBusy} onClick={() => bulkMove(column.key)}>
              {column.label}
            </button>
          ))}
          <button type="button" disabled={bulkBusy} onClick={bulkArchive}>
            Archive
          </button>
          <button type="button" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}
    </>
  );
}
