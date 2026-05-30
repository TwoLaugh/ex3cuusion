import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { acquireDevServerLock } from "./dev-server-lock.mjs";

const port = Number(process.env.EX3CUUSION_EVAL_PORT ?? 3021);
const baseUrl = `http://127.0.0.1:${port}`;
const live = process.argv.includes("--live");
const jsonReport = process.argv.includes("--json");
const isWindows = process.platform === "win32";
const runner = isWindows ? "cmd.exe" : "npx";
const requestTimeoutMs = Number(process.env.EX3CUUSION_EVAL_REQUEST_TIMEOUT_MS ?? (live ? 70_000 : 20_000));
const slowRequestMs = Number(process.env.EX3CUUSION_EVAL_SLOW_MS ?? (live ? 10_000 : 2_000));

loadLocalEnv();

if (live && !process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for --live evals.");
  process.exit(1);
}

const serverEnv = {
    ...process.env,
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5.4-mini"
  };
if (!live) serverEnv.EX3CUUSION_AI_MODE = "fixture";
if (live) delete serverEnv.EX3CUUSION_AI_MODE;

const releaseDevServerLock = await acquireDevServerLock("AI eval");
const serverArgs = isWindows
  ? ["/c", "npx", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)]
  : ["next", "dev", "--hostname", "127.0.0.1", "--port", String(port)];
const server = spawn(runner, serverArgs, {
  cwd: process.cwd(),
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();
  const results = [];
  for (const scenario of scenarios()) {
    results.push(await runScenario(scenario));
  }
  printReport(results);
  if (jsonReport) {
    console.log(JSON.stringify({ live, model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini", results }, null, 2));
  }
  const failures = results.flatMap((result) => result.failures);
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (serverOutput) console.error(serverOutput.slice(-4000));
  process.exitCode = 1;
} finally {
  stopServer();
  releaseDevServerLock();
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
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

function scenarios() {
  return [
    ...staticScenarios(),
    ...simulatedDayScenarios(),
    ...weekDateIntentScenarios()
  ];
}

function staticScenarios() {
  return [
    {
      phase: "static",
      name: "obvious simple task does not clarify",
      steps: [
        setTime("2026-06-01", "08:30"),
        inbox("I need to cut my nails")
      ],
      expects: [
        taskExists(/cut.*nails/i),
        noPendingQuestion(),
        taskField(/cut.*nails/i, "completionMode", "simple_done")
      ]
    },
    {
      phase: "static",
      name: "broad house cleaning asks for done-state",
      steps: [
        setTime("2026-06-01", "08:30"),
        inbox("clean the house this weekend")
      ],
      expects: [
        pendingQuestionKind("definition_of_done"),
        latestDraftTitle("Clean house")
      ]
    },
    {
      phase: "static",
      name: "timeboxed product work becomes timebox task",
      steps: [
        setTime("2026-06-01", "08:30"),
        inbox("work on diet app for two hours")
      ],
      expects: [
        taskExists(/diet app/i),
        taskField(/diet app/i, "completionMode", "timebox"),
        taskField(/diet app/i, "effortMinutes", 120)
      ]
    },
    {
      phase: "static",
      name: "relationship ideas clarify reusable suggestion",
      steps: [
        setTime("2026-06-01", "08:30"),
        inbox("ideas for things to do with Emma")
      ],
      expects: [
        pendingQuestionKind("completion_behavior"),
        latestDraftTitle("Ideas for things to do with Emma")
      ]
    },
    {
      phase: "static",
      name: "friday relationship cadence becomes routine",
      steps: [
        setTime("2026-06-01", "08:30"),
        inbox("message Will every Friday")
      ],
      expects: [
        routineExists(/message will/i),
        routineHasWeeklyDay(/message will/i, 5)
      ]
    },
    {
      phase: "static",
      name: "background AI side-work preserves overlap semantics",
      steps: [
        setTime("2026-06-01", "18:00"),
        inbox("AI can run the report while I cook dinner tonight")
      ],
      expects: [
        taskNestedField("Cook dinner", ["scheduling", "mode"], "concurrent"),
        taskNestedField("Run AI report draft", ["scheduling", "mode"], "background"),
        taskNestedField("Run AI report draft", ["scheduling", "attentionLoad"], "passive")
      ]
    }
  ];
}

function simulatedDayScenarios() {
  return [
    {
      phase: "simulated-day",
      name: "late-day hard sleep anchor preserves bed time",
      steps: [
        setTime("2026-06-01", "22:47"),
        inbox("Add sleep at half 11 tonight for 8 hours.")
      ],
      expects: [
        taskField(/sleep|bed/i, "scheduledTime", "23:30"),
        planItemStarts(/sleep|bed/i, "23:30")
      ]
    },
    {
      phase: "simulated-day",
      name: "partial progress records worked-on event",
      steps: [
        setTime("2026-06-01", "16:30"),
        outcomeByTitle("Clean garage", {
          type: "partially_completed",
          reason: "did_part",
          note: "I did one pass but got tired.",
          actualMinutes: 35,
          nextAction: "Finish shelves"
        })
      ],
      expects: [
        eventExists("partially_completed", "Clean garage"),
        taskField("Clean garage", "status", "active")
      ]
    },
    {
      phase: "simulated-day",
      name: "blocked task leaves normal planning flow tomorrow",
      steps: [
        setTime("2026-06-01", "11:45"),
        outcomeByTitle("Message Will", {
          type: "blocked",
          reason: "blocked",
          note: "Need his new number.",
          blocked: { blockedBy: "missing_info", note: "Need his new number." }
        }),
        setTime("2026-06-02", "08:30")
      ],
      expects: [
        taskField("Message Will", "status", "blocked"),
        notInPlan("Message Will")
      ]
    }
  ];
}

function weekDateIntentScenarios() {
  return [
    {
      phase: "week-date",
      name: "today task appears today",
      steps: [
        setTime("2026-06-02", "08:30"),
        inbox("Add a task called Water plants today for 10 minutes.")
      ],
      expects: [
        taskExists("Water plants"),
        planItemVisible("Water plants"),
        taskNestedField("Water plants", ["dateIntent", "kind"], "today")
      ]
    },
    {
      phase: "week-date",
      name: "sleep next exact time uses scheduled clock",
      steps: [
        setTime("2026-06-02", "22:00"),
        inbox("Add sleep at half 11 tonight for 8 hours.")
      ],
      expects: [
        taskField(/sleep|bed/i, "scheduledDate", "2026-06-02"),
        taskField(/sleep|bed/i, "scheduledTime", "23:30")
      ]
    },
    {
      phase: "week-date",
      name: "mixed today and future wording should split or ask",
      steps: [
        setTime("2026-06-02", "08:30"),
        inbox("text Alex today and book dentist sometime next week")
      ],
      expects: [
        taskExists("Text Alex"),
        taskNestedField("Text Alex", ["dateIntent", "kind"], "today"),
        taskNestedField(/dentist/i, ["dateIntent", "kind"], "week_window")
      ]
    },
    {
      phase: "week-date",
      name: "follow-up message revises existing capture",
      steps: [
        setTime("2026-06-02", "08:30"),
        inbox("Add a task called Water plants today for 10 minutes."),
        followUpLatestSession("actually make that next week and put it under Diet App")
      ],
      expects: [
        taskExists("Water plants"),
        taskField("Water plants", "projectId", "project_diet_app"),
        taskNestedField("Water plants", ["dateIntent", "kind"], "week_window"),
        notInPlan("Water plants")
      ]
    }
  ];
}

function setTime(date, time) {
  return { type: "set-time", date, time };
}

function inbox(input) {
  return { type: "inbox", input };
}

function outcomeByTitle(title, outcome) {
  return { type: "outcome-by-title", title, outcome };
}

function followUpLatestSession(message) {
  return { type: "follow-up-latest-session", message };
}

async function runScenario(scenario) {
  await post("/api/state", {});
  let lastState;
  for (const step of scenario.steps) {
    try {
      if (step.type === "set-time") {
        lastState = await post("/api/time", { date: step.date, time: step.time });
      }
      if (step.type === "inbox") {
        lastState = await post("/api/inbox", { input: step.input });
      }
      if (step.type === "outcome-by-title") {
        const debug = await getDebug();
        const item = debug.planItems.find((candidate) => candidate.title === step.title);
        if (!item) {
          lastState = await getState();
        } else {
          lastState = await post("/api/plan/outcome", { planItemId: item.id, ...step.outcome });
        }
      }
      if (step.type === "follow-up-latest-session") {
        const debug = await getDebug();
        const session = debug.captureSessions[0];
        if (!session) throw new Error("No capture session exists for follow-up.");
        lastState = await post(`/api/capture-sessions/${session.id}/message`, { message: step.message });
      }
    } catch (error) {
      throw new Error(`${scenario.phase}/${scenario.name} failed during ${describeStep(step)}: ${errorMessage(error)}`);
    }
  }
  const debug = await getDebug();
  const failures = scenario.expects.flatMap((expectation) => expectation(debug));
  return {
    phase: scenario.phase,
    name: scenario.name,
    ok: failures.length === 0,
    failures,
    observed: summarize(debug)
  };
}

function taskExists(title) {
  return (debug) => (findTask(debug, title) ? [] : [`Expected task ${matcherLabel(title)} to exist.`]);
}

function taskExistsMatching(pattern) {
  return (debug) => (debug.tasks.some((task) => pattern.test(task.title)) ? [] : [`Expected a task matching ${pattern}.`]);
}

function routineExists(title) {
  return (debug) => (findRoutine(debug, title) ? [] : [`Expected routine ${matcherLabel(title)} to exist.`]);
}

function routineHasWeeklyDay(title, day) {
  return (debug) => {
    const routine = findRoutine(debug, title);
    return routine?.recurrence?.type === "weekly" && routine.recurrence.days?.includes(day)
      ? []
      : [`Expected routine ${matcherLabel(title)} to recur weekly on day ${day}.`];
  };
}

function taskField(title, field, value) {
  return (debug) => {
    const task = findTask(debug, title);
    if (!task) return [`Expected task ${matcherLabel(title)} to exist for ${field}.`];
    return task[field] === value ? [] : [`Expected ${matcherLabel(title)} ${field}=${JSON.stringify(value)}, got ${JSON.stringify(task[field])}.`];
  };
}

function taskNestedField(title, path, value) {
  return (debug) => {
    const task = findTask(debug, title);
    if (!task) return [`Expected task ${matcherLabel(title)} to exist for ${path.join(".")}.`];
    const observed = path.reduce((current, key) => current?.[key], task);
    return observed === value
      ? []
      : [`Expected ${matcherLabel(title)} ${path.join(".")}=${JSON.stringify(value)}, got ${JSON.stringify(observed)}.`];
  };
}

function pendingQuestionKind(kind) {
  return (debug) => {
    const question = latestQuestion(debug);
    return question?.kind === kind && question.status === "pending"
      ? []
      : [`Expected latest pending question kind "${kind}", got ${question?.kind ?? "none"}:${question?.status ?? "none"}.`];
  };
}

function pendingQuestion() {
  return (debug) => (latestQuestion(debug)?.status === "pending" ? [] : ["Expected a pending clarification question."]);
}

function noPendingQuestion() {
  return (debug) => (debug.captureSessions.some((session) => session.questions.some((question) => question.status === "pending")) ? ["Expected no pending clarification question."] : []);
}

function latestDraftTitle(title) {
  return (debug) => {
    const action = debug.inbox[0]?.actions[0];
    const draftTitle = action?.payload?.draftAction?.title;
    return draftTitle === title ? [] : [`Expected latest draft title "${title}", got ${JSON.stringify(draftTitle)}.`];
  };
}

function planItemVisible(title) {
  return (debug) => (debug.planItems.some((item) => item.title === title) ? [] : [`Expected "${title}" to be visible in plan.`]);
}

function notInPlan(title) {
  return (debug) => (debug.planItems.some((item) => item.title === title) ? [`Expected "${title}" not to be in current plan.`] : []);
}

function planItemStarts(title, startTime) {
  return (debug) => {
    const item = debug.planItems.find((candidate) => matches(candidate.title, title));
    return item?.startTime === startTime ? [] : [`Expected ${matcherLabel(title)} to start ${startTime}, got ${item?.startTime ?? "missing"}.`];
  };
}

function eventExists(type, taskTitle) {
  return (debug) => {
    const task = findTask(debug, taskTitle);
    if (!task) return [`Expected task "${taskTitle}" for event ${type}.`];
    const found = debug.executionEvents.some((event) => event.type === type && (event.taskId === task.id || event.taskIds?.includes(task.id)));
    return found ? [] : [`Expected ${type} event for "${taskTitle}".`];
  };
}

function either(expectations) {
  return (debug) => (expectations.some((expectation) => expectation(debug).length === 0) ? [] : ["Expected one alternative condition to pass."]);
}

function latestQuestion(debug) {
  return debug.captureSessions[0]?.questions[0];
}

function findTask(debug, title) {
  return debug.tasks.find((task) => matches(task.title, title));
}

function findRoutine(debug, title) {
  return debug.routines.find((routine) => matches(routine.title, title));
}

function matches(value, matcher) {
  return matcher instanceof RegExp ? matcher.test(value) : value === matcher;
}

function matcherLabel(matcher) {
  return matcher instanceof RegExp ? String(matcher) : `"${matcher}"`;
}

function summarize(debug) {
  return {
    latestInbox: debug.inbox[0]
      ? {
          summary: debug.inbox[0].summary,
          actions: debug.inbox[0].actions.map((action) => ({
            type: action.type,
            label: action.label,
            safety: action.safety,
            status: action.status,
            model: action.model,
            skippedReason: action.skippedReason
          }))
        }
      : null,
    latestSession: debug.captureSessions[0]
      ? {
          status: debug.captureSessions[0].status,
          questions: debug.captureSessions[0].questions.map((question) => ({
            kind: question.kind,
            status: question.status,
            question: question.question
          }))
        }
      : null,
    tasks: debug.tasks.map((task) => ({
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
      scheduledTime: task.scheduledTime,
      dateIntent: task.dateIntent,
      scheduling: task.scheduling,
      completionMode: task.completionMode,
      completionBehavior: task.completionBehavior
    })),
    planItems: debug.planItems.map((item) => ({
      title: item.title,
      status: item.status,
      startTime: item.startTime,
      endTime: item.endTime
    }))
  };
}

function printReport(results) {
  const grouped = new Map();
  for (const result of results) {
    grouped.set(result.phase, [...(grouped.get(result.phase) ?? []), result]);
  }
  for (const [phase, phaseResults] of grouped.entries()) {
    const passed = phaseResults.filter((result) => result.ok).length;
    console.log(`\n${phase}: ${passed}/${phaseResults.length} passed`);
    for (const result of phaseResults) {
      console.log(`  ${result.ok ? "PASS" : "FAIL"} ${result.name}`);
      for (const failure of result.failures) {
        console.log(`    - ${failure}`);
      }
      if (!result.ok) {
        console.log(`    observed actions: ${JSON.stringify(result.observed.latestInbox?.actions ?? [])}`);
        console.log(`    observed questions: ${JSON.stringify(result.observed.latestSession?.questions ?? [])}`);
        console.log(`    observed task titles: ${result.observed.tasks.map((task) => task.title).join(", ")}`);
      }
    }
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const response = await fetchWithTimeout("/", {}, 5_000);
      if (response.ok) return;
    } catch {
      // server still starting
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for eval server.");
}

async function post(path, body) {
  const response = await fetchWithTimeout(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await responseError(response)}`);
  }
  return response.json();
}

async function getState() {
  const response = await fetchWithTimeout("/api/state");
  if (!response.ok) throw new Error(`state failed with ${response.status}`);
  return response.json();
}

async function getDebug() {
  const response = await fetchWithTimeout("/api/debug");
  if (!response.ok) throw new Error(`debug failed with ${response.status}`);
  return response.json();
}

async function fetchWithTimeout(path, options = {}, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const started = Date.now();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
    const elapsedMs = Date.now() - started;
    if (elapsedMs >= slowRequestMs) {
      console.warn(`[eval] slow request ${path} ${response.status} in ${elapsedMs}ms`);
    }
    return response;
  } catch (error) {
    if (timedOut) throw new Error(`${path} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function responseError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

function describeStep(step) {
  if (step.type === "set-time") return `set-time ${step.date} ${step.time}`;
  if (step.type === "inbox") return `inbox "${step.input}"`;
  if (step.type === "outcome-by-title") return `outcome "${step.title}"`;
  if (step.type === "follow-up-latest-session") return `follow-up "${step.message}"`;
  return step.type;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
