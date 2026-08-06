// src/lib/turnEngine/validators/itemUseValidator.ts
/**
 * Post-generation validator: checks that narrative-described item use is
 * consistent with the player's actual inventory, the item's effect type,
 * and the structured consumed_items field.
 *
 * This is a PURE function — no IO, no mutations. It replaces the former
 * prompt-level instruction that asked the model to check inventory before
 * writing item use; enforcement now happens in code.
 */

import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import type { ItemEffectType } from "@/lib/registry/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemUseIssueCode =
  | "item_not_in_inventory"
  | "item_effect_type_mismatch"
  | "item_consumed_not_in_structured";

export type ItemUseIssue = {
  code: ItemUseIssueCode;
  detail: string;
  severity: "low" | "medium" | "high";
  /** Matched item id, when identified. */
  itemId?: string;
};

export type ItemUseValidationReport = {
  ok: boolean;
  issues: ItemUseIssue[];
};

// ---------------------------------------------------------------------------
// Narrative patterns for item use detection
// ---------------------------------------------------------------------------

/**
 * Patterns that signal the player is actively using/consuming an item.
 * Captures the item name (group 1) from common Chinese use-verb constructs.
 */
const ITEM_USE_PATTERNS: readonly RegExp[] = [
  /(?:掏|拿|取|摸)出[了]?\s*(.{1,12})(?:，|。|$)/,
  /使用[了]?\s*(.{1,12})/,
  /用[了]?\s*(.{1,12})(?:打开|破开|撬开|解锁|解开|击退|挡住|吸引|交换|贿赂|安抚|治疗|恢复|净化|束缚|伪装)/,
  /(?:拧开|撕开|打开)[了]?\s*(.{1,12})/,
  /(?:吞下|喝下|吃下|服下|注射)[了]?\s*(.{1,12})/,
  /(?:点燃|烧掉|烧毁)[了]?\s*(.{1,12})/,
  /(?:挥动|举起|拔出|亮出|出示)[了]?\s*(.{1,12})/,
  /把\s*(.{1,12})\s*(?:递给|交给|塞给|抛给|扔给|放在)/,
  /将\s*(.{1,12})\s*(?:递|交|塞|抛|放|挂|贴|插|别)/,
  /(?:借助|依靠|利用)\s*(.{1,12})/,
];

/**
 * Item consumption is irreversible — once an item is "used up", it should
 * appear in consumed_items. These verbs indicate consumption/destruction.
 */
const CONSUMPTION_VERB_PATTERNS: readonly RegExp[] = [
  /(?:用掉|用尽|消耗|耗尽|花光)[了]?\s*(.{1,12})/,
  /(?:捏碎|摔碎|砸碎|折断)[了]?\s*(.{1,12})/,
  /(?:吞下|喝下|吃下|服下)[了]?\s*(.{1,12})/,
  /(?:烧掉|烧毁|点燃)[了]?\s*(.{1,12})/,
  /(?:撕碎|扯碎|撕毁)[了]?\s*(.{1,12})/,
  /用后.*?(?:消失|溶解|损毁|碎裂|化为)/,
];

// ---------------------------------------------------------------------------
// Effect-type consistency map
// ---------------------------------------------------------------------------

/**
 * Maps item effect types to the narrative-verb families that are
 * consistent with that type. If a narrative action doesn't match any
 * consistent pattern for the item's effect type, we flag a mismatch.
 */
const EFFECT_CONSISTENCY_PATTERNS: Readonly<Record<ItemEffectType, RegExp[]>> = {
  shield: [
    /(?:挡住|抵挡|防御|格挡|护住|抗住|保命|免死)/,
  ],
  ruleKill: [
    /(?:压制|压制|打断|反制|中断|击退|驱散|镇住)/,
  ],
  tempStat: [
    /(?:强化|提升|增强|加|恢复|补充)/,
  ],
  intel: [
    /(?:查看|阅读|查阅|翻阅|研究|分析|解读|理解)/,
  ],
  access: [
    /(?:打开|通过|进入|绕过|穿行|抵达)/,
  ],
  disguise: [
    /(?:伪装|冒充|假装|扮成|变换|化装)/,
  ],
  amnesty: [
    /(?:出示|亮出|展示|亮明|通行|豁免|放行)/,
  ],
  trigger: [
    /(?:触发|激活|启动|引发|引出|唤醒)/,
  ],
  tempFavor: [
    /(?:赠送|送给|交给|递给|贿赂|讨好|换取)/,
  ],
  transform: [
    /(?:变形|变身|转化|变成|化为|幻化)/,
  ],
  purify: [
    /(?:净化|清除|驱散|消除|洗涤|祛除)/,
  ],
  key: [
    /(?:打开|解锁|开启|开锁|破开|撬开)/,
  ],
  bait: [
    /(?:引开|吸引|引诱|分散|转移|引走)/,
  ],
  binding: [
    /(?:束缚|绑住|捆住|缠住|困住|定住)/,
  ],
  consumable: [
    /(?:吞下|喝下|吃下|服下|使用|消耗|用掉|涂抹|包扎)/,
  ],
};

// ---------------------------------------------------------------------------
// Item-name surface extraction
// ---------------------------------------------------------------------------

function extractMatch(text: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const extracted = m[1].split(/[，。！？；、\s]/, 1)[0]?.trim() ?? "";
      if (extracted.length >= 2 && extracted.length <= 12) {
        return extracted;
      }
    }
  }
  return null;
}

/**
 * Find a registered item whose name appears as a substring of the
 * extracted phrase, or vice versa. Returns the item if found.
 */
function matchItemByName(extractedPhrase: string, candidateIds: readonly string[]): string | null {
  if (!extractedPhrase || candidateIds.length === 0) return null;
  for (const id of candidateIds) {
    const item = findRegisteredItemById(id);
    if (!item) continue;
    if (item.name.includes(extractedPhrase) || extractedPhrase.includes(item.name)) {
      return id;
    }
  }
  return null;
}

/**
 * Check whether the narrative action verbs are consistent with the item's
 * declared effect type. Returns null when consistent, or a mismatch detail
 * string when inconsistent.
 */
function checkEffectConsistency(
  narrative: string,
  effectType: ItemEffectType | undefined,
): string | null {
  if (!effectType) return null; // no effect type to check against
  const consistentPatterns = EFFECT_CONSISTENCY_PATTERNS[effectType];
  if (!consistentPatterns) return null;
  if (consistentPatterns.some((re) => re.test(narrative))) return null;
  return `narrative use of item does not match effect type "${effectType}"`;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validate that narrative-described item use is consistent with the player's
 * inventory, the item's effect type, and the structured consumed_items field.
 *
 * @param narrative - The DM turn narrative text.
 * @param inventory - Array of item IDs currently in the player's inventory.
 * @param dmRecord - The DM record (candidate envelope). Read-only.
 */
export function validateItemUseNarrative(
  narrative: string,
  inventory: readonly string[],
  dmRecord: Record<string, unknown>,
): ItemUseValidationReport {
  const issues: ItemUseIssue[] = [];
  if (!narrative || !narrative.trim()) return { ok: true, issues: [] };

  // 1. Detect item use in narrative
  const extractedPhrase = extractMatch(narrative, ITEM_USE_PATTERNS);
  if (!extractedPhrase) {
    // No item-use pattern detected — nothing to validate
    return { ok: true, issues: [] };
  }

  // 2. Match extracted phrase to a registered item in the player's inventory
  const matchedItemId = matchItemByName(extractedPhrase, inventory);

  if (!matchedItemId) {
    issues.push({
      code: "item_not_in_inventory",
      detail: `narrative describes using "${extractedPhrase}" but no matching item found in player inventory (${inventory.length} items)`,
      severity: "medium",
    });
  } else {
    const item = findRegisteredItemById(matchedItemId);
    if (item) {
      // 3. Check effect-type consistency
      const mismatch = checkEffectConsistency(narrative, item.effectType);
      if (mismatch) {
        issues.push({
          code: "item_effect_type_mismatch",
          detail: `${mismatch} (item: ${item.id}|${item.name}, effectType: ${item.effectType ?? "none"})`,
          itemId: matchedItemId,
          severity: "low",
        });
      }
    }
  }

  // 4. Check consumed_items alignment
  // If the narrative uses consumption verbs, the item should appear in consumed_items
  const consumptionPhrase = extractMatch(narrative, CONSUMPTION_VERB_PATTERNS);
  if (consumptionPhrase) {
    const consumedItemId = matchItemByName(consumptionPhrase, inventory);
    if (consumedItemId) {
      const consumedItems = Array.isArray((dmRecord as { consumed_items?: unknown }).consumed_items)
        ? ((dmRecord as { consumed_items: unknown[] }).consumed_items as string[])
        : [];
      if (!consumedItems.includes(consumedItemId)) {
        issues.push({
          code: "item_consumed_not_in_structured",
          detail: `narrative describes consuming "${consumptionPhrase}" (matched ${consumedItemId}) but consumed_items does not include it`,
          itemId: consumedItemId,
          severity: "medium",
        });
      }
    }
  }

  // Also check: if consumed_items lists items that are NOT in inventory
  const consumedItems = Array.isArray((dmRecord as { consumed_items?: unknown }).consumed_items)
    ? ((dmRecord as { consumed_items: unknown[] }).consumed_items as string[])
    : [];
  for (const consumedId of consumedItems) {
    if (typeof consumedId !== "string" || !consumedId.trim()) continue;
    if (!inventory.includes(consumedId)) {
      issues.push({
        code: "item_not_in_inventory",
        detail: `consumed_items lists "${consumedId}" but it is not in player inventory`,
        itemId: consumedId,
        severity: "high",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
