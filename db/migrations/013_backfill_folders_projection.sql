insert into folders (user_id, external_id, name, weight, can_block, status, created_at, updated_at)
select
  user_id,
  coalesce(external_id, 'domain_' || id::text),
  name,
  weight,
  false,
  case when status = 'active' then 'active' else 'archived' end,
  created_at,
  updated_at
from domains
on conflict (user_id, external_id) do update set
  name = excluded.name,
  weight = excluded.weight,
  status = excluded.status,
  updated_at = now();

insert into folders (
  user_id,
  external_id,
  name,
  parent_folder_id,
  weight,
  can_block,
  default_block_minutes,
  context_note,
  status,
  created_at,
  updated_at
)
select
  containers.user_id,
  coalesce(containers.external_id, 'container_' || containers.id::text),
  containers.name,
  parent_folders.id,
  containers.priority_weight,
  true,
  containers.default_block_minutes,
  containers.context_note,
  case when containers.status = 'active' then 'active' else 'archived' end,
  containers.created_at,
  containers.updated_at
from containers
left join domains on domains.id = containers.domain_id
left join folders parent_folders
  on parent_folders.user_id = containers.user_id
  and parent_folders.external_id = coalesce(domains.external_id, 'domain_' || domains.id::text)
on conflict (user_id, external_id) do update set
  name = excluded.name,
  parent_folder_id = excluded.parent_folder_id,
  weight = excluded.weight,
  can_block = excluded.can_block,
  default_block_minutes = excluded.default_block_minutes,
  context_note = excluded.context_note,
  status = excluded.status,
  updated_at = now();

with resolved_task_folders as (
  select
    tasks.id as task_id,
    coalesce(container_folders.id, domain_folders.id) as folder_id
  from tasks
  left join containers on containers.id = tasks.container_id
  left join folders container_folders
    on container_folders.user_id = tasks.user_id
    and container_folders.external_id = coalesce(containers.external_id, 'container_' || containers.id::text)
  left join domains on domains.id = tasks.domain_id
  left join folders domain_folders
    on domain_folders.user_id = tasks.user_id
    and domain_folders.external_id = coalesce(domains.external_id, 'domain_' || domains.id::text)
)
update tasks
set folder_id = resolved_task_folders.folder_id
from resolved_task_folders
where tasks.id = resolved_task_folders.task_id
  and tasks.folder_id is null
  and resolved_task_folders.folder_id is not null;

with migrated_runtime_state as (
  select
    user_id,
    coalesce(
      jsonb_agg((selection - 'projectId') || jsonb_build_object('folderId', selection->>'projectId')),
      '[]'::jsonb
    ) as folder_block_selections_json
  from app_runtime_state
  cross join lateral jsonb_array_elements(project_block_selections_json) as selection
  where project_block_selections_json <> '[]'::jsonb
    and folder_block_selections_json = '[]'::jsonb
    and selection ? 'projectId'
  group by user_id
)
update app_runtime_state
set folder_block_selections_json = migrated_runtime_state.folder_block_selections_json,
  updated_at = now()
from migrated_runtime_state
where app_runtime_state.user_id = migrated_runtime_state.user_id;
