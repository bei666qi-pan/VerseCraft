/**
 * taskCopyValidator.ts — 任务文案 lint 与确定性替换
 *
 * 从 DESIGN.md §7-8 派生，在 resolveDmTurn 的 task normalization 段接线。
 * 目标是在不变更模型输出的前提下拦截/标记文案质量问题，并做可逆软校正。
 *
 * == 设计原则 ==
 * 1. 只 lint title/desc/nextHint 三个由 DM 直接输出的字段。
 * 2. lint 不修改内容（通知 issues 给调用方自行决定降级/遥测）。
 * 3. sanitize 做确定性替换（禁语 → 替代表达），可用于 commitTurn 的后处理。
 * 4. 不依赖 taskV2.ts 的 GameTaskV2 类型以保持低耦合；仅检查字符串。
 * 5. 所有正则匹配对大小写敏感。
 */

// ─── 出现次数级 ────────────────────────────────────

/**
 * 全能套话：模板金句，出现即违规。
 * 不依赖上下文。
 */
const UNIVERSAL_PLATITUDES: readonly RegExp[] = [
  /帮我找到/u,
  /调查一下/u,
  /了解更多/u,
  /收集更多信息/u,
  /一探究竟/u,
  /进一步调查/u,
  /寻找线索/u,
  /揭开.*真相/u,
  /看似.*实则/u,
  /看似简单.*实则不然/u,
  /完成可获得丰厚奖励/u,
  /任务奖励令人期待/u,
  /检测到新线索/u,
  /任务已更新/u,
  /目标已添加/u,
  /这是一个惊天的秘密/u,
  /你即将揭开/u,
];

/**
 * 内部标签码泄露：系统内部字段暴露到玩家可见文案
 */
const INTERNAL_TAG_LEAKS: readonly RegExp[] = [
  /visited:/u,
  /talked_to:/u,
  /guidanceLevel/u,
  /N-\d{3}/u,
  /__.*__/u,
];

/**
 * 重复模式：同一名词以不同语言/写法连续出现
 */
const DUPLICATE_PATTERNS = [
  /\b(\S{2,6})\s*[·/]\s*\1\b/u,
];

/**
 * 连词堆砌：「不仅…而且…此外…」
 */
const CONJUNCTION_CLUSTER = /不仅.*而且.*此外|不仅.*而且.*同时|首先.*其次.*最后/u;

/** 奖牌腔（已盖在 UNIVERSAL_PLATITUDES 部分，追加个别模式） */
const BOAST_NAG: readonly RegExp[] = [/丰厚奖励|令人期待|绝对安全|百分百|稳赚不赔|万无一失/u];

/** 系统音 */
const SYSTEM_TONE: readonly RegExp[] = [/检测到|已更新|已添加|目标已|系统提示/u];

/** 自吹自擂 */
const SELF_PRAISE: readonly RegExp[] = [/惊天的秘密|你即将揭开|令人震惊|史上最大/u];

// ─── 每个字段独有的 ├───

const DESC_ONLY_BANS = [/继续探索|继续调查|继续寻找|继续前行|继续前进/u];

const NEXTHINT_ONLY_BANS = [
  /继续在.*那里打探消息/u,
  /继续与.*交谈/u,
  /继续前往/u,
];

// ════════════════════════════════════════════════════
// Issue 类型
// ════════════════════════════════════════════════════

export interface TaskCopyIssue {
  field: "title" | "desc" | "nextHint";
  code: string;
  match: string;
  suggestion?: string;
}

export interface TaskCopyValidationReport {
  valid: boolean;
  issues: TaskCopyIssue[];
}

// ════════════════════════════════════════════════════
// Lint 入口
// ════════════════════════════════════════════════════

function runPatterns(text: string, patterns: readonly RegExp[]): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) out.push(m[0]);
  }
  return out;
}

export function checkTitle(t: string): TaskCopyIssue[] {
  if (!t) return [];
  const issues: TaskCopyIssue[] = [];

  // 长度检查
  if ([...t].length > 12) {
    issues.push({ field: "title", code: "title_too_long", match: t, suggestion: "标题建议 ≤12 字" });
  }

  for (const hit of runPatterns(t, UNIVERSAL_PLATITUDES)) {
    issues.push({ field: "title", code: "platitude", match: hit, suggestion: "标题应含具体名词与钩子" });
  }
  for (const hit of runPatterns(t, INTERNAL_TAG_LEAKS)) {
    issues.push({ field: "title", code: "internal_tag_leak", match: hit, suggestion: "文案禁止暴露内部标签" });
  }
  for (const hit of runPatterns(t, BOAST_NAG)) {
    issues.push({ field: "title", code: "boast", match: hit, suggestion: "禁奖牌腔" });
  }
  for (const hit of runPatterns(t, SELF_PRAISE)) {
    issues.push({ field: "title", code: "self_praise", match: hit, suggestion: "禁自吹自擂" });
  }

  return issues;
}

export function checkDesc(t: string): TaskCopyIssue[] {
  if (!t) return [{ field: "desc", code: "empty", match: "", suggestion: "desc 不应为空" }];
  const issues: TaskCopyIssue[] = [];

  // 长度检查
  if ([...t].length > 80) {
    issues.push({ field: "desc", code: "desc_too_long", match: t.slice(0, 30), suggestion: "desc 建议 ≤80 字" });
  }

  for (const hit of runPatterns(t, UNIVERSAL_PLATITUDES)) {
    issues.push({ field: "desc", code: "platitude", match: hit, suggestion: "禁万能套话" });
  }
  for (const hit of runPatterns(t, INTERNAL_TAG_LEAKS)) {
    issues.push({ field: "desc", code: "internal_tag_leak", match: hit, suggestion: "文案禁止暴露内部标签" });
  }
  for (const hit of runPatterns(t, BOAST_NAG)) {
    issues.push({ field: "desc", code: "boast", match: hit, suggestion: "禁奖牌腔" });
  }
  for (const hit of runPatterns(t, SYSTEM_TONE)) {
    issues.push({ field: "desc", code: "system_tone", match: hit, suggestion: "禁系统音" });
  }
  for (const hit of runPatterns(t, SELF_PRAISE)) {
    issues.push({ field: "desc", code: "self_praise", match: hit, suggestion: "禁自吹自擂" });
  }
  for (const hit of runPatterns(t, DESC_ONLY_BANS)) {
    issues.push({ field: "desc", code: "vague_direction", match: hit, suggestion: "描述需要具体目标，不仅是方向词" });
  }
  const conjHit = t.match(CONJUNCTION_CLUSTER);
  if (conjHit) {
    issues.push({ field: "desc", code: "conjunction_cluster", match: conjHit[0], suggestion: "禁止连词堆砌" });
  }

  return issues;
}

export function checkNextHint(t: string): TaskCopyIssue[] {
  if (!t) return [{ field: "nextHint", code: "empty", match: "", suggestion: "nextHint 不应为空" }];
  const issues: TaskCopyIssue[] = [];

  for (const hit of runPatterns(t, UNIVERSAL_PLATITUDES)) {
    issues.push({ field: "nextHint", code: "platitude", match: hit, suggestion: "禁万能套话" });
  }
  for (const hit of runPatterns(t, INTERNAL_TAG_LEAKS)) {
    issues.push({ field: "nextHint", code: "internal_tag_leak", match: hit, suggestion: "文案禁止暴露内部标签" });
  }
  for (const hit of runPatterns(t, NEXTHINT_ONLY_BANS)) {
    issues.push({ field: "nextHint", code: "vague_continue", match: hit, suggestion: "nextHint 须含具体人/地/物至少其一" });
  }

  // 检查是否含具体人/地/物（最少信号检测）
  const hasConcreteNoun = /[老|小|阿|大]/.test(t)  // 人名前缀
    || /了\d|[A-Z]\d|层|楼|室|间|房|店|摊/.test(t);  // 位置信号
  if (!hasConcreteNoun && !issues.some((i) => i.code === "vague_continue")) {
    // 不强制报错（命名方式多样），但作为轻提醒
    if (t.length > 5 && !/“|”|『|』/.test(t)) {
      issues.push({ field: "nextHint", code: "low_concrete_signal", match: t.slice(0, 20), suggestion: "nextHint 建议含具体人名、地名或物名" });
    }
  }

  return issues;
}

// ════════════════════════════════════════════════════
// Sanitize — 确定性软替换
// ════════════════════════════════════════════════════

const SANITIZE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/帮我找到/g, "找到"],
  [/调查一下/g, "留意"],
  [/了解更多/g, "弄清"],
  [/收集更多信息/g, "了解更多"],
  [/一探究竟/g, "弄清楚"],
  [/继续探索/g, "继续"],
  [/(完成|获取)丰厚奖励/g, ""],
  [/任务奖励令人期待/g, ""],
  [/检测到新线索/g, "发现了一些值得注意的动静"],
  [/任务已更新/g, ""],
  [/目标已添加/g, ""],
];

export function sanitizeTitle(t: string): string {
  let result = t;
  for (const [re, replacement] of SANITIZE_REPLACEMENTS) {
    result = result.replace(re, replacement);
  }
  return result.trim();
}

// ════════════════════════════════════════════════════
// ** 只查 title/desc/nextHint，不依赖 GameTaskV2 类型 **
// ════════════════════════════════════════════════════

export interface TaskCopyCheckInput {
  title?: string;
  desc?: string;
  nextHint?: string;
}

export function validateGameTask(t: TaskCopyCheckInput): TaskCopyValidationReport {
  const all: TaskCopyIssue[] = [
    ...checkTitle(t.title ?? ""),
    ...checkDesc(t.desc ?? ""),
    ...checkNextHint(t.nextHint ?? ""),
  ];
  return { valid: all.length === 0, issues: all };
}
