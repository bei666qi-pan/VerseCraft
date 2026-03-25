import type { ModerationScene, SafetyRuntimeContext } from "@/lib/safety/policy/model";

export type WorldviewWhitelistEntry = {
  term: string;
  /**
   * Scenes where this term is expected/allowed to appear.
   * Not a bypass: only reduces false positive weight in those contexts.
   */
  scenes: ModerationScene[];
  /**
   * Optional: require B1 safe zone / non-B1, etc.
   */
  require?: {
    isB1SafeZone?: boolean;
    floorIdPrefix?: string; // e.g. "B1" | "1F" | "7F"
  };
  tags: string[];
};

/**
 * VerseCraft 世界观白名单：
 * - 目标：减少“怪谈氛围词”被误杀
 * - 非目标：绕过法律红线/违法细节
 */
export const WORLDVIEW_WHITELIST: WorldviewWhitelistEntry[] = [
  { term: "夜读老人", scenes: ["npc_dialogue", "private_story_output", "b1_safe_zone"], tags: ["npc", "lore"] },
  { term: "深渊守门人", scenes: ["threat_encounter", "private_story_output", "codex_text"], tags: ["threat", "lore"] },
  { term: "原石", scenes: ["task_text", "codex_text", "private_story_output"], tags: ["economy", "lore"] },
  { term: "锚点", scenes: ["task_text", "codex_text", "private_story_output", "b1_safe_zone"], tags: ["mechanic", "lore"] },
  { term: "红色自来水", scenes: ["threat_encounter", "private_story_output", "codex_text"], tags: ["omen", "lore"] },
  { term: "龙胃", scenes: ["codex_text", "private_story_output", "threat_encounter"], tags: ["place", "lore"] },
  { term: "消化", scenes: ["codex_text", "private_story_output", "task_text"], tags: ["mechanic", "lore"] },
  { term: "未消化层", scenes: ["codex_text", "private_story_output", "threat_encounter"], tags: ["place", "lore"] },
  { term: "屠夫", scenes: ["threat_encounter", "private_story_output", "codex_text"], tags: ["threat", "lore"] },
  { term: "腐蚀", scenes: ["threat_encounter", "private_story_output", "codex_text"], tags: ["effect", "lore"] },
  { term: "暗月", scenes: ["private_story_output", "codex_text"], tags: ["omen", "lore"] },
  { term: "终焉", scenes: ["private_story_output", "codex_text"], tags: ["omen", "lore"] },
];

export function matchWorldviewWhitelist(args: {
  text: string;
  scene: ModerationScene;
  runtimeContext?: SafetyRuntimeContext;
}): string[] {
  const t = args.text;
  if (!t) return [];
  const matches: string[] = [];
  for (const e of WORLDVIEW_WHITELIST) {
    if (!e.scenes.includes(args.scene)) continue;
    if (!t.includes(e.term)) continue;

    const req = e.require;
    if (req?.isB1SafeZone != null && Boolean(args.runtimeContext?.isB1SafeZone) !== req.isB1SafeZone) continue;
    if (req?.floorIdPrefix) {
      const floorId = String(args.runtimeContext?.floorId ?? "");
      if (!floorId.startsWith(req.floorIdPrefix)) continue;
    }
    matches.push(e.term);
  }
  return matches;
}

