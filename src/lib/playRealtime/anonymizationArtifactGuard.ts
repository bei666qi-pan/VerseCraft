type RecordLike = Record<string, unknown>;

/** Repairs narrow, grammatically impossible `陌生人` substitutions observed in live provider output. */
export function applyAnonymizationArtifactGuard(dmRecord: RecordLike): RecordLike {
  const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "";
  if (!narrative) return dmRecord;
  const repaired = narrative
    .replace(/(大堂|走廊|办公室)的陌生人在头顶(?=嗡|亮|闪|发出)/g, "$1的日光灯在头顶")
    .replace(/日期写着上陌生人(?=[，,。；;但而])/g, "日期写着上周");
  if (repaired === narrative) return dmRecord;
  const flags = Array.isArray(dmRecord._commit_flags) ? dmRecord._commit_flags.filter((x): x is string => typeof x === "string") : [];
  return { ...dmRecord, narrative: repaired, _commit_flags: [...new Set([...flags, "anonymization_artifact_repaired_v1"])] };
}
