import { sanitizeMessagesForUpstream } from "@/lib/ai/service";
import { composePlayerChatSystemMessages } from "@/lib/playRealtime/playerChatSystemPrompt";
import type { ChatMessageShape } from "@/lib/turnEngine/types";

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
  };
}
