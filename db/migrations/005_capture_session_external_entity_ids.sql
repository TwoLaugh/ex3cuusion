alter table capture_sessions add column applied_entity_external_ids text[] not null default '{}';

