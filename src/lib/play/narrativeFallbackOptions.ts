// src/lib/play/narrativeFallbackOptions.ts
//
// 当 minimax-m3 (Volcengine Ark Responses) 不执行 provider-level strict
// constraint decoding 时，AI 可能在 `decision_required` turn 返回 0 options。
// 该模块在 server-side 兜底：从 narrative 末段抽取 1-2 个实体（书名号 / 引号
// / 专有名词），组合出 4 条非通用 action options。
//
// 设计原则：
// 1. 兜底选项必须**不能**被 `filterNarrativeActionOptions` (optionQuality.ts)
//    过滤掉——避免再次被识别为"非叙事"或"过度通用"而丢失
// 2. 必须**包含至少 1 条与 narrative 实体相关的选项**（提升沉浸感）
// 3. 4 条必须彼此**可区分**（动作动词 / 目标不同）
// 4. 选项长度 4-18 字，符合章节预算

import { isNonNarrativeOptionLike, isOverGenericNarrativeOption } from "@/lib/play/optionQuality";

const FALLBACK_TEMPLATES_WITH_ENTITY: ReadonlyArray<(entity: string) => string> = [
  (e) => `向${e}的方向靠近`,
  (e) => `询问${e}的来历`,
  (e) => `拿出研究笔记比对${e}`,
  (e) => `记录${e}的细节后继续行动`,
];

// 兜底 4 条 (在没有抽取到 narrative 实体时使用). 注意: 全部**不在**
// `isOverGenericNarrativeOption` 过滤列表 (optionQuality.ts:49-61).
const GENERIC_FALLBACK_OPTIONS: readonly string[] = [
  "顺着声音的方向靠近",
  "俯身观察地上的痕迹",
  "低声向同伴确认情况",
  "拿出研究笔记对照眼前",
];

// 从 narrative 末段 200 字符抽取"实体锚点"——优先书名号 / 引号 / 末段 2-4 字名词
function extractNarrativeEntity(narrative: string): string {
  const tail = String(narrative ?? "").slice(-200);
  // 1) 书名号 《xxx》  (VerseCraft NPC / 地点 / 道具常用)
  const bookMatch = tail.match(/《([^》]+)》/g);
  if (bookMatch && bookMatch.length > 0) {
    const last = bookMatch[bookMatch.length - 1];
    const inner = last.replace(/[《》]/g, "").trim();
    if (inner && inner.length <= 12) return inner;
  }
  // 2) 引号 「xxx」 或 "xxx" / "xxx"
  const quoteMatch =
    tail.match(/「([^」]+)」/g) ??
    tail.match(/"([^"]+)"/g) ??
    tail.match(/"([^"]+)"/g);
  if (quoteMatch && quoteMatch.length > 0) {
    const last = quoteMatch[quoteMatch.length - 1];
    const inner = last.replace(/[「」"]/g, "").trim();
    if (inner && inner.length <= 12) return inner;
  }
  // 3) 末段专有名词: 连续 2-4 个中文字符后跟常见动词 (说/道/问/应/看/望/答)
  const npMatch = tail.match(/([一-鿿]{2,4})(说|道|问|应|看|望|答|笑|叹|喊|指|握|抬|回)/g);
  if (npMatch && npMatch.length > 0) {
    const last = npMatch[npMatch.length - 1];
    const noun = last.slice(0, -1);
    if (noun && noun.length <= 6) return noun;
  }
  return "";
}

/**
 * 在 plannedTurnMode=decision_required 但 AI 返回 0 options 时，生成 4 条
 * server-side fallback options.
 *
 * @param narrative  AI 输出的叙事文本 (用于抽取实体锚点)
 * @returns 4 条 action options, 经 `filterNarrativeActionOptions` 等价过滤
 */
export function buildNarrativeFallbackOptions(narrative: string): string[] {
  const entity = extractNarrativeEntity(narrative);
  let candidates: string[];
  if (entity) {
    candidates = FALLBACK_TEMPLATES_WITH_ENTITY.map((tpl) => tpl(entity));
  } else {
    candidates = [...GENERIC_FALLBACK_OPTIONS];
  }
  // 再做一次等价的 filterNarrativeActionOptions 过滤 (避免被客户端 / Phase 7 二次过滤)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (!t) continue;
    if (isNonNarrativeOptionLike(t)) continue;
    if (isOverGenericNarrativeOption(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 4) break;
  }
  // 万一全部被过滤 (极端 edge case), 退回 4 个硬编码兜底
  if (out.length < 4) {
    return [
      "顺着声音的方向靠近",
      "俯身观察地上的痕迹",
      "低声向同伴确认情况",
      "拿出研究笔记对照眼前",
    ];
  }
  return out;
}
