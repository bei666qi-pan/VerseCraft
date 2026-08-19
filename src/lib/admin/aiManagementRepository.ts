import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigState, aiRouteAssignments, aiServiceConnections, aiServiceModels } from "@/db/schema";
import { decryptApiKey, encryptApiKey, keyLastFour } from "@/lib/ai/managed/crypto";
import { invalidateManagedAiSnapshot } from "@/lib/ai/managed/runtime";
import { getManagedAiSnapshot } from "@/lib/ai/managed/state";
import { AI_PURPOSE_LABELS, AI_PURPOSES, type ManagedTransport } from "@/lib/ai/managed/types";
import { probeManagedModel } from "@/lib/ai/managed/probe";
import { parseManagedServiceUrl } from "@/lib/ai/managed/urlSafety";
import { probeAllBeforeCommit } from "@/lib/admin/aiManagementActivation";

export type AdminAiModelInput = {
  id?: string; name: string; upstreamModel: string; capability: "generation" | "embedding";
  embeddingDimension?: number | null; inputPriceCnyFenPerMillion?: number | null;
  outputPriceCnyFenPerMillion?: number | null; enabled?: boolean;
};

export type AdminAiServiceInput = {
  id?: string; name: string; baseUrl: string; transport: ManagedTransport; apiKey?: string;
  enabled?: boolean; models: AdminAiModelInput[];
};

function cleanText(value: unknown, max: number): string { return String(value ?? "").trim().slice(0, max); }
function nullableNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}
function publicService(row: typeof aiServiceConnections.$inferSelect, models: Array<typeof aiServiceModels.$inferSelect>) {
  return {
    id: row.id, name: row.name, baseUrl: row.baseUrl, transport: row.transport, keyLastFour: row.keyLastFour,
    enabled: row.enabled, lastTestStatus: row.lastTestStatus, lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestMessage: row.lastTestMessage, models: models.map((m) => ({
      id: m.id, name: m.name, upstreamModel: m.upstreamModel, capability: m.capability,
      embeddingDimension: m.embeddingDimension, inputPriceCnyFenPerMillion: m.inputPriceCnyFenPerMillion,
      outputPriceCnyFenPerMillion: m.outputPriceCnyFenPerMillion, enabled: m.enabled,
    })),
  };
}

export async function getAiManagementData() {
  const [services, models, routes] = await Promise.all([
    db.select().from(aiServiceConnections).where(isNull(aiServiceConnections.deletedAt)).orderBy(aiServiceConnections.createdAt),
    db.select().from(aiServiceModels).where(isNull(aiServiceModels.deletedAt)).orderBy(aiServiceModels.createdAt),
    db.select({ purpose: aiRouteAssignments.purpose, priority: aiRouteAssignments.priority, modelId: aiRouteAssignments.modelId })
      .from(aiRouteAssignments).orderBy(aiRouteAssignments.purpose, aiRouteAssignments.priority),
  ]);
  const snapshot = getManagedAiSnapshot();
  return {
    services: services.map((s) => publicService(s, models.filter((m) => m.serviceId === s.id))),
    routes: AI_PURPOSES.map((purpose) => ({ purpose, label: AI_PURPOSE_LABELS[purpose], modelIds: routes.filter((r) => r.purpose === purpose).map((r) => r.modelId) })),
    runtime: { ready: snapshot.ready, health: snapshot.health, version: snapshot.version, loadedAt: snapshot.loadedAt || null },
  };
}

export async function saveAiService(raw: AdminAiServiceInput): Promise<{ service: Awaited<ReturnType<typeof getAiManagementData>>["services"][number] }> {
  const id = cleanText(raw.id, 64) || randomUUID();
  const existing = raw.id ? (await db.select().from(aiServiceConnections).where(and(eq(aiServiceConnections.id, id), isNull(aiServiceConnections.deletedAt))).limit(1))[0] : null;
  if (raw.id && !existing) throw new Error("service_not_found");
  const name = cleanText(raw.name, 96); const baseUrl = cleanText(raw.baseUrl, 1024);
  if (!name || !baseUrl) throw new Error("service_fields_required");
  const transport: ManagedTransport = raw.transport === "ark_multimodal" ? "ark_multimodal" : raw.transport === "mock" && process.env.NODE_ENV !== "production" ? "mock" : "openai_compatible";
  parseManagedServiceUrl(baseUrl, { allowLocalhost: process.env.NODE_ENV !== "production" });
  const submittedKey = cleanText(raw.apiKey, 4096);
  const apiKey = submittedKey || (existing ? decryptApiKey(existing.encryptedApiKey, existing.id) : "");
  if (!apiKey) throw new Error("service_key_required");
  if (!Array.isArray(raw.models) || raw.models.length === 0) throw new Error("service_model_required");
  const models = raw.models.map((m) => ({
    id: cleanText(m.id, 64) || randomUUID(), name: cleanText(m.name, 96), upstreamModel: cleanText(m.upstreamModel, 191),
    capability: m.capability === "embedding" ? "embedding" as const : "generation" as const,
    embeddingDimension: nullableNonNegative(m.embeddingDimension), inputPriceCnyFenPerMillion: nullableNonNegative(m.inputPriceCnyFenPerMillion),
    outputPriceCnyFenPerMillion: nullableNonNegative(m.outputPriceCnyFenPerMillion), enabled: m.enabled !== false,
  }));
  if (models.some((m) => !m.name || !m.upstreamModel)) throw new Error("model_fields_required");
  const encrypted = encryptApiKey(apiKey, id); const now = new Date();
  await probeAllBeforeCommit({
    candidates: models.filter((model) => model.enabled),
    probe: (model) => probeManagedModel({ baseUrl, apiKey, transport, model, allowLocalhost: process.env.NODE_ENV !== "production" }),
    commit: () => db.transaction(async (tx) => {
      await tx.insert(aiServiceConnections).values({ id, name, baseUrl, transport, encryptedApiKey: encrypted, keyLastFour: keyLastFour(apiKey), enabled: raw.enabled !== false, lastTestStatus: "success", lastTestedAt: now, lastTestMessage: "连接正常" })
        .onConflictDoUpdate({ target: aiServiceConnections.id, set: { name, baseUrl, transport, encryptedApiKey: encrypted, keyLastFour: keyLastFour(apiKey), enabled: raw.enabled !== false, lastTestStatus: "success", lastTestedAt: now, lastTestMessage: "连接正常", updatedAt: now } });
      const keep = new Set(models.map((m) => m.id));
      const old = await tx.select({ id: aiServiceModels.id }).from(aiServiceModels).where(and(eq(aiServiceModels.serviceId, id), isNull(aiServiceModels.deletedAt)));
      for (const stale of old.filter((m) => !keep.has(m.id))) await tx.update(aiServiceModels).set({ enabled: false, deletedAt: now, updatedAt: now }).where(eq(aiServiceModels.id, stale.id));
      for (const model of models) await tx.insert(aiServiceModels).values({ ...model, serviceId: id }).onConflictDoUpdate({ target: aiServiceModels.id, set: { ...model, serviceId: id, deletedAt: null, updatedAt: now } });
      await tx.update(aiConfigState).set({ version: sql`${aiConfigState.version} + 1`, updatedAt: now }).where(eq(aiConfigState.id, 1));
    }),
  });
  await invalidateManagedAiSnapshot();
  const data = await getAiManagementData();
  return { service: data.services.find((s) => s.id === id)! };
}

export async function setAiServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const result = await tx.update(aiServiceConnections).set({ enabled, updatedAt: now }).where(and(eq(aiServiceConnections.id, serviceId), isNull(aiServiceConnections.deletedAt))).returning({ id: aiServiceConnections.id });
    if (!result[0]) throw new Error("service_not_found");
    await tx.update(aiConfigState).set({ version: sql`${aiConfigState.version} + 1`, updatedAt: now }).where(eq(aiConfigState.id, 1));
  });
  await invalidateManagedAiSnapshot();
}

export async function softDeleteAiService(serviceId: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const result = await tx.update(aiServiceConnections).set({ enabled: false, deletedAt: now, updatedAt: now }).where(and(eq(aiServiceConnections.id, serviceId), isNull(aiServiceConnections.deletedAt))).returning({ id: aiServiceConnections.id });
    if (!result[0]) throw new Error("service_not_found");
    await tx.update(aiServiceModels).set({ enabled: false, deletedAt: now, updatedAt: now }).where(eq(aiServiceModels.serviceId, serviceId));
    await tx.update(aiConfigState).set({ version: sql`${aiConfigState.version} + 1`, updatedAt: now }).where(eq(aiConfigState.id, 1));
  });
  await invalidateManagedAiSnapshot();
}

export async function testAiService(serviceId: string): Promise<void> {
  const service = (await db.select().from(aiServiceConnections).where(and(eq(aiServiceConnections.id, serviceId), isNull(aiServiceConnections.deletedAt))).limit(1))[0];
  if (!service) throw new Error("service_not_found");
  const models = await db.select().from(aiServiceModels).where(and(eq(aiServiceModels.serviceId, serviceId), isNull(aiServiceModels.deletedAt), eq(aiServiceModels.enabled, true)));
  const apiKey = decryptApiKey(service.encryptedApiKey, service.id);
  for (const model of models) {
    const result = await probeManagedModel({ baseUrl: service.baseUrl, apiKey, transport: service.transport as ManagedTransport, model: { upstreamModel: model.upstreamModel, capability: model.capability as "generation" | "embedding", embeddingDimension: model.embeddingDimension }, allowLocalhost: process.env.NODE_ENV !== "production" });
    if (!result.ok) throw new Error(result.reason);
  }
  await db.update(aiServiceConnections).set({ lastTestStatus: "success", lastTestedAt: new Date(), lastTestMessage: "连接正常" }).where(eq(aiServiceConnections.id, serviceId));
}

export async function replaceAiRoutes(input: Record<string, unknown>): Promise<void> {
  const parsed = AI_PURPOSES.map((purpose) => ({ purpose, modelIds: Array.isArray(input[purpose]) ? (input[purpose] as unknown[]).map((v) => cleanText(v, 64)).filter(Boolean) : [] }));
  const uniqueIds = [...new Set(parsed.flatMap((r) => r.modelIds))];
  if (uniqueIds.length) {
    const available = await db.select({ id: aiServiceModels.id }).from(aiServiceModels).where(and(isNull(aiServiceModels.deletedAt), eq(aiServiceModels.enabled, true)));
    const allowed = new Set(available.map((m) => m.id));
    if (uniqueIds.some((id) => !allowed.has(id))) throw new Error("route_model_unavailable");
  }
  await db.transaction(async (tx) => {
    await tx.delete(aiRouteAssignments);
    for (const route of parsed) for (let priority = 0; priority < route.modelIds.length; priority++) await tx.insert(aiRouteAssignments).values({ purpose: route.purpose, modelId: route.modelIds[priority], priority });
    await tx.update(aiConfigState).set({ version: sql`${aiConfigState.version} + 1`, updatedAt: new Date() }).where(eq(aiConfigState.id, 1));
  });
  await invalidateManagedAiSnapshot();
}

export async function queryAiUsage(days: number) {
  const bounded = Math.max(1, Math.min(90, Math.trunc(days || 7)));
  const result = await db.execute(sql`
    WITH filtered AS (SELECT * FROM ai_usage_events WHERE occurred_at >= CURRENT_TIMESTAMP - (${bounded}::text || ' days')::interval),
    trend AS (SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date AS day, SUM(input_tokens)::bigint AS input, SUM(output_tokens)::bigint AS output FROM filtered GROUP BY 1 ORDER BY 1),
    purpose_rank AS (SELECT purpose AS name, SUM(total_tokens)::bigint AS tokens FROM filtered GROUP BY 1 ORDER BY 2 DESC),
    service_rank AS (SELECT service_name AS name, SUM(total_tokens)::bigint AS tokens FROM filtered GROUP BY 1 ORDER BY 2 DESC),
    model_rank AS (SELECT model_name AS name, SUM(total_tokens)::bigint AS tokens FROM filtered GROUP BY 1 ORDER BY 2 DESC)
    SELECT COUNT(*)::int AS requests, COUNT(*) FILTER (WHERE outcome='success')::int AS successes,
      COALESCE(SUM(input_tokens),0)::bigint AS "inputTokens", COALESCE(SUM(output_tokens),0)::bigint AS "outputTokens",
      COALESCE(SUM(total_tokens),0)::bigint AS "totalTokens", CASE WHEN COUNT(cost_cny_micros)=COUNT(*) THEN SUM(cost_cny_micros)::bigint ELSE NULL END AS "costCnyMicros",
      COUNT(*) FILTER (WHERE usage_estimated)::int AS "estimatedCount", COALESCE((SELECT json_agg(trend) FROM trend),'[]') AS trend,
      COALESCE((SELECT json_agg(purpose_rank) FROM purpose_rank),'[]') AS "purposeRank", COALESCE((SELECT json_agg(service_rank) FROM service_rank),'[]') AS "serviceRank",
      COALESCE((SELECT json_agg(model_rank) FROM model_rank),'[]') AS "modelRank" FROM filtered
  `);
  const row = ((result as { rows?: Record<string, unknown>[] }).rows ?? [])[0] ?? {};
  return { days: bounded, ...row };
}
