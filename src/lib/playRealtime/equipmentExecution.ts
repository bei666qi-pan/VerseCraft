import type { Weapon } from "@/lib/registry/types";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

type DmRecord = Record<string, unknown>;

function asWeaponArray(v: unknown): Weapon[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Weapon => !!x && typeof x === "object" && !Array.isArray(x));
}

function parseWeaponBagFromPlayerContext(playerContext: string): Weapon[] {
  // 约定：武器背包：WZ-...[...]；WPN-...[...]。
  // 这里不解析完整武器对象（避免 prompt 注入成本），只解析 id 列表并从“随身携带的序列化武器表”中取。
  // 兼容：若 playerContext 未包含武器背包，返回空数组。
  const m = playerContext.match(/武器背包：([^。]+)[。]?/);
  const seg = (m?.[1] ?? "").trim();
  if (!seg) return [];
  const ids = seg
    .split("，")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split("[")[0]!.trim())
    .filter(Boolean);

  // 兼容兜底（旧链路遗留）：
  // 可选提供“武器背包详情：<json>”用于回写完整对象。
  // 当前主链路已改为 `clientState.weaponBag` 权威输入，这里只作为旧存档/旧 prompt 的最后兜底。
  const detail = playerContext.match(/武器背包详情：([\s\S]{0,6000})$/)?.[1];
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as unknown;
      const arr = asWeaponArray(parsed);
      if (arr.length > 0) {
        const byId = new Map(arr.map((w) => [w.id, w]));
        return ids.map((id) => byId.get(id)).filter((w): w is Weapon => !!w);
      }
    } catch {
      // ignore
    }
  }

  // 若没有详情对象，则退化为仅用 id 的“占位武器对象”（用于让 UI/指令还能引用到该 id）。
  return ids.map((id) => ({
    id,
    name: id,
    description: "（待装备武器）",
    counterThreatIds: [],
    counterTags: ["weapon_bag"],
    stability: 0,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: false,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
  }));
}

function parseEquippedWeaponIdFromPlayerContext(playerContext: string): string | null {
  const m = playerContext.match(/主手武器\[([^\]|]+)\|/);
  if (!m?.[1]) return null;
  const id = m[1].trim();
  if (!id || id === "未装备") return null;
  return id;
}

function parseIsWeaponEquippedFromPlayerContext(playerContext: string): boolean {
  return /主手武器\[(?!未装备)/.test(playerContext);
}

function parseEquipAction(latestUserInput: string): null | { kind: "equip" | "unequip" | "swap"; weaponId?: string } {
  const t = String(latestUserInput ?? "").trim();
  if (!t) return null;
  if (/^(卸下武器|解除武器装备|卸下主手武器)$/.test(t)) return { kind: "unequip" };
  const mEquip = t.match(/^(装备武器|装备主手|装备主手武器)[\s:：]*\[?([A-Z0-9-]{4,64})\]?$/i);
  if (mEquip?.[2]) return { kind: "equip", weaponId: mEquip[2].toUpperCase() };
  const mSwap = t.match(/^(更换武器|替换武器|换装武器)[\s:：]*\[?([A-Z0-9-]{4,64})\]?$/i);
  if (mSwap?.[2]) return { kind: "swap", weaponId: mSwap[2].toUpperCase() };
  return null;
}

function appendWeaponBagUpdates(record: DmRecord, updates: Array<Record<string, unknown>>) {
  const prev = Array.isArray(record.weapon_bag_updates)
    ? (record.weapon_bag_updates as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
  record.weapon_bag_updates = [...prev, ...updates];
}

function appendWeaponUpdates(record: DmRecord, updates: Array<Record<string, unknown>>) {
  const prev = Array.isArray(record.weapon_updates)
    ? (record.weapon_updates as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
  record.weapon_updates = [...prev, ...updates];
}

/**
 * 装备系统服务端裁决（基于 playerContext 的结构化语义进行兜底）。
 *
 * 目标：
 * - 让“装备/卸下/更换”成为真实状态机更新，而不是前端瞬切。
 * - 最终以系统裁决为准：即使模型没按协议输出，也会被这里强制写回 DM JSON。
 *
 * 注意：
 * - 当前版本优先使用 `clientState`（结构化上下文）作为裁决输入，`playerContext` 仅作为兼容兜底。
 * - 即使模型没按协议输出，也会被这里强制写回 DM JSON，确保“回合成本/唯一武器栏/回写字段形状”不被模型伪造。
 * - 若未来引入更强的服务端权威存档，应继续把输入源从 `clientState` 迁移为服务端快照（彻底关闭改包面）。
 */
export function applyEquipmentExecutionGuard(args: {
  dmRecord: DmRecord;
  latestUserInput: string;
  playerContext: string;
  clientState?: ClientStructuredContextV1 | null;
}): DmRecord {
  const act = parseEquipAction(args.latestUserInput);
  if (!act) return args.dmRecord;
  const record = { ...args.dmRecord };

  // 优先使用结构化上下文；playerContext 仅作兼容兜底（不再作为主要裁决输入）。
  const hasEquipped = (() => {
    const eq = args.clientState?.equippedWeapon;
    if (eq && typeof eq === "object" && !Array.isArray(eq) && typeof (eq as any).id === "string") return true;
    return parseIsWeaponEquippedFromPlayerContext(args.playerContext);
  })();
  const equippedId = (() => {
    const eq = args.clientState?.equippedWeapon;
    if (eq && typeof eq === "object" && !Array.isArray(eq) && typeof (eq as any).id === "string") return String((eq as any).id).toUpperCase();
    return parseEquippedWeaponIdFromPlayerContext(args.playerContext);
  })();
  const bag = (() => {
    const b = args.clientState?.weaponBag;
    if (Array.isArray(b) && b.length > 0) {
      return b
        .filter((x) => !!x && typeof x === "object" && !Array.isArray(x))
        .map((x) => x as unknown as Weapon)
        .slice(0, 24);
    }
    return parseWeaponBagFromPlayerContext(args.playerContext);
  })();

  // 装备/换装/卸下：从节奏与反作弊角度统一为“消耗 1 回合”（consumes_time=true）
  record.consumes_time = true;

  if (act.kind === "unequip") {
    if (!hasEquipped || !equippedId) {
      record.is_action_legal = false;
      record.narrative = `${record.narrative ?? ""}\n\n你当前没有装备武器，无法卸下。`.trim();
      return record;
    }
    // 规则：卸下回武器背包
    appendWeaponUpdates(record, [{ unequip: true }]);
    appendWeaponBagUpdates(record, [{ addEquippedWeaponId: equippedId }]);
    record.narrative = `${record.narrative ?? ""}\n\n你卸下了武器，武器已回到背包。`.trim();
    return record;
  }

  const targetId = act.weaponId ?? "";
  if (!targetId) return record;

  const targetWeapon = bag.find((w) => String(w.id).toUpperCase() === targetId) ?? null;
  if (!targetWeapon) {
    record.is_action_legal = false;
    record.narrative = `${record.narrative ?? ""}\n\n该武器不在你的武器背包中，无法装备。`.trim();
    return record;
  }

  if (act.kind === "equip") {
    if (hasEquipped) {
      record.is_action_legal = false;
      record.narrative = `${record.narrative ?? ""}\n\n武器栏已被占用。请先卸下武器，再装备新武器（或使用“更换武器”指令）。`.trim();
      return record;
    }
    appendWeaponUpdates(record, [{ weapon: targetWeapon }]);
    appendWeaponBagUpdates(record, [{ removeWeaponId: targetWeapon.id }]);
    record.narrative = `${record.narrative ?? ""}\n\n你完成装备，武器已进入武器栏。`.trim();
    return record;
  }

  // swap
  if (!hasEquipped || !equippedId) {
    // 视为 equip
    appendWeaponUpdates(record, [{ weapon: targetWeapon }]);
    appendWeaponBagUpdates(record, [{ removeWeaponId: targetWeapon.id }]);
    record.narrative = `${record.narrative ?? ""}\n\n你完成装备，武器已进入武器栏。`.trim();
    return record;
  }

  if (equippedId.toUpperCase() === targetWeapon.id.toUpperCase()) {
    record.is_action_legal = false;
    record.narrative = `${record.narrative ?? ""}\n\n你已经装备了这把武器，无需更换。`.trim();
    return record;
  }

  appendWeaponUpdates(record, [{ weapon: targetWeapon }]);
  appendWeaponBagUpdates(record, [
    { removeWeaponId: targetWeapon.id },
    { addEquippedWeaponId: equippedId },
  ]);
  record.narrative = `${record.narrative ?? ""}\n\n你更换了武器，新武器已生效，旧武器已回到背包。`.trim();
  return record;
}

