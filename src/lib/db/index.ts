import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const raw = process.env.DATABASE_URL || "postgresql://versecraft:versecraft_password@localhost:5432/versecraft";
const url = String(raw).replace(/^["']|["']$/g, "").trim();
const pool = new Pool({ connectionString: url });
export const db = drizzle(pool);
