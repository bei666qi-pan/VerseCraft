import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const raw = process.env.DATABASE_URL || "mysql://localhost:3306/versecraft";
const url = String(raw).replace(/^["']|["']$/g, "").trim();
const pool = mysql.createPool(url);
export const db = drizzle(pool);
