/**
 * Case Registry — 全量评测 case 元数据注册与自检
 *
 * 每个 suite 的 case 在首次加载时注册到 registry，
 * registry 提供 scheme 校验、去重检测、计数一致性检查。
 * 解决 F6（计数漂移）：suite.json 的计数由脚本从 registry 实数生成。
 */

import type { RegistryEntry, CaseDifficulty, CaseSource } from "./types";

const _registry = new Map<string, RegistryEntry>();

/** 注册单个 case */
export function registerCase(entry: RegistryEntry): void {
  const existing = _registry.get(entry.id);
  if (existing) {
    // 允许同名但同 suite 的覆盖
    if (existing.suite !== entry.suite) {
      console.warn(
        `[Registry] case "${entry.id}" 已在 suite "${existing.suite}" 注册，跳过 "${entry.suite}" 的重复注册`
      );
      return;
    }
  }
  _registry.set(entry.id, entry);
}

/** 批量注册 */
export function registerCases(entries: RegistryEntry[]): void {
  for (const entry of entries) registerCase(entry);
}

/** 按 suite 查询 */
export function getCasesBySuite(suite: string): RegistryEntry[] {
  return Array.from(_registry.values()).filter((e) => e.suite === suite);
}

/** 按 difficulty 过滤 */
export function getCasesByDifficulty(difficulty: CaseDifficulty): RegistryEntry[] {
  return Array.from(_registry.values()).filter((e) => e.difficulty === difficulty);
}

/** 按 source 过滤 */
export function getCasesBySource(source: CaseSource): RegistryEntry[] {
  return Array.from(_registry.values()).filter((e) => e.source === source);
}

/** 获取全量注册列表 */
export function getAllCases(): RegistryEntry[] {
  return Array.from(_registry.values());
}

/** 自检：检查是否有 case 缺少必需字段 */
export function validateRegistry(): string[] {
  const errors: string[] = [];
  for (const entry of _registry.values()) {
    if (!entry.id) errors.push("case_id 为空");
    if (!entry.suite) errors.push(`case ${entry.id}: suite 缺失`);
    if (!entry.difficulty) errors.push(`case ${entry.id}: difficulty 缺失`);
    if (!entry.source) errors.push(`case ${entry.id}: source 缺失`);
  }
  return errors;
}

/** 获取指定 suite 的 case 计数 */
export function getCaseCount(suite: string): number {
  return getCasesBySuite(suite).length;
}

/** 生成 suite.json 计数映射 */
export function generateSuiteCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of _registry.values()) {
    counts[entry.suite] = (counts[entry.suite] ?? 0) + 1;
  }
  return counts;
}

/** 清空注册表（测试用） */
export function resetRegistry(): void {
  _registry.clear();
}
