import { describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSeedState } from "./seed";
import { createFileRepositoryForTests, createPostgresRepositoryForTests } from "./repository";

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;

describe("file repository", () => {
  // Regression: the file repo used to re-parse the file on every read(), silently dropping the
  // in-place mutations state.ts applies to the object read() returns. It must hand back the SAME
  // live object across reads (like the in-memory and Postgres repos) and flush it to disk.
  it("keeps a live object across reads, persists mutations, and survives a 'restart'", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ex3-file-repo-"));
    const filePath = path.join(dir, "state.json");
    try {
      const repository = createFileRepositoryForTests(filePath);
      const first = repository.read(); // seeds on first read
      expect(first.tasks.length).toBeGreaterThan(0);

      // Mutate the returned object in place — exactly what applyStructureMutation does.
      first.tasks.push({ ...first.tasks[0], id: "task_file_repo_probe", title: "File repo probe" });
      const second = repository.read();
      expect(second.tasks.some((task) => task.id === "task_file_repo_probe")).toBe(true);

      // The persist-on-read flush must have written the mutation to disk.
      expect(readFileSync(filePath, "utf8")).toContain("task_file_repo_probe");

      // A NEW instance over the same file (process restart) sees the mutation.
      const rebooted = createFileRepositoryForTests(filePath).read();
      expect(rebooted.tasks.some((task) => task.id === "task_file_repo_probe")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describePostgres("postgres repository", () => {
  it("resets, writes, and reads AppState through normalized Postgres tables", async () => {
    const previousUserId = process.env.EX3CUUSION_LOCAL_USER_ID;
    const testUserId = randomUUID();
    process.env.EX3CUUSION_LOCAL_USER_ID = testUserId;
    try {
      const repository = createPostgresRepositoryForTests();
      const seed = repository.reset();
      expect(seed.tasks.some((task) => task.title === "Finish auth bug")).toBe(true);

      const next = createSeedState();
      next.currentDate = "2026-06-04";
      next.tasks.push({
        ...next.tasks[0],
        id: "task_postgres_roundtrip",
        title: "Postgres roundtrip task"
      });
      next.executionEvents.push({
        id: "event_postgres_roundtrip",
        date: "2026-06-04",
        createdAt: "2026-06-04T09:15:00.000Z",
        type: "worked_on",
        taskId: "task_postgres_roundtrip",
        planItemId: "plan_postgres_roundtrip",
        actualMinutes: 20,
        note: "Made useful progress."
      });
      next.dailyReviews.push({
        id: "review_postgres_roundtrip",
        date: "2026-06-04",
        createdAt: "2026-06-04T22:00:00.000Z",
        energy: "low",
        planFit: "overplanned",
        note: "Reduce the next plan.",
        affectPlanning: true,
        capacityAdjustmentMinutes: -60,
        completedCount: 1,
        partialCount: 1,
        deferredCount: 1,
        blockedCount: 0,
        skippedCount: 0,
        calibrationSignals: ["review marked the day as overplanned"]
      });
      next.inbox.push({
        id: "inbox_postgres_roundtrip",
        createdAt: "2026-06-04T09:00:00.000Z",
        input: "clean the kitchen this weekend",
        summary: "Captured kitchen cleaning task.",
        captureSessionId: "session_postgres_roundtrip",
        actions: [
          {
            id: "action_postgres_roundtrip",
            type: "ask_clarification",
            label: "Clarify done state",
            payload: { question: "What counts as done?" },
            safety: "needs_confirmation",
            status: "proposed",
            captureSessionId: "session_postgres_roundtrip",
            sourceMessageId: "inbox_postgres_roundtrip",
            pendingQuestionId: "question_postgres_roundtrip",
            model: "fixture",
            createdAt: "2026-06-04T09:00:01.000Z"
          }
        ]
      });
      next.captureSessions.push({
        id: "session_postgres_roundtrip",
        status: "waiting_for_user",
        source: "inbox",
        createdAt: "2026-06-04T09:00:00.000Z",
        updatedAt: "2026-06-04T09:05:00.000Z",
        messages: [
          {
            id: "message_postgres_roundtrip",
            role: "user",
            content: "clean the kitchen this weekend",
            createdAt: "2026-06-04T09:00:00.000Z"
          }
        ],
        questions: [
          {
            id: "question_postgres_roundtrip",
            actionId: "action_postgres_roundtrip",
            question: "What counts as done?",
            kind: "definition_of_done",
            mode: "blocking",
            status: "pending",
            materiality: "high",
            rationale: "Kitchen scope changes duration.",
            createdAt: "2026-06-04T09:00:01.000Z"
          }
        ],
        actionIds: ["action_postgres_roundtrip"],
        draftActionIds: [],
        appliedEntityIds: ["task_postgres_roundtrip"],
        answeredFields: [],
        revisionEvents: [
          {
            id: "revision_postgres_roundtrip",
            createdAt: "2026-06-04T09:05:00.000Z",
            source: "follow_up",
            taskId: "task_postgres_roundtrip",
            actionId: "action_postgres_roundtrip",
            model: "fixture",
            confidence: 0.9,
            summary: "Attached follow-up metadata.",
            changes: ["definition_of_done"],
            before: { title: "Postgres roundtrip task" },
            after: { definitionOfDone: "Kitchen is clean." }
          }
        ],
        unresolvedFields: ["definition_of_done"],
        summary: "Kitchen cleaning capture."
      });

      repository.write(next);
      const readBack = createPostgresRepositoryForTests().read();

      expect(readBack.currentDate).toBe("2026-06-04");
      expect(readBack.tasks.some((task) => task.id === "task_postgres_roundtrip")).toBe(true);
      expect(readBack.captureSessions.some((session) => session.id === "session_postgres_roundtrip")).toBe(true);

      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const projected = await client.query("select title from tasks where user_id = $1 and external_id = $2", [testUserId, "task_postgres_roundtrip"]);
        expect(projected.rows[0]?.title).toBe("Postgres roundtrip task");

        const event = await client.query("select task_external_id, actual_minutes from execution_events where user_id = $1 and external_id = $2", [
          testUserId,
          "event_postgres_roundtrip"
        ]);
        expect(event.rows[0]).toMatchObject({ task_external_id: "task_postgres_roundtrip", actual_minutes: 20 });

        const session = await client.query(
          "select external_id, applied_entity_external_ids from capture_sessions where user_id = $1 and external_id = $2",
          [testUserId, "session_postgres_roundtrip"]
        );
        expect(session.rows[0]).toMatchObject({
          external_id: "session_postgres_roundtrip",
          applied_entity_external_ids: ["task_postgres_roundtrip"]
        });

        const childCounts = await client.query(
          `
            select
              (select count(*)::int from ai_actions where user_id = $1 and external_id = 'action_postgres_roundtrip') as actions,
              (select count(*)::int from capture_messages join capture_sessions on capture_sessions.id = capture_messages.session_id where capture_sessions.user_id = $1 and capture_messages.external_id = 'message_postgres_roundtrip') as messages,
              (select count(*)::int from clarification_questions join capture_sessions on capture_sessions.id = clarification_questions.session_id where capture_sessions.user_id = $1 and clarification_questions.external_id = 'question_postgres_roundtrip') as questions,
              (select count(*)::int from capture_revision_events join capture_sessions on capture_sessions.id = capture_revision_events.session_id where capture_sessions.user_id = $1 and capture_revision_events.external_id = 'revision_postgres_roundtrip') as revisions
          `,
          [testUserId]
        );
        expect(childCounts.rows[0]).toMatchObject({ actions: 1, messages: 1, questions: 1, revisions: 1 });

        const readFromNormalizedRows = createPostgresRepositoryForTests().read();
        expect(readFromNormalizedRows.currentDate).toBe("2026-06-04");
        expect(readFromNormalizedRows.tasks.find((task) => task.id === "task_postgres_roundtrip")).toMatchObject({
          title: "Postgres roundtrip task",
          folderId: "project_diet_app"
        });
        expect(readFromNormalizedRows.executionEvents[0]).toMatchObject({
          id: "event_postgres_roundtrip",
          taskId: "task_postgres_roundtrip",
          actualMinutes: 20
        });
        expect(readFromNormalizedRows.dailyReviews[0]).toMatchObject({
          id: "review_postgres_roundtrip",
          capacityAdjustmentMinutes: -60
        });
        expect(readFromNormalizedRows.inbox[0].actions[0]).toMatchObject({
          id: "action_postgres_roundtrip",
          pendingQuestionId: "question_postgres_roundtrip"
        });
        expect(readFromNormalizedRows.captureSessions[0].questions[0]).toMatchObject({
          id: "question_postgres_roundtrip",
          actionId: "action_postgres_roundtrip"
        });

        readBack.captureSessions[0].messages = [];
        readBack.captureSessions[0].questions = [];
        readBack.captureSessions[0].revisionEvents = [];
        repository.write(readBack);
        const staleChildCounts = await client.query(
          `
            select
              (select count(*)::int from capture_messages join capture_sessions on capture_sessions.id = capture_messages.session_id where capture_sessions.user_id = $1 and capture_messages.external_id = 'message_postgres_roundtrip') as messages,
              (select count(*)::int from clarification_questions join capture_sessions on capture_sessions.id = clarification_questions.session_id where capture_sessions.user_id = $1 and clarification_questions.external_id = 'question_postgres_roundtrip') as questions,
              (select count(*)::int from capture_revision_events join capture_sessions on capture_sessions.id = capture_revision_events.session_id where capture_sessions.user_id = $1 and capture_revision_events.external_id = 'revision_postgres_roundtrip') as revisions
          `,
          [testUserId]
        );
        expect(staleChildCounts.rows[0]).toMatchObject({ messages: 0, questions: 0, revisions: 0 });
      } finally {
        await client.end();
      }
    } finally {
      if (previousUserId === undefined) {
        delete process.env.EX3CUUSION_LOCAL_USER_ID;
      } else {
        process.env.EX3CUUSION_LOCAL_USER_ID = previousUserId;
      }
    }
  });
});
