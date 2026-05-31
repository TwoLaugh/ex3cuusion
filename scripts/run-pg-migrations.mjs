import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy .env.example or set it in your shell.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "db", "migrations");
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("begin");
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )
  `);
  await client.query("commit");

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const version = file.split("_")[0];
    const alreadyApplied = await client.query("select 1 from schema_migrations where version = $1", [version]);
    if (alreadyApplied.rowCount) {
      console.log(`skip ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (version, name) values ($1, $2)", [version, file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await client.end().catch(() => {});
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const contents = readFileSync(file, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = unquoteEnvValue(match[2]);
      }
    } catch {
      // optional local env file
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
