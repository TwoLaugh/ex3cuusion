"use client";

import { Dispatch, SetStateAction } from "react";
import type { AppState } from "@/lib/types";
import { actionSummary, type PostFn } from "../lib/structure-forms";

const showAiDebugTrace = process.env.NODE_ENV !== "production";

export function InboxSession({
  entry,
  session,
  clarificationDrafts,
  setClarificationDrafts,
  followUpDrafts,
  setFollowUpDrafts,
  answerClarification,
  sendFollowUp,
  post
}: {
  entry: AppState["inbox"][number];
  session?: AppState["captureSessions"][number];
  clarificationDrafts: Record<string, string>;
  setClarificationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  followUpDrafts: Record<string, string>;
  setFollowUpDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  answerClarification: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  sendFollowUp: (sessionId: string) => Promise<void>;
  post: PostFn;
}) {
  const entryActions = Array.isArray(entry.actions) ? entry.actions : [];
  const sessionQuestions = Array.isArray(session?.questions) ? session.questions : [];
  const sessionMessages = Array.isArray(session?.messages) ? session.messages : [];
  const pendingQuestions = sessionQuestions.filter((question) => question.status === "pending");
  const pendingQuestionText = new Set(pendingQuestions.map((question) => question.question));
  const visibleMessages = sessionMessages.slice(1).filter((message) => !(message.role === "assistant" && pendingQuestionText.has(message.content)));
  const appliedActions = entryActions.filter((action) => action.status === "applied" && action.type !== "ask_clarification");
  const proposedActions = entryActions.filter(
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
      {visibleMessages.length > 0 && (
        <div className="sessionMessages">
          {visibleMessages.map((message) => (
            <div className={message.role === "user" ? "chatMessage userMessage" : "chatMessage assistantMessage"} key={message.id}>
              <span>{message.role === "user" ? "You" : "AI"}</span>
              <p>{message.content}</p>
            </div>
          ))}
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
      {showAiDebugTrace && entry.debugTrace?.calls?.length ? (
        <details className="aiDebugTrace">
          <summary>AI debug</summary>
          {entry.debugTrace.calls.map((call, index) => (
            <section key={`${call.label}_${index}`}>
              <h3>
                {call.label}
                {call.model ? ` · ${call.model}` : ""}
              </h3>
              <strong>Prompt sent</strong>
              <pre>{`Instructions:\n${call.instructions}\n\nInput:\n${call.input}`}</pre>
              <strong>Response received</strong>
              <pre>{call.response}</pre>
              {call.parsedResponse !== undefined && (
                <>
                  <strong>Parsed response</strong>
                  <pre>{JSON.stringify(call.parsedResponse, null, 2)}</pre>
                </>
              )}
            </section>
          ))}
        </details>
      ) : null}
      {session && (
        <div className="followUpBox">
          <input
            value={followUpDrafts[session.id] ?? ""}
            onChange={(event) => setFollowUpDrafts((drafts) => ({ ...drafts, [session.id]: event.target.value }))}
            placeholder="Correct or add context..."
            aria-label={`Follow up on ${entry.input}`}
          />
          <button onClick={() => sendFollowUp(session.id)}>Send</button>
        </div>
      )}
    </article>
  );
}
