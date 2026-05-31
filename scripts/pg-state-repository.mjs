import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

const command = process.argv[2];
const snapshotId = process.env.EX3CUUSION_STATE_SNAPSHOT_ID ?? "default";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the Postgres state repository.");
  process.exit(1);
}

if (!["read", "write", "delete"].includes(command)) {
  console.error("Usage: node scripts/pg-state-repository.mjs read|write|delete");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  if (command === "read") {
    const result = await client.query("select state_json from app_state_snapshots where id = $1", [snapshotId]);
    if (!result.rowCount) {
      process.stdout.write("");
    } else {
      process.stdout.write(JSON.stringify(result.rows[0].state_json));
    }
  }

  if (command === "write") {
    const stateJson = await readStdin();
    JSON.parse(stateJson);
    await client.query(
      `
        insert into app_state_snapshots (id, state_json, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (id)
        do update set state_json = excluded.state_json, updated_at = now()
      `,
      [snapshotId, stateJson]
    );
  }

  if (command === "delete") {
    await client.query("delete from app_state_snapshots where id = $1", [snapshotId]);
  }
} finally {
  await client.end().catch(() => {});
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      value += chunk;
    });
    process.stdin.on("end", () => resolve(value));
    process.stdin.on("error", reject);
  });
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
