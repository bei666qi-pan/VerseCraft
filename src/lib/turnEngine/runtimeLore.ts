import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import { guessPlayerLocationFromContext } from "@/lib/playRealtime/b1Safety";
import { getRuntimeLore } from "@/lib/worldKnowledge/runtime/getRuntimeLore";
import type { LorePacket } from "@/lib/worldKnowledge/types";
import { extractRecentEntities } from "@/lib/turnEngine/requestMetadata";
import type { ChatPerfFlags, RiskLane } from "@/lib/turnEngine/types";

export type RuntimeLoreStageResult = {
  runtimeLoreCompact: string;
  loreRetrievalLatencyMs: number;
  loreCacheHit: boolean;
  loreSourceCount: number;
  loreTokenEstimate: number;
  loreFallbackPath: "none" | "db_partial" | "registry";
  loreBudgetHit: boolean;
  lorePacketChars: number;
  retrievalSourceCounts: Record<string, number>;
  retrievalScopeCounts: Record<string, number>;
  privateFactHitCount: number;
  runtimeLorePacket: LorePacket | null;
};

export async function loadRuntimeLoreStage(args: {
  perfFlags: ChatPerfFlags;
  riskLane: RiskLane;
  loreRetrievalBudgetMs: number;
  requestId: string;
  userId: string | null;
  sessionId: string | null;
  latestUserInput: string;
  playerContext: string;
  getRuntimeLoreImpl?: typeof getRuntimeLore;
  logAiTelemetryImpl?: typeof logAiTelemetry;
  guessPlayerLocationImpl?: typeof guessPlayerLocationFromContext;
  extractRecentEntitiesImpl?: typeof extractRecentEntities;
}): Promise<RuntimeLoreStageResult> {
  const getRuntimeLoreFn = args.getRuntimeLoreImpl ?? getRuntimeLore;
  const logAiTelemetryFn = args.logAiTelemetryImpl ?? logAiTelemetry;
  const guessLocationFn = args.guessPlayerLocationImpl ?? guessPlayerLocationFromContext;
  const extractRecentEntitiesFn = args.extractRecentEntitiesImpl ?? extractRecentEntities;

  if (args.perfFlags.enableLightweightFastPath && args.riskLane === "fast") {
    return {
      runtimeLoreCompact: "",
      loreRetrievalLatencyMs: 0,
      loreCacheHit: false,
      loreSourceCount: 0,
      loreTokenEstimate: 0,
      loreFallbackPath: "none",
      loreBudgetHit: false,
      lorePacketChars: 0,
      retrievalSourceCounts: {},
      retrievalScopeCounts: {},
      privateFactHitCount: 0,
      runtimeLorePacket: null,
    };
  }

  let loreFallbackPath: "none" | "db_partial" | "registry" = "none";
  const loreStartedAt = Date.now();

  try {
    const lorePromise = getRuntimeLoreFn({
      latestUserInput: args.latestUserInput,
      userId: args.userId,
      sessionId: args.sessionId ?? null,
      worldRevision: BigInt(0),
      playerLocation: guessLocationFn(args.playerContext),
      playerContext: args.playerContext,
      recentlyEncounteredEntities: extractRecentEntitiesFn(args.latestUserInput),
      taskType: "PLAYER_CHAT",
      tokenBudget: 420,
      worldScope: ["core", "shared", "user", "session"],
    });
    const runtimeLore =
      args.loreRetrievalBudgetMs > 0
        ? await Promise.race([
            lorePromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), args.loreRetrievalBudgetMs)),
          ])
        : await lorePromise;
    const loreRetrievalLatencyMs = Math.max(0, Date.now() - loreStartedAt);

    if (!runtimeLore) {
      loreFallbackPath = "registry";
      logAiTelemetryFn({
        requestId: args.requestId,
        task: "PLAYER_CHAT",
        providerId: "oneapi",
        logicalRole: "control",
        phase: "preflight_budget",
        latencyMs: loreRetrievalLatencyMs,
        message: `lore_budget_hit budget_ms=${args.loreRetrievalBudgetMs}`,
        userId: args.userId ?? undefined,
        retrievalLatencyMs: loreRetrievalLatencyMs,
        retrievalCacheHit: false,
        fallbackRegistryUsed: true,
      });
      return {
        runtimeLoreCompact: "",
        loreRetrievalLatencyMs,
        loreCacheHit: false,
        loreSourceCount: 0,
        loreTokenEstimate: 0,
        loreFallbackPath,
        loreBudgetHit: true,
        lorePacketChars: 0,
        retrievalSourceCounts: {},
        retrievalScopeCounts: {},
        privateFactHitCount: 0,
        runtimeLorePacket: null,
      };
    }

    const runtimeLoreCompact = runtimeLore.compactPromptText;
    const loreCacheHit = runtimeLore.debugMeta.cache.level0MemoHit || runtimeLore.debugMeta.cache.redisHit;
    const loreSourceCount = runtimeLore.retrievedFacts.length;
    const loreTokenEstimate = Math.ceil(runtimeLoreCompact.length / 4);
    const lorePacketChars = runtimeLoreCompact.length;
    const retrievalSourceCounts = runtimeLore.debugMeta.hitSources.reduce<Record<string, number>>((acc, source) => {
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, {});
    const retrievalScopeCounts = runtimeLore.retrievedFacts.reduce<Record<string, number>>((acc, fact) => {
      acc[fact.layer] = (acc[fact.layer] ?? 0) + 1;
      return acc;
    }, {});
    const privateFactHitCount = runtimeLore.retrievedFacts.filter((fact) => fact.layer === "user_private_lore").length;

    if ((runtimeLore.debugMeta.trimReason ?? "").startsWith("registry_fallback")) {
      loreFallbackPath = "registry";
    } else if (runtimeLore.debugMeta.trimmedByBudget) {
      loreFallbackPath = "db_partial";
    }

    logAiTelemetryFn({
      requestId: args.requestId,
      task: "PLAYER_CHAT",
      providerId: "oneapi",
      logicalRole: "control",
      phase: "preflight_budget",
      latencyMs: loreRetrievalLatencyMs,
      cacheHit: loreCacheHit,
      message: `lore_retrieval sources=${loreSourceCount} fallback=${loreFallbackPath}`,
      userId: args.userId ?? undefined,
      retrievalLatencyMs: loreRetrievalLatencyMs,
      retrievalCacheHit: loreCacheHit,
      retrievalSourceCounts,
      retrievalScopeCounts,
      lorePacketChars,
      lorePacketTokenEstimate: loreTokenEstimate,
      fallbackRegistryUsed: loreFallbackPath === "registry",
      privateFactHitCount,
    });

    return {
      runtimeLoreCompact,
      loreRetrievalLatencyMs,
      loreCacheHit,
      loreSourceCount,
      loreTokenEstimate,
      loreFallbackPath,
      loreBudgetHit: false,
      lorePacketChars,
      retrievalSourceCounts,
      retrievalScopeCounts,
      privateFactHitCount,
      runtimeLorePacket: runtimeLore,
    };
  } catch (error) {
    console.warn("[api/chat] world knowledge runtime lore skipped", error);
    return {
      runtimeLoreCompact: "",
      loreRetrievalLatencyMs: Math.max(0, Date.now() - loreStartedAt),
      loreCacheHit: false,
      loreSourceCount: 0,
      loreTokenEstimate: 0,
      loreFallbackPath: "registry",
      loreBudgetHit: false,
      lorePacketChars: 0,
      retrievalSourceCounts: {},
      retrievalScopeCounts: {},
      privateFactHitCount: 0,
      runtimeLorePacket: null,
    };
  }
}
