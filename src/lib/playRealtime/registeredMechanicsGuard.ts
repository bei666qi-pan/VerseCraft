type RecordLike = Record<string, unknown>;

import { createStageOneStarterTasks } from "@/lib/tasks/taskV2";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { getAnomalyCombatStat } from "@/lib/registry/combatCanon";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { NPC_CANONICAL_IDENTITY_BY_ID } from "@/lib/registry/npcCanon";
import { NPCS } from "@/lib/registry/npcs";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import { enrichOptionsFromNarrative } from "./legalTurnOptionsFallback";

const REGISTERED_WAREHOUSE_ITEM_IDS = new Set(WAREHOUSE_ITEMS.map((item) => item.id));

export const REGISTERED_TASK_IDS = new Set([
  ...createStageOneStarterTasks().map((task) => task.id),
  "prof_trial_lampkeeper",
  "prof_trial_pathfinder", "prof_trial_omenseeker", "prof_trial_sunhorn",
  "prof_trial_traceorigin",
]);

const DENIES_REGISTERED_COMBAT_TARGET_RE =
  /(?:没有敌人|什么都没有|没有异常|不存在威胁|空荡荡.{0,24}(?:连个|没有|只有)|(?:连个|一个).{0,8}(?:鬼影|人影|敌人|异常|目标).{0,6}(?:都|也)?没有|朝(?:着)?空气.{0,8}(?:喊|攻击|挥|砸)|独角戏|(?:但|却)?我没(?:有)?动|没有(?:发起|进行|做出)(?:攻击|行动)|(?:不敢|拒绝)(?:攻击|动手)|尚不足以形成可提交的战果|武器与世界状态没有变化)/u;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function append(record: RecordLike, key: string, row: RecordLike): void {
  const prev = Array.isArray(record[key]) ? record[key] as unknown[] : [];
  const rowId = typeof row.id === "string" ? row.id : null;
  if (rowId && prev.some((item) => item && typeof item === "object" && !Array.isArray(item) && (item as RecordLike).id === rowId)) return;
  record[key] = [...prev, row];
}

/**
 * 注册表门禁：模型候选 award 只能引用已注册物品 id。未注册 id、只有名称的
 * object-form（无法核验身份）以及未注册字符串一律剔除——模型不得动态创造物品。
 * 混合场景保留合法项；合法注册物品不受影响（keep-alive）。
 *
 * 状态—叙事一致性：被剔除物品的"已获得"叙述不得保留给玩家。不做全局字符串
 * 替换——当剔除物品的显式名称出现在 narrative/options 中，或全部奖励被剔除且
 * narrative 带有获得语义时，整体替换为诚实的中性叙事；只提及合法物品的叙事保留。
 */
const ACQUISITION_SEMANTICS_RE =
  /(?:获得|拿到|得到|捡起|拾起|接过|收进|放入(?:行囊|背包|口袋|仓库)|奖励你|赠(?:送|予|给)你|交给了你)/u;

function pruneUnregisteredAwards(record: RecordLike): RecordLike {
  let pruned = false;
  let consumedPruned = false;
  const prunedNames: string[] = [];
  const filterField = (value: unknown, isRegistered: (id: string) => boolean): unknown[] => {
    if (!Array.isArray(value)) return [];
    return (value as unknown[]).filter((entry) => {
      const id =
        typeof entry === "string"
          ? entry
          : entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as RecordLike).id === "string"
            ? ((entry as RecordLike).id as string)
            : null;
      const keep = id !== null && isRegistered(id);
      if (!keep) {
        pruned = true;
        const name =
          entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as RecordLike).name === "string"
            ? ((entry as RecordLike).name as string).trim()
            : typeof entry === "string"
              ? entry.trim()
              : "";
        if (name.length >= 2) prunedNames.push(name);
      }
      return keep;
    });
  };
  const next = { ...record };
  const hadItems = Array.isArray(record.awarded_items) && (record.awarded_items as unknown[]).length > 0;
  const hadWarehouse = Array.isArray(record.awarded_warehouse_items) && (record.awarded_warehouse_items as unknown[]).length > 0;
  const hadConsumedItems = Array.isArray(record.consumed_items) && (record.consumed_items as unknown[]).length > 0;
  const hadConsumedWarehouse =
    Array.isArray(record.consumed_warehouse_items) && (record.consumed_warehouse_items as unknown[]).length > 0;
  if (hadItems) {
    next.awarded_items = filterField(record.awarded_items, (id) => findRegisteredItemById(id) !== undefined);
  }
  if (hadWarehouse) {
    next.awarded_warehouse_items = filterField(record.awarded_warehouse_items, (id) => REGISTERED_WAREHOUSE_ITEM_IDS.has(id));
  }
  if (hadConsumedItems) {
    next.consumed_items = filterField(record.consumed_items, (id) => findRegisteredItemById(id) !== undefined);
    consumedPruned = (next.consumed_items as unknown[]).length !== (record.consumed_items as unknown[]).length;
  }
  if (hadConsumedWarehouse) {
    next.consumed_warehouse_items = filterField(
      record.consumed_warehouse_items,
      (id) => REGISTERED_WAREHOUSE_ITEM_IDS.has(id),
    );
    consumedPruned = consumedPruned ||
      (next.consumed_warehouse_items as unknown[]).length !== (record.consumed_warehouse_items as unknown[]).length;
  }
  if (pruned) {
    next._commit_flags = [...strings(record._commit_flags), "unregistered_item_pruned_v1"];
    if (consumedPruned) {
      next._commit_flags = [...strings(next._commit_flags), "unregistered_consumed_item_pruned_v1"];
    }

    const remaining =
      (Array.isArray(next.awarded_items) ? (next.awarded_items as unknown[]).length : 0) +
      (Array.isArray(next.awarded_warehouse_items) ? (next.awarded_warehouse_items as unknown[]).length : 0);
    const narrative = String(record.narrative ?? "");
    const mentionsPruned = prunedNames.some((name) => narrative.includes(name));
    const allPruned = remaining === 0 && (hadItems || hadWarehouse);
    if (mentionsPruned || (allPruned && ACQUISITION_SEMANTICS_RE.test(narrative))) {
      // 诚实降级：不伪造成功，不保留任何被剔除物品的"已获得"语义。
      const keptNames = [
        ...(Array.isArray(next.awarded_items) ? (next.awarded_items as unknown[]) : []),
        ...(Array.isArray(next.awarded_warehouse_items) ? (next.awarded_warehouse_items as unknown[]) : []),
      ]
        .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as RecordLike).name === "string" ? ((entry as RecordLike).name as string) : null))
        .filter((name): name is string => Boolean(name));
      next.narrative =
        keptNames.length > 0
          ? `我核对了行囊与仓库登记：${keptNames.join("、")} 已登记在册；另有所指物品并不在登记中，无法真正取得。`
          : "我核对了行囊与仓库登记：刚才提到的那样东西并不在登记中，无法真正取得。物品状态没有变化。";
      next._commit_flags = [...strings(next._commit_flags), "phantom_award_narrative_aligned_v1"];
    }
    if (Array.isArray(record.options) && prunedNames.length > 0) {
      const options = strings(record.options).filter((option) => !prunedNames.some((name) => option.includes(name)));
      if (options.length !== strings(record.options).length) {
        next.options = options;
        next._commit_flags = [...strings(next._commit_flags), "phantom_award_options_aligned_v1"];
      }
    }
  }
  return next;
}

const EXPLICIT_NEVER_OWNED_ITEM_RE =
  /(?:从未|从来没|并未|没有)(?:真正)?(?:拥有|获得|拿到|持有|捡到|买到|得到).{0,12}(?:钥匙|物品|道具|卡|票|药|符|工具|武器)|(?:钥匙|物品|道具|卡|票|药|符|工具|武器).{0,12}(?:从未|从来没|并未|没有)(?:真正)?(?:拥有|获得|拿到|持有|捡到|买到|得到)/u;
const EXPLICIT_ITEM_USE_RE =
  /(?:拿出|取出|掏出|使用|用|插入|递出|交出|装备|服用|打开|解锁|挥动)/u;
const SYSTEM_TALENT_ACTION_RE =
  /^【系统强制干预：玩家发动了["“][^"”]{2,16}["”]。/u;
const BODY_OR_ABSTRACT_TOOL_TERMS = new Set(["双手", "单手", "左手", "右手", "眼睛", "目光", "力气", "身体", "声音"]);

function extractExplicitUsedItem(action: string): string | null {
  const match = action.match(
    /(?:拿出|取出|掏出|使用|用|装备|服用|挥动|点燃)\s*(?:了|着)?\s*(?:我的|自己(?:的)?|这(?:一)?把|那(?:一)?把|一把|一柄|一根|一支|一枚|一瓶|一件|一个)?\s*([\p{Script=Han}A-Za-z0-9_-]{2,24}?)(?=(?:来|去)?(?:试(?:着)?|尝试)?(?:砍|劈|刺|攻击|射击|敲|砸|撬|开|解锁|点燃|照|服用|挥动|插入|递出|交出)|[，。！？,.!?]|$)/u,
  );
  const term = match?.[1]?.trim() ?? "";
  if (!term || BODY_OR_ABSTRACT_TOOL_TERMS.has(term)) return null;
  return term;
}

function ownsExplicitItem(args: {
  term: string;
  inventoryItemIds: Set<string>;
  equippedWeapon?: RecordLike | null;
}): boolean {
  const normalized = args.term.toLowerCase();
  const equippedId = typeof args.equippedWeapon?.id === "string" ? args.equippedWeapon.id : "";
  const equippedName = typeof args.equippedWeapon?.name === "string" ? args.equippedWeapon.name : "";
  if (
    (equippedId && equippedId.toLowerCase() === normalized) ||
    (equippedName && (equippedName.includes(args.term) || args.term.includes(equippedName))) ||
    (equippedId && /IRON[-_]?PIPE/i.test(equippedId) && args.term.includes("铁管")) ||
    (args.term === "武器" && Boolean(equippedId))
  ) return true;
  for (const id of args.inventoryItemIds) {
    const registered = findRegisteredItemById(id);
    const name = typeof registered?.name === "string" ? registered.name : "";
    if (id.toLowerCase() === normalized || (name && (name.includes(args.term) || args.term.includes(name)))) return true;
  }
  return false;
}

function npcAuthorityIds(worldId: string, presentNpcIds: string[]): Set<string> {
  const registered = worldId === "xingni_taichu"
    ? QINGSHI_NPCS.map((npc) => npc.id)
    : Object.keys(NPC_CANONICAL_IDENTITY_BY_ID);
  return new Set([...registered, ...presentNpcIds].map((id) => id.trim()).filter(Boolean));
}

function npcIdFromRow(row: RecordLike): string {
  for (const key of ["npcId", "npc_id", "targetNpcId", "target_npc_id", "actorNpcId", "actor_npc_id", "id"]) {
    if (typeof row[key] === "string" && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

function filterNpcWrites(record: RecordLike, allowedNpcIds: Set<string>, worldId: string): RecordLike {
  const next = { ...record };
  let pruned = false;
  let codexIdentityPruned = false;
  const canonicalCodexById = new Map<string, { id: string; name: string; type: "npc" | "anomaly" }>(
    (worldId === "xingni_taichu"
      ? QINGSHI_NPCS.map((npc) => ({ id: npc.id, name: npc.name, type: "npc" as const }))
      : [
          ...NPCS.map((npc) => ({ id: npc.id, name: npc.name, type: "npc" as const })),
          ...ANOMALIES.map((anomaly) => ({ id: anomaly.id, name: anomaly.name, type: "anomaly" as const })),
        ]
    ).map((entry) => [entry.id.toUpperCase(), entry]),
  );
  const filterRows = (value: unknown, inherentlyNpc: boolean): unknown[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        if (inherentlyNpc) pruned = true;
        return !inherentlyNpc;
      }
      const row = raw as RecordLike;
      const id = npcIdFromRow(row);
      const type = String(row.type ?? row.kind ?? "").toLowerCase();
      const looksNpc = inherentlyNpc || type === "npc" || "npcId" in row || "npc_id" in row || /^N-\d+$/i.test(id);
      if (!looksNpc) return true;
      const keep = id.length > 0 && allowedNpcIds.has(id);
      if (!keep) pruned = true;
      return keep;
    });
  };

  for (const field of ["relationship_updates", "npc_location_updates", "npc_memory_updates"]) {
    if (Array.isArray(record[field])) next[field] = filterRows(record[field], true);
  }
  if (Array.isArray(record.codex_updates)) {
    const npcFiltered = filterRows(record.codex_updates, false);
    next.codex_updates = npcFiltered.flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [raw];
      const row = raw as RecordLike;
      const id = npcIdFromRow(row).toUpperCase();
      const suppliedType = typeof row.type === "string" ? row.type.trim().toLowerCase() : "";
      const looksCanonicalEntityId = /^(?:N-\d{3}|XQ-N\d{3}|A-\d{3})$/i.test(id);
      const requiresCanonicalEntity = looksCanonicalEntityId || suppliedType === "npc" || suppliedType === "anomaly";
      if (!requiresCanonicalEntity) return [raw];
      const canonical = canonicalCodexById.get(id);
      const suppliedName = typeof row.name === "string" ? row.name.trim() : "";
      if (!canonical || (suppliedName && suppliedName !== canonical.name) || (suppliedType && suppliedType !== canonical.type)) {
        codexIdentityPruned = true;
        return [];
      }
      return [{ ...row, id: canonical.id, name: canonical.name, type: canonical.type }];
    });
  }

  if (record.relation_changes && typeof record.relation_changes === "object" && !Array.isArray(record.relation_changes)) {
    const nested = record.relation_changes as RecordLike;
    next.relation_changes = {
      ...nested,
      ...(Array.isArray(nested.relationship_updates)
        ? { relationship_updates: filterRows(nested.relationship_updates, true) }
        : {}),
    };
  }
  if (record.world_state_changes && typeof record.world_state_changes === "object" && !Array.isArray(record.world_state_changes)) {
    const nested = record.world_state_changes as RecordLike;
    next.world_state_changes = {
      ...nested,
      ...(Array.isArray(nested.npc_location_updates)
        ? { npc_location_updates: filterRows(nested.npc_location_updates, true) }
        : {}),
    };
  }
  if (pruned) next._commit_flags = [...strings(next._commit_flags), "unregistered_npc_state_pruned_v1"];
  if (codexIdentityPruned) next._commit_flags = [...strings(next._commit_flags), "canonical_codex_identity_mismatch_pruned_v1"];
  return next;
}

function rejectExplicitPhantomItem(record: RecordLike): RecordLike {
  const next = { ...record };
  for (const field of [
    "player_location",
    "npc_location_updates",
    "dm_change_set",
    "task_changes",
    "relation_changes",
    "loot_changes",
    "clue_changes",
    "world_state_changes",
    "main_threat_updates",
    "conflict_outcome",
    "weapon_updates",
    "weapon_bag_updates",
    "task_updates",
    "new_tasks",
    "relationship_updates",
    "clue_updates",
    "decision_options",
    "next_chapter_title_candidate",
    "_narrative_audit",
  ]) {
    delete next[field];
  }
  return {
    ...next,
    is_action_legal: false,
    consumes_time: false,
    time_cost: "none",
    sanity_damage: 0,
    is_death: false,
    consumed_items: [],
    consumed_warehouse_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    currency_change: 0,
    narrative: "我核对了行囊与已获得物品：这件物品并不在行囊中，也没有取得记录，不能凭空拿出或使用。行动没有发生。",
    options: [],
    _commit_flags: [...strings(record._commit_flags), "explicit_phantom_item_blocked_v1"],
  };
}

function ensureLegalTurnOptions(record: RecordLike): RecordLike {
  if (record.is_action_legal !== true || record.is_death === true) return record;
  const options = strings(record.options).map((option) => option.trim()).filter(Boolean);
  if (options.length >= 2) return options === record.options ? record : { ...record, options };
  return {
    ...record,
    options: enrichOptionsFromNarrative({
      currentOptions: [],
      narrative: String(record.narrative ?? ""),
    }).slice(0, 4),
    _commit_flags: [...strings(record._commit_flags), "legal_turn_options_backfilled_v1"],
  };
}

const HARMLESS_CONTACT_ATTEMPT_RE =
  /(?:走过去|走向|朝(?:着)?|靠近|上前|过去|找到?|寻找|去找|碰见|遇见).{0,24}(?:打个?招呼|问候|问(?:他|她|对方)?|询问|打听|聊聊|聊天|交谈|谈谈|说(?:句|话))/u;
const DIRECT_HARMLESS_CONTACT_ATTEMPT_RE =
  /(?:向|和).{1,12}(?:打个?招呼|问候|询问|了解|打听|聊聊|聊天|交谈|谈谈)/u;
const INDEPENDENTLY_PROHIBITED_SOCIAL_ACTION_RE =
  /(?:强迫|逼迫|控制|操控|催眠|洗脑|命令|服从|爱上|喜欢上|攻击|袭击|殴打|伤害|杀死|杀掉|绑架|威胁|侵犯)/u;
const CONTACT_TARGET_UNAVAILABLE_RE =
  /(?:什么(?:也|都)没有|没有人|没(?:有)?(?:这|这个|此)(?:人|住户)|(?:没(?:有)?|不存在)(?:叫|名为).{1,12}(?:的)?(?:人|住户)|没人应|空无一人|无人回应|没有回应|无人出现|没有出现|找不到|未找到|没找到|上哪儿.{0,16}(?:确认|找|问)|(?:找谁问|找谁打听).{0,12}(?:摸不着门|不知道|不清楚)|不在(?:场|家|房间|这里)?(?:[。！!，,]|$)|并不在|并不存在|(?:人影|身影|对方|他|她|目标).{0,12}(?:不见了|消失(?:了)?)|只有.{0,16}(?:墙|空走廊|空气))/u;

const NAVIGATION_FAILURE_MISREAD_RE =
  /(?:可通行相邻路线|仍留在原地|没能确认.{0,20}(?:路线|路径|方向)|无法确认.{0,20}(?:路线|路径|方向))/u;

function hasNavigationFailureMisread(narrative: string): boolean {
  return NAVIGATION_FAILURE_MISREAD_RE.test(narrative);
}

function extractContactTarget(action: string): string | null {
  const match = action.match(
    /(?:和|向|找(?:到)?|寻找|去找|碰见|遇见)([\p{Script=Han}·]{2,8})(?=(?:，|,)?(?:想)?(?:和(?:他|她|对方))?(?:打个?招呼|问候|问|询问|了解|打听|聊聊|聊天|交谈|谈谈))/u,
  );
  return match?.[1] ?? null;
}

function hasUnavailableContactOutcome(record: RecordLike, action: string): boolean {
  const narrative = String(record.narrative ?? "");
  if (CONTACT_TARGET_UNAVAILABLE_RE.test(narrative)) return true;
  const target = extractContactTarget(action);
  if (!target) return false;
  const surname = Array.from(target)[0] ?? "";
  return narrative.includes(`没有${target}`) ||
    narrative.includes(`没有名为${target}`) ||
    narrative.includes(`不是${target}`) ||
    narrative.includes(`并非${target}`) ||
    narrative.includes(`${target}不是`) ||
    narrative.includes(`${target}并非`) ||
    narrative.includes(`${target}是谁`) ||
    /没有一扇(?:门|门缝).{0,24}(?:声音|回应|痕迹)/u.test(narrative) ||
    (surname !== "" && new RegExp(`(?:这|本)(?:一)?(?:层楼|栋楼|楼里).{0,8}没(?:有)?姓${surname}的`, "u").test(narrative)) ||
    new RegExp(`${target}.{0,12}(?:不是|并非|不在|不见了|消失了?|不存在)`, "u").test(narrative);
}

function hasProtocolOnlyNarrativeDegradation(record: RecordLike): boolean {
  if (String(record.narrative ?? "").trim() !== "") return false;
  const meta = record.security_meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const securityMeta = meta as RecordLike;
  return (
    securityMeta.action === "degrade" &&
    securityMeta.stage === "final_output" &&
    securityMeta.protocol_guard === "narrative_contaminated"
  );
}

function hasEntityHardGateFallback(record: RecordLike): boolean {
  const meta = record.security_meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const turnCommit = (meta as RecordLike).turn_commit;
  if (!turnCommit || typeof turnCommit !== "object" || Array.isArray(turnCommit)) return false;
  const safetyPolicy = (turnCommit as RecordLike).safety_policy;
  if (!safetyPolicy || typeof safetyPolicy !== "object" || Array.isArray(safetyPolicy)) return false;
  return (
    (turnCommit as RecordLike).safe_fallback === true &&
    (safetyPolicy as RecordLike).decision === "block_commit" &&
    (safetyPolicy as RecordLike).entity_hard_gate === true
  );
}

/**
 * Approaching someone to greet them is an executable player attempt even when
 * the named target cannot be found. The attempt may fail in-world, but absence
 * is not itself an illegal action. Keep the no-contact prose while preventing
 * the candidate from materializing that target through structured NPC deltas.
 */
function preserveHarmlessUnavailableContactAttempt(record: RecordLike, action: string): RecordLike {
  const protocolNarrativeDegraded = hasProtocolOnlyNarrativeDegradation(record);
  const entityHardGateFallback = hasEntityHardGateFallback(record);
  if (
    record.is_action_legal !== false ||
    (!HARMLESS_CONTACT_ATTEMPT_RE.test(action) && !DIRECT_HARMLESS_CONTACT_ATTEMPT_RE.test(action)) ||
    INDEPENDENTLY_PROHIBITED_SOCIAL_ACTION_RE.test(action) ||
    (!protocolNarrativeDegraded && !entityHardGateFallback && !hasUnavailableContactOutcome(record, action) && !hasNavigationFailureMisread(String(record.narrative ?? "")))
  ) {
    return record;
  }

  const codexUpdates = protocolNarrativeDegraded
    ? []
    : Array.isArray(record.codex_updates)
    ? (record.codex_updates as unknown[]).filter((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
        const row = entry as RecordLike;
        const type = String(row.type ?? row.kind ?? "").toLowerCase();
        const id = String(row.id ?? row.npcId ?? row.npc_id ?? "");
        return type !== "npc" && !/^N-/i.test(id) && !row.npcId && !row.npc_id;
      })
    : [];
  const relationChanges =
    record.relation_changes && typeof record.relation_changes === "object" && !Array.isArray(record.relation_changes)
      ? { ...(record.relation_changes as RecordLike), relationship_updates: [] }
      : record.relation_changes;
  const worldStateChanges =
    record.world_state_changes && typeof record.world_state_changes === "object" && !Array.isArray(record.world_state_changes)
      ? { ...(record.world_state_changes as RecordLike), npc_location_updates: [] }
      : record.world_state_changes;

  return {
    ...record,
    is_action_legal: true,
    narrative: protocolNarrativeDegraded
      ? "我走过去试着与对方打招呼，但眼前的动静没有形成可确认的回应；这次尝试没有带来可记录的变化。"
      : record.narrative,
    relationship_updates: [],
    npc_location_updates: [],
    codex_updates: codexUpdates,
    ...(relationChanges === undefined ? {} : { relation_changes: relationChanges }),
    ...(worldStateChanges === undefined ? {} : { world_state_changes: worldStateChanges }),
    _commit_flags: [...strings(record._commit_flags), "unavailable_contact_attempt_legalized_v1"],
  };
}

/**
 * Deterministic transitions for authored mechanics. Inputs are structured
 * client state + explicit action; narrative is never parsed as state.
 */
export function applyRegisteredMechanicsGuard(args: {
  dmRecord: RecordLike;
  latestUserInput: string;
  clientState?: {
    playerLocation?: string;
    activeTaskIds?: string[];
    completedTaskIds?: string[];
    equippedWeapon?: RecordLike | null;
    activeThreatIds?: string[];
    journalClueIds?: string[];
    inventoryItemIds?: string[];
    presentNpcIds?: string[];
    worldId?: string;
  } | null;
}): RecordLike {
  const allowedNpcIds = npcAuthorityIds(
    String(args.clientState?.worldId ?? "dark_moon_prologue"),
    strings(args.clientState?.presentNpcIds),
  );
  const record = filterNpcWrites(
    args.dmRecord,
    allowedNpcIds,
    String(args.clientState?.worldId ?? "dark_moon_prologue"),
  );
  const action = String(args.latestUserInput ?? "");
  const location = String(args.clientState?.playerLocation ?? "");
  const active = new Set(strings(args.clientState?.activeTaskIds));
  const completed = new Set(strings(args.clientState?.completedTaskIds));
  const activeThreatIds = strings(args.clientState?.activeThreatIds);
  const registeredActiveThreatIds = activeThreatIds.filter((id) => getAnomalyCombatStat(id) !== null);
  const journalClueIds = strings(args.clientState?.journalClueIds);
  const inventoryItemIds = new Set(strings(args.clientState?.inventoryItemIds));
  const isSystemTalentAction = SYSTEM_TALENT_ACTION_RE.test(action);
  // Profession outcomes are server-adjudicated only; never trust a candidate
  // model field or replay it after the task has already reached a terminal state.
  delete record.profession_trial_result;

  if (!isSystemTalentAction && EXPLICIT_NEVER_OWNED_ITEM_RE.test(action) && EXPLICIT_ITEM_USE_RE.test(action)) {
    return rejectExplicitPhantomItem(record);
  }
  const explicitUsedItem = isSystemTalentAction ? null : extractExplicitUsedItem(action);
  if (explicitUsedItem && !ownsExplicitItem({
    term: explicitUsedItem,
    inventoryItemIds,
    equippedWeapon: args.clientState?.equippedWeapon,
  })) {
    return rejectExplicitPhantomItem({
      ...record,
      _commit_flags: [...strings(record._commit_flags), "unowned_explicit_item_use_blocked_v2"],
    });
  }

  // 状态真相源门禁：假物品不得经 award 字段进入最终 inventory/warehouse。
  const awardChecked = pruneUnregisteredAwards(record);
  Object.assign(record, awardChecked);

  if (Array.isArray(record.new_tasks)) {
    const before = record.new_tasks as unknown[];
    const filtered = before.filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      return REGISTERED_TASK_IDS.has(id);
    });
    if (filtered.length !== before.length) {
      record.new_tasks = filtered;
      record._commit_flags = [...strings(record._commit_flags), "unregistered_task_pruned_v1"];
      if (/(?:领取|接受|接取|正式任务|正式委托)/.test(action) && filtered.length === 0) {
        record.narrative = "我核对了当前地点、在场人物和已有记录。这里暂时没有满足地点与前置条件的正式委托；任务列表没有变化。";
        record.consumes_time = false;
      }
    }
  }

  if (Array.isArray(record.task_updates)) {
    record.task_updates = (record.task_updates as unknown[]).flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      if (!(REGISTERED_TASK_IDS.has(id) || active.has(id) || completed.has(id))) return [];
      const status = typeof row.status === "string" ? row.status : null;
      if (completed.has(id) && status && status !== "completed") return [];
      if (active.has(id) && (status === "available" || status === "hidden")) return [{ ...row, status: "active" }];
      return [row];
    });
  }

  const threatMutationAction = /攻击|反击|压制|战斗|寻找.{0,8}威胁|威胁.{0,8}(出现|逼近|袭击)/.test(action);
  if (!threatMutationAction) delete record.main_threat_updates;

  if (active.has("prof_trial_lampkeeper") && !completed.has("prof_trial_lampkeeper") && /(?:提交|交付|交给|汇报).{0,18}(?:记录|试炼|证据|老刘)/.test(action) && /B1|配电/.test(location)) {
    const lampkeeperEvidenceIds = journalClueIds.filter((id) => id === "clue:trial:lampkeeper:verified_record");
    if (lampkeeperEvidenceIds.length === 0) {
      record.narrative = "我核对了守灯人试炼的已提交状态：当前没有可验证的记录或线索可供交付，因此试炼保持进行中，不会凭空完成或认证。";
      record.consumes_time = false;
      record.profession_trial_result = {
        profession: "守灯人",
        trialTaskId: "prof_trial_lampkeeper",
        outcome: "prerequisite_missing",
        certified: false,
        reasonCode: "verified_record_missing",
      };
    } else {
      append(record, "task_updates", { id: "prof_trial_lampkeeper", status: "completed", title: "守灯认证：带回不熄记录" });
      record.profession_trial_result = {
        profession: "守灯人",
        trialTaskId: "prof_trial_lampkeeper",
        outcome: "trial_completed",
        certified: false,
        evidenceClueIds: lampkeeperEvidenceIds,
      };
    }
  }

  const legacyDeliveryTaskRequirements: Record<string, string> = {
    t_delivery_letter_b1: "I-B08",
  };
  const legacyDeliveryTaskIds = new Set(Object.keys(legacyDeliveryTaskRequirements));
  const hasLegacyDeliveryActive = [...active].some((id) => legacyDeliveryTaskIds.has(id));
  if (hasLegacyDeliveryActive && /(?:提交|交付|交给|核对|确认).*?(?:任务|委托|信件|配给|交.*?信)/.test(action) && /B1|配电/.test(location)) {
    for (const taskId of active) {
      if (!legacyDeliveryTaskIds.has(taskId)) continue;
      const requiredItemId = legacyDeliveryTaskRequirements[taskId];
      if (!inventoryItemIds.has(requiredItemId)) {
        if (Array.isArray(record.task_updates)) {
          record.task_updates = record.task_updates.filter((raw) => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
            const row = raw as RecordLike;
            const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
            return id !== taskId;
          });
        }
        record.narrative = "我核对了行囊与委托记录：要交付的挂号信并不在身上，不能凭空取出信件或完成任务。委托仍保持进行中。";
        record.consumes_time = false;
        record._commit_flags = [...strings(record._commit_flags), "legacy_task_delivery_item_missing_v1"];
        continue;
      }
      // Candidate output may already contain this task with a missing or stale
      // status. Replace it rather than letting generic de-duplication preserve
      // an incomplete row over the authoritative completion.
      const existingUpdates = Array.isArray(record.task_updates) ? record.task_updates : [];
      record.task_updates = existingUpdates.filter((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
        const row = raw as RecordLike;
        const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
        return id !== taskId;
      });
      append(record, "task_updates", { id: taskId, status: "completed", title: "旧信件任务完成：完成交付" });
      record.consumed_items = [...new Set([...strings(record.consumed_items), requiredItemId])];
      record.narrative = "我把已登记的挂号信交给老刘。老刘核对后确认收下，委托完成；信件已不再留在行囊中。";
      record._commit_flags = [...strings(record._commit_flags), "legacy_task_delivery_completed_v1"];
    }
  }

  const floorProbeClueId = "clue:floor:1F:public_anomaly_observed";
  if (active.has("floor_1f_probe") && /1F|一楼/.test(location) && /(?:观察|检查|核对|翻看).{0,18}(?:登记|报修|日期|门牌|线索)/.test(action) && !journalClueIds.includes(floorProbeClueId)) {
    append(record, "clue_updates", {
      id: floorProbeClueId,
      title: "一楼登记时间错位",
      detail: "登记与报修信息出现可继续核验的时间差异。",
      kind: "trace",
      factId: NPC_KNOWLEDGE_FACT_IDS.F1_PUBLIC_ANOMALY,
      source: "registry",
      revealTier: "surface",
      relatedLocationIds: [location],
      relatedObjectiveId: "floor_1f_probe",
    });
    append(record, "task_updates", { id: "floor_1f_probe", status: "active", nextHint: "带着登记时间错位的记录继续核验，或提交给任务签发者。" });
  }
  const forbidsFloorProbeCompletion = /(?:不得|不要|不能|暂不|先不).{0,16}(?:完成|提交|交付).{0,16}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:不得|不要|不能|暂不|先不).{0,16}(?:floor_1f_probe|一楼|试探|线索|任务).{0,16}(?:完成|提交|交付)/i.test(action);
  if (forbidsFloorProbeCompletion && Array.isArray(record.task_updates)) {
    record.task_updates = (record.task_updates as unknown[]).filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      return !(id === "floor_1f_probe" && row.status === "completed");
    });
  }
  if (active.has("floor_1f_probe") && !completed.has("floor_1f_probe") && journalClueIds.includes(floorProbeClueId) && !forbidsFloorProbeCompletion && /(?:提交|完成|交付).{0,20}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:floor_1f_probe|一楼试探).{0,20}(?:提交|完成|交付)/i.test(action)) {
    record.task_updates = [{ id: "floor_1f_probe", status: "completed", title: "一楼试探性探索" }];
  }

  const weapon = args.clientState?.equippedWeapon;
  const explicitCombatVerb = /(?:攻击|反击|压制|敲击)/.test(action);
  const explicitCombat =
    /(?:攻击|反击|压制|敲击).{0,18}(?:阴影|异常|威胁)|(?:阴影|异常|威胁).{0,18}(?:攻击|反击|压制|敲击)/.test(action) ||
    // ID itself is not sufficient. Once a registered threat is already in the
    // structured state, however, an explicit attack verb is a legal target
    // reference even when the player writes the ID instead of a Chinese noun.
    (explicitCombatVerb && registeredActiveThreatIds.length > 0);
  const weaponMutationAction = explicitCombat || /(?:装备|修理|修复|锻造|强化|净化).{0,18}(?:武器|铁管|刀|棍)/.test(action);
  if (!weaponMutationAction) delete record.weapon_updates;

  const riskSource = typeof record.risk_source === "string" && record.risk_source !== "unknown"
    ? record.risk_source
    : typeof record.damage_source === "string" && record.damage_source !== "unknown"
      ? record.damage_source
      : "";
  const registeredThreatEvidence = registeredActiveThreatIds.length > 0 && Array.isArray(record.main_threat_updates)
    && (record.main_threat_updates as unknown[]).some((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const threatId = String((raw as RecordLike).threatId ?? "");
      return registeredActiveThreatIds.includes(threatId) && getAnomalyCombatStat(threatId) !== null;
    });
  const deterministicMechanicsEvidence = strings(record._commit_flags).some((flag) =>
    flag === "authoritative_combat_settlement_v1" || flag.startsWith("weapon_tactical_")
  );
  const groundedMechanics = Boolean(riskSource) || registeredThreatEvidence || deterministicMechanicsEvidence;
  if (Number(record.sanity_damage ?? 0) > 0 && !groundedMechanics) {
    record.sanity_damage = 0;
    record._commit_flags = [...strings(record._commit_flags), "ungrounded_sanity_damage_pruned_v1"];
  }
  if (record.conflict_outcome && !registeredThreatEvidence && !deterministicMechanicsEvidence) {
    delete record.conflict_outcome;
    record._commit_flags = [...strings(record._commit_flags), "ungrounded_conflict_outcome_pruned_v1"];
  }
  if (explicitCombat && registeredActiveThreatIds.length === 0) {
    delete record.weapon_updates;
    delete record.main_threat_updates;
    delete record.conflict_outcome;
    record.sanity_damage = 0;
    record.is_death = false;
    record.narrative = "我检查了当前地点与异常战斗登记。这里没有可结算的已登记攻击目标，因此没有发生战斗，也没有产生武器损耗。";
    record.consumes_time = false;
    record._commit_flags = [...strings(record._commit_flags), "combat_without_registered_threat_blocked_v1"];
  } else if (weapon && explicitCombat) {
    // The authored target, location and equipped weapon make this a legal
    // combat attempt. Provider prose cannot veto the deterministic mechanic.
    record.is_action_legal = true;
    const threatId = registeredActiveThreatIds[0]!;
    record.main_threat_updates = [{ floorId: location.includes("3") ? "3F" : location, threatId, phase: "suppressed", suppressionProgress: 25 }];
    const stability = typeof weapon.stability === "number" ? Math.max(0, Math.trunc(weapon.stability) - 4) : 68;
    record.weapon_updates = [{ weaponId: weapon.id, stability, contamination: Math.min(100, Number(weapon.contamination ?? 0) + 1) }];
    record.conflict_outcome = {
      outcomeTier: "partial_success",
      resultLayer: "system_adjudicated",
      summary: "玩家使用当前已装备武器对已登记威胁完成一次有效压制；威胁尚未彻底清除。",
      // `likelyCost` is translated into physical injury by resolveDmTurn.
      // Sanity damage alone is not evidence of a bruise or wound.
      likelyCost: "none",
    };
    if (DENIES_REGISTERED_COMBAT_TARGET_RE.test(String(record.narrative ?? ""))) {
      record.narrative = "异常阴影从灯下压近。我以守灯人的节奏稳住光线，用当前铁管完成一次有效压制；武器承受了明确损耗，威胁仍未彻底清除。";
    }
    record._commit_flags = [...strings(record._commit_flags), "authoritative_combat_settlement_v1"];
  }
  return ensureLegalTurnOptions(preserveHarmlessUnavailableContactAttempt(record, action));
}
