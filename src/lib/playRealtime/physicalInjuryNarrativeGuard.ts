type DmRecord = Record<string, unknown>;

const NEW_PHYSICAL_INJURY_PATTERN = /(?:多了|出现|留下|添了|映出|裂开|渗出|一道|一处|一小道)[^。！？\n]{0,12}(?:擦伤|伤口|淤青|血痕|裂口)|(?:鲜血|血液)[^。！？\n]{0,8}(?:流下|渗出|滴落)|(?:掌心|手掌|皮肤|手指)[^。！？\n]{0,10}(?:磨破|破皮|渗出血丝|流血)/;

function hasStructuredPhysicalInjury(record: DmRecord): boolean {
  const conflict = record.conflict_outcome;
  if (!conflict || typeof conflict !== "object" || Array.isArray(conflict)) return false;
  const delta = (conflict as Record<string, unknown>).injury_delta;
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return false;
  const injuries = (delta as Record<string, unknown>).injuries;
  return Array.isArray(injuries) && injuries.length > 0;
}

/**
 * State-delta-first guard: prose may not introduce a new bodily wound unless
 * this same authoritative turn commits a structured physical injury.
 */
export function applyPhysicalInjuryNarrativeGuard(dmRecord: DmRecord): DmRecord {
  const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "";
  if (!narrative || hasStructuredPhysicalInjury(dmRecord) || !NEW_PHYSICAL_INJURY_PATTERN.test(narrative)) return dmRecord;

  const kept = narrative
    .split(/(?<=[。！？\n])/u)
    .filter((sentence) => !NEW_PHYSICAL_INJURY_PATTERN.test(sentence));
  const flags = Array.isArray(dmRecord._commit_flags)
    ? dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...dmRecord,
    narrative: kept.join("").trim(),
    _commit_flags: [...new Set([...flags, "unsupported_physical_injury_prose_removed_v1"])],
  };
}
