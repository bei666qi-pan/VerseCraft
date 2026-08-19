// scripts/migrate-ark-embedding-gateway.mjs
//
// One-shot migration: register the Volcengine Ark embedding gateway as the
// only `embedding`-purpose managed binding. Reads the API key from stdin so
// it never appears in shell history or env exports.
import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { Client } from "pg";
import { createCipheriv, randomBytes } from "node:crypto";

dotenv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(2); }
const rawKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
if (!rawKey) { console.error("AI_CONFIG_ENCRYPTION_KEY missing"); process.exit(2); }

function parseKey(raw = rawKey) {
  const v = raw.trim();
  if (!v) throw new Error("ai_config_encryption_key_missing");
  const k = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (k.length !== 32) throw new Error("ai_config_encryption_key_invalid");
  return k;
}

function encryptApiKey(plain, recordId) {
  const key = parseKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(recordId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

// Read key from stdin only.
let API_KEY = "";
if (!process.stdin.isTTY) {
  try {
    const buf = await new Promise((resolveBuf, rejectBuf) => {
      const chunks = [];
      process.stdin.on("data", (c) => chunks.push(c));
      process.stdin.on("end", () => resolveBuf(Buffer.concat(chunks).toString("utf8")));
      process.stdin.on("error", rejectBuf);
    });
    API_KEY = buf.trim();
  } catch { /* ignore */ }
}
if (!API_KEY) {
  console.error("stdin: pipe the gateway API key (e.g. printf '%s' \"$KEY\" | node ...)");
  process.exit(2);
}

const SERVICE_ID = "volcengine-ark-embeddings";
const MODEL_ID = "doubao-embedding-vision";
const BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const TRANSPORT = "openai_compatible";
const MODEL_NAME = "doubao-embedding-vision";
const EMBED_DIM = 2048;

const c = new Client({ connectionString: url });
await c.connect();
try {
  await c.query("BEGIN");
  const encrypted = encryptApiKey(API_KEY, SERVICE_ID);
  await c.query(
    `INSERT INTO ai_service_connections (id, name, base_url, transport, enabled, encrypted_api_key, key_last_four, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, $6, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, base_url=EXCLUDED.base_url, transport=EXCLUDED.transport, enabled=TRUE, encrypted_api_key=EXCLUDED.encrypted_api_key, key_last_four=EXCLUDED.key_last_four, updated_at=NOW()`,
    [SERVICE_ID, "Volcengine Ark Embeddings (doubao-embedding-vision)", BASE_URL, TRANSPORT, encrypted, API_KEY.slice(-4)]
  );
  await c.query(
    `INSERT INTO ai_service_models (id, service_id, name, upstream_model, enabled, embedding_dimension, created_at, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET service_id=EXCLUDED.service_id, name=EXCLUDED.name, upstream_model=EXCLUDED.upstream_model, enabled=TRUE, embedding_dimension=EXCLUDED.embedding_dimension, updated_at=NOW()`,
    [MODEL_ID, SERVICE_ID, MODEL_NAME, MODEL_NAME, EMBED_DIM]
  );
  await c.query(
    `INSERT INTO ai_route_assignments (purpose, priority, model_id)
     VALUES ('embedding', 0, $1)
     ON CONFLICT (purpose, priority) DO UPDATE SET model_id=EXCLUDED.model_id`,
    [MODEL_ID]
  );
  await c.query(
    `INSERT INTO ai_config_state (id, version, updated_at) VALUES (1, 1, NOW())
     ON CONFLICT (id) DO UPDATE SET version = ai_config_state.version + 1, updated_at = NOW()`
  );
  await c.query("COMMIT");
  console.log(`service=${SERVICE_ID} model=${MODEL_ID} dim=${EMBED_DIM} transport=${TRANSPORT} base=${BASE_URL} ok`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("migration_failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
} finally {
  await c.end();
}