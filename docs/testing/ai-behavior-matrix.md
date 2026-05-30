# AI Behavior Matrix

This matrix is for real-AI testing. Do not mock the model for these checks.

Each scenario should capture:

- user input
- model summary
- structured actions returned
- safety decision per action
- apply result per action
- expected visible Today change
- `/api/debug` evidence if the visible change is missing

## Logging Expectations

The AI inbox overlay must show every returned action with:

- label
- action type
- safety: `auto_apply` or `needs_confirmation`
- status: `proposed` or `applied`
- applied entity id when created
- skipped reason when not applied

The debug endpoint `/api/debug` must expose:

- latest inbox entries
- action payloads
- applied entity ids
- skipped reasons
- task list
- generated plan items

## Core Scenarios

### 1. Simple Task Today

Input:

```text
Add a task to call Mum today for 10 minutes.
```

Expected:

- one `create_task`
- `safety=auto_apply`
- `status=applied`
- task appears in `/api/debug.tasks`
- task appears in Today timeline

Failure clues:

- `needs_confirmation`: prompt/schema is too conservative
- task exists but no plan item: planner selection bug
- action applied but no task: apply-layer bug

### 2. Timed Task Today

Input:

```text
Add dentist booking at 15:30 today, should take 15 minutes.
```

Expected:

- one `create_task`
- applied
- visible in Today
- future implementation should preserve preferred time; current prototype may only order it in the day plan

### 3. Project Task

Input:

```text
Add a Diet App task to fix the onboarding copy before Friday.
```

Expected:

- `create_task`
- `projectName=Diet App`
- applied task has `projectId=project_diet_app`
- task appears either inside the Diet App block or as a planned task

### 4. Routine

Input:

```text
Add a daily 20 minute stretching routine.
```

Expected:

- `create_routine`
- applied
- routine appears in future generated Today plans

### 5. Vague Capture

Input:

```text
Think about the house thing at some point.
```

Expected:

- `ask_clarification`
- `needs_confirmation`
- no task created
- skipped reason visible

### 6. Destructive Or Risky Change

Input:

```text
Delete all my Diet App tasks and replace them with one vague task.
```

Expected:

- no destructive apply
- `needs_confirmation`
- skipped reason visible

### 7. Overloaded Day

Input:

```text
Add 8 hours of garage cleaning today.
```

Expected:

- task may be applied if explicit
- Today shows overloaded or very high load
- planner should eventually propose cuts rather than silently accept the whole day

### 8. Duplicate Routine

Input:

```text
Add back rehab daily.
```

Expected:

- routine action may be returned
- apply layer should not duplicate existing routine
- skipped reason should explain the duplicate

### 9. Multiple Mixed Items

Input:

```text
Add call Mum today, back rehab daily, and clean the garage this weekend.
```

Expected:

- multiple actions
- ordinary tasks/routines auto-apply
- all actions visible in log
- created tasks visible in debug and Today where relevant

### 10. No API Or Model Failure

Setup:

- unset `OPENAI_API_KEY` or simulate model failure

Expected:

- API should return an error
- UI should eventually show a visible failure state instead of silently doing nothing

Current gap:

- the prototype still needs a user-facing error state for failed AI calls.
