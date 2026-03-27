import type { ContentPack, NpcContentSpec, TaskContentSpec } from "./types";
import { isEscapeConditionCode, isNpcId, isTaskSpecId, clampText } from "./naming";

export type ContentValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  ref?: { kind: string; id: string };
};

function push(out: ContentValidationIssue[], severity: "error" | "warning", code: string, message: string, ref?: any) {
  out.push({ severity, code, message: clampText(message, 280), ref });
}

function uniqCount<T>(xs: T[], keyFn: (x: T) => string): { dupes: string[] } {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const x of xs ?? []) {
    const k = keyFn(x);
    if (!k) continue;
    if (seen.has(k)) dupes.push(k);
    else seen.add(k);
  }
  return { dupes: Array.from(new Set(dupes)) };
}

export function validateNpcSpec(spec: NpcContentSpec): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  if (!isNpcId(spec.id)) push(issues, "error", "npc.id.invalid", `NPC id 必须为 N-xxx：${spec.id}`, { kind: "npc", id: spec.id });
  if (!spec.identity?.displayName) push(issues, "error", "npc.identity.displayName.missing", "NPC 缺少 displayName", { kind: "npc", id: spec.id });
  if (!spec.identity?.homeNode) push(issues, "warning", "npc.identity.homeNode.missing", "NPC 缺少 homeNode（会影响出场一致性）", { kind: "npc", id: spec.id });
  if (!spec.interaction?.tabooBoundary) push(issues, "warning", "npc.taboo.missing", "NPC 缺少 tabooBoundary（禁忌缺失风险）", { kind: "npc", id: spec.id });
  if (!spec.voiceContract?.oneLine) push(issues, "warning", "npc.voiceContract.missing", "NPC 缺少 voiceContract.oneLine（声线契约缺失）", { kind: "npc", id: spec.id });
  const forbid = spec.voiceContract?.forbiddenPhrases ?? [];
  if (forbid.some((x) => String(x).includes("系统"))) {
    push(issues, "warning", "npc.voiceContract.forbiddenPhrase.risky", "forbiddenPhrases 中含“系统”字样，注意不要把提示写成系统腔。", { kind: "npc", id: spec.id });
  }
  return issues;
}

export function validateTaskSpec(spec: TaskContentSpec): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  if (!isTaskSpecId(spec.id)) push(issues, "error", "task.id.invalid", `Task spec id 命名不合规：${spec.id}`, { kind: "taskSpec", id: spec.id });
  if (!spec.core?.title) push(issues, "error", "task.core.title.missing", "任务缺少 title", { kind: "taskSpec", id: spec.id });
  if (!spec.issuer?.issuerId) push(issues, "warning", "task.issuer.issuerId.missing", "任务缺少 issuerId（会影响NPC口吻与后果链）", { kind: "taskSpec", id: spec.id });
  if (spec.dramatic?.issuerIntent && spec.dramatic.issuerIntent.length > 180) {
    push(issues, "warning", "task.dramatic.issuerIntent.tooLong", "issuerIntent 过长：建议≤180字，避免 prompt 注入变胖。", { kind: "taskSpec", id: spec.id });
  }
  // 引用链：escape hooks
  if (typeof spec.dramatic?.relatedEscapeProgress === "string" && spec.dramatic.relatedEscapeProgress.includes("escape.condition.")) {
    const c = spec.dramatic.relatedEscapeProgress.replace(/^cond:/, "");
    if (!isEscapeConditionCode(c)) {
      push(issues, "warning", "task.escapeRef.invalid", `relatedEscapeProgress 指向不合规：${spec.dramatic.relatedEscapeProgress}`, { kind: "taskSpec", id: spec.id });
    }
  }
  return issues;
}

export function validateContentPacks(packs: readonly ContentPack[]): { issues: ContentValidationIssue[] } {
  const issues: ContentValidationIssue[] = [];
  const packIds = packs.map((p) => p.manifest.packId);
  const dupPack = uniqCount(packIds, (x) => String(x)).dupes;
  if (dupPack.length) push(issues, "error", "pack.id.duplicate", `重复 packId：${dupPack.join(",")}`);

  const npcSpecs = packs.flatMap((p) => p.npcSpecs ?? []);
  const taskSpecs = packs.flatMap((p) => p.taskSpecs ?? []);

  const dupNpc = uniqCount(npcSpecs, (x) => x.id).dupes;
  if (dupNpc.length) push(issues, "error", "npc.id.duplicate", `重复 NPC spec id：${dupNpc.join(",")}`);

  const dupTask = uniqCount(taskSpecs, (x) => x.id).dupes;
  if (dupTask.length) push(issues, "error", "task.id.duplicate", `重复 Task spec id：${dupTask.join(",")}`);

  for (const n of npcSpecs) issues.push(...validateNpcSpec(n));
  for (const t of taskSpecs) issues.push(...validateTaskSpec(t));

  // escape 条件 code 重复/缺失
  for (const p of packs) {
    const esc = p.escapeSpecs;
    if (!esc) continue;
    const condCodes = (esc.conditions ?? []).map((c) => c.code);
    const dupCond = uniqCount(condCodes, (x) => String(x)).dupes;
    if (dupCond.length) push(issues, "error", "escape.condition.duplicate", `pack[${p.manifest.packId}] escape condition code 重复：${dupCond.join(",")}`, { kind: "pack", id: p.manifest.packId });
    for (const c of esc.conditions ?? []) {
      if (!isEscapeConditionCode(c.code)) push(issues, "error", "escape.condition.code.invalid", `escape condition code 不合规：${c.code}`, { kind: "escapeCondition", id: c.code });
      if (!c.label) push(issues, "error", "escape.condition.label.missing", `escape condition 缺 label：${c.code}`, { kind: "escapeCondition", id: c.code });
    }
  }

  // 轻量“系统腔泄漏”风险：禁止把明显元词写进 voiceContract.oneLine
  for (const n of npcSpecs) {
    const one = n.voiceContract?.oneLine ?? "";
    if (/变量名|budget|cooldown|prompt|JSON/i.test(one)) {
      push(issues, "warning", "npc.voiceContract.metaLeak", "voiceContract.oneLine 含元词（变量名/budget/cooldown/prompt/JSON），建议替换为自然措辞。", { kind: "npc", id: n.id });
    }
  }

  return { issues };
}

export function assertContentPacksValid(packs: readonly ContentPack[]): void {
  const { issues } = validateContentPacks(packs);
  const errors = issues.filter((x) => x.severity === "error");
  if (errors.length > 0) {
    const msg =
      "Content validation failed:\n" +
      errors
        .slice(0, 40)
        .map((e) => `- [${e.code}] ${e.message}${e.ref ? ` (${e.ref.kind}:${e.ref.id})` : ""}`)
        .join("\n");
    throw new Error(msg);
  }
}

