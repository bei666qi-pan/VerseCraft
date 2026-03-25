import type { ModerationScene } from "@/lib/safety/policy/model";

export type GameplayActionWhitelistEntry = {
  verb: string;
  scenes: ModerationScene[];
  tags: string[];
};

/**
 * 玩法动作白名单：
 * - 目标：保护合法游戏动作表达（战术/撤离/封印/净化等）
 * - 非目标：放行违法/可模仿现实伤害步骤
 */
export const GAMEPLAY_ACTION_WHITELIST: GameplayActionWhitelistEntry[] = [
  { verb: "压制", scenes: ["threat_encounter", "private_story_action", "private_story_output"], tags: ["tactic"] },
  { verb: "净化", scenes: ["threat_encounter", "private_story_action", "private_story_output"], tags: ["tactic"] },
  { verb: "封印", scenes: ["threat_encounter", "private_story_action", "private_story_output"], tags: ["tactic"] },
  { verb: "诱导", scenes: ["threat_encounter", "private_story_action"], tags: ["tactic"] },
  { verb: "牵制", scenes: ["threat_encounter", "private_story_action"], tags: ["tactic"] },
  { verb: "撤离", scenes: ["threat_encounter", "private_story_action", "b1_safe_zone"], tags: ["escape"] },
  { verb: "切断水源", scenes: ["threat_encounter", "private_story_action"], tags: ["environment"] },
  { verb: "打开安全窗口", scenes: ["b1_safe_zone", "private_story_action"], tags: ["safety"] },
];

export function matchGameplayActionWhitelist(args: { text: string; scene: ModerationScene }): string[] {
  const t = args.text;
  if (!t) return [];
  const matches: string[] = [];
  for (const e of GAMEPLAY_ACTION_WHITELIST) {
    if (!e.scenes.includes(args.scene)) continue;
    if (!t.includes(e.verb)) continue;
    matches.push(e.verb);
  }
  return matches;
}

