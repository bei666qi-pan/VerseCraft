// scripts/migrate-ark-responses-gateway.mjs
// One-shot migration: switch the only managed AI service in the local
// dev database to the Volcengine Ark Responses API endpoint.
//
// SECURITY: the gateway API key is read from stdin ONLY. It is never
// embedded in source, command line, or environment. The .env.local
// DATABASE_URL + AI_CONFIG_ENCRYPTION_KEY are loaded via dotenv.
//
// Usage:
//   printf '%s' "$ARK_GATEWAY_API_KEY" | node scripts/migrate-ark-responses-gateway.mjs
// or via a one-time interactive paste.
import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createCipheriv, randomBytes } from "node:crypto";

dotenv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(2);
}
const rawKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
if (!rawKey) {
  console.error("AI_CONFIG_ENCRYPTION_KEY missing");
  process.exit(2);
}

function parseKey(raw = rawKey) {
  const v = raw.trim();
  if (!v) throw new Error("ai_config_encryption_key_missing");
  const k = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (k.length !== 32) throw new Error("ai_config_encryption_key_invalid");
  return k;
}
function encryptApiKey(plain, recordId) {
  const secret = plain.trim();
  if (!secret) throw new Error("api_key_required");
  const key = parseKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(recordId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

// Read key from stdin only.
let API_KEY = "";
try {
  if (!process.stdin.isTTY) {
    const buf = readFileSync(0, "utf8");
    API_KEY = buf.trim();
  }
} catch {
  /* ignore */
}
if (!API_KEY) {
  console.error("stdin: pipe the gateway API key (e.g. printf '%s' \"$KEY\" | node ...)");
  process.exit(2);
}

const SERVICE_ID = "volcengine-ark-responses";
const MODEL_ID = "deepseek-v4-flash-ark";
const SERVICE_NAME = "Volcengine Ark Responses (deepseek-v4-flash)";
const BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const TRANSPORT = "openai_responses";
const MODEL_NAME = "deepseek-v4-flash";
const UPSTREAM_MODEL = "deepseek-v4-flash";
const EMBED_DIM = null;

const c = new Client({ connectionString: url });
await c.connect();
try {
  await c.query("BEGIN");
  const encrypted = encryptApiKey(API_KEY, SERVICE_ID);
  await c.query(
    `INSERT INTO ai_service_connections
       (id, name, base_url, transport, enabled, encrypted_api_key, key_last_four, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, $6, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           base_url = EXCLUDED.base_url,
           transport = EXCLUDED.transport,
           enabled = TRUE,
           encrypted_api_key = EXCLUDED.encrypted_api_key,
           key_last_four = EXCLUDED.key_last_four,
           updated_at = NOW()`,
    [SERVICE_ID, SERVICE_NAME, BASE_URL, TRANSPORT, encrypted, API_KEY.slice(-4)],
  );
  await c.query(
    `INSERT INTO ai_service_models
       (id, service_id, name, upstream_model, enabled, embedding_dimension, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET service_id = EXCLUDED.service_id,
           name = EXCLUDED.name,
           upstream_model = EXCLUDED.upstream_model,
           enabled = TRUE,
           embedding_dimension = EXCLUDED.embedding_dimension,
           updated_at = NOW()`,
    [MODEL_ID, SERVICE_ID, MODEL_NAME, UPSTREAM_MODEL, EMBED_DIM],
  );
  await c.query(
    `DELETE FROM ai_route_assignments WHERE model_id <> $1`,
    [MODEL_ID],
  );
  for (const purpose of ["story", "rules", "polish", "background"]) {
    await c.query(
      `INSERT INTO ai_route_assignments (purpose, priority, model_id)
       VALUES ($1, 0, $2)
       ON CONFLICT (purpose, priority) DO UPDATE
         SET model_id = EXCLUDED.model_id`,
      [purpose, MODEL_ID],
    );
  }
  await c.query(
    `INSERT INTO ai_config_state (id, version, updated_at)
     VALUES (1, 1, NOW())
     ON CONFLICT (id) DO UPDATE
       SET version = ai_config_state.version + 1,
           updated_at = NOW()`,
  );
  await c.query("COMMIT");
  console.log(`service=${SERVICE_ID} model=${MODEL_ID} transport=${TRANSPORT} base=${BASE_URL} ok`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("migration_failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
} finally {
  await c.end();
}
