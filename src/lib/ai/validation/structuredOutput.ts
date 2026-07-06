// src/lib/ai/validation/structuredOutput.ts
import { jsonrepair } from "jsonrepair";

/** True when body looks like a single JSON object (after common markdown fences). */
export function isValidJsonObjectString(content: string): boolean {
  const t = content.trim().replace(/^```json\s*|```$/g, "").trim();
  if (!t) return false;
  try {
    const o = JSON.parse(t) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o);
  } catch {
    return false;
  }
}

/**
 * 提取首个「配平的」顶层 {...} 对象片段；忽略字符串内部的花括号与转义。
 * 用于从带前言 / 后缀 / markdown 围栏的模型输出里定位真正的 JSON 对象。
 */
function extractFirstBalancedJsonObject(text: string): string | null {
  const s = text.trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1).trim();
    }
  }
  return null;
}

/**
 * 离线 / 后台 reasoner 产物兜底修复：把「接近 JSON 对象」的模型输出修成合法 JSON 对象字符串。
 *
 * 适用场景：DeepSeek-R1 / 豆包思考类等 reasoner 在强制 JSON 时仍可能输出尾逗号、注释、单引号、
 * markdown 围栏或前后缀说明文字。这些瑕疵会让严格 `JSON.parse` / `isValidJsonObjectString` 直接判失败，
 * 进而让 world director 等离线 tick 整轮丢弃产物、agenda 永不落地。
 *
 * 安全性：调用方只在内容「已判定为不合法、本就会被丢弃」时才走到这里，因此对既有可解析输出零影响，
 * 只可能把原本必然失败的 case 修成成功，不会回归任何当前可用路径。仅用于离线链路，不进入在线
 * PLAYER_CHAT 首包路径。修不成时返回 null，调用方按失败处理。
 */
export function repairJsonObjectString(content: string): string | null {
  const raw = (content ?? "").trim();
  if (!raw) return null;
  const fenceStripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const candidates = [
    extractFirstBalancedJsonObject(fenceStripped),
    fenceStripped,
    extractFirstBalancedJsonObject(raw),
    raw,
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    // 只信任「像带字段的 JSON 对象」的候选：真实模型输出必含 "key":value 形式的冒号。
    // 借此避免 jsonrepair 对 `{ not json` 这类纯垃圾过度臆造出合法对象，保留上游的坏输入护栏。
    if (!c.includes(":")) continue;
    try {
      const repaired = jsonrepair(c).trim();
      if (isValidJsonObjectString(repaired)) return repaired;
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return null;
}
