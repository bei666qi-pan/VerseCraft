const EXPLICIT_SAFETY_RE =
  /\b(sexual|sexually_explicit|porn|erotic|minor_sexual|violence|violent|graphic_violence|gore|blood_gore|illegal_harm|weapon_harm|self_harm_instruction|harm_instruction|terror|extremism)\b/i;

const NON_SAFETY_RE =
  /\b(narrative_validator|narrative_safety_kernel|turn_commit|fact_commit|npc_consistency|dm_only|root_cause|offscreen|unregistered|style_drift|pacing|rate|quota|queue|auth|forbidden|network|timeout|gateway|json|parse|protocol)\b/i;

export function hasExplicitSafetyBlockMetadata(dm: unknown): boolean {
  if (!dm || typeof dm !== "object" || Array.isArray(dm)) return false;
  const record = dm as { security_meta?: unknown };
  const meta =
    record.security_meta && typeof record.security_meta === "object" && !Array.isArray(record.security_meta)
      ? (record.security_meta as Record<string, unknown>)
      : null;
  if (!meta) return false;
  const parts = [
    meta.reason,
    meta.reason_code,
    meta.category,
    meta.categories,
    meta.policy_category,
    meta.policyCategory,
    meta.risk_type,
    meta.riskType,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (!parts.trim()) return false;
  if (NON_SAFETY_RE.test(parts)) return false;
  return EXPLICIT_SAFETY_RE.test(parts);
}

export function shouldShowComplianceHintForDmMeta(dm: unknown, isOpeningSystemRequest: boolean): boolean {
  if (isOpeningSystemRequest) return false;
  return hasExplicitSafetyBlockMetadata(dm);
}
