import type { RelationshipStatePatch } from "./taskV2";
import type { GameTaskV2 } from "./taskV2";
import type { MemoryCandidateDraft } from "@/lib/memorySpine/reducer";

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function uniq(xs: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function deriveTaskConsequences(args: {
  beforeTasks: GameTaskV2[];
  afterTasks: GameTaskV2[];
  taskUpdates: Array<{ id: string; status?: string }>;
  nowHour: number;
  playerLocation: string;
}): {
  relationshipPatches: RelationshipStatePatch[];
  memoryCandidates: MemoryCandidateDraft[];
  toastHint: string | null;
} {
  const beforeById = new Map(args.beforeTasks.map((t) => [t.id, t]));
  const afterById = new Map(args.afterTasks.map((t) => [t.id, t]));
  const relationshipPatches: RelationshipStatePatch[] = [];
  const memoryCandidates: MemoryCandidateDraft[] = [];

  const completedOrFailed: GameTaskV2[] = [];
  for (const u of args.taskUpdates ?? []) {
    const id = String(u?.id ?? "").trim();
    if (!id) continue;
    const after = afterById.get(id);
    const before = beforeById.get(id);
    const beforeStatus = before?.status;
    const afterStatus = after?.status;
    if (!afterStatus) continue;
    const changedToTerminal =
      (afterStatus === "completed" || afterStatus === "failed") &&
      beforeStatus !== afterStatus;
    if (changedToTerminal && after) completedOrFailed.push(after);
  }

  for (const t of completedOrFailed.slice(0, 2)) {
    const issuerId = asText(t.issuerId) || "unknown_issuer";
    const title = asText(t.title) || "一项任务";
    const kind = t.status === "completed" ? "task_residue" : "promise";
    const residueText =
      t.status === "completed"
        ? asText(t.residueOnComplete) || `你完成了《${title}》，这会在关系里留下回声。`
        : asText(t.residueOnFail) || `你没能兑现《${title}》，债会被记住。`;

    // 关系：默认用“完成=信任小幅上升；失败=信任下降/恐惧上升”的保守规则
    if (t.status === "completed") {
      relationshipPatches.push({ npcId: issuerId, trust: +3, debt: -1 });
    } else if (t.status === "failed") {
      relationshipPatches.push({ npcId: issuerId, trust: -4, fear: +3, debt: +2 });
    }

    // backfire（结构化，不靠叙事）
    if (t.canBackfire && Array.isArray(t.backfireConsequences)) {
      for (const raw of t.backfireConsequences.slice(0, 3)) {
        const s = asText(raw);
        const m = s.match(/^rel:([^:]+):(favorability|trust|fear|debt|affection|desire):([+-]?\d+)$/);
        if (!m) continue;
        const npcId = m[1] ?? "";
        const key = m[2] as keyof Omit<RelationshipStatePatch, "npcId">;
        const delta = Number(m[3]);
        if (!npcId || !Number.isFinite(delta)) continue;
        relationshipPatches.push({ npcId, [key]: Math.trunc(delta) } as any);
      }
    }

    const relatedNpcIds = uniq([issuerId, ...(t.relatedNpcIds ?? [])], 6);
    const relatedLocIds = uniq([args.playerLocation, ...(t.relatedLocationIds ?? [])], 6);

    memoryCandidates.push({
      kind: kind as any,
      scope: "run_private",
      summary: residueText.slice(0, 120),
      salience: t.status === "failed" ? 0.8 : 0.6,
      confidence: 0.85,
      status: "active",
      ttlHours: t.status === "failed" ? 36 : 24,
      mergeKey: `task:${t.id}:${t.status}`,
      anchors: {
        npcIds: relatedNpcIds,
        locationIds: relatedLocIds,
        taskIds: uniq([t.id], 4),
      },
      recallTags: uniq([t.dramaticType ?? "", t.status === "failed" ? "debt" : "promise"].filter(Boolean), 4),
      source: "task_update",
      promoteToLore: false,
    });
  }

  const toastHint =
    completedOrFailed.length > 0
      ? completedOrFailed[0]?.status === "completed"
        ? `《${completedOrFailed[0]?.title ?? "一项任务"}》有了结果。`
        : `《${completedOrFailed[0]?.title ?? "一项任务"}》的账被记下了。`
      : null;

  return {
    relationshipPatches: relationshipPatches.slice(0, 6),
    memoryCandidates: memoryCandidates.slice(0, 4),
    toastHint,
  };
}

