// DEV quality scenarios — realistic, varied inbox inputs with natural-language rubrics.
// These MAY be used to tune the prompt. Keep them realistic (things a user would actually
// type), not elaborate scripted edge cases. The judge accepts any reasonable interpretation
// that meets the rubric's intent — rubrics describe acceptable behavior, not one exact answer.
//
// Each scenario: { id, date, time, input, rubric, minPassRate }
// minPassRate is the fraction of samples that must satisfy the rubric for the scenario to pass.

export const devScenarios = [
  {
    id: "overlap-split",
    date: "2026-06-01",
    time: "18:00",
    input: "I want to prep dinner while the model finishes training in the background",
    rubric:
      "The user is doing a hands-on activity (dinner prep) while an automated/passive task (model training) runs. GOOD: two separate tasks — the hands-on one tagged exclusive or concurrent, the unattended one tagged background/concurrent so they can overlap — OR a brief clarifying question. BAD: a single merged task covering both, or one giant multi-hour task.",
    minPassRate: 0.6
  },
  {
    id: "obvious-simple",
    date: "2026-06-01",
    time: "08:30",
    input: "grab milk on the way home",
    rubric:
      "A trivial, unambiguous errand. GOOD: create one simple task, no clarifying question. BAD: asking a clarifying question, or creating multiple tasks.",
    minPassRate: 0.8
  },
  {
    id: "broad-outcome",
    date: "2026-06-01",
    time: "08:30",
    input: "I need to get the spare room sorted",
    rubric:
      "Broad outcome work: a whole space with no defined finish line. GOOD: ask a clarifying question about what 'done' means (definition of done / scope) before committing, OR create a task with a clearly stated concrete scope. BAD: create a vague task with no scope and no question.",
    minPassRate: 0.6
  },
  {
    id: "deadline-not-schedule",
    date: "2026-06-01",
    time: "08:30",
    input: "submit the tax form by Thursday",
    rubric:
      "Deadline wording ('by Thursday'). GOOD: create a task with a DUE date of the coming Thursday (a deadline), not a fixed execution time slot on Thursday. BAD: scheduling it as a timed event, or ignoring the deadline.",
    minPassRate: 0.6
  },
  {
    id: "reusable-list",
    date: "2026-06-01",
    time: "08:30",
    input: "keep a running list of date-night ideas",
    rubric:
      "The user wants a reusable list they draw from repeatedly, not a one-off task. GOOD: treat it as a reusable suggestion list (keep_as_suggestion / suggestion_used), optionally asking whether to keep it as such. The question, if any, should be optional in tone — NOT a blocking 'what counts as done' question. BAD: a normal one-off task, or a blocking definition-of-done question (such a list is never 'done').",
    minPassRate: 0.6
  },
  {
    id: "recurring-habit",
    date: "2026-06-01",
    time: "08:30",
    input: "I want to stretch my back every morning",
    rubric:
      "An explicit recurring daily habit. GOOD: create a recurring routine (daily). BAD: a single one-off task, or asking an unnecessary question.",
    minPassRate: 0.7
  },
  {
    id: "vague-window-no-ask",
    date: "2026-06-01",
    time: "08:30",
    input: "book a haircut sometime next week",
    rubric:
      "A vague but acceptable time window ('sometime next week'). GOOD: create the task and store it as a week-level intent for next week, WITHOUT inventing a specific date and WITHOUT asking a date-pinning question. BAD: asking which day, or inventing an exact date.",
    minPassRate: 0.6
  },
  {
    id: "ambiguous-blob",
    date: "2026-06-01",
    time: "08:30",
    input: "stuff for the house thing later",
    rubric:
      "Genuinely unstructured / unclear input. GOOD: ask one clarifying question to find a concrete next action, rather than fabricating a task. BAD: creating a vague junk task from it.",
    minPassRate: 0.6
  }
];
