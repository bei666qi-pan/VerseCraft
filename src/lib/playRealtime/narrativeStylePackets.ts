type ContinuityFocus = "continuity" | "dialogue" | "investigate" | "combat" | "explore" | "meta" | "unknown";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function inferContinuityFocus(rawAction: string): ContinuityFocus {
  const s = String(rawAction ?? "").trim();
  if (!s) return "unknown";
  const t = s.replace(/\s+/g, "");
  if (/^(保存|读档|回档|设置|帮助|退出|重开|暂停|继续)$/.test(t) || /(背包|任务|属性|菜单|静音|音量)/.test(t)) {
    return "meta";
  }
  if (/^(我)?对.+(说|问|喊|解释|回答|道歉|打招呼)/.test(t) || /^(我)?(询问|请求|交谈|沟通)/.test(t)) {
    return "dialogue";
  }
  if (/^(查看|观察|调查|搜索|检查|翻找)/.test(t)) return "investigate";
  if (/(攻击|砍|刺|射击|开火|格挡|闪避|躲开|反击)/.test(t)) return "combat";
  if (/^(我)?(去|前往|走向|进入|回到|返回)/.test(t) || /^(探索|移动到)/.test(t)) return "explore";
  return "continuity";
}

function diceBand(dice: number | null): "great" | "good" | "mixed" | "bad" | "awful" | "unknown" {
  if (!dice || !Number.isFinite(dice)) return "unknown";
  const d = Math.max(1, Math.min(100, Math.trunc(dice)));
  if (d <= 10) return "great";
  if (d <= 35) return "good";
  if (d <= 70) return "mixed";
  if (d <= 90) return "bad";
  return "awful";
}

export function buildNarrativeContinuityPacketBlock(args: {
  previousTail: string | null;
  rawAction: string | null;
  dice: number | null;
  maxChars?: number;
}): string {
  const focus = inferContinuityFocus(args.rawAction ?? "");
  const packet = {
    schema: "narrative_continuity_v1",
    previous_tail_summary: clamp(args.previousTail ?? "", 140),
    continuity_focus: focus,
    action_absorption_rule:
      "把玩家输入当作本段落中已经发生/正在发生的一瞬间，写‘后果+反应+阻力+微细节’，禁止先复述动作再给结果。",
    repetition_forbidden_patterns: [
      "玩家输入",
      "用户输入",
      "写作要求",
      "系统暗骰",
      "你刚才",
      "你做了",
      "你试图",
      "翻译",
      "总结",
      "解释",
      "作为系统",
      "作为AI",
      "客服",
    ],
    allowed_action_merge_styles: [
      "后果先行：先写触感/视线/停顿/对方反应，再在同句或下一句把动作融进去",
      "交错展开：动作片段与即时反馈交错，不要一口气把动作讲完",
      "对白落地：用中文引号写对白，不用“玩家说/你说”标签",
    ],
    dice_bias: diceBand(args.dice ?? null),
    meta_guard:
      "narrative 只输出小说正文，禁止解释机制、禁止复述玩家输入原句或近义改写开头句。",
  };
  const text = `## 【narrative_continuity_packet】\n${JSON.stringify(packet)}`;
  const maxChars = Math.max(220, Math.min(1400, args.maxChars ?? 900));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

