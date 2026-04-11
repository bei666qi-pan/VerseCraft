import { jsonrepair } from "jsonrepair";
import type { DMJson } from "./types";
import {
  hasProtocolLeakSignature,
  sanitizeNarrativeLeakageForFinal,
  stripTrailingLeakedObject,
} from "@/lib/playRealtime/protocolGuard";
import { sanitizeDisplayedNarrative } from "@/features/play/render/sanitizeDisplayedNarrative";

const MAX_BRACE_SCAN = 64;
const LOG_HEAD_CHARS = 180;
const LOG_TAIL_CHARS = 100;

/**
 * 从 `start`（须为 `{`）起截取**一个**平衡顶层对象，正确处理字符串内的括号与转义。
 */
export function extractBalancedJsonObjectFrom(s: string, start: number): string | null {
  if (start < 0 || start >= s.length || s[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escapeNext = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 扫描文本中多个“平衡顶层 JSON 对象”候选（`{...}`），用于：
 * - 模型重复输出多段 JSON
 * - 前置状态帧 / wrapper 对象
 * - 前段残缺对象 + 后段完整对象
 *
 * 注意：这里只做“对象切片”，不做 JSON.parse。
 */
export function extractBalancedJsonObjectCandidates(s: string, maxCandidates = MAX_BRACE_SCAN): string[] {
  const src = String(s ?? "");
  const out: string[] = [];
  if (!src) return out;
  const max = Math.max(1, Math.min(256, Math.trunc(maxCandidates)));
  for (let i = 0; i < src.length && out.length < max; i++) {
    if (src[i] !== "{") continue;
    const slice = extractBalancedJsonObjectFrom(src, i);
    if (!slice || slice.length < 2) continue;
    out.push(slice);
    // 跳过已消费对象，避免 O(n^2) 重复扫描
    i += slice.length - 1;
  }
  return out;
}

/**
 * 从文本中截取**第一个**顶层 JSON 对象（`{`…`}`）。
 * 用于模型重复输出两段相同 `{...}{...}` 时避免把两段拼成非法 JSON。
 */
export function extractFirstBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  return extractBalancedJsonObjectFrom(s, start);
}

function isValidDmShape(data: unknown): data is DMJson {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as DMJson).is_action_legal === "boolean" &&
    typeof (data as DMJson).sanity_damage === "number" &&
    typeof (data as DMJson).narrative === "string" &&
    typeof (data as DMJson).is_death === "boolean"
  );
}

function parseSliceToDm(slice: string): DMJson | null {
  try {
    const data = JSON.parse(slice) as unknown;
    if (isValidDmShape(data)) return data;
  } catch {
    /* try repair */
  }
  try {
    const repaired = jsonrepair(slice);
    const data = JSON.parse(repaired) as unknown;
    if (isValidDmShape(data)) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function optionsArrayFromUnknownPayload(data: unknown): unknown[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const legacy = Array.isArray(o.options) ? o.options : null;
  if (legacy && legacy.length > 0) return legacy;
  const decision = Array.isArray(o.decision_options) ? o.decision_options : null;
  if (decision && decision.length > 0) return decision;
  return legacy ?? decision;
}

function parseSliceToRegenOptions(slice: string): unknown[] | null {
  try {
    const data = JSON.parse(slice) as unknown;
    const arr = optionsArrayFromUnknownPayload(data);
    return arr && arr.length > 0 ? arr : null;
  } catch {
    /* try repair */
  }
  try {
    const repaired = jsonrepair(slice);
    const data = JSON.parse(repaired) as unknown;
    const arr = optionsArrayFromUnknownPayload(data);
    return arr && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

/**
 * `options_regen_only` 等场景下模型常只输出 `{"options":[...]}`，不满足 {@link tryParseDM} 的完整 DM 形态；
 * 从 SSE 折叠后的原文中扫描 JSON 对象并提取非空 `options` / `decision_options` 数组。
 */
export function extractRegenOptionsFromRaw(raw: string): unknown[] | null {
  const cleanContent = raw
    .replace(/^\uFEFF/, "")
    .replace(/__VERSECRAFT_FINAL__:/g, "")
    .replace(/__VERSECRAFT_STATUS__:[^\n]*/g, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const bracePositions: number[] = [];
  for (let i = 0; i < cleanContent.length && bracePositions.length < MAX_BRACE_SCAN; i++) {
    if (cleanContent[i] === "{") bracePositions.push(i);
  }

  for (const pos of bracePositions) {
    const objectSlice = extractBalancedJsonObjectFrom(cleanContent, pos);
    if (!objectSlice || objectSlice.length < 2) continue;
    const opts = parseSliceToRegenOptions(objectSlice);
    if (opts && opts.length > 0) return opts;
  }
  return null;
}

function logTryParseFailure(cleanContent: string, candidateCount: number): void {
  const head = cleanContent.slice(0, LOG_HEAD_CHARS);
  const tail =
    cleanContent.length > LOG_HEAD_CHARS + LOG_TAIL_CHARS
      ? cleanContent.slice(-LOG_TAIL_CHARS)
      : "";
  console.error(
    `[tryParseDM] JSON parse failed after ${candidateCount} candidate object(s), totalLength=${cleanContent.length}, head=${JSON.stringify(head)}${
      tail ? `, tail=${JSON.stringify(tail)}` : ""
    }`
  );
}

function dmRootKeyScoreFromSlice(slice: string): number {
  // 纯字符串层评分：不做 parse，避免坏 JSON 直接抛异常。
  // 目的：优先尝试更像“DM 根对象”的候选，减少把 wrapper/状态帧当成主对象。
  const has = (k: string) => slice.includes(k);
  let score = 0;
  if (has('"is_action_legal"')) score += 4;
  if (has('"narrative"')) score += 4;
  if (has('"is_death"')) score += 3;
  if (has('"sanity_damage"')) score += 3;
  if (has('"consumes_time"')) score += 1;
  if (has('"options"')) score += 1;
  // 极端小对象更可能是 wrapper；极端大对象也可能是拼接污染。轻量倾向中等长度。
  const len = slice.length;
  if (len >= 80) score += 1;
  if (len > 30_000) score -= 2;
  return score;
}

/**
 * Extract narrative from streaming JSON by finding the exact JSON string boundaries.
 * Scans for the closing unescaped double-quote to avoid ALL JSON key leakage,
 * regardless of key ordering or mid-stream truncation.
 */
export function extractNarrative(raw: string): string {
  const keyIdx = raw.indexOf('"narrative"');
  if (keyIdx === -1) return "";
  const colonIdx = raw.indexOf(":", keyIdx + 11);
  if (colonIdx === -1) return "";

  let openQuote = -1;
  for (let j = colonIdx + 1; j < raw.length; j++) {
    const ch = raw[j];
    if (ch === '"') {
      openQuote = j;
      break;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") return "";
  }
  if (openQuote === -1) return "";

  let closeQuote = -1;
  for (let j = openQuote + 1; j < raw.length; j++) {
    if (raw[j] === "\\") {
      j++;
      continue;
    }
    if (raw[j] === '"') {
      closeQuote = j;
      break;
    }
  }

  let text: string;
  if (closeQuote !== -1) {
    text = raw.substring(openQuote + 1, closeQuote);
  } else {
    text = raw.substring(openQuote + 1);
    if (text.endsWith("\\")) text = text.slice(0, -1);
  }

  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const c = text[i + 1];
      switch (c) {
        case "n":
          out.push("\n");
          i++;
          break;
        case "r":
          out.push("\r");
          i++;
          break;
        case "t":
          out.push("\t");
          i++;
          break;
        case '"':
          out.push('"');
          i++;
          break;
        case "\\":
          out.push("\\");
          i++;
          break;
        case "/":
          out.push("/");
          i++;
          break;
        case "b":
          out.push("\b");
          i++;
          break;
        case "f":
          out.push("\f");
          i++;
          break;
        default:
          out.push(c);
          i++;
          break;
      }
    } else {
      out.push(text[i] ?? "");
    }
  }
  const narrativePreview = out.join("");
  /**
   * 展示层兜底（仅用于流式预览）：
   * - 这里不做状态写回，只防止“半截协议/二段 JSON”在屏幕上裸露。
   * - 若命中协议污染，预览直接 fail-closed 返回统一提示，不透传脏原文。
   */
  const shown = sanitizeDisplayedNarrative(stripTrailingLeakedObject(narrativePreview));
  if (shown.blocked) return shown.text;
  return shown.text;
}

export const FALLBACK_DM: DMJson = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "（系统波动）周围的空气似乎扭曲了一瞬，请继续你的行动...",
  is_death: false,
  consumes_time: true,
};

export type DmParseFailureReason =
  | "no_balanced_object"
  | "json_parse_failed"
  | "protocol_guard_rejected";

export interface TryParseDmDetailedResult {
  dm: DMJson | null;
  reason: DmParseFailureReason | null;
}

export function tryParseDM(raw: string): DMJson | null {
  return tryParseDMDetailed(raw).dm;
}

export function tryParseDMDetailed(raw: string): TryParseDmDetailedResult {
  const cleanContent = raw
    .replace(/^\uFEFF/, "")
    .replace(/__VERSECRAFT_FINAL__:/g, "")
    .replace(/__VERSECRAFT_STATUS__:[^\n]*/g, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const candidates = extractBalancedJsonObjectCandidates(cleanContent, MAX_BRACE_SCAN);
  const ranked = candidates
    .map((slice, idx) => ({ slice, idx, score: dmRootKeyScoreFromSlice(slice) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // 同分时保守：优先更早出现的对象，避免后置拼接注入覆盖前置合法对象
      return a.idx - b.idx;
    });

  let candidatesTried = 0;
  let sawProtocolRejected = false;
  for (const c of ranked) {
    const objectSlice = c.slice;
    if (!objectSlice || objectSlice.length < 2) continue;
    candidatesTried++;
    const dm = parseSliceToDm(objectSlice);
    if (dm) {
      /**
       * 协议修复（状态层）：
       * - 允许 code fence/反引号清理这类“格式污染”；
       * - 命中协议泄漏特征时不做“脑补修复”，而是保守拒绝写回（fail-closed）。
       */
      dm.narrative = dm.narrative
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`\n]{1,80})`/g, "$1");
      const sanitized = sanitizeNarrativeLeakageForFinal(dm.narrative);
      if (sanitized.degraded || hasProtocolLeakSignature(sanitized.narrative)) {
        // 重要：遇到一个“污染候选”不应立刻判死，避免浪费后面完整干净对象。
        // 仍保持 fail-closed：若所有候选都被拒绝，最终返回 protocol_guard_rejected。
        sawProtocolRejected = true;
        continue;
      }
      dm.narrative = sanitized.narrative;
      return { dm, reason: null };
    }
  }

  if (candidatesTried === 0) {
    console.error("[tryParseDM] no balanced `{...}` slice found");
    return { dm: null, reason: "no_balanced_object" };
  }
  if (sawProtocolRejected) {
    // 若曾命中协议污染拒绝，优先暴露该原因，便于上层区分“可重试解析”与“安全拦截”。
    return { dm: null, reason: "protocol_guard_rejected" };
  }
  logTryParseFailure(cleanContent, candidatesTried);
  return { dm: null, reason: "json_parse_failed" };
}
