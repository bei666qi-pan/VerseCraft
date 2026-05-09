const VISIBLE_SAFETY_REASON_PATTERN =
  /(?:^|[^a-z0-9])(?:sexual|explicit|explicit_sexual|porn|erotic|gore|graphic_violence|violence|violent|illegal_harm|illegal_instructions|legal_redline|self_harm|harmful_instruction)(?:$|[^a-z0-9])/i;

const VISIBLE_SAFETY_REASON_CJK_PATTERN = /(?:涉黄|色情|性内容|涉暴|暴力|血腥|违法伤害|自伤|自残)/;

export const VISIBLE_SAFETY_DEGRADE_MESSAGE =
  "本回合涉及涉黄、涉暴或违法伤害内容，不能继续。";

function flattenReasonText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(flattenReasonText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenReasonText).filter(Boolean).join(" ");
  }
  return String(value);
}

export function isVisibleSafetyDegradeReason(value: unknown): boolean {
  const text = flattenReasonText(value);
  if (!text) return false;
  return VISIBLE_SAFETY_REASON_PATTERN.test(text) || VISIBLE_SAFETY_REASON_CJK_PATTERN.test(text);
}

export function visibleSafetyDegradeMessageFor(value: unknown): string | null {
  return isVisibleSafetyDegradeReason(value) ? VISIBLE_SAFETY_DEGRADE_MESSAGE : null;
}
