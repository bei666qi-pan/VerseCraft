import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
  });

if (env.nodeEnv !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
