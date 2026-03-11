// scripts/delete-test-accounts.ts
// One-time script to delete playflow_* and test_* accounts from DB
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

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
  const conn = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id, name FROM users WHERE name LIKE ? OR name LIKE ?",
      ["playflow_%", "test_%"]
    );
    if (!rows || rows.length === 0) {
      console.log("No playflow_* or test_* accounts found in DB.");
      return;
    }
    for (const row of rows) {
      await conn.execute("DELETE FROM users WHERE id = ?", [row.id]);
    }
    console.log(`Deleted ${rows.length} accounts: ${rows.map((r) => r.name).join(", ")}`);
  } finally {
    await conn.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
