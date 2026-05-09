import {
  PLAYER_ECHO_HARD_CAP_CHARS,
  PLAYER_ECHO_MAX_PACKET_CHARS,
} from "./constants";
import type { NpcFirstEncounterEchoPlan, SelectedEchoFragment } from "./types";

function clampText(value: string, maxChars: number): string {
  const s = String(value ?? "").trim().replace(/\s+/g, " ");
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}

function targetLabel(fragment: SelectedEchoFragment): string {
  if (fragment.npcId) return fragment.npcId;
  if (fragment.targetId) return fragment.targetId;
  return fragment.targetType;
}

function planIntensity(plan: NpcFirstEncounterEchoPlan): string {
  return plan.intensity ?? plan.strength;
}

function buildLines(selection: SelectedEchoFragment[], plan: NpcFirstEncounterEchoPlan | null | undefined): string[] {
  const hasSelection = Array.isArray(selection) && selection.some((fragment) => clampText(fragment.summary, 56));
  const hasFirstEncounterPlan = Boolean(plan && planIntensity(plan) !== "none" && (plan.activeNpcId || plan.npcId));
  if (!hasSelection && !hasFirstEncounterPlan) return [];

  const lines = [
    "【player_echo_canon_packet】",
    "规则：不得覆盖当前周目事实；不得让普通 NPC 明确认得玩家；残响只可自然表现，不必强写。",
    "首次影响按 intensity 克制执行；微弱残响只能写停顿、目光或一句岔开的对白，不写成旧友相认。",
  ];

  for (const fragment of selection.slice(0, 3)) {
    const summary = clampText(fragment.summary, 56);
    if (!summary) continue;
    lines.push(`- ${targetLabel(fragment)}：${summary}`);
  }

  if (plan && planIntensity(plan) !== "none") {
    const npcId = plan.activeNpcId ?? plan.npcId ?? "npc";
    const forms = plan.allowedForms.slice(0, 4).join("/");
    const bans = plan.forbiddenClaims.slice(0, 4).join("/");
    const style = plan.styleHint ? `；style=${plan.styleHint}` : "";
    lines.push(`首见：${npcId} intensity=${planIntensity(plan)}${style}${forms ? `；forms=${forms}` : ""}`);
    if (bans) lines.push(`禁称：${bans}`);
  }

  return lines;
}

export function buildPlayerEchoPromptBlock(
  selection: SelectedEchoFragment[],
  plan?: NpcFirstEncounterEchoPlan | null,
  opts?: { maxChars?: number }
): string {
  const lines = buildLines(selection, plan);
  if (lines.length === 0) return "";

  const maxChars = Math.max(
    160,
    Math.min(PLAYER_ECHO_HARD_CAP_CHARS, opts?.maxChars ?? PLAYER_ECHO_MAX_PACKET_CHARS)
  );
  while (lines.length > 2 && `${lines.join("\n")}\n`.length > maxChars) {
    lines.splice(lines.length - 1, 1);
  }
  const text = `${lines.join("\n")}\n`;
  return text.length <= PLAYER_ECHO_HARD_CAP_CHARS ? text : `${text.slice(0, PLAYER_ECHO_HARD_CAP_CHARS - 1)}\n`;
}
