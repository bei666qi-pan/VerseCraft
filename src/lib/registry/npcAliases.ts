/**
 * NPC aliases 单一真源（v4 NPC 系统）
 *
 * 背景：历史上 SAFE_NPC_ALIASES 内联在 `codexAutoCapture.ts` 内（4 条），
 * 2026-07 v4 改造后扩到 5+ 条，并被 narrative validator 复用。
 * 提取到本文件后，命名/关系/canonical 名册可以共享同一份 source-of-truth。
 *
 * 约束：
 * - 键 = NPC id（`N-XXX` 形式）
 * - 值 = 口语化 alias 列表（用于 narrative 文本 / 玩家口吻 / codex keyword）
 * - alias 长度 ≥ 2（与 `codexAutoCapture` 现有逻辑保持一致）
 * - alias 不与别的 NPC 真名冲突
 * - alias 本身可被 `extractChineseNames` 的 alias 子集命中
 *
 * 与 NPCS 表的关系：alias 是 NPC 真名的口语化补充，**不是**独立身份。
 * 增加/修改 alias 时必须同步检查：
 *   1. `src/lib/registry/npcs.ts` 中对应 NPC 的 lore 字段
 *   2. `npcConsistencyBoundaryPackets.ts` 在每回合从 canonical registry 即时投影名册
 *   3. `scripts/verify-canonical-name-prompt.mjs` 通过 (`pnpm prompts:regen:verify`)
 */
export const NPC_ALIASES: Record<string, readonly string[]> = {
  // v3 既有 4 条（迁移自 codexAutoCapture.ts:31-36）
  "N-003": ["老王"],
  "N-004": ["阿花"],
  "N-006": ["张先生"],
  "N-008": ["老刘"],
  // v4 新增：5 个描述式 NPC 升格为真名后，保留口语化 alias
  "N-005": ["老周", "周阿伯"],
  "N-009": ["织儿"],
  "N-012": ["陶师"],
  "N-016": ["章姐"],
  "N-017": ["红姨"],
  // v4 新增：N-021 阿绣（N-009 双胞胎分裂的第二位）
  "N-021": ["绣儿"],
  // v4 ambient 升格 6 条
  "N-022": ["马甲叔"],
  "N-023": ["蓝盆姐"],
  "N-024": ["驼背老"],
  "N-025": ["夜班阿瘦"],
  "N-026": ["开关姐"],
  "N-027": ["睡衣姐"],
  // v4 全楼层新增 16 条
  "N-028": ["B2守夜"],
  "N-029": ["前台周"],
  "N-030": ["张师"],
  "N-031": ["画室老谢"],
  "N-032": ["六楼老陈"],
  "N-033": ["七楼老吴"],
  "N-034": ["点灯珍"],
  "N-035": ["夜咖小弟"],
  "N-036": ["老秦"],
  "N-037": ["方姨"],
  "N-038": ["阿芳"],
  "N-039": ["王老师"],
  "N-040": ["小林"],
  "N-041": ["小郑"],
  "N-042": ["老庄"],
  "N-043": ["锅炉老钱"],
};

/** 全部 alias 摊平的 Set（O(N) 启动期构建一次）。 */
export const NPC_ALIAS_FLAT_SET: ReadonlySet<string> = new Set(
  Object.values(NPC_ALIASES).flat(),
);

/** 根据 id 查 alias；若不存在返回空数组（不会抛错）。 */
export function getNpcAliases(id: string): readonly string[] {
  return NPC_ALIASES[id] ?? [];
}
