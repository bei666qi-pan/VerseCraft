#!/usr/bin/env node
// Quick read-only diagnostic: list active AI service connections + route assignments.
// Loads .env.local via dotenv (no shell-level credential echo).
import { config as dotenv } from "dotenv";
import { Client } from "pg";
import { resolve } from "node:path";

dotenv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(2); }

const c = new Client({ connectionString: url });
await c.connect();
try {
  const svcs = await c.query(`
    SELECT s.id, s.name, s.base_url, s.transport, s.enabled, s.deleted_at,
           m.id AS model_id, m.name AS model_name, m.upstream_model, m.enabled AS model_enabled, m.deleted_at AS model_deleted_at
    FROM ai_service_connections s
    LEFT JOIN ai_service_models m ON m.service_id = s.id
    ORDER BY s.id, m.id
  `);
  console.log("=== ai_service_connections + models ===");
  for (const r of svcs.rows) {
    console.log(JSON.stringify({
      svc_id: r.id, name: r.name, base: r.base_url, transport: r.transport,
      enabled: r.enabled, deleted_at: r.deleted_at,
      model_id: r.model_id, model_name: r.model_name, upstream: r.upstream_model,
      model_enabled: r.model_enabled, model_deleted_at: r.model_deleted_at,
    }));
  }

  const routes = await c.query(`
    SELECT r.purpose, r.priority, m.id AS model_id, m.upstream_model
    FROM ai_route_assignments r
    JOIN ai_service_models m ON m.id = r.model_id
    ORDER BY r.purpose, r.priority
  `);
  console.log("=== ai_route_assignments ===");
  for (const r of routes.rows) {
    console.log(JSON.stringify(r));
  }

  const cfg = await c.query(`SELECT version FROM ai_config_state WHERE id = 1`);
  console.log("=== ai_config_state ===");
  for (const r of cfg.rows) console.log(JSON.stringify(r));
} finally {
  await c.end();
}
