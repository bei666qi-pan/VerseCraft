export type ContinuitySeverity = "none" | "minor" | "moderate" | "severe";

function clamp(s: string, max: number): string {
  const t = String(s ?? "");
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function normalize(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/[“”"']/g, "")
    .replace(/[，,；;：:]/g, "，")
    .trim();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const t = normalize(s);
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union <= 0 ? 0 : inter / union;
}

const META_RE = /(玩家输入|用户输入|写作要求|系统暗骰|检定|roll|数值机制|作为系统|作为AI|总结|翻译|解释)/;
const EXPLAIN_RE = /(你刚才|你做了|你试图|系统判定|因此你|所以你)/;
const CHAT_LABEL_RE = /(玩家说[:：]|用户说[:：]|你说[:：]|他说[:：]|她说[:：])/;

function scrubObviousMetaLines(n: string): { text: string; changed: boolean } {
  const lines = String(n ?? "").split("\n");
  const kept: string[] = [];
  let changed = false;
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (META_RE.test(t)) {
      changed = true;
      continue;
    }
    kept.push(ln);
  }
  const out = kept.join("\n");
  return { text: out, changed: changed || out !== n };
}

function rewriteOpeningToContinuity(narrative: string): { text: string; changed: boolean } {
  // 目标：当开头像“解释用户动作/复述动作”时，改成“后果先行”的第一人称短锚。
  const src = String(narrative ?? "");
  const trimmed = src.trim();
  if (!trimmed) return { text: src, changed: false };
  const anchor = "我压下呼吸，让自己从上一瞬的余震里继续往前。";
  // 删除可能的“解释句”第一句（到第一个句末标点）
  const dropped = src.replace(/^\s*[^。！？\n\r]{0,90}[。！？]\s*/, "");
  const out = `${anchor}\n${dropped}`.trim();
  return { text: out, changed: out !== src };
}

export function applyNarrativeContinuityPostGeneration(input: {
  narrative: string;
  latestUserInput: string;
  previousTailSummary?: string | null;
}): {
  narrative: string;
  severity: ContinuitySeverity;
  triggered: boolean;
  reason: string | null;
  debug: { similarity: number; metaHit: boolean; explainHit: boolean; chatLabelHit: boolean };
} {
  const src = String(input.narrative ?? "");
  const trimmed = src.trim();
  if (!trimmed) {
    return {
      narrative: src,
      severity: "none",
      triggered: false,
      reason: null,
      debug: { similarity: 0, metaHit: false, explainHit: false, chatLabelHit: false },
    };
  }

  const head = trimmed.slice(0, 280);
  const sim = jaccard(bigrams(head), bigrams(String(input.latestUserInput ?? "").slice(0, 120)));
  const metaHit = META_RE.test(head);
  const explainHit = EXPLAIN_RE.test(head);
  const chatLabelHit = CHAT_LABEL_RE.test(head);

  const needs = metaHit || explainHit || chatLabelHit || sim >= 0.56;
  if (!needs) {
    return {
      narrative: src,
      severity: "none",
      triggered: false,
      reason: null,
      debug: { similarity: Number(sim.toFixed(2)), metaHit, explainHit, chatLabelHit },
    };
  }

  let work = src;
  let changed = false;
  let reason: string | null = null;

  // 轻微：先 scrub 明显 meta/标签行
  const scrubbed = scrubObviousMetaLines(work);
  if (scrubbed.changed) {
    work = scrubbed.text;
    changed = true;
    reason = reason ?? "scrub_meta_lines";
  }

  // 中/重：开头仍像解释/高相似复述时，重写开头短锚
  const head2 = work.trim().slice(0, 220);
  const sim2 = jaccard(bigrams(head2), bigrams(String(input.latestUserInput ?? "").slice(0, 120)));
  if (EXPLAIN_RE.test(head2) || CHAT_LABEL_RE.test(head2) || sim2 >= 0.62) {
    const rw = rewriteOpeningToContinuity(work);
    if (rw.changed) {
      work = rw.text;
      changed = true;
      reason = reason ?? "rewrite_opening_to_continuity";
    }
  }

  const severity: ContinuitySeverity =
    sim >= 0.72 || metaHit || chatLabelHit ? "severe" : sim >= 0.62 || explainHit ? "moderate" : "minor";

  return {
    narrative: clamp(work, 50000),
    severity,
    triggered: changed,
    reason,
    debug: { similarity: Number(sim.toFixed(2)), metaHit, explainHit, chatLabelHit },
  };
}

