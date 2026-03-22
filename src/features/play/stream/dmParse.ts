import type { DMJson } from "./types";

/**
 * 从文本中截取**第一个**顶层 JSON 对象（`{`…`}`），正确处理字符串内的括号与转义。
 * 用于模型重复输出两段相同 `{...}{...}` 时避免贪婪正则把两段拼成非法 JSON。
 */
export function extractFirstBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
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
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const objectSlice = extractFirstBalancedJsonObject(cleanContent);
  if (!objectSlice) {
    return null;
  }

  let parsedData: DMJson;
  try {
    parsedData = JSON.parse(objectSlice) as DMJson;
  } catch {
    console.error("JSON Parsing Failed, raw content:", raw);
    return null;
  }

  if (
    typeof parsedData?.is_action_legal === "boolean" &&
    typeof parsedData?.sanity_damage === "number" &&
    typeof parsedData?.narrative === "string" &&
    typeof parsedData?.is_death === "boolean"
  ) {
    return parsedData;
  }
  return null;
}
