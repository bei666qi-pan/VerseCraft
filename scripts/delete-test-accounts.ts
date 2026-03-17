// scripts/delete-test-accounts.ts
// One-time script to delete playflow_* and test_* accounts from DB
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("DATABASE_URL is missing and .env.local was not found");
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith("DATABASE_URL=")) continue;
    const value = line.slice("DATABASE_URL=".length).trim();
    return value.replace(/^['"]|['"]$/g, "");
  }
  throw new Error("DATABASE_URL is not defined in .env.local");
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const res = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE name LIKE $1 OR name LIKE $2",
      ["playflow_%", "test_%"]
    );
    const rows = res.rows;
    if (!rows || rows.length === 0) {
      console.log("No playflow_* or test_* accounts found in DB.");
      return;
    }
    for (const row of rows) {
      await client.query("DELETE FROM users WHERE id = $1", [row.id]);
    }
    console.log(`Deleted ${rows.length} accounts: ${rows.map((r) => r.name).join(", ")}`);
  } finally {
    await client.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
