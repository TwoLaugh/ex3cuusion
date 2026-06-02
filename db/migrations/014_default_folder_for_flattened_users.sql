with flattened_users as (
  select tasks.user_id
  from tasks
  left join folders on folders.user_id = tasks.user_id
  group by tasks.user_id
  having count(tasks.id) > 0 and count(folders.id) = 0
)
insert into folders (user_id, external_id, name, weight, can_block, status)
select user_id, 'folder_personal', 'Personal', 5, true, 'active'
from flattened_users
on conflict (user_id, external_id) do nothing;

with personal_folders as (
  select folders.user_id, folders.id
  from folders
  where folders.external_id = 'folder_personal'
)
update tasks
set folder_id = personal_folders.id
from personal_folders
where tasks.user_id = personal_folders.user_id
  and tasks.folder_id is null;
