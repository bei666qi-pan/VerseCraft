import type { ClientStructuredContextV1, OptionsRegenContextPayload } from "@/lib/security/chatValidation";
import { buildOptionsRegenContextPacket } from "@/lib/play/optionsRegenContext";
import { buildOptionsRegenSystemPrompt } from "@/lib/play/optionsRegenPrompt";

export function buildOptionsOnlySystemPrompt(): string {
  return buildOptionsRegenSystemPrompt();
}

export function buildOptionsOnlyUserPacket(args: {
  reason: string;
  optionsRegenContext: OptionsRegenContextPayload | null;
  playerContextSnapshot: string;
  clientState: ClientStructuredContextV1 | null;
}): string {
  const packet = buildOptionsRegenContextPacket({
    reason: args.reason,
    context: args.optionsRegenContext,
    playerContextSnapshot: args.playerContextSnapshot,
    clientState: args.clientState,
  });
  return [
    packet,
    "",
    "请严格按系统规则生成 4 条新行动，不得与“当前/最近选项”重复或高相似。",
  ].join("\n");
}

