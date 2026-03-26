import { jsonrepair } from "jsonrepair";
import type { DMJson } from "./types";

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
  return out.join("");
}

export const FALLBACK_DM: DMJson = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "（系统波动）周围的空气似乎扭曲了一瞬，请继续你的行动...",
  is_death: false,
  consumes_time: true,
};

export function tryParseDM(raw: string): DMJson | null {
  const cleanContent = raw
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const bracePositions: number[] = [];
  for (let i = 0; i < cleanContent.length && bracePositions.length < MAX_BRACE_SCAN; i++) {
    if (cleanContent[i] === "{") bracePositions.push(i);
  }

  let candidatesTried = 0;
  for (const pos of bracePositions) {
    const objectSlice = extractBalancedJsonObjectFrom(cleanContent, pos);
    if (!objectSlice || objectSlice.length < 2) continue;
    candidatesTried++;
    const dm = parseSliceToDm(objectSlice);
    if (dm) {
      dm.narrative = dm.narrative
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`\n]{1,80})`/g, "$1");
      return dm;
    }
  }

  if (candidatesTried === 0) {
    console.error("[tryParseDM] no balanced `{...}` slice found");
    return null;
  }
  logTryParseFailure(cleanContent, candidatesTried);
  return null;
}
