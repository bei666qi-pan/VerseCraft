import { getEndingOutcomeTitle } from "./summary";
import type {
  EndingFinalChoice,
  EndingFinalChoiceId,
  EndingFinalePayload,
  EndingOutcome,
} from "./types";

export const ENDING_SETTLEMENT_OPTIONS = ["查看结算", "导出本局写作稿", "回看全文"] as const;
export const ENDING_FINALE_SYSTEM_PROMPT_TAG = "【系统强制干预：本局终局最终叙事】";

export type EndingSettlementOption = (typeof ENDING_SETTLEMENT_OPTIONS)[number];

export interface BuildEndingFinalChoicesInput {
  outcome: EndingOutcome;
}

export interface BuildEndingFinalNarrativePromptInput {
  outcome: EndingOutcome;
  choice: EndingFinalChoice;
  keyChoices: string[];
  obtainedClues: string[];
  worldStateLines: string[];
  lastNarrative?: string | null;
}

export interface BuildLocalEndingFinaleFallbackInput extends BuildEndingFinalNarrativePromptInput {
  source?: "fallback";
}

const CHOICE_LIBRARY: Record<EndingFinalChoiceId, Omit<EndingFinalChoice, "selectedAt">> = {
  true_door: {
    id: "true_door",
    label: "推开真正的门",
    description: "确认所有线索，把最后的门当作真实出口。",
    outcome: "true_escape",
  },
  leave_with_npc: {
    id: "leave_with_npc",
    label: "带着重要 NPC 离开",
    description: "把一个仍被公寓牵住的人也带出这条规则。",
    outcome: "costly_escape",
  },
  leave_alone: {
    id: "leave_alone",
    label: "独自穿过出口",
    description: "保留最后的清醒，独自承担出口后的沉默。",
    outcome: "costly_escape",
  },
  mirror_exit: {
    id: "mirror_exit",
    label: "相信镜中的出口",
    description: "选择看似温柔、却未必真实的另一扇门。",
    outcome: "false_escape",
  },
  embrace_doom: {
    id: "embrace_doom",
    label: "迎接终焉",
    description: "不再寻找退路，直面第十日落下的规则。",
    outcome: "doom",
  },
};

function uniq(values: readonly string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const text = String(raw ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text.slice(0, 120));
    if (out.length >= cap) break;
  }
  return out;
}

function makeChoice(id: EndingFinalChoiceId, outcome: EndingOutcome): EndingFinalChoice {
  const base = CHOICE_LIBRARY[id];
  return {
    ...base,
    outcome,
    selectedAt: "",
  };
}

export function buildEndingFinalChoices(input: BuildEndingFinalChoicesInput): EndingFinalChoice[] {
  switch (input.outcome) {
    case "true_escape":
      return [
        makeChoice("true_door", "true_escape"),
        makeChoice("leave_with_npc", "true_escape"),
        makeChoice("leave_alone", "true_escape"),
      ];
    case "costly_escape":
      return [
        makeChoice("leave_with_npc", "costly_escape"),
        makeChoice("leave_alone", "costly_escape"),
        makeChoice("true_door", "costly_escape"),
      ];
    case "false_escape":
      return [
        makeChoice("mirror_exit", "false_escape"),
        makeChoice("leave_alone", "false_escape"),
        makeChoice("embrace_doom", "false_escape"),
      ];
    case "doom":
    case "abandon":
      return [
        makeChoice("embrace_doom", input.outcome === "abandon" ? "abandon" : "doom"),
        makeChoice("mirror_exit", input.outcome),
      ];
    case "death":
    default:
      return [];
  }
}

export function stampEndingFinalChoice(choice: EndingFinalChoice, selectedAt = new Date().toISOString()): EndingFinalChoice {
  return { ...choice, selectedAt };
}

export function buildEndingFinalNarrativePrompt(input: BuildEndingFinalNarrativePromptInput): string {
  const recalled = uniq([...input.keyChoices, ...input.obtainedClues], 8);
  const worldLines = uniq(input.worldStateLines, 8);
  return [
    ENDING_FINALE_SYSTEM_PROMPT_TAG,
    "你正在为 VerseCraft 生成本局最终叙事，不是普通回合。",
    "请严格以 JSON 格式输出，不要输出 JSON 以外的任何文本。",
    "",
    "DM JSON 必须包含这些基础字段：",
    "- is_action_legal=true",
    "- sanity_damage=0",
    "- is_death=false",
    "- consumes_time=false",
    "- turn_mode=\"system_transition\"",
    "- narrative 必须与 ending_finale.narrative 相同",
    "- options 只能是 [\"查看结算\",\"导出本局写作稿\",\"回看全文\"]",
    "- new_tasks/task_updates/awarded_items/awarded_warehouse_items/currency_change 必须为空或 0",
    "",
    "必须额外包含 ending_finale 字段：",
    "{ \"outcome\": 结局 outcome, \"narrative\": 600到1000字最终叙事, \"recalled\": 至少2个回收的选择或线索, \"options\": [\"查看结算\",\"导出本局写作稿\",\"回看全文\"] }",
    "",
    `结局 outcome：${input.outcome}（${getEndingOutcomeTitle(input.outcome)}）`,
    `玩家最终选择：${input.choice.label}`,
    `选择含义：${input.choice.description}`,
    `可回收的关键选择/线索：${recalled.join("；") || "玩家一路抵达终局；最后一次行动本身"}`,
    `世界状态：${worldLines.join("；") || "公寓规则已经收束"}`,
    `上一段叙事摘要：${String(input.lastNarrative ?? "").slice(-600)}`,
    "",
    "写作要求：",
    "- 600到1000字，中文，冷峻、克制、明确收束。",
    "- 必须对应 outcome，不得把假逃离写成真逃离，不得把终焉写成逃脱。",
    "- 至少回收2个玩家关键选择或线索。",
    "- 不得新增普通任务，不得发放普通奖励，不得生成普通下一步行动选项。",
  ].join("\n");
}

function sentenceForOutcome(outcome: EndingOutcome): string {
  switch (outcome) {
    case "true_escape":
      return "真正的门没有发光，也没有替你解释胜利，它只是让公寓的声音在背后变轻。";
    case "costly_escape":
      return "出口承认了你，却没有完整归还你，某个名字、某段关系或某种清醒被留在门内。";
    case "false_escape":
      return "镜中的出口接住了你，也复写了你，门外的风像自由，影子却仍按公寓的节拍移动。";
    case "doom":
      return "第十日落下时，公寓不再伪装成建筑，它把所有走廊收成同一个句号。";
    case "death":
      return "死亡并没有把你带离公寓，只是让规则合上手掌，把本局的声音压低。";
    case "abandon":
    default:
      return "故事在这里中止，未被选择的门仍然留在暗处，等待另一条时间线醒来。";
  }
}

function padToFinaleLength(base: string, outcome: EndingOutcome, recalled: string[]): string {
  const motifs = recalled.length > 0 ? recalled : ["最后一次选择", "被记录的线索"];
  let text = base.trim();
  let index = 0;
  while (text.length < 620) {
    const motif = motifs[index % motifs.length] ?? "线索";
    text += `\n\n${sentenceForOutcome(outcome)}你想起“${motif}”并不是提示，而是一枚钉子：它把你曾经做过的判断固定在此刻，让终局不再像偶然。`;
    index += 1;
  }
  return text.length > 1000 ? text.slice(0, 990) + "。" : text;
}

export function buildLocalEndingFinaleFallback(input: BuildLocalEndingFinaleFallbackInput): EndingFinalePayload {
  const recalled = uniq([...input.keyChoices, ...input.obtainedClues], 8);
  while (recalled.length < 2) {
    recalled.push(recalled.length === 0 ? input.choice.label : getEndingOutcomeTitle(input.outcome));
  }
  const worldLines = uniq(input.worldStateLines, 4);
  const base = [
    `${input.choice.label}以后，时间像被人从背后按住。`,
    sentenceForOutcome(input.outcome),
    `你回头整理自己一路留下的痕迹：${recalled.slice(0, 2).map((x) => `“${x}”`).join("、")}没有消失，它们在终局里重新变得清楚。`,
    worldLines.length > 0 ? `此刻的世界只剩几条硬边：${worldLines.join("；")}。` : "此刻的世界只剩下门、呼吸，以及无法再拖延的回答。",
    "公寓没有为你鼓掌，也没有给出新的任务。它只是让那些被你碰过的人、被你读过的字、被你冒险确认过的异常，依次退到灯光之外。你终于明白，所谓结局不是系统替你盖下的印章，而是所有选择同时回望你的瞬间。",
    "于是本局在这里收束。没有新的奖励，没有下一条普通行动，只有可以被回看的全文、可以被导出的写作稿，以及一份不会随刷新改变的结算记录。",
  ].join("\n\n");
  return {
    outcome: input.outcome,
    narrative: padToFinaleLength(base, input.outcome, recalled),
    recalled: recalled.slice(0, 8),
    options: [...ENDING_SETTLEMENT_OPTIONS],
    source: "fallback",
  };
}

export function normalizeEndingFinalePayload(raw: unknown, fallback: BuildLocalEndingFinaleFallbackInput): EndingFinalePayload {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!record) return buildLocalEndingFinaleFallback(fallback);
  const narrative = typeof record.narrative === "string" ? record.narrative.trim() : "";
  const outcome = record.outcome === fallback.outcome ? fallback.outcome : fallback.outcome;
  const recalled = uniq(Array.isArray(record.recalled) ? record.recalled.map(String) : [], 8);
  const hasValidOptions =
    Array.isArray(record.options) &&
    ENDING_SETTLEMENT_OPTIONS.every((option) => (record.options as unknown[]).includes(option));
  if (narrative.length < 400 || recalled.length < 2 || !hasValidOptions) {
    return buildLocalEndingFinaleFallback(fallback);
  }
  return {
    outcome,
    narrative: narrative.length > 1000 ? narrative.slice(0, 990) + "。" : padToFinaleLength(narrative, outcome, recalled),
    recalled,
    options: [...ENDING_SETTLEMENT_OPTIONS],
    source: "ai",
  };
}
