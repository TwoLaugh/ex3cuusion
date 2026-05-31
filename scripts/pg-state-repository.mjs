import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

const command = process.argv[2];
const snapshotId = process.env.EX3CUUSION_STATE_SNAPSHOT_ID ?? "default";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the Postgres state repository.");
  process.exit(1);
}

if (!["read", "write", "delete"].includes(command)) {
  console.error("Usage: node scripts/pg-state-repository.mjs read|write|delete");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  if (command === "read") {
    const result = await client.query("select state_json from app_state_snapshots where id = $1", [snapshotId]);
    if (!result.rowCount) {
      process.stdout.write("");
    } else {
      process.stdout.write(JSON.stringify(result.rows[0].state_json));
    }
  }

  if (command === "write") {
    const stateJson = await readStdin();
    const state = JSON.parse(stateJson);
    await client.query("begin");
    try {
      await client.query(
        `
          insert into app_state_snapshots (id, state_json, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (id)
          do update set state_json = excluded.state_json, updated_at = now()
        `,
        [snapshotId, stateJson]
      );
      if (process.env.EX3CUUSION_PROJECT_NORMALIZED_STATE !== "0") {
        await projectState(client, state);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  if (command === "delete") {
    await client.query("delete from app_state_snapshots where id = $1", [snapshotId]);
  }
} finally {
  await client.end().catch(() => {});
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      value += chunk;
    });
    process.stdin.on("end", () => resolve(value));
    process.stdin.on("error", reject);
  });
}

async function projectState(client, state) {
  const userId = process.env.EX3CUUSION_LOCAL_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  await client.query(
    `
      insert into users (id, email, display_name, timezone)
      values ($1, 'local@ex3cuusion.dev', 'Local User', 'Europe/London')
      on conflict (id) do nothing
    `,
    [userId]
  );

  const domainIds = new Map();
  for (const domain of state.domains ?? []) {
    const result = await client.query(
      `
        insert into domains (user_id, external_id, name, weight, status, updated_at)
        values ($1, $2, $3, $4, 'active', now())
        on conflict (user_id, external_id) where external_id is not null
        do update set name = excluded.name, weight = excluded.weight, updated_at = now()
        returning id
      `,
      [userId, domain.id, domain.name, domain.weight]
    );
    domainIds.set(domain.id, result.rows[0].id);
  }

  const containerIds = new Map();
  for (const project of state.projects ?? []) {
    const result = await client.query(
      `
        insert into containers (
          user_id, external_id, domain_id, name, kind, planning_mode, status, priority_weight, default_block_minutes, context_note, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        on conflict (user_id, external_id) where external_id is not null
        do update set
          domain_id = excluded.domain_id,
          name = excluded.name,
          kind = excluded.kind,
          planning_mode = excluded.planning_mode,
          status = excluded.status,
          priority_weight = excluded.priority_weight,
          default_block_minutes = excluded.default_block_minutes,
          context_note = excluded.context_note,
          updated_at = now()
        returning id
      `,
      [
        userId,
        project.id,
        domainIds.get(project.domainId) ?? null,
        project.name,
        project.kind,
        project.planningMode,
        project.status,
        project.priorityWeight,
        project.defaultBlockMinutes,
        project.contextNote ?? ""
      ]
    );
    containerIds.set(project.id, result.rows[0].id);
  }

  const taskIds = new Map();
  for (const task of state.tasks ?? []) {
    const result = await client.query(
      `
        insert into tasks (
          user_id, external_id, domain_id, container_id, parent_task_id, source_inbox_item_external_id, title, description, type, status,
          repeat_policy, completion_behavior, completion_mode, definition_of_done, planner_fields, planner_signals, tags, field_confidence,
          priority, importance, urgency, due_on, scheduled_for, scheduled_time, date_intent, scheduling, effort_minutes, min_minutes,
          max_minutes, estimate_confidence, energy, strictness, notes, blocked_reason, blocked_json, waiting_json, delegation_json,
          completed_at, last_completed_at, source, updated_at
        )
        values (
          $1, $2, $3, $4, null, $5, $6, $7, $8, $9,
          $10::jsonb, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17::jsonb,
          $18, $19, $20, $21, $22, $23, $24::jsonb, $25::jsonb, $26, $27,
          $28, $29, $30, $31, $32, $33, $34::jsonb, $35::jsonb, $36::jsonb,
          $37, $38, $39, now()
        )
        on conflict (user_id, external_id) where external_id is not null
        do update set
          domain_id = excluded.domain_id,
          container_id = excluded.container_id,
          source_inbox_item_external_id = excluded.source_inbox_item_external_id,
          title = excluded.title,
          description = excluded.description,
          type = excluded.type,
          status = excluded.status,
          repeat_policy = excluded.repeat_policy,
          completion_behavior = excluded.completion_behavior,
          completion_mode = excluded.completion_mode,
          definition_of_done = excluded.definition_of_done,
          planner_fields = excluded.planner_fields,
          planner_signals = excluded.planner_signals,
          tags = excluded.tags,
          field_confidence = excluded.field_confidence,
          priority = excluded.priority,
          importance = excluded.importance,
          urgency = excluded.urgency,
          due_on = excluded.due_on,
          scheduled_for = excluded.scheduled_for,
          scheduled_time = excluded.scheduled_time,
          date_intent = excluded.date_intent,
          scheduling = excluded.scheduling,
          effort_minutes = excluded.effort_minutes,
          min_minutes = excluded.min_minutes,
          max_minutes = excluded.max_minutes,
          estimate_confidence = excluded.estimate_confidence,
          energy = excluded.energy,
          strictness = excluded.strictness,
          notes = excluded.notes,
          blocked_reason = excluded.blocked_reason,
          blocked_json = excluded.blocked_json,
          waiting_json = excluded.waiting_json,
          delegation_json = excluded.delegation_json,
          completed_at = excluded.completed_at,
          last_completed_at = excluded.last_completed_at,
          source = excluded.source,
          updated_at = now()
        returning id
      `,
      [
        userId,
        task.id,
        domainIds.get(task.domainId),
        task.projectId ? containerIds.get(task.projectId) ?? null : null,
        task.sourceInboxItemId ?? null,
        task.title,
        task.description ?? null,
        task.type,
        task.status,
        JSON.stringify(task.repeatPolicy ?? { type: "none" }),
        task.completionBehavior,
        task.completionMode ?? null,
        task.definitionOfDone ?? null,
        JSON.stringify(task.plannerFields ?? {}),
        jsonOrNull(task.plannerSignals),
        task.tags ?? null,
        jsonOrNull(task.fieldConfidence),
        task.priority,
        task.importance,
        task.urgency,
        task.dueDate ?? null,
        task.scheduledDate ?? null,
        task.scheduledTime ?? null,
        jsonOrNull(task.dateIntent),
        jsonOrNull(task.scheduling),
        task.effortMinutes,
        task.minMinutes ?? null,
        task.maxMinutes ?? null,
        task.estimateConfidence ?? null,
        task.energy,
        task.strictness,
        task.notes ?? null,
        task.blockedReason ?? null,
        jsonOrNull(task.blocked),
        jsonOrNull(task.waiting),
        jsonOrNull(task.delegation),
        task.completedAt ?? null,
        task.lastCompletedAt ?? null,
        task.source ?? null
      ]
    );
    taskIds.set(task.id, result.rows[0].id);
  }

  for (const task of state.tasks ?? []) {
    if (!task.parentTaskId) continue;
    await client.query(
      "update tasks set parent_task_id = $1 where user_id = $2 and external_id = $3",
      [taskIds.get(task.parentTaskId) ?? null, userId, task.id]
    );
  }

  for (const routine of state.routines ?? []) {
    await client.query(
      `
        insert into routine_templates (
          user_id, external_id, domain_id, title, recurrence, default_effort_minutes, energy, strictness, preferred_window, active, updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, now())
        on conflict (user_id, external_id) where external_id is not null
        do update set
          domain_id = excluded.domain_id,
          title = excluded.title,
          recurrence = excluded.recurrence,
          default_effort_minutes = excluded.default_effort_minutes,
          energy = excluded.energy,
          strictness = excluded.strictness,
          preferred_window = excluded.preferred_window,
          active = excluded.active,
          updated_at = now()
      `,
      [
        userId,
        routine.id,
        domainIds.get(routine.domainId),
        routine.title,
        JSON.stringify(routine.recurrence),
        routine.defaultEffortMinutes,
        routine.energy,
        routine.strictness,
        routine.preferredWindow ?? null,
        routine.active
      ]
    );
  }

  for (const event of state.executionEvents ?? []) {
    await client.query(
      `
        insert into execution_events (
          user_id, external_id, event_date, type, task_id, task_external_id, task_external_ids, plan_item_external_id, reason, note,
          actual_minutes, next_action, blocked_json, waiting_json, delegation_json, payload_json, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17)
        on conflict (user_id, external_id) where external_id is not null
        do update set
          event_date = excluded.event_date,
          type = excluded.type,
          task_id = excluded.task_id,
          task_external_id = excluded.task_external_id,
          task_external_ids = excluded.task_external_ids,
          plan_item_external_id = excluded.plan_item_external_id,
          reason = excluded.reason,
          note = excluded.note,
          actual_minutes = excluded.actual_minutes,
          next_action = excluded.next_action,
          blocked_json = excluded.blocked_json,
          waiting_json = excluded.waiting_json,
          delegation_json = excluded.delegation_json,
          payload_json = excluded.payload_json
      `,
      [
        userId,
        event.id,
        event.date,
        event.type,
        event.taskId ? taskIds.get(event.taskId) ?? null : null,
        event.taskId ?? null,
        event.taskIds ?? null,
        event.planItemId ?? null,
        event.reason ?? null,
        event.note ?? null,
        event.actualMinutes ?? null,
        event.nextAction ?? null,
        jsonOrNull(event.blocked),
        jsonOrNull(event.waiting),
        jsonOrNull(event.delegation),
        JSON.stringify(event),
        event.createdAt ?? new Date().toISOString()
      ]
    );
  }

  const inboxIds = new Map();
  const actionIds = new Map();
  const sessionIds = new Map();

  for (const entry of state.inbox ?? []) {
    const result = await client.query(
      `
        insert into inbox_items (user_id, external_id, raw_text, status, assistant_summary, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
        on conflict (user_id, external_id) where external_id is not null
        do update set raw_text = excluded.raw_text, status = excluded.status, assistant_summary = excluded.assistant_summary, updated_at = now()
        returning id
      `,
      [userId, entry.id, entry.input, inboxStatus(entry), entry.summary, entry.createdAt]
    );
    inboxIds.set(entry.id, result.rows[0].id);
  }

  for (const session of state.captureSessions ?? []) {
    const inboxEntry = (state.inbox ?? []).find((entry) => entry.captureSessionId === session.id);
    const result = await client.query(
      `
        insert into capture_sessions (
          user_id, external_id, inbox_item_id, inbox_item_external_id, status, source, summary, action_external_ids,
          draft_action_external_ids, applied_entity_external_ids, answered_fields, unresolved_fields, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        on conflict (user_id, external_id) where external_id is not null
        do update set
          inbox_item_id = excluded.inbox_item_id,
          inbox_item_external_id = excluded.inbox_item_external_id,
          status = excluded.status,
          source = excluded.source,
          summary = excluded.summary,
          action_external_ids = excluded.action_external_ids,
          draft_action_external_ids = excluded.draft_action_external_ids,
          applied_entity_external_ids = excluded.applied_entity_external_ids,
          answered_fields = excluded.answered_fields,
          unresolved_fields = excluded.unresolved_fields,
          updated_at = excluded.updated_at
        returning id
      `,
      [
        userId,
        session.id,
        inboxEntry ? inboxIds.get(inboxEntry.id) ?? null : null,
        inboxEntry?.id ?? null,
        session.status,
        session.source,
        session.summary,
        session.actionIds ?? [],
        session.draftActionIds ?? [],
        session.appliedEntityIds ?? [],
        session.answeredFields ?? [],
        session.unresolvedFields ?? [],
        session.createdAt,
        session.updatedAt
      ]
    );
    sessionIds.set(session.id, result.rows[0].id);
  }

  for (const entry of state.inbox ?? []) {
    for (const action of entry.actions ?? []) {
      const result = await client.query(
        `
          insert into ai_actions (
            user_id, external_id, inbox_item_id, inbox_item_external_id, capture_session_id, capture_session_external_id,
            pending_question_external_id, action_type, label, risk_level, status, payload_json, validation_errors,
            applied_record_refs, model, skipped_reason, created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17)
          on conflict (user_id, external_id) where external_id is not null
          do update set
            inbox_item_id = excluded.inbox_item_id,
            inbox_item_external_id = excluded.inbox_item_external_id,
            capture_session_id = excluded.capture_session_id,
            capture_session_external_id = excluded.capture_session_external_id,
            pending_question_external_id = excluded.pending_question_external_id,
            action_type = excluded.action_type,
            label = excluded.label,
            risk_level = excluded.risk_level,
            status = excluded.status,
            payload_json = excluded.payload_json,
            validation_errors = excluded.validation_errors,
            applied_record_refs = excluded.applied_record_refs,
            model = excluded.model,
            skipped_reason = excluded.skipped_reason
          returning id
        `,
        [
          userId,
          action.id,
          inboxIds.get(entry.id) ?? null,
          entry.id,
          action.captureSessionId ? sessionIds.get(action.captureSessionId) ?? null : null,
          action.captureSessionId ?? null,
          action.pendingQuestionId ?? null,
          action.type,
          action.label,
          action.safety === "auto_apply" ? "safe" : "confirmation_required",
          action.status,
          JSON.stringify(action.payload ?? {}),
          jsonOrNull(action.validationErrors),
          jsonOrNull(action.appliedEntityId ? { appliedEntityId: action.appliedEntityId } : undefined),
          action.model ?? null,
          action.skippedReason ?? null,
          action.createdAt ?? entry.createdAt
        ]
      );
      actionIds.set(action.id, result.rows[0].id);
    }
  }

  for (const session of state.captureSessions ?? []) {
    const sessionId = sessionIds.get(session.id);
    if (!sessionId) continue;
    for (const message of session.messages ?? []) {
      await client.query(
        `
          insert into capture_messages (session_id, external_id, role, content, created_at)
          values ($1, $2, $3, $4, $5)
          on conflict (session_id, external_id) where external_id is not null
          do update set role = excluded.role, content = excluded.content, created_at = excluded.created_at
        `,
        [sessionId, message.id, message.role, message.content, message.createdAt]
      );
    }
    await deleteSessionProjectedRows(
      client,
      "capture_messages",
      sessionId,
      (session.messages ?? []).map((message) => message.id)
    );

    for (const question of session.questions ?? []) {
      await client.query(
        `
          insert into clarification_questions (
            session_id, external_id, action_id, action_external_id, question, kind, mode, status, options, materiality, rationale, answer, created_at, answered_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          on conflict (session_id, external_id) where external_id is not null
          do update set
            action_id = excluded.action_id,
            action_external_id = excluded.action_external_id,
            question = excluded.question,
            kind = excluded.kind,
            mode = excluded.mode,
            status = excluded.status,
            options = excluded.options,
            materiality = excluded.materiality,
            rationale = excluded.rationale,
            answer = excluded.answer,
            answered_at = excluded.answered_at
        `,
        [
          sessionId,
          question.id,
          actionIds.get(question.actionId) ?? null,
          question.actionId,
          question.question,
          question.kind,
          question.mode,
          question.status,
          question.options ?? null,
          question.materiality ?? null,
          question.rationale ?? null,
          question.answer ?? null,
          question.createdAt,
          question.answeredAt ?? null
        ]
      );
    }
    await deleteSessionProjectedRows(
      client,
      "clarification_questions",
      sessionId,
      (session.questions ?? []).map((question) => question.id)
    );

    for (const revision of session.revisionEvents ?? []) {
      await client.query(
        `
          insert into capture_revision_events (
            session_id, external_id, source, task_id, task_external_id, action_id, action_external_id, model, confidence, summary, changes,
            before_json, after_json, created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)
          on conflict (session_id, external_id) where external_id is not null
          do update set
            source = excluded.source,
            task_id = excluded.task_id,
            task_external_id = excluded.task_external_id,
            action_id = excluded.action_id,
            action_external_id = excluded.action_external_id,
            model = excluded.model,
            confidence = excluded.confidence,
            summary = excluded.summary,
            changes = excluded.changes,
            before_json = excluded.before_json,
            after_json = excluded.after_json
        `,
        [
          sessionId,
          revision.id,
          revision.source,
          revision.taskId ? taskIds.get(revision.taskId) ?? null : null,
          revision.taskId ?? null,
          revision.actionId ? actionIds.get(revision.actionId) ?? null : null,
          revision.actionId ?? null,
          revision.model ?? null,
          revision.confidence ?? null,
          revision.summary,
          revision.changes ?? [],
          jsonOrNull(revision.before),
          jsonOrNull(revision.after),
          revision.createdAt
        ]
      );
    }
    await deleteSessionProjectedRows(
      client,
      "capture_revision_events",
      sessionId,
      (session.revisionEvents ?? []).map((revision) => revision.id)
    );
  }

  await deleteProjectedRows(client, "execution_events", userId, (state.executionEvents ?? []).map((event) => event.id));
  await deleteProjectedRows(client, "tasks", userId, (state.tasks ?? []).map((task) => task.id));
  await deleteProjectedRows(client, "routine_templates", userId, (state.routines ?? []).map((routine) => routine.id));
  await deleteProjectedRows(
    client,
    "ai_actions",
    userId,
    (state.inbox ?? []).flatMap((entry) => (entry.actions ?? []).map((action) => action.id))
  );
  await deleteProjectedRows(client, "capture_sessions", userId, (state.captureSessions ?? []).map((session) => session.id));
  await deleteProjectedRows(client, "inbox_items", userId, (state.inbox ?? []).map((entry) => entry.id));
  await deleteProjectedRows(client, "containers", userId, (state.projects ?? []).map((project) => project.id));
  await deleteProjectedRows(client, "domains", userId, (state.domains ?? []).map((domain) => domain.id));
}

function inboxStatus(entry) {
  if ((entry.actions ?? []).some((action) => action.status === "failed")) return "failed";
  if ((entry.actions ?? []).some((action) => action.type === "ask_clarification" && action.status === "proposed")) return "needs_clarification";
  if ((entry.actions ?? []).some((action) => action.status === "proposed")) return "proposed";
  if ((entry.actions ?? []).length && (entry.actions ?? []).every((action) => action.status === "applied")) return "applied";
  return "received";
}

function jsonOrNull(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

async function deleteProjectedRows(client, tableName, userId, externalIds) {
  const allowedTables = new Set([
    "domains",
    "containers",
    "tasks",
    "routine_templates",
    "execution_events",
    "inbox_items",
    "ai_actions",
    "capture_sessions"
  ]);
  if (!allowedTables.has(tableName)) throw new Error(`Unsupported projected table cleanup: ${tableName}`);

  if (externalIds.length === 0) {
    await client.query(`delete from ${tableName} where user_id = $1 and external_id is not null`, [userId]);
    return;
  }
  await client.query(`delete from ${tableName} where user_id = $1 and external_id is not null and not (external_id = any($2::text[]))`, [
    userId,
    externalIds
  ]);
}

async function deleteSessionProjectedRows(client, tableName, sessionId, externalIds) {
  const allowedTables = new Set(["capture_messages", "clarification_questions", "capture_revision_events"]);
  if (!allowedTables.has(tableName)) throw new Error(`Unsupported projected session table cleanup: ${tableName}`);

  if (externalIds.length === 0) {
    await client.query(`delete from ${tableName} where session_id = $1 and external_id is not null`, [sessionId]);
    return;
  }
  await client.query(`delete from ${tableName} where session_id = $1 and external_id is not null and not (external_id = any($2::text[]))`, [
    sessionId,
    externalIds
  ]);
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = unquoteEnvValue(match[2]);
    }
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
