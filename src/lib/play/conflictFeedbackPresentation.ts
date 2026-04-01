// src/lib/play/conflictFeedbackPresentation.ts
// 冲突回合玩家反馈：纯函数、无裸分、无“战斗面板”术语；与 TurnEnvelope.conflict_outcome / combat_summary 对齐。

import type { ConflictOutcomeEnvelope } from "@/features/play/turnCommit/turnEnvelope";
import { outcomeToResultLayer } from "@/lib/combat/combatPresentation";
import type { CombatOutcomeTier, ConflictResultLayer } from "@/lib/combat/types";

export type ConflictSituationPole = "danger" | "contest" | "pressure" | "retreat";

export type ConflictFeedbackViewModel = {
  situationPole: ConflictSituationPole;
  /** 危险 / 可拼 / 可压 / 必撤 */
  situationLabel: string;
  /** 怪谈气质：态势旁白（一行） */
  situationWhisper: string;
  /** 机会窗 */
  opportunityLine: string;
  /** 代价预警 */
  costLine: string;
  /** 压制 / 逼退 / 互伤 / 撤离 / 失控 */
  resultTierLabel: string;
  /** 结果层级旁白 */
  resultTierWhisper: string;
  /** 叙事回声：清洗后的 summary，避免与上列重复时可为空 */
  narrativeEcho: string;
};

const OUTCOME_TIERS = new Set<string>([
  "crush",
  "overwhelm",
  "advantage",
  "edge",
  "stalemate",
  "pressured",
  "collapse",
  "mutual_harm",
  "mutual_damage",
  "withdraw",
  "forced_retreat",
]);

const RESULT_LAYERS = new Set<string>([
  "suppress_success",
  "narrow_pushback",
  "mutual_bruise",
  "forced_withdraw",
  "runaway_collapse",
]);

function clip(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function parseOutcomeTier(raw?: string): CombatOutcomeTier | null {
  const v = raw?.trim();
  if (!v || !OUTCOME_TIERS.has(v)) return null;
  return v as CombatOutcomeTier;
}

function parseResultLayer(raw?: string): ConflictResultLayer | null {
  const v = raw?.trim();
  if (!v || !RESULT_LAYERS.has(v)) return null;
  return v as ConflictResultLayer;
}

function resolveResultLayer(env: ConflictOutcomeEnvelope, tier: CombatOutcomeTier | null): ConflictResultLayer | null {
  const direct = parseResultLayer(env.resultLayer);
  if (direct) return direct;
  if (tier) return outcomeToResultLayer(tier);
  return null;
}

function resultTierDisplay(layer: ConflictResultLayer | null, tier: CombatOutcomeTier | null): { label: string; whisper: string } {
  if (layer === "suppress_success") {
    return { label: "压制", whisper: "你暂时把对方的牙口按住了——别误以为这就是结局。" };
  }
  if (layer === "narrow_pushback") {
    return { label: "逼退", whisper: "距离被拉开一寸，但回声还在你耳后。" };
  }
  if (layer === "mutual_bruise") {
    return { label: "互伤", whisper: "谁都没占到便宜，只留下潮湿的疼痛与怀疑。" };
  }
  if (layer === "forced_withdraw") {
    return { label: "撤离", whisper: "你先退一步，不是认输，是把命从刀刃边挪开。" };
  }
  if (layer === "runaway_collapse") {
    return { label: "失控", whisper: "规则在那一瞬裂开，像灯管里爬出别的东西。" };
  }
  // 仅有 tier、无 layer
  if (tier === "withdraw") return { label: "撤离", whisper: "你抓住了一个不该存在的空档，转身。" };
  if (tier === "forced_retreat") return { label: "逼退", whisper: "你被推着离开原来的位置，像被风换了一格。" };
  return { label: "互伤", whisper: "这一下还没在尘土里显形——像两个人同时错半步，谁都没站稳。" };
}

function inferSituation(
  layer: ConflictResultLayer | null,
  tier: CombatOutcomeTier | null,
  cost: ConflictOutcomeEnvelope["likelyCost"]
): { pole: ConflictSituationPole; label: string; whisper: string } {
  if (layer === "runaway_collapse" || tier === "collapse" || tier === "crush") {
    return { pole: "danger", label: "危险", whisper: "空气变稠了：再硬顶，会像在湿墙里拔出手。" };
  }
  if (layer === "forced_withdraw" || tier === "pressured") {
    return { pole: "danger", label: "危险", whisper: "你在下风位——每一次呼吸都像在借债。" };
  }
  if (tier === "withdraw" || tier === "forced_retreat") {
    return { pole: "retreat", label: "必撤", whisper: "此刻最聪明的不是赢，是把自己完整地搬走。" };
  }
  if (layer === "narrow_pushback") {
    return { pole: "retreat", label: "必撤", whisper: "再拖半句，窗口会反过来咬住脚踝。" };
  }
  if (layer === "mutual_bruise" || tier === "stalemate" || tier === "mutual_harm" || tier === "mutual_damage") {
    return { pole: "contest", label: "可拼", whisper: "局势像卡住的电梯：还能争一步，但每一步都带响。" };
  }
  if (layer === "suppress_success" || tier === "overwhelm" || tier === "advantage" || tier === "edge") {
    if (cost === "heavy") {
      return { pole: "contest", label: "可拼", whisper: "你看似占先，代价却已经在暗处抬头。" };
    }
    return { pole: "pressure", label: "可压", whisper: "你手里还有半步先手——别把它浪费在嘴上。" };
  }
  if (cost === "heavy" || cost === "moderate") {
    return { pole: "danger", label: "危险", whisper: "胜负未分，账单已经开始写你的名字。" };
  }
  return { pole: "contest", label: "可拼", whisper: "像雾里的脚步声：听得见，却还没贴脸。" };
}

function opportunityLineFor(layer: ConflictResultLayer | null, tier: CombatOutcomeTier | null): string {
  if (tier === "withdraw" || tier === "forced_retreat") {
    return "机会窗：门缝那一瞬的松动——只够你侧身，不够你炫耀。";
  }
  if (layer === "runaway_collapse" || tier === "collapse" || tier === "crush") {
    return "机会窗：几乎闭合。若还看见缝，多半是它在看你。";
  }
  if (tier === "edge" || tier === "stalemate") {
    return "机会窗：窄得像指甲刮过墙灰——只够换一次手。";
  }
  if (tier === "advantage" || tier === "overwhelm" || layer === "suppress_success") {
    return "机会窗：还在，但有人在数你的节拍；快一步是压制，慢一步是笑话。";
  }
  if (tier === "pressured" || layer === "forced_withdraw") {
    return "机会窗：碎。若要反打，先找掩体与退路，再找面子。";
  }
  return "机会窗：像灯闪——你以为看清了，其实只是黑暗眨了下眼。";
}

function costLineFor(
  cost: ConflictOutcomeEnvelope["likelyCost"],
  sanityDamage: number,
  relationUpdateCount: number
): string {
  const parts: string[] = [];
  if (sanityDamage > 0) {
    parts.push("理智像被潮气渗入墙皮，留下一圈洗不掉的印子");
  }
  if (cost === "heavy") {
    parts.push("身上会留痕：疼是小事，麻烦是有人记住你的气味");
  } else if (cost === "moderate") {
    parts.push("皮肉与神经至少一处要付利息");
  } else if (cost === "light") {
    parts.push("代价更像淤青与心悸，暂时还不会惊动远处");
  } else if (cost === "none") {
    parts.push("表面几乎无伤，但别把这种安静当真");
  } else {
    parts.push("代价还在雾里，别在走廊里大声问价");
  }
  if (relationUpdateCount > 0) {
    parts.push("关系账本被悄悄翻了一页，有人以后会用另一种眼神结账");
  }
  if (cost === "heavy" || sanityDamage >= 3) {
    parts.push("动静太大时，隔墙会有耳朵醒来");
  }
  return `代价预警：${parts.slice(0, 3).join("；")}。`;
}

function suggestedWhisper(raw?: string): string {
  const s = clip(raw ?? "", 140);
  return s;
}

export function envelopeIsConflictSignificant(env: ConflictOutcomeEnvelope | null): env is ConflictOutcomeEnvelope {
  if (!env) return false;
  return Boolean(
    env.outcomeTier?.trim() ||
      env.resultLayer?.trim() ||
      env.summary?.trim() ||
      env.suggestedDirection?.trim()
  );
}

export type ConflictFeedbackBuildInput = {
  envelope: ConflictOutcomeEnvelope | null;
  /** 本回合理智损伤（DM 数值仅用于映射文案档位，不展示数字） */
  sanityDamage?: number;
  /** relationship_updates 条数，用于关系代价提示 */
  relationUpdateCount?: number;
};

/**
 * 从统一信封 + 轻量回合信号生成玩家反馈。
 * 无显著冲突时返回 null（前端不渲染，避免每回合打断）。
 */
export function buildConflictFeedbackViewModel(input: ConflictFeedbackBuildInput): ConflictFeedbackViewModel | null {
  const env = input.envelope;
  if (!envelopeIsConflictSignificant(env)) return null;

  const tier = parseOutcomeTier(env.outcomeTier);
  const layer = resolveResultLayer(env, tier);
  const { label: resultTierLabel, whisper: resultTierWhisper } = resultTierDisplay(layer, tier);
  const sit = inferSituation(layer, tier, env.likelyCost ?? "unknown");
  const opportunityLine = opportunityLineFor(layer, tier);
  const costLine = costLineFor(env.likelyCost ?? "unknown", Math.max(0, Math.trunc(input.sanityDamage ?? 0)), Math.max(0, Math.trunc(input.relationUpdateCount ?? 0)));

  let narrativeEcho = clip(env.summary ?? "", 160);
  const sug = suggestedWhisper(env.suggestedDirection);
  if (sug && (!narrativeEcho || !narrativeEcho.includes(sug.slice(0, 12)))) {
    narrativeEcho = narrativeEcho ? `${narrativeEcho} ${sug}` : sug;
    narrativeEcho = clip(narrativeEcho, 200);
  }

  return {
    situationPole: sit.pole,
    situationLabel: sit.label,
    situationWhisper: sit.whisper,
    opportunityLine,
    costLine,
    resultTierLabel,
    resultTierWhisper,
    narrativeEcho: clip(narrativeEcho, 200),
  };
}
