// src/lib/ai/providers/index.ts
import type { AiProviderId } from "@/lib/ai/types/core";
import { deepseekProvider } from "@/lib/ai/providers/deepseek";
import { minimaxProvider } from "@/lib/ai/providers/minimax";
import type { ProviderRequestFactory } from "@/lib/ai/providers/types";
import { zhipuProvider } from "@/lib/ai/providers/zhipu";

const map: Record<AiProviderId, ProviderRequestFactory> = {
  deepseek: deepseekProvider,
  zhipu: zhipuProvider,
  minimax: minimaxProvider,
};

export function getProviderFactory(id: AiProviderId): ProviderRequestFactory {
  return map[id];
}

export type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
