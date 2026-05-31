alter table domains add column external_id text;
alter table containers add column external_id text;
alter table tasks add column external_id text;
alter table tasks add column source_inbox_item_external_id text;
alter table routine_templates add column external_id text;
alter table execution_events add column external_id text;
alter table execution_events add column task_external_id text;
alter table execution_events add column task_external_ids text[];
alter table execution_events add column plan_item_external_id text;
alter table inbox_items add column external_id text;
alter table ai_actions add column external_id text;
alter table ai_actions add column inbox_item_external_id text;
alter table ai_actions add column capture_session_external_id text;
alter table ai_actions add column pending_question_external_id text;
alter table capture_sessions add column external_id text;
alter table capture_sessions add column inbox_item_external_id text;
alter table capture_sessions add column action_external_ids text[] not null default '{}';
alter table capture_sessions add column draft_action_external_ids text[] not null default '{}';
alter table capture_messages add column external_id text;
alter table clarification_questions add column external_id text;
alter table clarification_questions add column action_external_id text;
alter table capture_revision_events add column external_id text;
alter table capture_revision_events add column task_external_id text;
alter table capture_revision_events add column action_external_id text;

update domains set external_id = 'domain_health' where name = 'Health Repair';
update domains set external_id = 'domain_work' where name = 'Job Work';
update domains set external_id = 'domain_product' where name = 'Diet App';
update domains set external_id = 'domain_house' where name = 'House Work';
update domains set external_id = 'domain_social' where name = 'Social Maintenance';

update containers set external_id = 'project_diet_app' where name = 'Diet App';
update containers set external_id = 'container_emma' where name = 'Emma';

update tasks set external_id = 'task_auth_bug' where title = 'Finish auth bug';
update tasks set external_id = 'task_optimizer_tests' where title = 'Add optimizer tests';
update tasks set external_id = 'task_message_will' where title = 'Message Will';

update routine_templates set external_id = 'routine_back_rehab' where title = 'Back rehab';

create unique index domains_user_external_id_idx on domains(user_id, external_id) where external_id is not null;
create unique index containers_user_external_id_idx on containers(user_id, external_id) where external_id is not null;
create unique index tasks_user_external_id_idx on tasks(user_id, external_id) where external_id is not null;
create unique index routine_templates_user_external_id_idx on routine_templates(user_id, external_id) where external_id is not null;
create unique index execution_events_user_external_id_idx on execution_events(user_id, external_id) where external_id is not null;
create unique index inbox_items_user_external_id_idx on inbox_items(user_id, external_id) where external_id is not null;
create unique index ai_actions_user_external_id_idx on ai_actions(user_id, external_id) where external_id is not null;
create unique index capture_sessions_user_external_id_idx on capture_sessions(user_id, external_id) where external_id is not null;
create unique index capture_messages_session_external_id_idx on capture_messages(session_id, external_id) where external_id is not null;
create unique index clarification_questions_session_external_id_idx on clarification_questions(session_id, external_id) where external_id is not null;
create unique index capture_revision_events_session_external_id_idx on capture_revision_events(session_id, external_id) where external_id is not null;

