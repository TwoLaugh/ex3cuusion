insert into users (id, email, display_name, timezone)
values ('00000000-0000-0000-0000-000000000001', 'local@ex3cuusion.dev', 'Local User', 'Europe/London')
on conflict (id) do nothing;

insert into domains (id, user_id, name, weight)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Health Repair', 10),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Job Work', 9),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Diet App', 8),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'House Work', 5),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Social Maintenance', 4)
on conflict (id) do nothing;

insert into containers (id, user_id, domain_id, name, kind, planning_mode, priority_weight, default_block_minutes, context_note)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'Diet App',
    'project',
    'deadline_driven',
    9,
    120,
    'Keep momentum on auth and optimizer work.'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'Emma',
    'person',
    'relationship',
    4,
    45,
    'Relationship ideas and light-touch maintenance.'
  )
on conflict (id) do nothing;

insert into tasks (
  id,
  user_id,
  domain_id,
  container_id,
  title,
  type,
  status,
  completion_behavior,
  completion_mode,
  definition_of_done,
  planner_fields,
  tags,
  field_confidence,
  priority,
  importance,
  urgency,
  due_on,
  effort_minutes,
  energy,
  strictness
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'Finish auth bug',
    'project_task',
    'active',
    'exhaust_once',
    'outcome_done',
    'Auth bug is fixed and verified.',
    '{"intentType":"progress","pressureLevel":"due","location":"computer","setupCost":"medium"}',
    array['computer', 'auth'],
    '{"intentType":0.9,"pressureLevel":0.9,"effortMinutes":0.65}',
    9,
    9,
    9,
    '2026-06-05',
    90,
    'high',
    'normal'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'Add optimizer tests',
    'project_task',
    'active',
    'exhaust_once',
    'outcome_done',
    'Optimizer tests are added and passing.',
    '{"intentType":"progress","pressureLevel":"due","location":"computer","setupCost":"medium"}',
    array['computer', 'tests'],
    '{"intentType":0.9,"pressureLevel":0.8,"effortMinutes":0.7}',
    7,
    8,
    5,
    '2026-06-06',
    60,
    'medium',
    'normal'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    null,
    'Message Will',
    'atomic',
    'active',
    'exhaust_once',
    'simple_done',
    null,
    '{"intentType":"relationship","pressureLevel":"due","location":"phone","setupCost":"low"}',
    array['phone', 'social'],
    '{"intentType":0.85,"pressureLevel":0.75,"effortMinutes":0.8}',
    5,
    6,
    7,
    '2026-06-02',
    10,
    'low',
    'normal'
  )
on conflict (id) do nothing;

insert into routine_templates (
  id,
  user_id,
  domain_id,
  title,
  recurrence,
  default_effort_minutes,
  energy,
  strictness,
  preferred_window,
  active
)
values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Back rehab',
  '{"type":"daily"}',
  20,
  'low',
  'strict',
  'morning',
  true
)
on conflict (id) do nothing;

insert into planning_context (
  user_id,
  default_day_start,
  default_day_end,
  default_available_minutes,
  preferred_load_level,
  planning_preferences_json,
  recent_capacity_json
)
values (
  '00000000-0000-0000-0000-000000000001',
  '08:30',
  '18:00',
  300,
  'normal',
  '{}',
  '{}'
)
on conflict (user_id) do nothing;

