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

function maskQuotedChineseDialogue(text: string): string {
  const chars = [...String(text ?? "")];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === "“") {
      i++;
      while (i < chars.length && chars[i] !== "”") {
        chars[i] = " ";
        i++;
      }
      // keep closing quote as boundary hint
      i++;
      continue;
    }
    i++;
  }
  return chars.join("");
}

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

function rewriteChatLabelsToNaturalDialogueEverywhere(n: string): { text: string; changed: boolean } {
  const src = String(n ?? "");
  if (!src) return { text: src, changed: false };
  // Only rewrite outside Chinese quotes to avoid damaging already-correct dialogue.
  const masked = maskQuotedChineseDialogue(src);
  if (!CHAT_LABEL_RE.test(masked) && !EXPLAIN_RE.test(masked)) {
    return { text: src, changed: false };
  }
  let out = src;
  // Convert `你说：xxx` / `玩家说：xxx` into Chinese quoted dialogue when it looks like a short utterance.
  out = out.replace(/(?:玩家说|用户说|你说)[:：]\s*([^\n\r“”]{1,36})(?=($|[。！？\n\r]))/g, (_m, g1) => {
    const t = String(g1 ?? "").trim();
    return t ? `“${t}”` : "";
  });
  // Remove meta label glue when the content already uses quotes.
  out = out.replace(/(?:玩家说|用户说|你说)[:：]\s*(?=“)/g, "");
  // Fallback: drop any remaining chat labels (keep content), to avoid "你说/玩家说" tags lingering.
  out = out.replace(/(?:玩家说|用户说|你说)[:：]\s*/g, "");
  // Soften explanation-y glue phrases that scream "input echo".
  out = out.replace(/(^|[。！？\n\r])\s*你刚才/g, "$1刚才");
  out = out.replace(/(^|[。！？\n\r])\s*你做了/g, "$1我动作一顿");
  out = out.replace(/(^|[。！？\n\r])\s*你试图/g, "$1我试着");
  out = out.replace(/玩家输入[:：]\s*/g, "");
  out = out.replace(/用户输入[:：]\s*/g, "");
  return { text: out, changed: out !== src };
}

function scrubVerbatimUserInputEchoEverywhere(n: string, latestUserInput: string): { text: string; changed: boolean } {
  const src = String(n ?? "");
  const u = String(latestUserInput ?? "").trim();
  if (!src || !u) return { text: src, changed: false };
  // Only act on sufficiently long inputs; avoid damaging common short phrases.
  const needle = u.length >= 14 ? u : "";
  if (!needle) return { text: src, changed: false };
  if (!src.includes(needle)) return { text: src, changed: false };
  // Only scrub when the echo appears near explanation/meta markers.
  const window = src.slice(Math.max(0, src.indexOf(needle) - 32), Math.min(src.length, src.indexOf(needle) + needle.length + 32));
  if (!/(你刚才|你说|玩家说|用户说|玩家输入|用户输入)/.test(window)) {
    return { text: src, changed: false };
  }
  const out = src.replace(needle, "那句话");
  return { text: out, changed: out !== src };
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

  // 轻/中：全文去残留（标签式承接 / 解释腔胶水 / 复述玩家原句）
  const residual1 = rewriteChatLabelsToNaturalDialogueEverywhere(work);
  if (residual1.changed) {
    work = residual1.text;
    changed = true;
    reason = reason ?? "scrub_residual_labels";
  }
  const residual2 = scrubVerbatimUserInputEchoEverywhere(work, input.latestUserInput);
  if (residual2.changed) {
    work = residual2.text;
    changed = true;
    reason = reason ?? "scrub_verbatim_input_echo";
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

