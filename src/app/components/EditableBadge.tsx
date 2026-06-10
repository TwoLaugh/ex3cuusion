"use client";

import { useRef, useState } from "react";
import { type PostFn } from "../lib/structure-forms";

// T079: click-to-edit task badge. Clicking the badge swaps it for a small inline input;
// Enter or blur commits a direct structure patch (fields are validated server-side in
// state.ts), Escape cancels. One component covers priority / effortMinutes / dueDate.
export function EditableBadge({
  taskId,
  field,
  inputType,
  value,
  display,
  ariaLabel,
  post,
  min,
  max
}: {
  taskId: string;
  field: "priority" | "effortMinutes" | "dueDate";
  inputType: "number" | "date";
  value: number | string | undefined;
  display: string;
  ariaLabel: string;
  post: PostFn;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelledRef = useRef(false);

  const current = value === undefined ? "" : String(value);

  function open() {
    cancelledRef.current = false;
    setDraft(current);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === current) return;
    if (inputType === "number") {
      const parsed = Number(next);
      if (!next || !Number.isFinite(parsed)) return;
      void post("/api/structure", { entity: "task", action: "update", id: taskId, patch: { [field]: parsed } });
      return;
    }
    // Date field: empty string clears it (state.ts treats "" as unset).
    void post("/api/structure", { entity: "task", action: "update", id: taskId, patch: { [field]: next } });
  }

  if (!editing) {
    return (
      <button type="button" className="taskBadge editableBadge" onClick={open} aria-label={ariaLabel} title="Click to edit">
        {display}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="badgeInput"
      type={inputType}
      value={draft}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelledRef.current = true;
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        commit();
      }}
    />
  );
}
