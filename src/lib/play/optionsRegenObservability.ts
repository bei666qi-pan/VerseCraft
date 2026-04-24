import type { OptionRejectReason } from "@/lib/play/optionsSemanticGuards";

export type OptionsRegenReasonCode =
  | "parse_failed"
  | "duplicated_rejected"
  | "anchor_miss_rejected"
  | "generic_rejected"
  | "homogeneity_rejected"
  | "repair_pass_used"
  | "fallback_used";

const REJECT_REASON_TO_CODE: Partial<Record<OptionRejectReason, OptionsRegenReasonCode>> = {
  duplicate_current_recent: "duplicated_rejected",
  high_similarity_duplicate: "duplicated_rejected",
  missing_story_anchor: "anchor_miss_rejected",
  generic_action: "generic_rejected",
  homogeneity_rejected: "homogeneity_rejected",
};

export function mapOptionRejectReasonToCodes(reasons: OptionRejectReason[]): OptionsRegenReasonCode[] {
  const out = new Set<OptionsRegenReasonCode>();
  for (const reason of reasons) {
    const code = REJECT_REASON_TO_CODE[reason];
    if (code) out.add(code);
  }
  return Array.from(out);
}

export function formatOptionsRegenDebugHint(codes: OptionsRegenReasonCode[]): string | null {
  const uniq = Array.from(new Set(codes));
  if (uniq.length === 0) return null;
  return `options_regen_debug: ${uniq.join(",")}`;
}

