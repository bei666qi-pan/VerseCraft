// src/lib/turnEngine/enrichGameState.ts
/**
 * Player-visible option fallback plus compatibility shims for the retired
 * narrative-to-state enrichment API. Narrative may shape suggested wording,
 * but it never creates authoritative location, codex, item, or NPC state.
 */

const FALLBACK_EXPLORE_OPTIONS = [
  "我继续往前探索，注意观察周围环境的变化。",
  "我检查最近的门是否能够打开。",
  "我停下来仔细听周围的动静。",
  "我寻找附近的光源或标识。",
];

const FALLBACK_DIALOGUE_OPTIONS = [
  "我继续追问刚才的话题，想了解更多。",
  "我试着换个角度提问，看看对方的反应。",
  "我观察对方的表情和动作，判断对方是否可信。",
  "我表示感谢后，准备继续探索。",
];

const FALLBACK_DANGER_OPTIONS = [
  "我保持警惕，慢慢后退到安全距离。",
  "我寻找周围可以当作武器的东西。",
  "我压低身体，尽量不发出声音。",
  "我确认逃跑路线，随时准备撤离。",
];

export function enrichOptionsFromNarrative(args: {
  currentOptions: string[];
  narrative: string;
}): string[] {
  if (args.currentOptions.length > 0) return args.currentOptions;
  if (["危险", "威胁", "怪物", "敌人", "攻击", "逃", "死", "血"].some((word) => args.narrative.includes(word))) {
    return [...FALLBACK_DANGER_OPTIONS];
  }
  if (/[「『"“][^」』"'”]{4,}[」』"'”]/.test(args.narrative) || args.narrative.includes("说")) {
    return [...FALLBACK_DIALOGUE_OPTIONS];
  }
  return [...FALLBACK_EXPLORE_OPTIONS];
}

/** @deprecated Narrative cannot provide authoritative location. */
export function enrichPlayerLocationFromNarrative(_args: {
  narrative: string;
  currentLocation?: string | null;
}): { playerLocation: string } | null {
  return null;
}

/** @deprecated Narrative cannot create codex state. */
export function enrichCodexFromNarrative(_args: {
  existingCodex: Array<{ id?: string; name?: string }>;
  narrative: string;
  sceneNpcIds?: string[];
}): Array<{ id: string; name: string; type: "npc"; observation: string }> {
  return [];
}

/** @deprecated Narrative cannot award inventory items. */
export function enrichItemsFromNarrative(_args: {
  existingItems: Array<{ id?: string } | string>;
  narrative: string;
}): Array<{ id: string; name: string }> {
  return [];
}

/** @deprecated Narrative cannot create NPC codex state. */
export function enrichNpcCodexFromNarrative(_args: {
  narrative: string;
  existingCodexUpdates?: Array<{ id?: string; name?: string; type?: string }>;
}): Array<{ id: string; name: string; type: "npc"; observation: string }> {
  return [];
}

export interface GameStateEnrichmentResult {
  options: string[];
  codexUpdates: Array<{ id: string; name: string; type: "npc"; observation: string }>;
  awardedItems: Array<{ id: string; name: string }>;
  playerLocation: string | null;
  npcCodexUpdates: Array<{ id: string; name: string; type: "npc"; observation: string }>;
  notes: string[];
}

export function enrichGameState(args: {
  narrative: string;
  currentOptions: string[];
  currentCodex: Array<{ id?: string; name?: string }>;
  currentItems: Array<{ id?: string } | string>;
  sceneNpcIds?: string[];
  currentPlayerLocation?: string | null;
  currentCodexUpdates?: Array<{ id?: string; name?: string; type?: string }>;
}): GameStateEnrichmentResult {
  const options = enrichOptionsFromNarrative({
    currentOptions: args.currentOptions,
    narrative: args.narrative,
  });
  return {
    options,
    codexUpdates: [],
    awardedItems: [],
    playerLocation: null,
    npcCodexUpdates: [],
    notes: options.length > 0 && args.currentOptions.length === 0 ? ["enriched_options"] : [],
  };
}
