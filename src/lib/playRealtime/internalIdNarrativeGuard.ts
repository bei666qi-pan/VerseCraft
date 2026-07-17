type RecordLike = Record<string, unknown>;

const PLAYER_LABELS: Record<string, string> = {
  prof_trial_lampkeeper: "守灯人试炼",
};

/** Replaces internal registry IDs that leaked into player-visible prose. */
export function applyInternalIdNarrativeGuard(dmRecord: RecordLike): RecordLike {
  const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "";
  if (!narrative) return dmRecord;
  let nextNarrative = narrative;
  let changed = false;
  nextNarrative = nextNarrative.replace(/\{([a-z][a-z0-9_:-]{3,80})\}/gi, (_full, rawId: string) => {
    changed = true;
    return PLAYER_LABELS[rawId] ?? "当前任务";
  });
  for (const [id, label] of Object.entries(PLAYER_LABELS)) {
    if (!nextNarrative.includes(id)) continue;
    nextNarrative = nextNarrative.replaceAll(id, label);
    changed = true;
  }
  if (!changed) return dmRecord;
  const flags = Array.isArray(dmRecord._commit_flags)
    ? dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...dmRecord,
    narrative: nextNarrative,
    _commit_flags: [...new Set([...flags, "internal_id_prose_replaced_v1"])],
  };
}
