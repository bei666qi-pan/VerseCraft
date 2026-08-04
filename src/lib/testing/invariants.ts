/**
 * 玩法不变量（Gameplay Invariants）
 *
 * 结合实际业务规则建立的断言，用于自动检测玩法异常。
 * 所有断言基于项目现有配置、产品逻辑和代码语义，不凭空发明数值。
 *
 * 设计约束：
 * - 每个 invariant 是纯函数，接收状态快照，返回 { ok, message }
 * - 不访问数据库、不调用 LLM、不依赖网络
 * - 不检查密码、Token 等隐私信息
 */

import type { Weapon } from "@/lib/registry/types";

// ── 通用不变量 ────────────────────────────────────────────────────

export interface InvariantResult {
  ok: boolean;
  message: string;
  detail?: Record<string, unknown>;
}

/**
 * 值在合法范围内（不包含 NaN, Infinity, -Infinity）。
 */
export function invariantFiniteNumber(
  label: string,
  value: unknown
): InvariantResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} 不是合法数值: ${String(value)}`, detail: { value } };
  }
  return { ok: true, message: "" };
}

/**
 * 值非负。
 */
export function invariantNonNegative(
  label: string,
  value: number
): InvariantResult {
  const fin = invariantFiniteNumber(label, value);
  if (!fin.ok) return fin;
  if (value < 0) {
    return { ok: false, message: `${label} 为负值: ${value}`, detail: { value } };
  }
  return { ok: true, message: "" };
}

// ── 武器不变量 ────────────────────────────────────────────────────

/**
 * 武器稳定性在 [0, 100] 范围内。
 */
export function invariantWeaponStability(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon) return { ok: true, message: "" };
  const s = weapon.stability;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 0 || s > 100) {
    return { ok: false, message: `武器稳定性越界: ${s}`, detail: { weaponId: weapon.id, stability: s } };
  }
  return { ok: true, message: "" };
}

/**
 * 武器污染值在 [0, 100] 范围内。
 */
export function invariantWeaponContamination(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon) return { ok: true, message: "" };
  const c = weapon.contamination;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 100) {
    return { ok: false, message: `武器污染越界: ${c}`, detail: { weaponId: weapon.id, contamination: c } };
  }
  return { ok: true, message: "" };
}

/**
 * 武器品级必须是合法的 WeaponTier（S/A/B/C）。
 */
export function invariantWeaponTier(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon || !weapon.tier) return { ok: true, message: "" };
  const validTiers = new Set(["S", "A", "B", "C"]);
  if (!validTiers.has(weapon.tier)) {
    return { ok: false, message: `武器品级非法: ${weapon.tier}`, detail: { weaponId: weapon.id, tier: weapon.tier } };
  }
  return { ok: true, message: "" };
}

/**
 * 武器灌注的 turnsLeft 为非负整数。
 */
export function invariantWeaponInfusions(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon) return { ok: true, message: "" };
  for (const inf of weapon.currentInfusions ?? []) {
    if (typeof inf.turnsLeft !== "number" || !Number.isFinite(inf.turnsLeft) || inf.turnsLeft < 0) {
      return {
        ok: false,
        message: `武器灌注 turnsLeft 非法: ${inf.turnsLeft}`,
        detail: { weaponId: weapon.id, threatTag: inf.threatTag, turnsLeft: inf.turnsLeft },
      };
    }
  }
  return { ok: true, message: "" };
}

/**
 * 武器改装不重复。
 */
export function invariantWeaponModsUnique(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon) return { ok: true, message: "" };
  const mods = weapon.currentMods ?? [];
  const unique = new Set(mods);
  if (unique.size !== mods.length) {
    return { ok: false, message: `武器改装存在重复`, detail: { weaponId: weapon.id, mods } };
  }
  return { ok: true, message: "" };
}

/**
 * 武器模组数量不超过槽位上限。
 */
export function invariantWeaponModSlotLimit(weapon: Weapon | null | undefined): InvariantResult {
  if (!weapon) return { ok: true, message: "" };
  const mods = weapon.currentMods ?? [];
  const maxSlots = weapon.modSlots?.length ?? 0;
  if (maxSlots > 0 && mods.length > maxSlots) {
    return {
      ok: false,
      message: `武器模组超过槽位: ${mods.length}/${maxSlots}`,
      detail: { weaponId: weapon.id, mods, maxSlots },
    };
  }
  return { ok: true, message: "" };
}

// ── 资源不变量 ────────────────────────────────────────────────────

/**
 * 材料不会出现负值。
 */
export function invariantResourcesNonNegative(resources: Record<string, number>): InvariantResult[] {
  const results: InvariantResult[] = [];
  for (const [key, value] of Object.entries(resources)) {
    const r = invariantNonNegative(`资源 ${key}`, value);
    if (!r.ok) results.push(r);
  }
  return results;
}

// ── 状态幂等性 ────────────────────────────────────────────────────

/**
 * 保存/加载往返后关键状态等价。
 * 比较两个状态快照的指定字段。
 */
export function invariantSaveLoadRoundtrip(
  label: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): InvariantResult[] {
  const results: InvariantResult[] = [];
  for (const field of fields) {
    const b = JSON.stringify(before[field] ?? null);
    const a = JSON.stringify(after[field] ?? null);
    if (b !== a) {
      results.push({
        ok: false,
        message: `${label}.${field} 存档往返不一致`,
        detail: { field, before: b, after: a },
      });
    }
  }
  return results;
}

// ── 武器不变量批量检查 ────────────────────────────────────────────

export function checkWeaponInvariants(
  weapon: Weapon | null | undefined,
  label: string
): InvariantResult[] {
  return [
    { ...invariantWeaponStability(weapon), message: invariantWeaponStability(weapon).ok ? "" : `[${label}] ${invariantWeaponStability(weapon).message}` },
    { ...invariantWeaponContamination(weapon), message: invariantWeaponContamination(weapon).ok ? "" : `[${label}] ${invariantWeaponContamination(weapon).message}` },
    { ...invariantWeaponTier(weapon), message: invariantWeaponTier(weapon).ok ? "" : `[${label}] ${invariantWeaponTier(weapon).message}` },
    { ...invariantWeaponInfusions(weapon), message: invariantWeaponInfusions(weapon).ok ? "" : `[${label}] ${invariantWeaponInfusions(weapon).message}` },
    { ...invariantWeaponModsUnique(weapon), message: invariantWeaponModsUnique(weapon).ok ? "" : `[${label}] ${invariantWeaponModsUnique(weapon).message}` },
    { ...invariantWeaponModSlotLimit(weapon), message: invariantWeaponModSlotLimit(weapon).ok ? "" : `[${label}] ${invariantWeaponModSlotLimit(weapon).message}` },
  ].filter((r) => !r.ok);
}

export function checkAllInvariants(label: string, checks: InvariantResult[]): InvariantResult[] {
  return checks.filter((r) => !r.ok);
}
