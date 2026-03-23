import { createHash } from "node:crypto";

/** 全角标点与常见空白 → 半角/空格，便于稳定哈希与去重。 */
const FULLWIDTH_PUNCT_MAP: Record<string, string> = {
  "，": ",",
  "。": ".",
  "、": ",",
  "；": ";",
  "：": ":",
  "？": "?",
  "！": "!",
  "「": '"',
  "」": '"',
  "『": '"',
  "』": '"',
  "（": "(",
  "）": ")",
  "【": "[",
  "】": "]",
  "《": "<",
  "》": ">",
  "—": "-",
  "…": "...",
  "　": " ",
};

/**
 * 对中英文标点、空白、全角半角做稳定归一（NFKC + 映射 + 空白折叠）。
 * 用于 request_hash 幂等，不改变语义检索用原文（embed 可另取 input）。
 */
export function normalizeForHash(input: string): string {
  let s = input.normalize("NFKC");
  let out = "";
  for (const ch of s) {
    out += FULLWIDTH_PUNCT_MAP[ch] ?? ch;
  }
  out = out
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/ +/g, " ")
    .trim()
    .toLowerCase();
  return out;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
