import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { canTraverseQingshi, isQingshiLocationId, QINGSHI_ENEMIES, QINGSHI_NPCS } from "./qingshiContent";
import { createInitialXingniState, normalizeXingniState, validateAndResolveXingniWorldDelta, type XingniTaichuState } from "./progression";

const registeredNpcIds = new Set(QINGSHI_NPCS.map((npc) => npc.id));
const registeredCodexIds = new Set([...registeredNpcIds, ...QINGSHI_ENEMIES.map((enemy) => enemy.id)]);

const XINGNI_ITEMS: Record<string, { id: string; name: string; tier: "D" | "C"; description: string; tags: string; ownerId: string }> = {
  xq_herb_spirit_leaf: { id: "xq_herb_spirit_leaf", name: "凝露灵叶", tier: "D", description: "聚气散的基础灵材。", tags: "xingni,herb,alchemy", ownerId: "xingni_qingshi_county" },
  xq_herb_sun_seed: { id: "xq_herb_sun_seed", name: "阳籽", tier: "D", description: "蕴含温和阳气的低阶灵材。", tags: "xingni,herb,alchemy", ownerId: "xingni_qingshi_county" },
  xq_ore_black_iron: { id: "xq_ore_black_iron", name: "玄铁", tier: "D", description: "修复低阶法器的常用矿材。", tags: "xingni,ore,refining", ownerId: "xingni_qingshi_county" },
  xq_pill_qi_gathering: { id: "xq_pill_qi_gathering", name: "聚气散", tier: "C", description: "帮助炼气修士梳理气机的散剂。", tags: "xingni,pill", ownerId: "XQ-N002" },
  xq_artifact_restored_blade: { id: "xq_artifact_restored_blade", name: "修复的残锋", tier: "C", description: "经神工坊修复的低阶法器。", tags: "xingni,artifact", ownerId: "XQ-N003" },
  xq_material_boar_tusk: { id: "xq_material_boar_tusk", name: "铁背獠牙", tier: "D", description: "击退铁背獠猪所得材料。", tags: "xingni,monster_material", ownerId: "XQ-E001" },
  xq_token_ascension_pass: { id: "xq_token_ascension_pass", name: "升仙试通行令", tier: "C", description: "证明已通过青石县升仙试。", tags: "xingni,quest_token", ownerId: "XQ-N004" },
  xq_pill_miasma_clearing: { id: "xq_pill_miasma_clearing", name: "清瘴散", tier: "C", description: "用于稳定黑松岭瘴气的登记任务丹药。", tags: "xingni,pill,quest", ownerId: "XQ-N002" },
  xq_artifact_damaged_blade: { id: "xq_artifact_damaged_blade", name: "残损法器·残锋", tier: "D", description: "玩家开局携带的受损法器。", tags: "xingni,artifact,quest", ownerId: "xingni_qingshi_county" },
  xq_quest_herb_basket: { id: "xq_quest_herb_basket", name: "周小满的药篓", tier: "D", description: "黑松岭失踪委托的受保护任务物品。", tags: "xingni,quest", ownerId: "XQ-N008" },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function currentState(clientState: ClientStructuredContextV1): XingniTaichuState {
  const digest = clientState.worldStateDigest;
  return digest?.kind === "xingni_taichu" ? normalizeXingniState(digest) : createInitialXingniState();
}

export function applyQingshiTurnGuard(args: {
  dmRecord: Record<string, unknown>;
  clientState: ClientStructuredContextV1;
}): Record<string, unknown> {
  const rec = { ...args.dmRecord };
  const from = args.clientState.playerLocation;
  const requestedLocation = typeof rec.player_location === "string" ? rec.player_location.trim() : "";
  if (!isQingshiLocationId(from)) {
    return { ...rec, is_action_legal: false, consumes_time: false, player_location: undefined, narrative: "当前地点不在青石县登记图中，本回合已停止。" };
  }

  if (requestedLocation && requestedLocation !== from) {
    if (isQingshiLocationId(requestedLocation) && canTraverseQingshi(from, requestedLocation)) {
      rec.player_location = requestedLocation;
    } else {
      delete rec.player_location;
      rec.is_action_legal = false;
      rec.consumes_time = false;
      rec.narrative = "那条路并不与此地相连。散修收住脚步，没有踏进地图上不存在的去处。";
    }
  }

  rec.npc_location_updates = [];
  rec.main_threat_updates = [];
  rec.weapon_updates = [];
  rec.weapon_bag_updates = [];
  rec.currency_change = 0;
  rec.relationship_updates = Array.isArray(rec.relationship_updates)
    ? rec.relationship_updates.filter((row) => registeredNpcIds.has(String(asRecord(row)?.npcId ?? ""))).slice(0, 8)
    : [];
  rec.codex_updates = Array.isArray(rec.codex_updates)
    ? rec.codex_updates.filter((row) => registeredCodexIds.has(String(asRecord(row)?.id ?? ""))).slice(0, 8)
    : [];

  const candidate = rec.world_delta;
  if (candidate !== undefined) {
    const before = currentState(args.clientState);
    const resolution = validateAndResolveXingniWorldDelta(before, candidate, {
      currentLocation: from,
      inventoryItemIds: args.clientState.inventoryItemIds,
    });
    rec.world_delta = {
      worldId: "xingni_taichu",
      mapId: "xingni_qingshi_county",
      accepted: resolution.ok,
      action: asRecord(candidate)?.action ?? null,
      message: resolution.message,
      resolvedState: resolution.state,
      unlockedMapIds: resolution.state.unlockedMapIds,
    };
    rec.consumed_items = resolution.ok ? resolution.consumedItemIds : [];
    rec.awarded_items = resolution.ok
      ? resolution.awardedItemIds.map((id) => XINGNI_ITEMS[id]).filter(Boolean)
      : [];
    rec.awarded_warehouse_items = [];
    if (resolution.locationOverride) rec.player_location = resolution.locationOverride;
    rec.is_death = false;
    if (!resolution.ok) {
      rec.is_action_legal = false;
      rec.consumes_time = false;
      rec.narrative = resolution.message;
    }
  } else {
    rec.consumed_items = [];
    rec.awarded_items = [];
    rec.awarded_warehouse_items = [];
  }
  return rec;
}
