/**
 * enforceRequiredFields.ts — 回合编译器核心模块
 *
 * 设计原则（来自 AGENTS.md §4.2 "turn compiler"）：
 * - 模型输出只是候选，中间层才是最终裁决
 * - 根据玩家意图（NormalizedPlayerIntent）推断本回合"必须产出"的结构化字段
 * - 生成后校验：缺失字段 → 智能回填（从叙事文本、slots、上下文提取）
 * - 只有回填也失败时，才降级为安全叙事
 *
 * 这不是 prompt 修补，而是代码级契约执行。
 */

import type { NormalizedPlayerIntent } from "./types";
import { NPCS } from "@/lib/registry/npcs";
import { MAP_ROOMS } from "@/lib/registry/world";

// ── Registry-derived lookup tables ─────────────────────────────────

/** All NPC display names from the registry, used for narrative-to-codex extraction. */
const ALL_NPC_NAMES: readonly string[] = NPCS.map((n) => n.name);

/** All traversable room codes from the world registry, used for location extraction. */
const ALL_LOCATIONS: readonly string[] = Object.values(MAP_ROOMS).flat();

// ── Intent → 必填字段映射 ────────────────────────────────────────

export interface RequiredFieldsSpec {
  /** 绝对必须存在的字段（缺失则触发回填或降级） */
  mustHave: string[];
  /** 强烈建议存在，缺失时尝试回填但不降级 */
  shouldHave: string[];
  /** 本回合不应存在的字段（如 system_transition 不应有 combat 相关） */
  mustNotHave: string[];
}

/**
 * 根据玩家意图推断本回合应该产生哪些 DM JSON 字段。
 * 这是回合编译器的"类型检查"层——不是 prompt 建议，而是代码契约。
 */
export function inferRequiredFields(
  intent: NormalizedPlayerIntent
): RequiredFieldsSpec {
  const kind = intent.kind;
  const slots = intent.slots ?? {};
  const hasTargetNpc = Boolean(slots.target);
  const hasLocationHint = Boolean(slots.locationHint);
  const hasItemHint = Boolean(slots.itemHint);

  switch (kind) {
    case "combat":
      return {
        mustHave: ["sanity_damage", "consumes_time"],
        shouldHave: ["is_death", "weapon_updates", "main_threat_updates"],
        mustNotHave: [],
      };

    case "explore":
      return {
        mustHave: ["consumes_time"],
        shouldHave: hasLocationHint
          ? ["player_location"]
          : ["player_location", "codex_updates"],
        mustNotHave: ["is_death"],
      };

    case "dialogue":
      return {
        mustHave: ["consumes_time"],
        shouldHave: hasTargetNpc
          ? ["relationship_updates", "codex_updates"]
          : ["codex_updates"],
        mustNotHave: ["is_death"],
      };

    case "investigate":
      return {
        mustHave: ["consumes_time"],
        shouldHave: ["codex_updates", "awarded_items", "new_tasks"],
        mustNotHave: [],
      };

    case "use_item":
      return {
        mustHave: ["consumes_time"],
        shouldHave: hasItemHint
          ? ["consumed_items", "awarded_items"]
          : ["consumed_items"],
        mustNotHave: ["is_death"],
      };

    case "system_transition":
      return {
        mustHave: [],
        shouldHave: [],
        mustNotHave: [
          "sanity_damage",
          "is_death",
          "weapon_updates",
          "relationship_updates",
          "new_tasks",
        ],
      };

    case "meta":
      // meta actions (options regen, system queries) should produce
      // minimal state changes
      return {
        mustHave: [],
        shouldHave: [],
        mustNotHave: [
          "sanity_damage",
          "is_death",
          "weapon_updates",
          "new_tasks",
          "consumed_items",
          "awarded_items",
        ],
      };

    case "other":
    default:
      return {
        mustHave: ["consumes_time"],
        shouldHave: [],
        mustNotHave: ["is_death"],
      };
  }
}

// ── 字段存在性校验 ──────────────────────────────────────────────

export interface FieldPresenceReport {
  /** 缺失的 mustHave 字段 */
  missingRequired: string[];
  /** 缺失的 shouldHave 字段 */
  missingRecommended: string[];
  /** 不应存在但存在的 mustNotHave 字段 */
  forbiddenPresent: string[];
  /** 整体是否通过硬门禁 */
  hardGatePassed: boolean;
}

/**
 * 检查 DM JSON record 中是否包含预期字段。
 * 不做值校验，只做存在性检查。
 */
export function checkFieldPresence(
  dmRecord: Record<string, unknown>,
  spec: RequiredFieldsSpec
): FieldPresenceReport {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const forbiddenPresent: string[] = [];

  for (const field of spec.mustHave) {
    const value = dmRecord[field];
    if (value === undefined || value === null) {
      missingRequired.push(field);
    } else if (Array.isArray(value) && value.length === 0) {
      // Empty array counts as "present but empty" — not truly missing
      // Only flag as missing if the field is truly absent
    }
  }

  for (const field of spec.shouldHave) {
    const value = dmRecord[field];
    if (
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      missingRecommended.push(field);
    }
  }

  for (const field of spec.mustNotHave) {
    const value = dmRecord[field];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === "number" && value === 0) continue;
      if (typeof value === "boolean" && value === false) continue;
      forbiddenPresent.push(field);
    }
  }

  return {
    missingRequired,
    missingRecommended,
    forbiddenPresent,
    hardGatePassed: missingRequired.length === 0,
  };
}

// ── 智能回填 ─────────────────────────────────────────────────────

export interface BackfillResult {
  /** 成功回填的字段及其值 */
  backfilled: Record<string, unknown>;
  /** 回填失败的字段 */
  failed: string[];
  /** 是否有过任何回填 */
  didBackfill: boolean;
}

/**
 * 尝试从可用来源回填缺失的字段。
 *
 * 回填策略（按优先级）：
 * 1. 从 slots 直接映射（如 locationHint → player_location）
 * 2. 从叙事文本提取（使用 actionResolver 模式）
 * 3. 从上下文推断默认值
 */
export function backfillMissingFields(args: {
  missingFields: string[];
  intent: NormalizedPlayerIntent;
  narrative: string;
  playerAction: string;
}): BackfillResult {
  const backfilled: Record<string, unknown> = {};
  const failed: string[] = [];
  const slots = args.intent.slots ?? {};

  for (const field of args.missingFields) {
    switch (field) {
      case "player_location": {
        // Strategy 1: from slots.locationHint
        if (slots.locationHint) {
          backfilled.player_location = slots.locationHint;
          break;
        }
        // Strategy 2: from movement verbs in narrative
        const locFromNarrative = extractLocationFromText(args.narrative);
        if (locFromNarrative) {
          backfilled.player_location = locFromNarrative;
          break;
        }
        // Strategy 3: from player action text
        const locFromAction = extractLocationFromText(args.playerAction);
        if (locFromAction) {
          backfilled.player_location = locFromAction;
          break;
        }
        failed.push(field);
        break;
      }

      case "consumes_time": {
        backfilled.consumes_time = true;
        break;
      }

      case "sanity_damage": {
        // Combat intent without explicit damage → default to 1
        if (args.intent.kind === "combat") {
          backfilled.sanity_damage = 1;
        } else {
          backfilled.sanity_damage = 0;
        }
        break;
      }

      case "codex_updates": {
        // Try extracting NPC names from narrative
        const npcNames = extractNpcMentions(args.narrative);
        if (npcNames.length > 0) {
          backfilled.codex_updates = npcNames.map((name) => ({
            id: `N-REF-${name}`,
            name,
            type: "npc",
            observation: "从本回合叙事中识别。",
          }));
          break;
        }
        failed.push(field);
        break;
      }

      case "relationship_updates": {
        if (slots.target) {
          backfilled.relationship_updates = [
            {
              npcId: slots.target,
              trust: 1,
              note: "本回合对话互动。",
            },
          ];
          break;
        }
        failed.push(field);
        break;
      }

      default:
        failed.push(field);
        break;
    }
  }

  return {
    backfilled,
    failed,
    didBackfill: Object.keys(backfilled).length > 0,
  };
}

// ── 辅助函数 ─────────────────────────────────────────────────────

const LOCATION_VERB_RE =
  /(?:走进|踏入|推开|来到|回到|进入|走向|跑到|爬上|下到|挤进|跨进|返回|穿过|绕到|钻进|迈入|朝|向|往)\s*(.{2,10}?)(?:[，。！？；、\s]|$)/g;

function extractLocationFromText(text: string): string | null {
  // Derived from MAP_ROOMS registry — single source of truth for all room codes
  const KNOWN = ALL_LOCATIONS;

  // Try matching movement verbs followed by a known location
  const matches = text.matchAll(LOCATION_VERB_RE);
  for (const m of matches) {
    const after = (m[1] ?? "").trim();
    for (const loc of KNOWN) {
      if (after.includes(loc) || loc.includes(after)) {
        return loc;
      }
    }
  }

  // Try finding any known location directly in the text
  for (const loc of KNOWN) {
    if (text.includes(loc)) return loc;
  }

  // Try matching Chinese location descriptions
  const chineseLocationMatch = text.match(
    /(?:三楼|四楼|B1|地下室|天台|配电间|杂物间|走廊|楼梯|电梯|门口|房间|公寓)/
  );
  if (chineseLocationMatch) {
    const hint = chineseLocationMatch[0];
    const mapping: Record<string, string> = {
      "三楼": "3F_Hallway",
      "走廊": "3F_Hallway",
      "楼梯": "3F_Stairwell",
      "四楼": "4F_CorridorEnd",
      B1: "B1_PowerRoom",
      "地下室": "B1_Storage",
      "天台": "Rooftop",
      "配电间": "B1_PowerRoom",
      "杂物间": "3F_UtilityRoom",
    };
    return mapping[hint] ?? null;
  }

  return null;
}

const NPC_NAME_PATTERNS = ALL_NPC_NAMES;

function extractNpcMentions(text: string): string[] {
  const found = new Set<string>();
  for (const name of NPC_NAME_PATTERNS) {
    if (text.includes(name)) found.add(name);
  }
  return [...found];
}
