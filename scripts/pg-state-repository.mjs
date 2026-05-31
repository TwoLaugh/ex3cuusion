import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

const command = process.argv[2];
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
    const projectedState = await readProjectedState(client);
    if (projectedState) {
      process.stdout.write(JSON.stringify(projectedState));
    } else {
      process.stdout.write("");
    }
  }

  if (command === "write") {
    const stateJson = await readStdin();
    const state = JSON.parse(stateJson);
    await client.query("begin");
    try {
      await projectState(client, state);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  if (command === "delete") {
    await client.query("begin");
    try {
      await deleteProjectedState(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
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
  const userId = localUserId();
  await client.query(
    `
      insert into users (id, email, display_name, timezone)
      values ($1, $2, 'Local User', 'Europe/London')
      on conflict (id) do nothing
    `,
    [userId, localUserEmail(userId)]
  );
  await client.query(
    `
      insert into app_runtime_state (
        user_id, current_day, current_clock, available_minutes, deferrals_json, completions_json, project_block_selections_json, daily_reviews_json, entity_order_json, updated_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, now())
      on conflict (user_id)
      do update set
        current_day = excluded.current_day,
        current_clock = excluded.current_clock,
        available_minutes = excluded.available_minutes,
        deferrals_json = excluded.deferrals_json,
        completions_json = excluded.completions_json,
        project_block_selections_json = excluded.project_block_selections_json,
        daily_reviews_json = excluded.daily_reviews_json,
        entity_order_json = excluded.entity_order_json,
        updated_at = now()
    `,
    [
      userId,
      state.currentDate,
      state.currentTime,
      state.availableMinutes,
      JSON.stringify(state.deferrals ?? []),
      JSON.stringify(state.completions ?? []),
      JSON.stringify(state.projectBlockSelections ?? []),
      JSON.stringify(state.dailyReviews ?? []),
      JSON.stringify(entityOrder(state))
    ]
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

async function readProjectedState(client) {
  const userId = localUserId();
  const runtime = await client.query("select * from app_runtime_state where user_id = $1", [userId]);
  if (!runtime.rowCount) return null;

  const runtimeRow = runtime.rows[0];
  const order = runtimeRow.entity_order_json ?? {};

  const domains = await client.query(
    `
      select external_id, name, weight
      from domains
      where user_id = $1 and external_id is not null
    `,
    [userId]
  );
  const projects = await client.query(
    `
      select
        containers.external_id,
        domains.external_id as domain_external_id,
        containers.name,
        containers.kind,
        containers.planning_mode,
        containers.status,
        containers.priority_weight,
        containers.default_block_minutes,
        containers.context_note
      from containers
      left join domains on domains.id = containers.domain_id
      where containers.user_id = $1 and containers.external_id is not null
    `,
    [userId]
  );
  const tasks = await client.query(
    `
      select
        tasks.external_id,
        domains.external_id as domain_external_id,
        containers.external_id as container_external_id,
        parent.external_id as parent_task_external_id,
        tasks.source_inbox_item_external_id,
        tasks.title,
        tasks.description,
        tasks.type,
        tasks.status,
        tasks.repeat_policy,
        tasks.completion_behavior,
        tasks.completion_mode,
        tasks.definition_of_done,
        tasks.planner_fields,
        tasks.planner_signals,
        tasks.tags,
        tasks.field_confidence,
        tasks.priority,
        tasks.importance,
        tasks.urgency,
        tasks.due_on,
        tasks.scheduled_for,
        tasks.scheduled_time,
        tasks.date_intent,
        tasks.scheduling,
        tasks.effort_minutes,
        tasks.min_minutes,
        tasks.max_minutes,
        tasks.estimate_confidence,
        tasks.energy,
        tasks.strictness,
        tasks.notes,
        tasks.blocked_reason,
        tasks.blocked_json,
        tasks.waiting_json,
        tasks.delegation_json,
        tasks.completed_at,
        tasks.last_completed_at,
        tasks.source
      from tasks
      join domains on domains.id = tasks.domain_id
      left join containers on containers.id = tasks.container_id
      left join tasks parent on parent.id = tasks.parent_task_id
      where tasks.user_id = $1 and tasks.external_id is not null
    `,
    [userId]
  );
  const routines = await client.query(
    `
      select
        routine_templates.external_id,
        domains.external_id as domain_external_id,
        routine_templates.title,
        routine_templates.recurrence,
        routine_templates.default_effort_minutes,
        routine_templates.energy,
        routine_templates.strictness,
        routine_templates.preferred_window,
        routine_templates.active
      from routine_templates
      join domains on domains.id = routine_templates.domain_id
      where routine_templates.user_id = $1 and routine_templates.external_id is not null
    `,
    [userId]
  );
  const executionEvents = await client.query(
    `
      select
        external_id,
        event_date,
        type,
        task_external_id,
        task_external_ids,
        plan_item_external_id,
        reason,
        note,
        actual_minutes,
        next_action,
        blocked_json,
        waiting_json,
        delegation_json,
        created_at
      from execution_events
      where user_id = $1 and external_id is not null
    `,
    [userId]
  );
  const inboxItems = await client.query(
    `
      select external_id, raw_text, assistant_summary, created_at
      from inbox_items
      where user_id = $1 and external_id is not null
    `,
    [userId]
  );
  const aiActions = await client.query(
    `
      select
        external_id,
        inbox_item_external_id,
        capture_session_external_id,
        pending_question_external_id,
        action_type,
        label,
        risk_level,
        status,
        payload_json,
        validation_errors,
        applied_record_refs,
        model,
        skipped_reason,
        created_at
      from ai_actions
      where user_id = $1 and external_id is not null
    `,
    [userId]
  );
  const captureSessions = await client.query(
    `
      select
        id,
        external_id,
        inbox_item_external_id,
        status,
        source,
        summary,
        action_external_ids,
        draft_action_external_ids,
        applied_entity_external_ids,
        answered_fields,
        unresolved_fields,
        created_at,
        updated_at
      from capture_sessions
      where user_id = $1 and external_id is not null
    `,
    [userId]
  );
  const captureMessages = await client.query(
    `
      select
        capture_sessions.external_id as session_external_id,
        capture_messages.external_id,
        capture_messages.role,
        capture_messages.content,
        capture_messages.created_at
      from capture_messages
      join capture_sessions on capture_sessions.id = capture_messages.session_id
      where capture_sessions.user_id = $1 and capture_messages.external_id is not null
    `,
    [userId]
  );
  const clarificationQuestions = await client.query(
    `
      select
        capture_sessions.external_id as session_external_id,
        clarification_questions.external_id,
        clarification_questions.action_external_id,
        clarification_questions.question,
        clarification_questions.kind,
        clarification_questions.mode,
        clarification_questions.status,
        clarification_questions.options,
        clarification_questions.materiality,
        clarification_questions.rationale,
        clarification_questions.answer,
        clarification_questions.created_at,
        clarification_questions.answered_at
      from clarification_questions
      join capture_sessions on capture_sessions.id = clarification_questions.session_id
      where capture_sessions.user_id = $1 and clarification_questions.external_id is not null
    `,
    [userId]
  );
  const captureRevisionEvents = await client.query(
    `
      select
        capture_sessions.external_id as session_external_id,
        capture_revision_events.external_id,
        capture_revision_events.source,
        capture_revision_events.task_external_id,
        capture_revision_events.action_external_id,
        capture_revision_events.model,
        capture_revision_events.confidence,
        capture_revision_events.summary,
        capture_revision_events.changes,
        capture_revision_events.before_json,
        capture_revision_events.after_json,
        capture_revision_events.created_at
      from capture_revision_events
      join capture_sessions on capture_sessions.id = capture_revision_events.session_id
      where capture_sessions.user_id = $1 and capture_revision_events.external_id is not null
    `,
    [userId]
  );

  const messagesBySession = groupBy(captureMessages.rows, (row) => row.session_external_id);
  const questionsBySession = groupBy(clarificationQuestions.rows, (row) => row.session_external_id);
  const revisionsBySession = groupBy(captureRevisionEvents.rows, (row) => row.session_external_id);
  const sessionsByInbox = new Map(captureSessions.rows.map((row) => [row.inbox_item_external_id, row.external_id]));
  const actionsByInbox = groupBy(aiActions.rows, (row) => row.inbox_item_external_id);

  return {
    currentDate: formatDateOnly(runtimeRow.current_day),
    currentTime: formatTimeOnly(runtimeRow.current_clock),
    availableMinutes: runtimeRow.available_minutes,
    domains: sortRows(domains.rows, order.domains).map((row) => ({
      id: row.external_id,
      name: row.name,
      weight: Number(row.weight)
    })),
    projects: sortRows(projects.rows, order.projects).map((row) => ({
      id: row.external_id,
      domainId: row.domain_external_id,
      name: row.name,
      kind: row.kind,
      planningMode: row.planning_mode,
      status: row.status,
      priorityWeight: Number(row.priority_weight),
      defaultBlockMinutes: row.default_block_minutes,
      contextNote: row.context_note
    })),
    tasks: sortRows(tasks.rows, order.tasks).map((row) => omitUndefined({
      id: row.external_id,
      title: row.title,
      description: row.description ?? undefined,
      type: row.type,
      domainId: row.domain_external_id,
      projectId: row.container_external_id ?? undefined,
      parentTaskId: row.parent_task_external_id ?? undefined,
      sourceInboxItemId: row.source_inbox_item_external_id ?? undefined,
      status: row.status,
      repeatPolicy: row.repeat_policy,
      completionBehavior: row.completion_behavior,
      completionMode: row.completion_mode ?? undefined,
      definitionOfDone: row.definition_of_done ?? undefined,
      plannerFields: row.planner_fields,
      plannerSignals: row.planner_signals ?? undefined,
      tags: row.tags ?? undefined,
      fieldConfidence: row.field_confidence ?? undefined,
      priority: row.priority,
      importance: row.importance,
      urgency: row.urgency,
      dueDate: row.due_on ? formatDateOnly(row.due_on) : undefined,
      scheduledDate: row.scheduled_for ? formatDateOnly(row.scheduled_for) : undefined,
      scheduledTime: row.scheduled_time ? formatTimeOnly(row.scheduled_time) : undefined,
      dateIntent: row.date_intent ?? undefined,
      scheduling: row.scheduling ?? undefined,
      effortMinutes: row.effort_minutes,
      minMinutes: row.min_minutes ?? undefined,
      maxMinutes: row.max_minutes ?? undefined,
      estimateConfidence: row.estimate_confidence === null ? undefined : Number(row.estimate_confidence),
      energy: row.energy,
      strictness: row.strictness,
      notes: row.notes ?? undefined,
      blockedReason: row.blocked_reason ?? undefined,
      blocked: row.blocked_json ?? undefined,
      waiting: row.waiting_json ?? undefined,
      delegation: row.delegation_json ?? undefined,
      completedAt: row.completed_at ? formatIso(row.completed_at) : undefined,
      lastCompletedAt: row.last_completed_at ? formatIso(row.last_completed_at) : undefined,
      source: row.source ?? undefined
    })),
    routines: sortRows(routines.rows, order.routines).map((row) => omitUndefined({
      id: row.external_id,
      title: row.title,
      domainId: row.domain_external_id,
      recurrence: row.recurrence,
      defaultEffortMinutes: row.default_effort_minutes,
      energy: row.energy,
      strictness: row.strictness,
      preferredWindow: row.preferred_window ?? undefined,
      active: row.active
    })),
    deferrals: runtimeRow.deferrals_json ?? [],
    completions: runtimeRow.completions_json ?? [],
    projectBlockSelections: runtimeRow.project_block_selections_json ?? [],
    dailyReviews: runtimeRow.daily_reviews_json ?? [],
    executionEvents: sortRows(executionEvents.rows, order.executionEvents).map((row) => omitUndefined({
      id: row.external_id,
      date: formatDateOnly(row.event_date),
      createdAt: formatIso(row.created_at),
      type: row.type,
      taskId: row.task_external_id ?? undefined,
      taskIds: row.task_external_ids ?? undefined,
      planItemId: row.plan_item_external_id ?? undefined,
      reason: row.reason ?? undefined,
      note: row.note ?? undefined,
      actualMinutes: row.actual_minutes ?? undefined,
      nextAction: row.next_action ?? undefined,
      blocked: row.blocked_json ?? undefined,
      waiting: row.waiting_json ?? undefined,
      delegation: row.delegation_json ?? undefined
    })),
    inbox: sortRows(inboxItems.rows, order.inbox).map((row) => omitUndefined({
      id: row.external_id,
      createdAt: formatIso(row.created_at),
      input: row.raw_text,
      actions: sortRows(actionsByInbox.get(row.external_id) ?? [], order.aiActions).map((action) => omitUndefined({
        id: action.external_id,
        type: action.action_type,
        label: action.label,
        payload: action.payload_json ?? {},
        safety: action.risk_level === "safe" ? "auto_apply" : "needs_confirmation",
        status: action.status,
        appliedEntityId: action.applied_record_refs?.appliedEntityId ?? undefined,
        skippedReason: action.skipped_reason ?? undefined,
        validationErrors: action.validation_errors ?? undefined,
        model: action.model ?? undefined,
        createdAt: action.created_at ? formatIso(action.created_at) : undefined,
        captureSessionId: action.capture_session_external_id ?? undefined,
        sourceMessageId: action.inbox_item_external_id ?? undefined,
        pendingQuestionId: action.pending_question_external_id ?? undefined
      })),
      summary: row.assistant_summary,
      captureSessionId: sessionsByInbox.get(row.external_id) ?? undefined
    })),
    captureSessions: sortRows(captureSessions.rows, order.captureSessions).map((row) => ({
      id: row.external_id,
      status: row.status,
      source: row.source,
      createdAt: formatIso(row.created_at),
      updatedAt: formatIso(row.updated_at),
      messages: sortRows(messagesBySession.get(row.external_id) ?? [], order.captureMessages).map((message) => ({
        id: message.external_id,
        role: message.role,
        content: message.content,
        createdAt: formatIso(message.created_at)
      })),
      questions: sortRows(questionsBySession.get(row.external_id) ?? [], order.clarificationQuestions).map((question) => omitUndefined({
        id: question.external_id,
        actionId: question.action_external_id,
        question: question.question,
        kind: question.kind,
        mode: question.mode,
        status: question.status,
        options: question.options ?? undefined,
        materiality: question.materiality ?? undefined,
        rationale: question.rationale ?? undefined,
        answer: question.answer ?? undefined,
        createdAt: formatIso(question.created_at),
        answeredAt: question.answered_at ? formatIso(question.answered_at) : undefined
      })),
      actionIds: row.action_external_ids ?? [],
      draftActionIds: row.draft_action_external_ids ?? [],
      appliedEntityIds: row.applied_entity_external_ids ?? [],
      answeredFields: row.answered_fields ?? [],
      revisionEvents: sortRows(revisionsBySession.get(row.external_id) ?? [], order.captureRevisionEvents).map((revision) => omitUndefined({
        id: revision.external_id,
        createdAt: formatIso(revision.created_at),
        source: revision.source,
        taskId: revision.task_external_id ?? undefined,
        actionId: revision.action_external_id ?? undefined,
        model: revision.model ?? undefined,
        confidence: revision.confidence === null ? undefined : Number(revision.confidence),
        summary: revision.summary,
        changes: revision.changes ?? [],
        before: revision.before_json ?? undefined,
        after: revision.after_json ?? undefined
      })),
      unresolvedFields: row.unresolved_fields ?? [],
      summary: row.summary
    }))
  };
}

async function deleteProjectedState(client) {
  const userId = localUserId();
  await client.query("delete from app_runtime_state where user_id = $1", [userId]);
  await deleteProjectedRows(client, "execution_events", userId, []);
  await deleteProjectedRows(client, "ai_actions", userId, []);
  await deleteProjectedRows(client, "capture_sessions", userId, []);
  await deleteProjectedRows(client, "inbox_items", userId, []);
  await deleteProjectedRows(client, "tasks", userId, []);
  await deleteProjectedRows(client, "routine_templates", userId, []);
  await deleteProjectedRows(client, "containers", userId, []);
  await deleteProjectedRows(client, "domains", userId, []);
}

function inboxStatus(entry) {
  if ((entry.actions ?? []).some((action) => action.status === "failed")) return "failed";
  if ((entry.actions ?? []).some((action) => action.type === "ask_clarification" && action.status === "proposed")) return "needs_clarification";
  if ((entry.actions ?? []).some((action) => action.status === "proposed")) return "proposed";
  if ((entry.actions ?? []).length && (entry.actions ?? []).every((action) => action.status === "applied")) return "applied";
  return "received";
}

function localUserId() {
  return process.env.EX3CUUSION_LOCAL_USER_ID ?? "00000000-0000-0000-0000-000000000001";
}

function localUserEmail(userId) {
  return userId === "00000000-0000-0000-0000-000000000001" ? "local@ex3cuusion.dev" : `local+${userId}@ex3cuusion.dev`;
}

function entityOrder(state) {
  return {
    domains: (state.domains ?? []).map((entry) => entry.id),
    projects: (state.projects ?? []).map((entry) => entry.id),
    tasks: (state.tasks ?? []).map((entry) => entry.id),
    routines: (state.routines ?? []).map((entry) => entry.id),
    executionEvents: (state.executionEvents ?? []).map((entry) => entry.id),
    inbox: (state.inbox ?? []).map((entry) => entry.id),
    aiActions: (state.inbox ?? []).flatMap((entry) => (entry.actions ?? []).map((action) => action.id)),
    captureSessions: (state.captureSessions ?? []).map((entry) => entry.id),
    captureMessages: (state.captureSessions ?? []).flatMap((entry) => (entry.messages ?? []).map((message) => message.id)),
    clarificationQuestions: (state.captureSessions ?? []).flatMap((entry) => (entry.questions ?? []).map((question) => question.id)),
    captureRevisionEvents: (state.captureSessions ?? []).flatMap((entry) => (entry.revisionEvents ?? []).map((revision) => revision.id))
  };
}

function groupBy(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return grouped;
}

function sortRows(rows, orderedExternalIds) {
  if (!Array.isArray(orderedExternalIds)) return [...rows].sort((a, b) => String(a.external_id).localeCompare(String(b.external_id)));
  const positions = new Map(orderedExternalIds.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => {
    const aPosition = positions.get(a.external_id) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = positions.get(b.external_id) ?? Number.MAX_SAFE_INTEGER;
    if (aPosition !== bPosition) return aPosition - bPosition;
    return String(a.external_id).localeCompare(String(b.external_id));
  });
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function formatDateOnly(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function formatTimeOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  return String(value).slice(0, 5);
}

function formatIso(value) {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
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
