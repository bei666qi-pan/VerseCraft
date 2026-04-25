"use client";

import { memo, type ReactNode } from "react";
import { LOCATION_LABELS } from "./locationLabels";

export const BLOOD_MARKER = "{{BLOOD}}";
const BLOOD_END = "{{/BLOOD}}";
const AUTO_PARAGRAPH_ENABLED = process.env.NEXT_PUBLIC_CHAT_AUTO_PARAGRAPH !== "0";
const AUTO_PARAGRAPH_MIN_CHARS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CHAT_AUTO_PARAGRAPH_MIN_CHARS ?? "100");
  if (!Number.isFinite(raw)) return 100;
  return Math.min(220, Math.max(60, Math.floor(raw)));
})();

function isListLikeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return /^([-*•]\s+|\d+[.)]\s+|[一二三四五六七八九十]+、)/.test(t);
}

function nextNonWhitespaceChar(s: string, from: number): string {
  let i = from;
  while (i < s.length) {
    const ch = s[i] ?? "";
    if (!/\s/.test(ch)) return ch;
    i += 1;
  }
  return "";
}

export function autoParagraphizeNarrative(
  text: string,
  opts?: { minParaChars?: number }
): string {
  const safe = typeof text === "string" ? text : "";
  if (!safe) return "";
  if (safe.includes("\n\n")) return safe;
  const minParaChars = Math.max(40, Math.floor(opts?.minParaChars ?? 100));
  if (safe.length < minParaChars + 30) return safe;

  const lines = safe.split("\n");
  if (lines.some((line) => isListLikeLine(line))) return safe;

  const sentencePunct = new Set(["。", "！", "？", "!", "?"]);
  const closePunct = new Set(["”", "’", "」", "』", "\"", "'"]);
  const openQuote = new Set(["“", "‘", "「", "『", "\"", "'"]);
  let quoteDepth = 0;
  let bracketDepth = 0;
  let segLen = 0;
  let out = "";

  for (let i = 0; i < safe.length; i += 1) {
    const ch = safe[i] ?? "";
    out += ch;
    segLen += 1;

    if (ch === "“" || ch === "‘" || ch === "「" || ch === "『") quoteDepth += 1;
    else if ((ch === "”" || ch === "’" || ch === "」" || ch === "』") && quoteDepth > 0) quoteDepth -= 1;
    else if (ch === "（" || ch === "(" || ch === "[" || ch === "【") bracketDepth += 1;
    else if ((ch === "）" || ch === ")" || ch === "]" || ch === "】") && bracketDepth > 0) bracketDepth -= 1;

    if (!sentencePunct.has(ch)) continue;
    if (quoteDepth > 0 || bracketDepth > 0) continue;
    if (segLen < minParaChars) continue;

    let j = i + 1;
    while (j < safe.length && closePunct.has(safe[j] ?? "")) {
      out += safe[j] ?? "";
      j += 1;
      i += 1;
    }
    const next = nextNonWhitespaceChar(safe, j);
    // Keep dialogue beat cohesive: avoid hard split right before a new quote opener.
    if (openQuote.has(next)) continue;
    if (next !== "\n" && next !== "") {
      out += "\n\n";
    }
    segLen = 0;
  }

  return out;
}

export function splitNarrativeIntoParas(text: string): string[] {
  const safe = typeof text === "string" ? text : "";
  try {
    const byBlank = safe.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
    if (byBlank.length > 1) return byBlank;
    // 若没有空行，但存在单换行：按换行分段，提升自然阅读性（仍保守：合并连续换行）。
    if (safe.includes("\n")) {
      const byLine = safe.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      if (byLine.length > 1) return byLine;
    }
    return safe.trim() ? [safe] : [];
  } catch {
    return safe ? [safe] : [];
  }
}

/**
 * 流式阶段：去掉未闭合的 {{BLOOD}} 起始标记（避免半段血块撑满布局），
 * 并去掉未成对的最后一个 `**`（避免半段加粗吞掉后续正文）。
 */
export function prepareStreamingNarrativeForRender(s: string): string {
  let t = typeof s === "string" ? s : "";
  const open = "{{BLOOD}}";
  const close = "{{/BLOOD}}";
  for (;;) {
    const lastOpen = t.lastIndexOf(open);
    if (lastOpen === -1) break;
    const rest = t.slice(lastOpen + open.length);
    if (!rest.includes(close)) {
      t = t.slice(0, lastOpen) + rest;
      continue;
    }
    break;
  }
  const segments = t.split("**");
  const starPairs = segments.length - 1;
  if (starPairs > 0 && starPairs % 2 === 1) {
    const last = t.lastIndexOf("**");
    if (last !== -1) {
      t = t.slice(0, last) + t.slice(last + 2);
    }
  }
  return t;
}

export function applyBloodErase(narrative: string): string {
  const parts = narrative.split(/([。！？\n]+)/);
  const sentences: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (/^[。！？\n]+$/.test(p)) {
      if (buf.trim()) sentences.push(buf + p);
      buf = "";
    } else {
      buf += p;
    }
  }
  if (buf.trim()) sentences.push(buf);
  const meaningful = sentences.filter((s) => s.trim().length > 4);
  if (meaningful.length < 2) return narrative;
  const startIdx = Math.min(
    Math.floor(Math.random() * (meaningful.length - 1)),
    meaningful.length - 2
  );
  const s0 = meaningful[startIdx];
  const s1 = meaningful[startIdx + 1];
  const idx0 = narrative.indexOf(s0);
  const idx1 = narrative.indexOf(s1, idx0);
  if (idx0 === -1 || idx1 === -1) return narrative;
  const end = idx1 + s1.length;
  return `${narrative.slice(0, idx0)}${BLOOD_MARKER}${narrative.slice(idx0, end)}${BLOOD_END}${narrative.slice(end)}`;
}

/**
 * 清除模型偶尔泄漏到 narrative 中的代码格式：
 * - ```json ... ``` / ``` ... ``` 代码围栏
 * - `...` 行内代码反引号
 * - 残留 JSON key/value 格式片段（如 "is_action_legal": true）
 */
function stripCodeArtifacts(s: string): string {
  let out = s;
  out = out.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/`([^`\n]{1,80})`/g, "$1");
  return out;
}

export function renderNarrativeText(
  text: string,
  options?: { plainOnly?: boolean; streamSafe?: boolean }
): ReactNode {
  try {
    const safeText = typeof text === "string" ? stripCodeArtifacts(text).slice(0, 15000) : "";
    const plainOnly = options?.plainOnly ?? false;
    const streamSafe = options?.streamSafe ?? false;
    const localized = (() => {
      try {
        if (!safeText) return safeText;
        const normalizeNarrativeTerms = (s: string) => {
          let out = s;
          out = out.replace(/游戏玩法/g, "创作设定");
          out = out.replace(/游戏/g, "创作");
          out = out.replace(/属性面板/g, "叙事维度");
          out = out.replace(/属性/g, "叙事维度");
          out = out.replace(/加点/g, "潜能赋予");
          out = out.replace(/理智值\/生命值|理智值|生命值|理智/g, "精神");
          out = out.replace(/敏捷/g, "敏捷");
          out = out.replace(/幸运/g, "幸运");
          out = out.replace(/战斗力/g, "剧情张力");
          out = out.replace(/背包|行囊|道具/g, "灵感手记");
          out = out.replace(/使用道具/g, "消耗灵感");
          return out;
        };
        const base = normalizeNarrativeTerms(safeText);
        const keys = Object.keys(LOCATION_LABELS ?? {});
        if (keys.length === 0) return safeText;
        keys.sort((a, b) => b.length - a.length);
        let out = base;
        for (const k of keys) {
          const zh = LOCATION_LABELS[k];
          if (!zh) continue;
          out = out.split(k).join(zh);
        }
        return out;
      } catch {
        return safeText;
      }
    })();
    let normalized = localized
      .replace(/\{\{blood\}\}/gi, "{{BLOOD}}")
      .replace(/\{\{\/blood\}\}/gi, "{{/BLOOD}}");
    if (streamSafe) {
      normalized = prepareStreamingNarrativeForRender(normalized);
    }
    if (AUTO_PARAGRAPH_ENABLED) {
      normalized = autoParagraphizeNarrative(normalized, {
        minParaChars: AUTO_PARAGRAPH_MIN_CHARS,
      });
    }
    const stripOrphans = (s: string) =>
      s.replace(/\{\{BLOOD\}\}/g, "").replace(/\{\{\/BLOOD\}\}/g, "").replace(/\^\^/g, "").replace(/\*\*/g, "");
    if (plainOnly) {
      const plain = normalized
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\^\^([^^]*)\^\^/g, "$1")
        .replace(/\{\{BLOOD\}\}([\s\S]*?)\{\{\/BLOOD\}\}/g, "$1");
      return <span>{stripOrphans(plain)}</span>;
    }
    const parts = normalized.split(/(\*\*[^*]*\*\*|\^\^[^^]*\^\^|\{\{BLOOD\}\}[\s\S]*?\{\{\/BLOOD\}\})/g);
    return parts.map((part, i) => {
      const m = part.match(/^\*\*(.+)\*\*$/);
      if (m)
        return (
          <strong
            key={i}
            className="font-bold text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]"
          >
            {m[1]}
          </strong>
        );
      const blood = part.match(/^\{\{BLOOD\}\}([\s\S]*)\{\{\/BLOOD\}\}$/);
      if (blood)
        return (
          <span key={i} className="relative inline-block">
            <span className="relative z-0 text-inherit opacity-30">{blood[1]}</span>
            <span
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-red-900/85 via-red-800/80 to-red-950/90 mix-blend-multiply"
              style={{ borderRadius: "2px" }}
              aria-hidden
            />
          </span>
        );
      return <span key={i}>{stripOrphans(part)}</span>;
    });
  } catch {
    return <span>{typeof text === "string" ? text.slice(0, 500) : ""}</span>;
  }
}

export function extractGreenTips(text: string): string[] {
  if (typeof text !== "string" || !text.includes("^^")) return [];
  const tips: string[] = [];
  const seen = new Set<string>();
  const regex = /\^\^([\s\S]*?)\^\^/g;
  const normalizeTip = (input: string): string => {
    return input
      .replace(/\s+/g, "")
      .replace(/[，。、“”‘’：；！？,.!?:;'"()（）【】\[\]—\-]/g, "")
      .replace(/属性面板|属性|加点/g, "潜能赋予")
      .replace(/理智值\/生命值|理智值|理智|生命值/g, "精神")
      .replace(/选项输入切换为手动输入|将选项切换为手动输入|切换到手动输入/g, "手动输入")
      .replace(/回理智|恢复理智|回精神锚点|恢复精神锚点/g, "回精神")
      .trim();
  };
  const MANUAL_INPUT_COMPLIANCE_KEY =
    "你可以选择手动输入自由书写你的意志若手动输入不可能的事情则会被抹杀原石可在设置中用于潜能赋予或回精神";
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const tip = match[1]?.trim();
    if (!tip) continue;
    const key = normalizeTip(tip);
    if (!key) continue;
    const isManualInputComplianceTip =
      key.includes("手动输入") &&
      key.includes("不可能") &&
      key.includes("抹杀") &&
      key.includes("原石") &&
      key.includes("潜能赋予") &&
      key.includes("精神");
    const dedupeKey = isManualInputComplianceTip ? MANUAL_INPUT_COMPLIANCE_KEY : key;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    tips.push(tip);
  }
  return tips;
}

export const DMNarrativeBlock = memo(function DMNarrativeBlock({
  content,
  isDarkMoon: _isDarkMoon,
  isLowSanity: _isLowSanity,
  plainOnly,
}: {
  content: string;
  isDarkMoon: boolean;
  isLowSanity?: boolean;
  plainOnly?: boolean;
}) {
  void _isDarkMoon;
  void _isLowSanity;
  const safeContent = typeof content === "string" ? content : "";
  const baseClass =
    "vc-reading-serif space-y-8 text-[21px] leading-[2.05] tracking-normal text-[#e7bb8f]";
  const paras = splitNarrativeIntoParas(safeContent);
  return (
    <div className={`${baseClass} whitespace-pre-wrap`}>
      {paras.length > 1 ? (
        paras.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {renderNarrativeText(p, { plainOnly: !!plainOnly })}
          </p>
        ))
      ) : (
        <>{renderNarrativeText(safeContent, { plainOnly: !!plainOnly })}</>
      )}
    </div>
  );
});
