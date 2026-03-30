import type { CanonicalGender } from "@/lib/registry/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";

export type GenderFixSeverity = "none" | "minor" | "moderate" | "severe";

type Target = {
  npcId: string;
  name: string;
  gender: CanonicalGender;
  expected: "他" | "她" | null;
  forbidden: "他" | "她" | null;
};

function expectedPronoun(g: CanonicalGender): { expected: "他" | "她" | null; forbidden: "他" | "她" | null } {
  if (g === "female") return { expected: "她", forbidden: "他" };
  if (g === "male") return { expected: "他", forbidden: "她" };
  return { expected: null, forbidden: null };
}

function clamp(s: string, max: number): string {
  const t = String(s ?? "");
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function maskQuotedChineseDialogue(text: string): { masked: string; spans: Array<{ start: number; end: number }> } {
  // 用于“检测/定位”，并提供 spans 供 rewrite 阶段跳过对白内部。
  const spans: Array<{ start: number; end: number }> = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === "“") {
      const start = i;
      i++;
      while (i < chars.length && chars[i] !== "”") i++;
      const end = i < chars.length && chars[i] === "”" ? i + 1 : i;
      spans.push({ start, end });
      i = end;
      continue;
    }
    i++;
  }
  const out = chars.map((c, idx) => {
    for (const sp of spans) {
      if (idx >= sp.start && idx < sp.end) return " ";
    }
    return c;
  });
  return { masked: out.join(""), spans };
}

function rewriteWindowOutsideQuotes(args: {
  text: string;
  spans: Array<{ start: number; end: number }>;
  start: number;
  end: number;
  from: "他" | "她";
  to: "他" | "她";
}): { out: string; changed: boolean } {
  const s = Math.max(0, Math.min(args.text.length, args.start));
  const e = Math.max(s, Math.min(args.text.length, args.end));
  const chars = [...args.text];
  const isInQuote = (idx: number) => args.spans.some((sp) => idx >= sp.start && idx < sp.end);
  let changed = false;
  for (let i = s; i < e; i++) {
    if (isInQuote(i)) continue;
    if (chars[i] === args.from) {
      chars[i] = args.to;
      changed = true;
    }
  }
  const out = chars.join("");
  return { out, changed };
}

function buildTargets(args: { focusNpcId: string | null; presentNpcIds: string[] }): Target[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    const t = String(id ?? "").trim();
    if (!t) return;
    const norm = t.replace(/^n-(\d{3})$/i, "N-$1").toUpperCase();
    if (!ids.includes(norm)) ids.push(norm);
  };
  push(args.focusNpcId);
  for (const id of args.presentNpcIds ?? []) push(id);
  return ids.slice(0, 10).map((npcId) => {
    const canon = getNpcCanonicalIdentity(npcId);
    const { expected, forbidden } = expectedPronoun(canon.canonicalGender);
    return {
      npcId: canon.npcId,
      name: canon.canonicalName,
      gender: canon.canonicalGender,
      expected,
      forbidden,
    };
  });
}

export function applyGenderPronounPostGeneration(input: {
  narrative: string;
  focusNpcId: string | null;
  presentNpcIds: string[];
}): {
  narrative: string;
  severity: GenderFixSeverity;
  triggered: boolean;
  logs: string[];
} {
  const src = String(input.narrative ?? "");
  if (!src.trim()) return { narrative: src, severity: "none", triggered: false, logs: [] };

  const targets = buildTargets({ focusNpcId: input.focusNpcId, presentNpcIds: input.presentNpcIds });
  const { masked, spans } = maskQuotedChineseDialogue(src);
  let out = src;
  const logs: string[] = [];
  let changeCount = 0;

  for (const t of targets) {
    if (!t.expected || !t.forbidden) continue; // unknown/ambiguous/group 不做他/她纠错
    if (!masked.includes(t.name) && !masked.includes(t.npcId)) continue;

    // 仅在“明确指代窗口”纠错：围绕名字/ID 的短窗口（避免误伤其他角色）
    const anchors: number[] = [];
    const idxName = masked.indexOf(t.name);
    if (idxName >= 0) anchors.push(idxName);
    const idxId = masked.indexOf(t.npcId);
    if (idxId >= 0) anchors.push(idxId);

    for (const a of anchors.slice(0, 3)) {
      const start = Math.max(0, a - 12);
      const end = Math.min(masked.length, a + 46);
      const segment = masked.slice(start, end);
      if (!segment.includes(t.forbidden)) continue;
      const r = rewriteWindowOutsideQuotes({ text: out, spans, start, end, from: t.forbidden, to: t.expected });
      if (r.changed) {
        out = r.out;
        changeCount++;
        logs.push(`gender_fix:${t.npcId}:${t.forbidden}->${t.expected}@${start}-${end}`);
      }
    }

    // 同句混用兜底（仍然只在含名字的句子内）
    const sentenceRe = new RegExp(`[^。！？\\n\\r]{0,90}${t.name}[^。！？\\n\\r]{0,90}`, "g");
    const m = masked.match(sentenceRe);
    if (m && m.length > 0) {
      for (const snip of m.slice(0, 2)) {
        if (snip.includes(t.forbidden)) {
          // 找到该句在原文中的位置，再做局部修复
          const pos = masked.indexOf(snip);
          if (pos >= 0) {
            const r = rewriteWindowOutsideQuotes({
              text: out,
              spans,
              start: pos,
              end: pos + snip.length,
              from: t.forbidden,
              to: t.expected,
            });
            if (r.changed) {
              out = r.out;
              changeCount++;
              logs.push(`gender_fix_sentence:${t.npcId}:${t.forbidden}->${t.expected}`);
            }
          }
        }
      }
    }
  }

  if (changeCount === 0) return { narrative: src, severity: "none", triggered: false, logs: [] };
  const severity: GenderFixSeverity = changeCount >= 4 ? "severe" : changeCount >= 2 ? "moderate" : "minor";
  return { narrative: clamp(out, 50000), severity, triggered: true, logs };
}

