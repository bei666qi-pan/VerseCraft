import "dotenv/config";
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query("SELECT count(*) FROM world_knowledge_chunks WHERE world_id = $1 AND visibility_scope = 'global'", ["dark_moon_prologue"]);
console.log("count:", r.rows[0].count);
const r2 = await c.query("SELECT id, visibility_scope, world_id FROM world_knowledge_chunks WHERE world_id = $1 AND visibility_scope = 'global' LIMIT 5", ["dark_moon_prologue"]);
console.log("sample:", r2.rows);
await c.end();
