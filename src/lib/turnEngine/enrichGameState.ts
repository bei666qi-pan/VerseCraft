// src/lib/turnEngine/enrichGameState.ts
/**
 * Deterministic game state enrichment layer.
 *
 * Industry best practice: the LLM is good at creative narrative, bad at
 * consistent structured data. This module fills missing game mechanics
 * (options, codex, items) using deterministic computation from the
 * narrative text + world registries.
 *
 * All functions are PURE — no IO, no network, no LLM calls.
 */
import { NPCS } from "@/lib/registry/npcs";
import { resolveActionsFromNarrative } from "@/lib/turnEngine/actionResolver";

// ── Known locations for backfilling ──────────────────────────────

const KNOWN_LOCATIONS = new Set([
  "3F_Hallway",
  "3F_Stairwell",
  "3F_Room302",
  "3F_CorridorEnd",
  "B1_PowerRoom",
  "B1_Storage",
  "4F_CorridorEnd",
  "4F_Stairwell",
  "Rooftop",
  "3F_UtilityRoom",
]);

const MOVEMENT_VERB_RE =
  /(走进|踏入|推开.*?门|来到|回到|进入|走向|跑到|爬上|下到|挤进|跨进|返回|穿过|绕到|钻进|迈入)/;

// NPC → location mapping for context-based location inference
const NPC_DEFAULT_LOCATION: Record<string, string> = {
  "N-008": "B1_PowerRoom",  // 电工老刘在配电间
  "N-001": "3F_Hallway",    // 林栀常在三楼走廊
  "N-004": "3F_CorridorEnd", // 阿花在走廊尽头附近
  "N-005": "3F_Hallway",    // 周伯在三楼
};

// NPC name variants that might appear in narrative
const NPC_NAME_VARIANTS: Record<string, string[]> = {
  "N-008": ["老刘", "电工老刘", "刘师傅"],
  "N-001": ["林栀", "栀"],
  "N-004": ["阿花", "花"],
  "N-002": ["苏晴", "苏老师"],
  "N-003": ["老周", "周叔"],
  "N-005": ["周伯", "老周伯"],
};

// ── Options enrichment ──────────────────────────────────────────

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

function narrativeContainsDialogue(narrative: string): boolean {
  // Detect Chinese dialogue markers
  return /[「『"“][^」』"'”]{4,}[」』"'”]/.test(narrative) || narrative.includes("说");
}

function narrativeContainsDanger(narrative: string): boolean {
  const dangerWords = ["危险", "威胁", "怪物", "敌人", "攻击", "逃", "死", "血"];
  return dangerWords.some((w) => narrative.includes(w));
}

/**
 * Generates contextual fallback options based on narrative content.
 * Only used when the LLM returns empty options — fills the hole
 * non-destructively.
 */
export function enrichOptionsFromNarrative(args: {
  currentOptions: string[];
  narrative: string;
}): string[] {
  if (args.currentOptions.length > 0) return args.currentOptions;

  const n = args.narrative;

  if (narrativeContainsDanger(n)) {
    return [...FALLBACK_DANGER_OPTIONS];
  }
  if (narrativeContainsDialogue(n)) {
    return [...FALLBACK_DIALOGUE_OPTIONS];
  }
  return [...FALLBACK_EXPLORE_OPTIONS];
}

// ── Location enrichment ─────────────────────────────────────────

/**
 * Detects player movement in the narrative and backfills
 * dmRecord.player_location when it is missing.
 *
 * Conservative: only fires when the current location is absent;
 * uses a tight movement-verb regex and matches against a
 * hardcoded set of known VerseCraft location IDs.
 */
export function enrichPlayerLocationFromNarrative(args: {
  narrative: string;
  currentLocation?: string | null;
}): { playerLocation: string } | null {
  // Only backfill when location is genuinely missing
  if (args.currentLocation && args.currentLocation.length > 0) return null;

  const match = MOVEMENT_VERB_RE.exec(args.narrative);
  if (!match) return null;

  const verbEnd = match.index + match[0].length;

  // Capture up to 8 chars after the verb as the destination hint
  const after = args.narrative.slice(verbEnd, verbEnd + 8).trim();
  if (!after) return null;

  // Try direct match: the captured text exactly equals a known location
  const hint = after.split(/[，。！？；、\s]/)[0]?.trim() ?? "";
  if (KNOWN_LOCATIONS.has(hint)) {
    return { playerLocation: hint };
  }

  // Try fuzzy match: any known location appears within 20 chars after the verb
  const wider = args.narrative.slice(verbEnd, verbEnd + 20);
  for (const loc of KNOWN_LOCATIONS) {
    if (wider.includes(loc)) {
      return { playerLocation: loc };
    }
  }

  // 3. Fallback: NPC context-based inference.
  // When the narrative mentions a known NPC but no movement verb,
  // infer the player's location from the NPC's default haunt.
  for (const [npcId, variants] of Object.entries(NPC_NAME_VARIANTS)) {
    const mentioned = variants.some((v) => args.narrative.includes(v));
    if (mentioned) {
      const loc = NPC_DEFAULT_LOCATION[npcId];
      if (loc) return { playerLocation: loc };
    }
  }

  return null;
}

// ── Codex enrichment ─────────────────────────────────────────────

/**
 * Detects NPCs mentioned in narrative that don't yet have codex entries,
 * and creates basic observation entries for first encounters.
 */
export function enrichCodexFromNarrative(args: {
  existingCodex: Array<{ id?: string; name?: string }>;
  narrative: string;
  sceneNpcIds?: string[];
}): Array<{ id: string; name: string; type: "npc"; observation: string }> {
  const updates: Array<{ id: string; name: string; type: "npc"; observation: string }> = [];
  const existingIds = new Set(args.existingCodex.map((c) => c.id).filter(Boolean));
  const existingNames = new Set(args.existingCodex.map((c) => c.name).filter(Boolean));

  // Check each registered NPC: are they in the narrative but not in codex?
  for (const npc of NPCS) {
    if (existingIds.has(npc.id)) continue;
    if (existingNames.has(npc.name)) continue;
    if (!args.narrative.includes(npc.name)) continue;

    updates.push({
      id: npc.id,
      name: npc.name,
      type: "npc" as const,
      observation: `本回合在场景中确认了${npc.name}的存在。`,
    });
  }

  return updates;
}

// ── Item enrichment ──────────────────────────────────────────────

const ITEM_EXTRACTION_PATTERNS: Array<{
  keywords: string[];
  itemId: string;
  itemName: string;
}> = [
  {
    keywords: ["螺纹钢", "铁管", "钢管", "铁棍"],
    itemId: "rebar",
    itemName: "螺纹钢",
  },
  {
    keywords: ["钥匙", "钥匙串"],
    itemId: "keys",
    itemName: "旧钥匙",
  },
  {
    keywords: ["手电筒", "手电", "电筒"],
    itemId: "flashlight",
    itemName: "手电筒",
  },
  {
    keywords: ["灭火器"],
    itemId: "fire_extinguisher",
    itemName: "灭火器",
  },
  {
    keywords: ["急救包", "医疗包", "绷带"],
    itemId: "medkit",
    itemName: "急救包",
  },
  {
    keywords: ["地图", "平面图", "楼层图"],
    itemId: "floor_map",
    itemName: "楼层平面图",
  },
];

/** Action verbs that indicate the player is acquiring an item */
const ACQUISITION_VERBS = ["捡起", "拿起", "握住", "攥住", "抓起", "找到", "摸到", "掏出来", "翻出"];

/**
 * Detects items the player acquires in the narrative that aren't
 * yet in the awarded_items list.
 *
 * Uses two strategies:
 * 1. Keyword-based extraction for well-known items (螺纹钢, 旧钥匙, etc.)
 * 2. actionResolver-based extraction for arbitrary narrative items
 *    (only when awarded_items is still empty and the extracted name
 *     is 2–6 chars – real item names in Chinese are short).
 */
export function enrichItemsFromNarrative(args: {
  existingItems: Array<{ id?: string } | string>;
  narrative: string;
}): Array<{ id: string; name: string }> {
  const existingIds = new Set(
    args.existingItems.map((item) => (typeof item === "string" ? item : item.id)).filter(Boolean)
  );

  const updates: Array<{ id: string; name: string }> = [];

  // Strategy 1: keyword-based extraction (existing logic)
  for (const pattern of ITEM_EXTRACTION_PATTERNS) {
    if (existingIds.has(pattern.itemId)) continue;

    const itemMentioned = pattern.keywords.some((kw) => args.narrative.includes(kw));
    if (!itemMentioned) continue;

    const hasAcquisition = ACQUISITION_VERBS.some((verb) => {
      for (const kw of pattern.keywords) {
        const kwIdx = args.narrative.indexOf(kw);
        if (kwIdx < 0) continue;
        const verbIdx = args.narrative.indexOf(verb, Math.max(0, kwIdx - 50));
        if (verbIdx >= 0 && verbIdx < kwIdx + kw.length + 50) return true;
      }
      return false;
    });

    if (hasAcquisition) {
      updates.push({ id: pattern.itemId, name: pattern.itemName });
      existingIds.add(pattern.itemId); // prevent duplicate across strategies
    }
  }

  // Strategy 2: actionResolver-based extraction for arbitrary items
  // Only when awarded_items is still empty (conservative – won't override LLM output)
  if (updates.length === 0 && args.existingItems.length === 0) {
    const resolved = resolveActionsFromNarrative({
      narrative: args.narrative,
      existingAwardedItems: [],
    });

    if (resolved.didBackfill && resolved.awardedItems && resolved.awardedItems.length > 0) {
      for (const item of resolved.awardedItems) {
        // Only backfill if the extracted name looks like a real item (2–6 Chinese chars)
        if (item.name.length >= 2 && item.name.length <= 6 && !existingIds.has(item.id)) {
          updates.push(item);
          existingIds.add(item.id);
        }
      }
    }
  }

  return updates;
}

// ── NPC codex enrichment ────────────────────────────────────────

/** Known NPCs for narrative-to-codex backfilling */
const KNOWN_NPC_PATTERNS: Array<{ id: string; name: string; altNames: string[] }> = [
  { id: "N-001", name: "林栀", altNames: ["Lin Zhi"] },
  { id: "N-004", name: "阿花", altNames: ["Ahua"] },
  { id: "N-008", name: "电工老刘", altNames: ["Electrician Liu", "老刘"] },
  { id: "N-002", name: "N-002", altNames: [] },
  { id: "N-003", name: "N-003", altNames: ["老周", "周叔"] },
  { id: "N-005", name: "N-005", altNames: ["周伯", "老周伯"] },
];

/**
 * Detects NPCs mentioned in the narrative that do not yet have
 * codex entries and adds minimal observation entries.
 *
 * Conservative: only fires when codex_updates has < 3 entries
 * to avoid bloating the codex during complex scenes.
 */
export function enrichNpcCodexFromNarrative(args: {
  narrative: string;
  existingCodexUpdates?: Array<{ id?: string; name?: string; type?: string }>;
}): Array<{ id: string; name: string; type: "npc"; observation: string }> {
  const existing = args.existingCodexUpdates ?? [];

  // Conservative: don't bloat if codex already has 3+ entries
  if (existing.length >= 3) return [];

  const existingIds = new Set(existing.map((c) => c.id).filter(Boolean));
  const existingNames = new Set(existing.map((c) => c.name).filter(Boolean));

  const updates: Array<{ id: string; name: string; type: "npc"; observation: string }> = [];

  for (const npc of KNOWN_NPC_PATTERNS) {
    if (existingIds.has(npc.id)) continue;
    if (existingNames.has(npc.name)) continue;

    // Check if NPC name or any alt name appears in the narrative
    const allNames = [npc.name, ...npc.altNames];
    const mentioned = allNames.some((n) => args.narrative.includes(n));
    if (!mentioned) continue;

    updates.push({
      id: npc.id,
      name: npc.name,
      type: "npc" as const,
      observation: "在本回合叙事中出现。",
    });

    // Still conservative: stop at 2 backfills max
    if (updates.length >= 2) break;
  }

  return updates;
}

export interface GameStateEnrichmentResult {
  options: string[];
  codexUpdates: Array<{ id: string; name: string; type: "npc"; observation: string }>;
  awardedItems: Array<{ id: string; name: string }>;
  /** Player location backfilled from narrative movement verbs (null when unchanged) */
  playerLocation: string | null;
  /** Additional NPC codex entries from narrative mention detection */
  npcCodexUpdates: Array<{ id: string; name: string; type: "npc"; observation: string }>;
  notes: string[];
}

/**
 * Main enrichment entry point. Call after LLM output is parsed and
 * normalized but before client delivery. Non-destructive — only fills
 * missing fields.
 */
export function enrichGameState(args: {
  narrative: string;
  currentOptions: string[];
  currentCodex: Array<{ id?: string; name?: string }>;
  currentItems: Array<{ id?: string } | string>;
  sceneNpcIds?: string[];
  /** Current player_location from dmRecord (for location backfill) */
  currentPlayerLocation?: string | null;
  /** Current codex_updates from dmRecord (for NPC mention backfill) */
  currentCodexUpdates?: Array<{ id?: string; name?: string; type?: string }>;
}): GameStateEnrichmentResult {
  const notes: string[] = [];

  // 1. Location enrichment
  const locationResult = enrichPlayerLocationFromNarrative({
    narrative: args.narrative,
    currentLocation: args.currentPlayerLocation,
  });
  const playerLocation = locationResult?.playerLocation ?? null;
  if (playerLocation) {
    notes.push("enriched_player_location");
  }

  // 2. Options enrichment
  const options = enrichOptionsFromNarrative({
    currentOptions: args.currentOptions,
    narrative: args.narrative,
  });
  if (options.length > 0 && args.currentOptions.length === 0) {
    notes.push("enriched_options");
  }

  // 3. Codex enrichment (from NPC registry)
  const codexUpdates = enrichCodexFromNarrative({
    existingCodex: args.currentCodex,
    narrative: args.narrative,
    sceneNpcIds: args.sceneNpcIds,
  });
  if (codexUpdates.length > 0) {
    notes.push(`enriched_codex:${codexUpdates.length}`);
  }

  // 4. Item enrichment (keyword + actionResolver)
  const awardedItems = enrichItemsFromNarrative({
    existingItems: args.currentItems,
    narrative: args.narrative,
  });
  if (awardedItems.length > 0) {
    notes.push(`enriched_items:${awardedItems.length}`);
  }

  // 5. NPC codex enrichment (from narrative mention detection)
  const npcCodexUpdates = enrichNpcCodexFromNarrative({
    narrative: args.narrative,
    existingCodexUpdates: args.currentCodexUpdates,
  });
  if (npcCodexUpdates.length > 0) {
    notes.push(`enriched_npc_codex:${npcCodexUpdates.length}`);
  }

  return { options, codexUpdates, awardedItems, playerLocation, npcCodexUpdates, notes };
}
