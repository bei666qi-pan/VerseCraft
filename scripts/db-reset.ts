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
    await conn.execute("DROP TABLE IF EXISTS `save_slots`");
    await conn.execute("DROP TABLE IF EXISTS `users`");
    console.log("Dropped tables: save_slots, users");
  } finally {
    await conn.end();
  }
}

void main();
