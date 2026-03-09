import "server-only";

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

const pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
