"use client";

import { Check, Clock3, Undo2 } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import type { PlanItem } from "@/lib/types";
import type { PostFn } from "../lib/structure-forms";

export function PlanItemActions({
  item,
  post,
  setSelected,
  setNotDoneItem,
  setMoveItem
}: {
  item: PlanItem;
  post: PostFn;
  setSelected: Dispatch<SetStateAction<PlanItem | null>>;
  setNotDoneItem: Dispatch<SetStateAction<PlanItem | null>>;
  setMoveItem: Dispatch<SetStateAction<PlanItem | null>>;
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
      {item.taskId && (
        <button className="moveButton" onClick={() => setMoveItem(item)} aria-label={`Move ${item.title}`}>
          <Clock3 size={15} />
        </button>
      )}
      {item.type === "folder_block" ? (
        <button onClick={() => setSelected(item)}>Open</button>
      ) : (
        item.taskId && (
          <button onClick={() => setSelected(item)} aria-label={`Details for ${item.title}`}>
            Details
          </button>
        )
      )}
    </div>
  );
}
