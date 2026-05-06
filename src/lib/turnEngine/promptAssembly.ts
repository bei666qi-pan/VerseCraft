import { sanitizeMessagesForUpstream } from "@/lib/ai/stream/sanitize";
import {
  composePlayerChatSystemMessages,
  getPlayerDmPromptVersion,
  stablePromptHash,
} from "@/lib/playRealtime/playerChatSystemPrompt";
import type { ChatMessageShape } from "@/lib/turnEngine/types";

function estimatePromptTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

export function assemblePlayerChatPrompt(args: {
  stablePrefix: string;
  dynamicSuffix: string;
  splitDualSystem: boolean;
  messagesToSend: ChatMessageShape[];
}): {
  systemChatMessages: ChatMessageShape[];
  safeMessages: ChatMessageShape[];
  stableCharLen: number;
  dynamicCharLen: number;
  promptVersion: string;
  promptStablePrefixHash: string;
  stableTokenEstimate: number;
  dynamicTokenEstimate: number;
} {
  const systemChatMessages = composePlayerChatSystemMessages(
    args.stablePrefix,
    args.dynamicSuffix,
    args.splitDualSystem
  );
  return {
    systemChatMessages,
    safeMessages: sanitizeMessagesForUpstream([...systemChatMessages, ...args.messagesToSend]),
    stableCharLen: args.stablePrefix.length,
    dynamicCharLen: args.dynamicSuffix.length,
    promptVersion: getPlayerDmPromptVersion(),
    promptStablePrefixHash: stablePromptHash(args.stablePrefix),
    stableTokenEstimate: estimatePromptTokens(args.stablePrefix.length),
    dynamicTokenEstimate: estimatePromptTokens(args.dynamicSuffix.length),
  };
}
