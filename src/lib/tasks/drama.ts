import { inferEffectiveNarrativeLayer } from "@/lib/tasks/taskRoleModel";
import type { GameTaskV2 } from "./taskV2";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export function buildTaskDramaPacket(args: {
  tasks: GameTaskV2[];
  preferredTaskIds?: string[];
  maxTasks?: number;
  maxChars?: number;
}): string {
  const maxTasks = Math.max(0, Math.min(2, args.maxTasks ?? 2));
  const maxChars = Math.max(120, Math.min(700, args.maxChars ?? 360));
  if (maxTasks === 0) return "";
  const byId = new Map(args.tasks.map((t) => [t.id, t]));
  const picked: GameTaskV2[] = [];
  for (const id of args.preferredTaskIds ?? []) {
    const t = byId.get(id);
    if (t) picked.push(t);
    if (picked.length >= maxTasks) break;
  }
  if (picked.length < maxTasks) {
    for (const t of args.tasks) {
      if (picked.some((x) => x.id === t.id)) continue;
      if (t.status !== "active" && t.status !== "available") continue;
      picked.push(t);
      if (picked.length >= maxTasks) break;
    }
  }
  if (picked.length === 0) return "";
  const lines: string[] = [];
  lines.push("## 【任务戏剧约束（只供写作，不要像系统提示）】");
  for (const t of picked) {
    const hook = clamp(t.playerHook ?? t.nextHint ?? "", 60);
    const urgency = clamp(t.urgencyReason ?? "", 60);
    const risk = clamp(t.riskNote ?? t.taboo ?? "", 60);
    const intent = clamp(t.issuerIntent ?? "", 70);
    const residue = clamp(t.residueOnFail ?? t.residueOnComplete ?? "", 70);
    const dt = t.dramaticType ? `类型=${t.dramaticType}` : "";
    const layer = inferEffectiveNarrativeLayer(t);
    const layerCn =
      layer === "soft_lead" ? "暗示线" : layer === "conversation_promise" ? "人情约定" : "正式追踪";
    const persona = t.issuerPersonaMode ? `人格模=${t.issuerPersonaMode}` : "";
    const softReveal = t.issuerSoftRevealMode ? `揭露口=${t.issuerSoftRevealMode}` : "";
    lines.push(`${t.issuerName}委托《${t.title}》${dt}[${layerCn}]${persona ? ` ${persona}` : ""}${softReveal ? ` ${softReveal}` : ""}`.trim());
    const bits = [
      intent ? `动机：${intent}` : "",
      hook ? `钩子：${hook}` : "",
      urgency ? `压力：${urgency}` : "",
      risk ? `代价/禁区：${risk}` : "",
      residue ? `残响：${residue}` : "",
      typeof t.revealValue === "number" ? `过程揭露权重=${t.revealValue.toFixed(2)}` : "",
    ].filter(Boolean);
    if (bits.length > 0) lines.push(bits.join("；"));
  }
  return clamp(lines.join("\n"), maxChars);
}

