import type { NpcContentSpec, TaskContentSpec } from "./types";
import { clampText } from "./naming";

export function compileNpcRuntimePromptBlock(args: { spec: NpcContentSpec; maxChars?: number }): string {
  const maxChars = Math.max(60, Math.min(260, args.maxChars ?? 160));
  const n = args.spec;
  const lines: string[] = [];
  lines.push(`NPC[${n.id}|${n.identity.displayName}]`);
  if (n.voiceContract?.oneLine) lines.push(`声线：${n.voiceContract.oneLine}`);
  lines.push(`禁区：${n.interaction.tabooBoundary}`);
  if (n.roles?.escapeRole) lines.push(`出口角色位：${n.roles.escapeRole}`);
  return clampText(lines.join("；"), maxChars);
}

export function compileTaskRuntimePromptBlock(args: { spec: TaskContentSpec; maxChars?: number }): string {
  const maxChars = Math.max(60, Math.min(260, args.maxChars ?? 160));
  const t = args.spec;
  const bits: string[] = [];
  bits.push(`任务[${t.core.title}]`);
  if (t.dramatic?.urgencyReason) bits.push(`紧迫：${t.dramatic.urgencyReason}`);
  if (t.dramatic?.riskNote) bits.push(`风险：${t.dramatic.riskNote}`);
  if (t.dramatic?.issuerIntent) bits.push(`委托动机：${t.dramatic.issuerIntent}`);
  return clampText(bits.join("；"), maxChars);
}

