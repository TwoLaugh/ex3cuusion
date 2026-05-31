alter table tasks drop constraint tasks_priority_check;
alter table tasks drop constraint tasks_importance_check;
alter table tasks drop constraint tasks_urgency_check;

alter table tasks add constraint tasks_priority_check check (priority between 1 and 10);
alter table tasks add constraint tasks_importance_check check (importance between 1 and 10);
alter table tasks add constraint tasks_urgency_check check (urgency between 1 and 10);
