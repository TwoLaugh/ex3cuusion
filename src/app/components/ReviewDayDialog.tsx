"use client";

import { Save, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { AppState } from "@/lib/types";
import { formatDate } from "../lib/format";
import type { PostFn } from "../lib/structure-forms";
import { buildClientReviewSummary } from "../lib/task-view";

export function ReviewDayDialog({ state, post, onClose }: { state: AppState; post: PostFn; onClose: () => void }) {
  const summary = useMemo(() => buildClientReviewSummary(state), [state]);
  const existing = summary.existingReview;
  const [energy, setEnergy] = useState(existing?.energy ?? "normal");
  const [planFit, setPlanFit] = useState(existing?.planFit ?? (summary.deferredCount >= 2 ? "overplanned" : "realistic"));
  const [note, setNote] = useState(existing?.note ?? "");
  const [affectPlanning, setAffectPlanning] = useState(existing?.affectPlanning ?? true);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await post("/api/review/daily", {
      date: state.currentDate,
      energy,
      planFit,
      note: note.trim() || undefined,
      affectPlanning
    });
    onClose();
  }

  return (
    <div className="overlay" role="dialog" aria-label="Daily review">
      <section className="reviewPanel">
        <button className="iconButton closeButton" onClick={onClose} aria-label="Close daily review">
          <X size={18} />
        </button>
        <p className="eyebrow">Daily review</p>
        <h2>{formatDate(state.currentDate)}</h2>
        <div className="reviewStats">
          <span>{summary.completedCount} done</span>
          <span>{summary.partialCount} partial</span>
          <span>{summary.deferredCount} deferred</span>
          <span>{summary.blockedCount} blocked</span>
          <span>{summary.skippedCount} skipped</span>
        </div>
        <ReviewList title="Done" items={summary.completedTitles} />
        <ReviewList title="Needs calibration" items={[...summary.partialTitles, ...summary.deferredTitles, ...summary.blockedTitles, ...summary.skippedTitles]} />
        <form className="reviewForm" onSubmit={submitReview}>
          <label>
            Energy
            <select value={energy} onChange={(event) => setEnergy(event.target.value as typeof energy)} aria-label="Review energy">
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            Plan fit
            <select value={planFit} onChange={(event) => setPlanFit(event.target.value as typeof planFit)} aria-label="Review plan fit">
              <option value="overplanned">overplanned</option>
              <option value="realistic">realistic</option>
              <option value="underfilled">underfilled</option>
            </select>
          </label>
          <label className="reviewCheckbox">
            <input type="checkbox" checked={affectPlanning} onChange={(event) => setAffectPlanning(event.target.checked)} />
            Use this to tune future plans
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={280}
            placeholder="Optional planning note, not a journal..."
            aria-label="Review note"
          />
          {summary.calibrationSignals.length > 0 && (
            <div className="reviewSignals">
              {summary.calibrationSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          )}
          <button className="sendButton" type="submit">
            <Save size={16} />
            Save review
          </button>
        </form>
      </section>
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="reviewList">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="emptyPanel">Nothing here.</p>
      ) : (
        items.slice(0, 6).map((item) => <p key={item}>{item}</p>)
      )}
    </div>
  );
}
