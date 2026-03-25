// src/lib/playRealtime/controlFastPath.ts
/**
 * 本地 deterministic 控制快判层（Fast Path）
 *
 * 设计目标：
 * - 把大量“明确、短、动作型”的输入从 LLM control preflight 中剔除，降低首包长尾与成本。
 * - 规则必须通用、克制、可维护：只在高置信场景命中；模糊输入宁可交给 LLM。
 * - 输出必须与 PlayerControlPlane 兼容，且不得写剧情正文。
 *
 * 注意：
 * - 该层不是安全系统；服务端已有 input moderation。这里仅提供“风险标签/约束提示”给主笔做收敛。
 * - 为避免误杀复杂输入，本层仅覆盖短输入 + 明确模式。
 */

import type { PlayerControlPlane, PlayerIntentKind, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

export type DeterministicControlFastPath =
  | { hit: true; control: PlayerControlPlane; reason: string }
  | { hit: false; reason: string };

function clampText(s: string, max: number): string {
  const clean = (s ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? clean.slice(0, max) : clean;
}

function basePlane(intent: PlayerIntentKind, confidence: number): PlayerControlPlane {
  return {
    intent,
    confidence: Math.max(0, Math.min(1, confidence)),
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: false,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
  };
}

function extractBetween(text: string, left: string, rightChoices: string[], maxLen: number): string | null {
  const idx = text.indexOf(left);
  if (idx < 0) return null;
  const start = idx + left.length;
  let end = -1;
  for (const r of rightChoices) {
    const j = text.indexOf(r, start);
    if (j >= 0) end = end === -1 ? j : Math.min(end, j);
  }
  const raw = (end >= 0 ? text.slice(start, end) : text.slice(start)).trim();
  const cleaned = clampText(raw, maxLen).replace(/[，。！？!?,.;:：\[\]【】"'“”]/g, "").trim();
  if (!cleaned) return null;
  return cleaned;
}

function detectRiskTags(input: string): { tags: string[]; level: "low" | "medium" | "high"; block: boolean; reason: string } {
  const t = input;
  // 极少量高置信词表，避免引入世界观语义与过度拦截。
  const high = [
    { re: /儿童色情|未成年色情|幼女|幼童色情/i, tag: "sexual" },
  ];
  for (const h of high) {
    if (h.re.test(t)) {
      return { tags: [h.tag], level: "high", block: true, reason: "explicit_illegal_content" };
    }
  }
  const medium: Array<{ re: RegExp; tag: string }> = [
    { re: /自杀|自残|割腕|跳楼|服毒/i, tag: "self_harm" },
    { re: /强奸|性侵|猥亵/i, tag: "sexual" },
    { re: /炸弹|爆炸物|枪支|制枪|制爆/i, tag: "violence" },
    { re: /毒品|冰毒|海洛因|可卡因/i, tag: "drugs" },
  ];
  const tags = medium.filter((m) => m.re.test(t)).map((m) => m.tag);
  if (tags.length > 0) return { tags: Array.from(new Set(tags)), level: "medium", block: false, reason: "keyword_risk" };
  return { tags: [], level: "low", block: false, reason: "" };
}

function shortActionGate(input: string): boolean {
  // 只对短、动作型输入命中：避免误判长复合叙述。
  const len = input.length;
  if (len === 0) return false;
  if (len > 48) return false;
  // 如果包含多句/复杂结构，也尽量交给 LLM。
  const multi = (input.match(/[。！？!?]/g) ?? []).length;
  if (multi >= 2) return false;
  return true;
}

export function runDeterministicControlFastPath(args: {
  latestUserInput: string;
  ruleSnapshot: PlayerRuleSnapshot;
  // Optional: a tiny hint extracted from player context digest (kept generic).
  locationHint?: string | null;
}): DeterministicControlFastPath {
  const raw = (args.latestUserInput ?? "").trim();
  if (!raw) return { hit: false, reason: "empty_input" };

  const input = clampText(raw, 200);
  if (!shortActionGate(input)) return { hit: false, reason: "not_short_action" };

  const risk = detectRiskTags(input);

  const norm = input.toLowerCase();

  // 1) 元操作 / 非剧情操作（短指令）
  if (
    /^(保存|读档|回档|设置|帮助|退出|重开|暂停|继续)$/.test(input) ||
    /(打开菜单|查看背包|查看任务|查看属性|静音|音量)/.test(input)
  ) {
    const c = basePlane("meta", 0.95);
    c.dm_hints = "用户为元操作/非剧情请求；请简短回应并引导继续行动。";
    c.risk_tags = risk.tags;
    c.risk_level = risk.level;
    if (risk.block) {
      c.block_dm = true;
      c.block_reason = risk.reason;
      c.dm_hints = "输入疑似高风险违规；主笔必须拒绝并给出安全替代建议。";
    }
    return { hit: true, control: c, reason: "meta_command" };
  }

  // 2) 明确道具使用（UI 常见形态：我使用了道具：【xx】）
  if (/^(我)?使用了道具[:：]/.test(input) || /^(我)?(使用|服用|喝下|喝|吃下|吃|装备|点燃|注射)/.test(input)) {
    // 仅在存在明显“对象”时命中，否则可能是“我使用方法…”的自然语言。
    const obj =
      extractBetween(input, "：", [], 24) ??
      extractBetween(input, "【", ["】"], 24) ??
      extractBetween(input, "「", ["」"], 24) ??
      extractBetween(input, "\"", ["\""], 24) ??
      extractBetween(input, "使用", ["，", "。", "！", "?", "？"], 24);
    if (obj && obj.length >= 1 && obj.length <= 24) {
      const c = basePlane("use_item", 0.92);
      c.extracted_slots.item_hint = obj;
      c.dm_hints = "用户明确使用道具；主笔按规则处理消耗/效果，避免过度铺陈。";
      c.risk_tags = risk.tags;
      c.risk_level = risk.level;
      if (risk.block) {
        c.block_dm = true;
        c.block_reason = risk.reason;
        c.dm_hints = "输入疑似高风险违规；主笔必须拒绝并给出安全替代建议。";
      }
      return { hit: true, control: c, reason: "use_item_explicit" };
    }
  }

  // 3) 明确对话
  if (
    /^(我)?对.+(说|问|喊|解释|回答|道歉|打招呼)/.test(input) ||
    /^(我)?(询问|请求|交谈|沟通)/.test(input)
  ) {
    const target =
      extractBetween(input, "对", ["说", "问", "喊", "解释", "回答", "道歉", "打招呼"], 18) ??
      extractBetween(input, "向", ["说", "问", "喊", "解释", "回答"], 18);
    const c = basePlane("dialogue", 0.9);
    if (target) c.extracted_slots.target = target;
    c.enhance_npc_emotion = true; // 对话回合更可能需要 NPC 情绪刻画（仍为提示，非强制）
    c.dm_hints = "用户明确对话；主笔优先推进对话与信息交换，保持选项清晰。";
    c.risk_tags = risk.tags;
    c.risk_level = risk.level;
    if (risk.block) {
      c.block_dm = true;
      c.block_reason = risk.reason;
      c.dm_hints = "输入疑似高风险违规；主笔必须拒绝并给出安全替代建议。";
    }
    return { hit: true, control: c, reason: "dialogue_explicit" };
  }

  // 4) 明确移动 / 探索（极短）
  if (/^(我)?(去|前往|走向|进入|回到|返回)/.test(input) || /^(探索|移动到)/.test(input)) {
    const loc =
      extractBetween(input, "去", ["，", "。", "！", "?", "？"], 22) ??
      extractBetween(input, "前往", ["，", "。", "！", "?", "？"], 22) ??
      extractBetween(input, "进入", ["，", "。", "！", "?", "？"], 22) ??
      extractBetween(input, "回到", ["，", "。", "！", "?", "？"], 22) ??
      extractBetween(input, "返回", ["，", "。", "！", "?", "？"], 22);
    const c = basePlane("explore", 0.9);
    if (loc) c.extracted_slots.location_hint = loc;
    else if (args.locationHint) c.extracted_slots.location_hint = String(args.locationHint).slice(0, 22);
    c.dm_hints = "用户明确移动/探索；主笔快速给出新场景信息与可选行动。";
    c.risk_tags = risk.tags;
    c.risk_level = risk.level;
    if (risk.block) {
      c.block_dm = true;
      c.block_reason = risk.reason;
      c.dm_hints = "输入疑似高风险违规；主笔必须拒绝并给出安全替代建议。";
    }
    return { hit: true, control: c, reason: "move_explore_explicit" };
  }

  // 5) 明确调查/观察（短指令）
  if (/^(查看|观察|调查|搜索|检查|翻找)/.test(input)) {
    const target = extractBetween(input, "", ["，", "。", "！", "?", "？"], 22);
    const c = basePlane("investigate", 0.86);
    if (target) c.extracted_slots.target = target.slice(0, 22);
    c.dm_hints = "用户明确调查/观察；主笔给出线索与下一步选项，避免长叙述。";
    c.risk_tags = risk.tags;
    c.risk_level = risk.level;
    if (risk.block) {
      c.block_dm = true;
      c.block_reason = risk.reason;
      c.dm_hints = "输入疑似高风险违规；主笔必须拒绝并给出安全替代建议。";
    }
    return { hit: true, control: c, reason: "investigate_explicit" };
  }

  // 6) 轻量风险词：即使意图不明，也可给出风险标签，但为避免误判，仍交给 LLM。
  if (risk.tags.length > 0) {
    return { hit: false, reason: "risk_keyword_but_ambiguous" };
  }

  // 模糊输入：交给 LLM
  if (args.ruleSnapshot.in_dialogue_hint || /对话/.test(norm)) return { hit: false, reason: "dialogue_hint_but_ambiguous" };
  if (args.ruleSnapshot.in_combat_hint || /战斗|攻击/.test(norm)) return { hit: false, reason: "combat_hint_but_ambiguous" };

  return { hit: false, reason: "no_high_confidence_rule" };
}

