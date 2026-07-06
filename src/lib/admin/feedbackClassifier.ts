/**
 * 反馈文本的轻量负向词判定，供 service.ts 的 getFeedbackInsights 使用。
 *
 * 独立成纯函数模块（不依赖 DB/env）有两个目的：
 * 1. 单一职责：文本分类逻辑和 SQL 查询/编排逻辑分开。
 * 2. 可测试性：service.ts 会传递引入 @/db（进而要求 DATABASE_URL 等服务端配置），
 *    把这几个纯函数独立出来后可以在不连接数据库的情况下直接跑单元测试。
 *
 * 修复的问题：朴素的 `text.includes(word)` 会把"不卡""没问题""不差""没崩"这类否定表达
 * 误判为负向反馈（例如"很好，不卡"里的"卡"）。这里只做轻量的"关键词前 1-2 个字符是否是
 * 否定词"判断，不追求完整的否定辖域/句法分析。
 */

export const NEGATION_MARKERS = ["不", "没有", "没", "无", "未", "别"];

export const DEFAULT_NEGATIVE_WORDS = ["差", "卡", "慢", "崩", "bug", "不好", "垃圾", "问题", "失败"];

/** 判断 text 中是否存在未被否定词修饰的 word 出现（大小写不敏感由调用方在传入前处理）。 */
export function hasUnnegatedKeyword(text: string, word: string): boolean {
  let idx = text.indexOf(word);
  while (idx !== -1) {
    const before = text.slice(Math.max(0, idx - 2), idx);
    const negated = NEGATION_MARKERS.some((marker) => before.endsWith(marker));
    if (!negated) return true;
    idx = text.indexOf(word, idx + word.length);
  }
  return false;
}

/** 对一段反馈文本判断是否应计入"负向反馈"统计。 */
export function isNegativeFeedbackText(content: string, negativeWords: string[] = DEFAULT_NEGATIVE_WORDS): boolean {
  const t = content.toLowerCase();
  return negativeWords.some((w) => hasUnnegatedKeyword(t, w));
}
