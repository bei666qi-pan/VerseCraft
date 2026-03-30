import type { NpcHeartRuntimeView } from "./types";

function clamp(s: string, maxChars: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

export function buildNpcHeartPromptBlock(input: {
  views: NpcHeartRuntimeView[];
  maxChars?: number;
}): string {
  const maxChars = Math.max(120, Math.min(900, input.maxChars ?? 520));
  const views = (input.views ?? []).slice(0, 5);
  if (views.length === 0) return "";
  const lines: string[] = [];
  lines.push("## 【NPC心脏·行为锚（写作用，勿念设定）】");
  const anyMajor = views.some((v) => v.profile.charmTier === "major_charm");
  if (anyMajor) {
    lines.push(
      "【高魅力禁同质化】禁止六人揉成「温柔神秘解说」或「嘴毒高冷」统一模板；每人只服从下行锚点。"
    );
  }
  for (const v of views) {
    const p = v.profile;
    const h = v.behavioralHints;
    const star = p.charmTier === "major_charm" ? "★" : "·";
    lines.push(
      `${star}${p.npcId}（${p.displayName}）态=${v.attitudeLabel}｜索：${clamp(v.whatNpcWantsFromPlayerNow, 52)}`
    );
    lines.push(
      `  口=${clamp(h.speakThisRound, 92)}｜推拉=${clamp(h.pushPullThisRound, 72)}｜破绽=${clamp(h.likelySlip, 48)}`
    );
    lines.push(`  禁=${clamp(h.forbiddenCaricature, 68)}｜密=${clamp(h.compactBehaviorLine, 100)}`);
    if (v.baselineMerged) {
      const b = v.baselineMerged;
      lines.push(
        `  基=${clamp(b.effectiveViewOfPlayer, 20)}｜熟=${b.canExpressFamiliarity ? "可" : "否"}｜称=${clamp(b.playerAddressCue ?? "", 36)}｜行=${clamp(b.playerInteractionStanceCue ?? "", 36)}｜提=${clamp(b.compactNarrativeHint, 44)}`
      );
    }
    if (v.peerRelationalCues) {
      lines.push(`  伴=${clamp(v.peerRelationalCues, 100)}`);
    }
    // 新手双主轴提示：仅作“写作锚”，不替代任务板、不当解说台词
    if (p.npcId === "N-008") {
      lines.push(`  新手轴=生存教官｜要点：工具/退路/电/别逞能（用骂人压住慌，给可执行半步）`);
    } else if (p.npcId === "N-015") {
      lines.push(`  新手轴=边界教官｜要点：秩序/越界代价/B1为何安全（先拦住越线冲动，再给规则半句）`);
    }
  }
  const text = lines.join("\n");
  return clamp(text, maxChars);
}

export function buildNpcProactiveGrantStyleHints(view: NpcHeartRuntimeView | null): string {
  if (!view) return "";
  const p = view.profile;
  const sc = p.personalityScenarios;
  const base = `${clamp(sc.demandStyle, 56)}；${clamp(sc.probeStyle, 44)}`;
  if (p.taskStyle === "transactional") {
    return `${base}；先开价留后路。`;
  }
  if (p.taskStyle === "manipulative") {
    return `${base}；示弱后把风险推给玩家。`;
  }
  if (p.taskStyle === "avoidant") {
    return `${base}；催进度但含糊关键。`;
  }
  if (p.taskStyle === "protective") {
    return `${base}；先边界再委托。`;
  }
  return `${base}；事务口吻引委托。`;
}
