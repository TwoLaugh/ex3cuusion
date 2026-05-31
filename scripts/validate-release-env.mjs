import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

loadLocalEnv();

const failures = [];
const warnings = [];

if (existsSync(".env.local") && !isIgnored(".env.local")) {
  failures.push(".env.local exists but is not ignored by git.");
}

if (existsSync(".env") && !isIgnored(".env")) {
  failures.push(".env exists but is not ignored by git.");
}

for (const file of trackedFiles()) {
  const content = safeRead(file);
  if (content === undefined) continue;
  if (/(^|[^A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(content)) {
    failures.push(`Potential OpenAI secret found in tracked file: ${file}`);
  }
}

if (process.env.EX3CUUSION_STATE_REPOSITORY === "postgres" && !process.env.DATABASE_URL) {
  failures.push("EX3CUUSION_STATE_REPOSITORY=postgres requires DATABASE_URL.");
}

if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("sk-")) {
  warnings.push("OPENAI_API_KEY is set but does not look like an OpenAI key.");
}

if (!process.env.OPENAI_API_KEY) {
  warnings.push("OPENAI_API_KEY is not set. Fixture evals still run; live AI evals require a key.");
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log("Release environment and secret hygiene checks passed.");

function trackedFiles() {
  const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  if (result.status !== 0) {
    failures.push("Could not list tracked files with git.");
    return [];
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function isIgnored(path) {
  const result = spawnSync("git", ["check-ignore", "-q", path]);
  return result.status === 0;
}

function safeRead(path) {
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return undefined;
    if (buffer.length > 2_000_000) return undefined;
    return buffer.toString("utf8");
  } catch {
    return undefined;
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
