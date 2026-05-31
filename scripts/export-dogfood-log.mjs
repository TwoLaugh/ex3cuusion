import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = path.join(process.cwd(), ".data", "dogfood-logs");
const state = readState();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const basePath = path.join(outputDir, `${timestamp}-dogfood-log`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${basePath}.json`, JSON.stringify(state, null, 2));
writeFileSync(`${basePath}.md`, renderMarkdownLog(state, timestamp));

console.log(`Wrote ${basePath}.md`);
console.log(`Wrote ${basePath}.json`);

function readState() {
  const result = spawnSync(process.execPath, [path.join("scripts", "pg-state-repository.mjs"), "read"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || "Could not read Postgres state.";
    throw new Error(message);
  }

  if (!result.stdout.trim()) {
    throw new Error("No Postgres state exists for the current EX3CUUSION_LOCAL_USER_ID.");
  }

  return JSON.parse(result.stdout);
}

function renderMarkdownLog(state, timestamp) {
  const lines = [
    "# Dogfood Log",
    "",
    `Exported: ${timestamp}`,
    `State date: ${state.currentDate ?? "unknown"} ${state.currentTime ?? ""}`.trim(),
    `Local user id: ${process.env.EX3CUUSION_LOCAL_USER_ID ?? "default"}`,
    "",
    "## Counts",
    "",
    `- Domains: ${(state.domains ?? []).length}`,
    `- Projects: ${(state.projects ?? []).length}`,
    `- Tasks: ${(state.tasks ?? []).length}`,
    `- Routines: ${(state.routines ?? []).length}`,
    `- Execution events: ${(state.executionEvents ?? []).length}`,
    `- Completions: ${(state.completions ?? []).length}`,
    `- Deferrals: ${(state.deferrals ?? []).length}`,
    `- Inbox entries: ${(state.inbox ?? []).length}`,
    `- Capture sessions: ${(state.captureSessions ?? []).length}`,
    "",
    "## Domains",
    "",
    ...listRows(state.domains, (domain) => `- ${domain.name} (weight ${domain.weight})`),
    "",
    "## Projects",
    "",
    ...listRows(state.projects, (project) => `- ${project.name} (${project.kind}, ${project.status}, ${project.planningMode})`),
    "",
    "## Tasks",
    "",
    ...listRows(state.tasks, renderTask),
    "",
    "## Routines",
    "",
    ...listRows(state.routines, (routine) => `- ${routine.title} (${routine.recurrence?.type ?? "unknown"}, ${routine.active ? "active" : "inactive"})`),
    "",
    "## Execution Events",
    "",
    ...listRows(state.executionEvents, renderExecutionEvent),
    "",
    "## AI Inbox",
    "",
    ...listRows(state.inbox, renderInboxEntry),
    "",
    "## Raw State",
    "",
    "The full raw JSON export is written next to this file."
  ];

  return `${lines.join("\n")}\n`;
}

function listRows(items, render) {
  if (!items?.length) return ["- None"];
  return items.map(render);
}

function renderTask(task) {
  const date = task.scheduledDate ? `scheduled ${task.scheduledDate}` : task.dueDate ? `due ${task.dueDate}` : task.dateIntent?.kind ?? "unscheduled";
  const project = task.projectId ? `, project ${task.projectId}` : "";
  return `- ${task.title} (${task.status}, ${date}, ${task.effortMinutes}m${project})`;
}

function renderExecutionEvent(event) {
  const target = event.taskId ?? event.taskIds?.join(", ") ?? event.planItemId ?? "no target";
  const note = event.note ? ` - ${event.note}` : "";
  return `- ${event.date}: ${event.type} (${target})${note}`;
}

function renderInboxEntry(entry) {
  const actionSummary = (entry.actions ?? []).map((action) => `${action.type}:${action.status}`).join(", ") || "no actions";
  return `- ${entry.createdAt ?? "unknown"}: ${entry.text ?? entry.rawInput ?? entry.id} (${actionSummary})`;
}
