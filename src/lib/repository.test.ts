import { describe, expect, it } from "vitest";
import pg from "pg";
import { createSeedState } from "./seed";
import { createPostgresSnapshotRepositoryForTests } from "./repository";

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;

describePostgres("postgres snapshot repository", () => {
  it("resets, writes, and reads AppState through Postgres", async () => {
    const previousSnapshotId = process.env.EX3CUUSION_STATE_SNAPSHOT_ID;
    process.env.EX3CUUSION_STATE_SNAPSHOT_ID = `test_${Date.now()}`;
    try {
      const repository = createPostgresSnapshotRepositoryForTests();
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
      const readBack = repository.read();

      expect(readBack.currentDate).toBe("2026-06-04");
      expect(readBack.tasks.some((task) => task.id === "task_postgres_roundtrip")).toBe(true);
      expect(readBack.captureSessions.some((session) => session.id === "session_postgres_roundtrip")).toBe(true);

      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const projected = await client.query("select title from tasks where external_id = $1", ["task_postgres_roundtrip"]);
        expect(projected.rows[0]?.title).toBe("Postgres roundtrip task");

        const event = await client.query("select task_external_id, actual_minutes from execution_events where external_id = $1", [
          "event_postgres_roundtrip"
        ]);
        expect(event.rows[0]).toMatchObject({ task_external_id: "task_postgres_roundtrip", actual_minutes: 20 });

        const session = await client.query(
          "select external_id, applied_entity_external_ids from capture_sessions where external_id = $1",
          ["session_postgres_roundtrip"]
        );
        expect(session.rows[0]).toMatchObject({
          external_id: "session_postgres_roundtrip",
          applied_entity_external_ids: ["task_postgres_roundtrip"]
        });

        const childCounts = await client.query(
          `
            select
              (select count(*)::int from ai_actions where external_id = 'action_postgres_roundtrip') as actions,
              (select count(*)::int from capture_messages where external_id = 'message_postgres_roundtrip') as messages,
              (select count(*)::int from clarification_questions where external_id = 'question_postgres_roundtrip') as questions,
              (select count(*)::int from capture_revision_events where external_id = 'revision_postgres_roundtrip') as revisions
          `
        );
        expect(childCounts.rows[0]).toMatchObject({ actions: 1, messages: 1, questions: 1, revisions: 1 });

        readBack.captureSessions[0].messages = [];
        readBack.captureSessions[0].questions = [];
        readBack.captureSessions[0].revisionEvents = [];
        repository.write(readBack);
        const staleChildCounts = await client.query(
          `
            select
              (select count(*)::int from capture_messages where external_id = 'message_postgres_roundtrip') as messages,
              (select count(*)::int from clarification_questions where external_id = 'question_postgres_roundtrip') as questions,
              (select count(*)::int from capture_revision_events where external_id = 'revision_postgres_roundtrip') as revisions
          `
        );
        expect(staleChildCounts.rows[0]).toMatchObject({ messages: 0, questions: 0, revisions: 0 });
      } finally {
        await client.end();
      }
    } finally {
      if (previousSnapshotId === undefined) {
        delete process.env.EX3CUUSION_STATE_SNAPSHOT_ID;
      } else {
        process.env.EX3CUUSION_STATE_SNAPSHOT_ID = previousSnapshotId;
      }
    }
  });
});
