// AI QUALITY harness — the honest way to measure a non-deterministic model.
//
// For each scenario it submits the input to the LIVE model N times and judges each response
// against a natural-language rubric with an LLM judge (not exact-match asserts). It reports a
// PASS-RATE per scenario and gates on a per-scenario threshold, so legitimate variance and
// alternative-but-correct answers don't read as hard failures.
//
//   npm run eval:quality            # dev set (tunable)
//   npm run eval:quality:heldout    # held-out set (overfitting check — DO NOT tune against)
//
// Env: OPENAI_API_KEY (required), OPENAI_MODEL (system model), JUDGE_MODEL (defaults to
// OPENAI_MODEL), QUALITY_SAMPLES (default 3), QUALITY_PORT (default 3023).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { devScenarios } from "./quality/dev-scenarios.mjs";
import { heldoutScenarios } from "./quality/heldout-scenarios.mjs";

const heldout = process.argv.includes("--heldout");
const jsonReport = process.argv.includes("--json");
// --only <id>[,<id>...] re-runs specific scenarios without burning a whole live suite.
const onlyIndex = process.argv.indexOf("--only");
const onlyIds = onlyIndex >= 0 ? new Set((process.argv[onlyIndex + 1] ?? "").split(",").filter(Boolean)) : null;
const allScenarios = heldout ? heldoutScenarios : devScenarios;
const scenarios = onlyIds ? allScenarios.filter((scenario) => onlyIds.has(scenario.id)) : allScenarios;
if (onlyIds && scenarios.length === 0) {
  console.error(`--only matched no scenarios. Known ids: ${allScenarios.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
const port = Number(process.env.QUALITY_PORT ?? 3023);
const baseUrl = `http://127.0.0.1:${port}`;
const isWindows = process.platform === "win32";
const SAMPLES = Number(process.env.QUALITY_SAMPLES ?? 3);

loadLocalEnv();
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the quality harness (it runs the live model + judge).");
  process.exit(1);
}
const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
const judgeModel = process.env.JUDGE_MODEL ?? model;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 2 });

const verdictSchema = z.object({
  pass: z.boolean(),
  severity: z.enum(["none", "minor", "major"]),
  reason: z.string()
});

const JUDGE_INSTRUCTIONS =
  "You are a strict-but-fair evaluator of a personal task-planner AI. You receive a rubric " +
  "describing acceptable behavior, the user's inbox message, and a JSON summary of the system's " +
  "response (the actions it proposed or applied, and any clarifying question). Decide whether the " +
  "response satisfies the rubric. Accept ANY reasonable interpretation that meets the rubric's " +
  "intent — do not require a specific title, wording, or action type unless the rubric explicitly " +
  "demands it. Mark pass=false only when the behavior clearly violates the rubric: wrong intent, a " +
  "missing required clarification, fabricated junk, ignoring the request, or an invalid/failed " +
  "action. Give a one-sentence reason and a severity (none when pass; minor or major when fail).";

// Quality servers must be hermetic: never read/write the durable .data/ store.
// EX3CUUSION_AI_MODE is SET (not deleted): a deleted env var gets silently back-filled from
// .env.local by Next.js, which once flipped a whole quality run to the fixture interpreter
// (every scenario "took no action" -> 0/12). Any value other than "fixture" means live.
const serverEnv = { ...process.env, OPENAI_MODEL: model, EX3CUUSION_STATE_REPOSITORY: "memory", EX3CUUSION_AI_MODE: "live" };
const runner = isWindows ? "cmd.exe" : "npx";
const serverArgs = isWindows
  ? ["/c", "npx", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)]
  : ["next", "dev", "--hostname", "127.0.0.1", "--port", String(port)];
const server = spawn(runner, serverArgs, { cwd: process.cwd(), env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = "";
server.stdout.on("data", (c) => (serverOutput += c));
server.stderr.on("data", (c) => (serverOutput += c));

try {
  await waitForServer();
  console.log(
    heldout
      ? `\n=== AI QUALITY: HELD-OUT set (overfitting check — do NOT tune against these) | model=${model} judge=${judgeModel} samples=${SAMPLES} ===`
      : `\n=== AI QUALITY: dev set | model=${model} judge=${judgeModel} samples=${SAMPLES} ===`
  );
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }
  printReport(results);
  if (jsonReport) console.log(JSON.stringify({ heldout, model, judgeModel, samples: SAMPLES, results }, null, 2));
  const failed = results.filter((result) => !result.ok);
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (serverOutput) console.error(serverOutput.slice(-2000));
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    if (isWindows) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
}

async function runScenario(scenario) {
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    try {
      await post("/api/state", {});
      await post("/api/time", { date: scenario.date, time: scenario.time });
      await post("/api/inbox", { input: scenario.input });
      const observed = observe(await getJson("/api/debug"));
      const verdict = await judge(scenario, observed);
      samples.push({ pass: verdict.pass, severity: verdict.severity, reason: verdict.reason, observed });
    } catch (error) {
      samples.push({ pass: false, severity: "major", reason: `error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const passCount = samples.filter((sample) => sample.pass).length;
  const rate = passCount / SAMPLES;
  const minPassRate = scenario.minPassRate ?? 0.6;
  return { id: scenario.id, passCount, total: SAMPLES, rate, minPassRate, ok: rate >= minPassRate, samples };
}

function observe(debug) {
  const entry = debug.inbox?.[0];
  const actions = (entry?.actions ?? []).map((a) => {
    const p = a.payload ?? {};
    return clean({
      type: a.type,
      status: a.status,
      safety: a.safety,
      skippedReason: a.skippedReason,
      title: p.title ?? p.draftAction?.title,
      questionKind: p.questionKind,
      materiality: p.materiality,
      question: p.question,
      completionMode: p.completionMode,
      completionBehavior: p.completionBehavior,
      schedulingMode: p.scheduling?.mode,
      recurrence: p.recurrence,
      scheduledDate: p.scheduledDate,
      scheduledTime: p.scheduledTime,
      dueDate: p.dueDate,
      dateIntent: typeof p.dateIntent === "string" ? p.dateIntent : p.dateIntent?.kind,
      priority: p.priority,
      effortMinutes: p.effortMinutes,
      // T088: folders replaced projects; folderId is the grouping link on task payloads
      // (set at apply time for same-batch grouping), pendingFolderName is the model's
      // intended folder for a task whose folder is created in the same batch.
      folderId: p.folderId,
      parentFolderId: p.parentFolderId,
      pendingFolderName: a.pendingFolderName
    });
  });
  const questions = (debug.captureSessions?.[0]?.questions ?? []).map((q) =>
    clean({ kind: q.kind, materiality: q.materiality, question: q.question, status: q.status })
  );
  return clean({ summary: entry?.summary, actions, questions });
}

async function judge(scenario, observed) {
  const res = await openai.responses.parse({
    model: judgeModel,
    instructions: JUDGE_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: `RUBRIC:\n${scenario.rubric}\n\nUSER INPUT:\n${scenario.input}\n\nSYSTEM RESPONSE (JSON):\n${JSON.stringify(observed, null, 2)}`
      }
    ],
    text: { format: zodTextFormat(verdictSchema, "behavior_verdict") }
  });
  if (!res.output_parsed) throw new Error("judge returned no parsed output");
  return res.output_parsed;
}

function printReport(results) {
  let pass = 0;
  for (const result of results) {
    if (result.ok) pass++;
    const pct = Math.round(result.rate * 100);
    const min = Math.round(result.minPassRate * 100);
    console.log(`\n${result.ok ? "PASS" : "FAIL"} ${result.id}  ${result.passCount}/${result.total} (${pct}%)  [min ${min}%]`);
    const fails = result.samples.filter((sample) => !sample.pass);
    for (const reason of [...new Set(fails.map((sample) => sample.reason))].slice(0, 3)) {
      console.log(`    - ${reason}`);
    }
  }
  console.log(`\n${pass}/${results.length} scenarios met their pass-rate threshold.`);
}

function clean(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      const r = await fetch(`${baseUrl}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error("Timed out waiting for quality-harness server.");
}
async function post(path, body) {
  const r = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function getJson(path) {
  const r = await fetch(`${baseUrl}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}
function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
