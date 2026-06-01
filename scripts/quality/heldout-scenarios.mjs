// ===========================================================================================
// HELD-OUT quality scenarios — DO NOT TUNE AGAINST THESE.
//
// The point of a held-out set is to detect overfitting: it tells you whether prompt changes
// that improved the dev set actually generalize, or just fit the dev cases. Rules:
//   - Never add prompt examples, code branches, or normalizers aimed at passing these.
//   - Never edit a held-out scenario to make a failing run go green.
//   - Only run this set to MEASURE generalization (npm run eval:quality:heldout), then leave it.
// If you find yourself tuning toward these, they have stopped being held-out — replace them
// with fresh inputs the system has never been optimized for.
// ===========================================================================================

export const heldoutScenarios = [
  {
    id: "ho-overlap",
    date: "2026-06-01",
    time: "17:30",
    input: "while the laundry's running I'll reply to Sam's email",
    rubric:
      "A passive activity (laundry running) overlapping a hands-on one (replying to email). GOOD: two tasks that can overlap (one background/passive, one exclusive or concurrent), OR a brief clarification. BAD: one merged task.",
    minPassRate: 0.6
  },
  {
    id: "ho-vague-relationship",
    date: "2026-06-01",
    time: "20:00",
    input: "I really should call mum more",
    rubric:
      "A soft, recurring relationship intention rather than a single concrete task. GOOD: capture it sensibly — a recurring/soft reminder or routine, or a clarifying question about cadence. BAD: a junk task with a vague title and no structure.",
    minPassRate: 0.5
  },
  {
    id: "ho-hard-deadline",
    date: "2026-06-01",
    time: "08:30",
    input: "the slide deck has to be finished before the 9am Monday review",
    rubric:
      "A hard deadline (before Monday 9am). GOOD: capture a task with a Monday deadline (due date), treating it as deadline pressure. BAD: ignoring the deadline or scheduling it at a random unrelated time.",
    minPassRate: 0.6
  },
  {
    id: "ho-broad-outcome",
    date: "2026-06-01",
    time: "08:30",
    input: "organise my entire digital photo library",
    rubric:
      "A large, open-ended outcome with no clear finish line. GOOD: ask a clarifying question about scope / definition of done before committing, OR create a task with an explicit concrete scope. BAD: a vague task with no scope and no question.",
    minPassRate: 0.6
  },
  {
    id: "ho-grouping",
    date: "2026-06-01",
    time: "08:30",
    input: "I'm organising a small dinner party — plan the menu, send the invites, and tidy the flat",
    rubric:
      "Several tasks belonging to one event/piece of work. GOOD: group them under a single project/work-block (a create_project or existing project) with the tasks attached. BAD: unrelated flat tasks with no shared project, or one merged task.",
    minPassRate: 0.6
  },
  {
    id: "ho-week-plan",
    date: "2026-06-01",
    time: "08:30",
    input: "help me lay out the rest of the week so nothing piles up",
    rubric:
      "A request to plan/spread the week. GOOD: assign multiple tasks to specific days across the week (several schedule_task actions on different days), a realistic spread. BAD: no scheduling actions, or everything on one day.",
    minPassRate: 0.5
  },
  {
    id: "ho-backlog-demote",
    date: "2026-06-01",
    time: "08:30",
    input: "the garage clean-out can wait — drop it to someday",
    rubric:
      "Deprioritise an EXISTING task (the seed has a garage-cleaning task) to someday. GOOD: update that existing task to someday / unscheduled / low pressure (e.g. update_task with dateIntent someday). BAD: creating a new task, scheduling it soon, or asking an unnecessary question.",
    minPassRate: 0.5
  },
  {
    id: "ho-two-simple",
    date: "2026-06-01",
    time: "19:00",
    input: "water the plants tonight and take the bins out",
    rubric:
      "Two distinct, simple chores for today. GOOD: two simple tasks scheduled for today, no clarifying questions. BAD: merging them, dropping one, or asking unnecessary questions.",
    minPassRate: 0.7
  }
];
