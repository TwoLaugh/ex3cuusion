"use client";

import { useState } from "react";
import type { AppState } from "@/lib/types";
import { type PostFn } from "../lib/structure-forms";
import { BACKLOG_COLUMNS, taskBucket, type BacklogBucket } from "../lib/task-view";

// Drag-and-drop backlog board (T072): drag a task between date-intent columns to promote/demote
// it, sharing the same applyTaskDateIntent semantics as the AI. The per-card select is the
// keyboard-accessible fallback for the drag interaction.
export function BacklogBoard({ state, post }: { state: AppState; post: PostFn }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const tasks = state.tasks.filter(
    (task) => !["archived", "completed"].includes(task.status) && !task.parentTaskId
  );
  function move(taskId: string, bucket: BacklogBucket) {
    void post("/api/structure", { entity: "task", action: "update", id: taskId, patch: { dateIntentKind: bucket } });
  }
  return (
    <div className="backlogBoard" aria-label="Backlog board">
      {BACKLOG_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => taskBucket(task, state.currentDate) === column.key);
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
              {column.label} <span>{columnTasks.length}</span>
            </h3>
            {columnTasks.map((task) => (
              <div
                key={task.id}
                className="backlogCard"
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => setDragId(null)}
              >
                <span className="backlogCardTitle">{task.title}</span>
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
  );
}
