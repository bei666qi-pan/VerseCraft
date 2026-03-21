// src/lib/ai/tasks/routing.ts
import "server-only";

import { DEFAULT_PLAYER_CHAIN, resolveAiEnv } from "@/lib/ai/config/env";
import type { AllowedModelId } from "@/lib/ai/models/registry";
import { getRegisteredModel } from "@/lib/ai/models/registry";
import type { FallbackPolicy, TaskType } from "@/lib/ai/types";

function filterChainForPlayerRealtime(chain: AllowedModelId[]): AllowedModelId[] {
  return chain.filter((id) => {
    const m = getRegisteredModel(id);
    return !m.offlineOnly;
  });
}

function filterByConfiguredKeys(chain: AllowedModelId[]): AllowedModelId[] {
  const env = resolveAiEnv();
  return chain.filter((id) => {
    const m = getRegisteredModel(id);
    if (m.provider === "deepseek") return env.deepseek.apiKey.length > 0;
    if (m.provider === "zhipu") return env.zhipu.apiKey.length > 0;
    if (m.provider === "minimax") return env.minimax.apiKey.length > 0;
    return false;
  });
}

/**
 * Builds ordered model chain for a task. All branching lives here — business code must not
 * compare provider strings.
 */
export function resolveFallbackPolicy(task: TaskType): FallbackPolicy {
  const env = resolveAiEnv();

  if (task === "player_chat_stream") {
    const chain = filterByConfiguredKeys(filterChainForPlayerRealtime(env.playerChatFallbackChain));
    return {
      chain,
      stopOnFirstSuccess: true,
      tripCircuitOnFailure: true,
    };
  }

  if (task === "memory_compression") {
    const primary = env.memoryCompressionModel;
    const fallbacks = DEFAULT_PLAYER_CHAIN.filter((x) => x !== primary);
    const chain = filterByConfiguredKeys([primary, ...fallbacks]);
    return { chain, stopOnFirstSuccess: true, tripCircuitOnFailure: true };
  }

  if (task === "admin_insight") {
    const primary = env.adminInsightModel;
    const fallbacks = DEFAULT_PLAYER_CHAIN.filter((x) => x !== primary);
    const chain = filterByConfiguredKeys([primary, ...fallbacks]);
    return { chain, stopOnFirstSuccess: true, tripCircuitOnFailure: true };
  }

  // generic_json_completion: prefer primary DeepSeek-V3.2 then same chain as player (without reasoner)
  const chain = filterByConfiguredKeys(
    filterChainForPlayerRealtime([env.deepseek.defaultModel, ...env.playerChatFallbackChain])
  );
  return { chain, stopOnFirstSuccess: true, tripCircuitOnFailure: true };
}

export function assertPlayerChatModelAllowed(modelId: AllowedModelId): void {
  const m = getRegisteredModel(modelId);
  if (m.offlineOnly) {
    throw new Error(`[ai] Model ${modelId} is offline-only and cannot be used for player_chat_stream`);
  }
}
