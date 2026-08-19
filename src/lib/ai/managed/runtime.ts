import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getAppRedisClient } from "@/lib/ratelimit";
import { decryptApiKey, hasAiConfigEncryptionKey } from "./crypto";
import { completionEndpoint, embeddingEndpoint } from "./urlSafety";
import { AI_PURPOSES, roleForPurpose, type AiPurpose, type ManagedAiBinding, type ManagedAiSnapshot, type ManagedTransport } from "./types";
import { emptyManagedAiSnapshot, getManagedAiSnapshot, setManagedAiSnapshot } from "./state";

let loading: Promise<ManagedAiSnapshot> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let invalidationSubscriberStarted = false;
const INVALIDATION_CHANNEL = "vc:ai-config:invalidate:v1";

type RuntimeRow = {
  version: number; purpose: AiPurpose; priority: number; serviceId: string; serviceName: string; baseUrl: string;
  transport: ManagedTransport; encryptedApiKey: string; modelId: string; modelName: string; upstreamModel: string;
  embeddingDimension: number | null; inputPrice: number | null; outputPrice: number | null;
};

function buildSnapshot(version: number, rows: RuntimeRow[]): ManagedAiSnapshot {
  const mutable = Object.fromEntries(AI_PURPOSES.map((p) => [p, [] as ManagedAiBinding[]])) as Record<AiPurpose, ManagedAiBinding[]>;
  for (const row of rows) {
    // Defensive guard: only aggregate rows whose purpose is part of the
    // known AI_PURPOSES list. Unknown purposes (e.g. operators adding new
    // rows before the type union is widened) must not throw and silently
    // abort the entire snapshot.
    if (!(row.purpose in mutable)) continue;
    const transport = row.transport;
    const baseUrl = row.purpose === "embedding" ? embeddingEndpoint(row.baseUrl, transport) : completionEndpoint(row.baseUrl, transport);
    mutable[row.purpose].push(Object.freeze({
      serviceId: row.serviceId, serviceName: row.serviceName, modelId: row.modelId, modelName: row.upstreamModel,
      baseUrl, apiKey: decryptApiKey(row.encryptedApiKey, row.serviceId), transport, purpose: row.purpose,
      logicalRole: roleForPurpose(row.purpose), embeddingDimension: row.embeddingDimension,
      inputPriceCnyFenPerMillion: row.inputPrice, outputPriceCnyFenPerMillion: row.outputPrice,
    }));
  }
  return Object.freeze({ version, loadedAt: Date.now(), ready: true, health: "ready", byPurpose: Object.freeze(Object.fromEntries(AI_PURPOSES.map((p) => [p, Object.freeze(mutable[p])]))) as Record<AiPurpose, readonly ManagedAiBinding[]> });
}

function buildMockSnapshot(): ManagedAiSnapshot {
  const bindings = Object.fromEntries(
    AI_PURPOSES.map((purpose): [AiPurpose, readonly ManagedAiBinding[]] => {
      const binding: ManagedAiBinding = Object.freeze({
        serviceId: "mock-service", serviceName: "本地测试服务", modelId: `mock-${purpose}`,
        modelName: purpose === "embedding" ? "mock-embedding" : `mock-${roleForPurpose(purpose)}`,
        baseUrl: purpose === "embedding" ? "mock://embeddings" : "mock://chat/completions", apiKey: "mock-key",
        transport: "mock", purpose, logicalRole: roleForPurpose(purpose),
        embeddingDimension: purpose === "embedding" ? 1024 : null,
        inputPriceCnyFenPerMillion: null, outputPriceCnyFenPerMillion: null,
      });
      return [purpose, Object.freeze([binding])];
    }),
  ) as Record<AiPurpose, readonly ManagedAiBinding[]>;
  return Object.freeze({ version: 0, loadedAt: Date.now(), ready: true, health: "ready", byPurpose: Object.freeze(bindings) });
}

export async function reloadManagedAiSnapshot(): Promise<ManagedAiSnapshot> {
  if (loading) return loading;
  loading = (async () => {
    if (process.env.AI_PROVIDER === "mock") {
      const next = buildMockSnapshot();
      setManagedAiSnapshot(next); return next;
    }
    if (!hasAiConfigEncryptionKey()) {
      const next = emptyManagedAiSnapshot("missing_encryption_key"); setManagedAiSnapshot(next); return next;
    }
    try {
      const result = await db.execute(sql`
        SELECT s.id AS "serviceId", s.name AS "serviceName", s.base_url AS "baseUrl", s.transport,
               s.encrypted_api_key AS "encryptedApiKey", m.id AS "modelId", m.name AS "modelName",
               m.upstream_model AS "upstreamModel", m.embedding_dimension AS "embeddingDimension",
               m.input_price_cny_fen_per_million AS "inputPrice", m.output_price_cny_fen_per_million AS "outputPrice",
               r.purpose, r.priority, COALESCE(cs.version, 0)::int AS version
        FROM ai_route_assignments r
        JOIN ai_service_models m ON m.id = r.model_id AND m.enabled = TRUE AND m.deleted_at IS NULL
        JOIN ai_service_connections s ON s.id = m.service_id AND s.enabled = TRUE AND s.deleted_at IS NULL
        CROSS JOIN ai_config_state cs
        WHERE cs.id = 1
        ORDER BY r.purpose, r.priority
      `);
      const rows = ((result as { rows?: unknown[] }).rows ?? []) as RuntimeRow[];
      const version = Number(rows[0]?.version ?? (await readManagedAiConfigVersion()));
      setManagedAiSnapshot(buildSnapshot(version, rows));
    } catch (error) {
      const decryptFailed = error instanceof Error && /decrypt|authenticate|envelope/i.test(error.message);
      setManagedAiSnapshot(emptyManagedAiSnapshot(decryptFailed ? "decrypt_failed" : "database_unavailable"));
    }
    return getManagedAiSnapshot();
  })().finally(() => { loading = null; });
  return loading;
}

/**
 * Next.js may evaluate instrumentation and route handlers in separate module
 * graphs during development and in some bundled runtimes. Ensure the local
 * graph has a snapshot before a request reads the synchronous routing state.
 * Once ready this is memory-only; it does not add a DB read to every AI call.
 */
export async function ensureManagedAiSnapshot(): Promise<ManagedAiSnapshot> {
  const current = getManagedAiSnapshot();
  if (current.ready) return current;
  return reloadManagedAiSnapshot();
}

async function readManagedAiConfigVersion(): Promise<number> {
  const result = await db.execute(sql`SELECT version::int AS version FROM ai_config_state WHERE id = 1`);
  return Number(((result as { rows?: Array<{ version?: unknown }> }).rows ?? [])[0]?.version ?? 0);
}

export async function invalidateManagedAiSnapshot(): Promise<void> {
  await reloadManagedAiSnapshot();
  try { const redis = await getAppRedisClient(); if (redis) await redis.publish(INVALIDATION_CHANNEL, String(getManagedAiSnapshot().version)); } catch { /* polling fallback */ }
}

export function startManagedAiSnapshotWatcher(): void {
  if (pollTimer) return;
  void reloadManagedAiSnapshot();
  pollTimer = setInterval(() => {
    void readManagedAiConfigVersion().then((version) => { if (version !== getManagedAiSnapshot().version) return reloadManagedAiSnapshot(); }).catch(() => {});
  }, 5000);
  pollTimer.unref?.();
  if (!invalidationSubscriberStarted) {
    invalidationSubscriberStarted = true;
    void getAppRedisClient().then(async (redis) => {
      if (!redis) return;
      const subscriber = redis.duplicate();
      subscriber.on("error", () => {});
      await subscriber.connect();
      await subscriber.subscribe(INVALIDATION_CHANNEL, () => { void reloadManagedAiSnapshot(); });
    }).catch(() => { invalidationSubscriberStarted = false; });
  }
}

export { getManagedAiSnapshot, getManagedBindingsForTask, getManagedEmbeddingBindings, managedAiConfiguredForTask, setManagedAiSnapshot as __setManagedAiSnapshotForTests } from "./state";
