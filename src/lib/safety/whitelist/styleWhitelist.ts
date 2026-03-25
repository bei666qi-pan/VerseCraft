import type { ModerationScene } from "@/lib/safety/policy/model";

/**
 * 叙事风格白名单（不是“词=放行”，而是“允许这些氛围特征存在，不因此加重风险”）
 * - 目标：允许悬疑/压迫/低语/吞噬感等氛围词
 * - 非目标：放行露骨、可模仿现实伤害细节
 */
const STYLE_TONE_TERMS = [
  "低语",
  "压迫",
  "不安",
  "吞噬",
  "阴影",
  "窒息感",
  "寒意",
  "回声",
  "凝视",
  "怪谈",
  "诡异",
  "异响",
  "黑暗",
];

export function matchStyleToneHints(args: { text: string; scene: ModerationScene }): string[] {
  // Style tone only matters for narrative scenes; ignore in account/report contexts.
  const narrativeScenes: ModerationScene[] = [
    "private_story_action",
    "private_story_output",
    "npc_dialogue",
    "threat_encounter",
    "b1_safe_zone",
    "task_text",
    "codex_text",
  ];
  if (!narrativeScenes.includes(args.scene)) return [];

  const t = args.text;
  if (!t) return [];
  const hits: string[] = [];
  for (const term of STYLE_TONE_TERMS) {
    if (t.includes(term)) hits.push(term);
  }
  return hits;
}

