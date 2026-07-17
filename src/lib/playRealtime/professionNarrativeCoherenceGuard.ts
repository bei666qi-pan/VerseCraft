type RecordLike = Record<string, unknown>;

/**
 * Repairs a narrow class of model word-substitution failures where an object
 * or an unknown person is accidentally written as the source of a registered
 * profession technique. This is presentation-only and never grants an ability.
 */
export function applyProfessionNarrativeCoherenceGuard(dmRecord: RecordLike): RecordLike {
  const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "";
  if (!narrative) return dmRecord;
  const nextNarrative = narrative.replace(/(?:烛台|吊坠)的陌生人(?=从掌心|沿着手臂|涌向)/g, "守灯人的专注");
  if (nextNarrative === narrative) return dmRecord;
  const flags = Array.isArray(dmRecord._commit_flags)
    ? dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...dmRecord,
    narrative: nextNarrative,
    _commit_flags: [...new Set([...flags, "profession_prose_coherence_repaired_v1"])],
  };
}
