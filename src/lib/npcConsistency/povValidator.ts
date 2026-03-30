type PovSeverity = "none" | "minor" | "moderate" | "severe";

function clamp(s: string, max: number): string {
  const t = String(s ?? "");
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function maskQuotedChineseDialogue(text: string): { masked: string; spans: Array<{ start: number; end: number }> } {
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
  // Replace quoted spans with spaces to preserve indices and avoid false positives.
  const out = chars.map((c, idx) => {
    for (const sp of spans) {
      if (idx >= sp.start && idx < sp.end) {
        // 保留闭引号 `”` 作为“句子边界”提示（对白结束后紧接叙事时常出现 `…”你…`）。
        if (idx === sp.end - 1 && c === "”") return "”";
        return " ";
      }
    }
    return c;
  });
  return { masked: out.join(""), spans };
}

const SECOND_PERSON_NARRATION_RE =
  /(^|[。！？\n\r”])\s*你(?:看见|看到|听见|听到|发现|意识到|伸手|抬手|转头|回头|走向|走到|靠近|后退|退后|推开|打开|摸向|握住|抓住|感到|觉得|试图|准备|停下|屏住|睁开|闭上|问|喊|说|看向|望向|压低|把)/g;

const SECOND_PERSON_ANY_RE =
  /(^|[。！？\n\r”])\s*你(?:[^\n\r。！？]{0,10})(?:看见|看到|听见|听到|发现|意识到|感到|觉得|试图|走|转头|伸手|睁开|闭上|问|喊|说|看向|望向|把)/g;

function countMatches(re: RegExp, s: string): number {
  let c = 0;
  re.lastIndex = 0;
  while (re.exec(s)) c++;
  re.lastIndex = 0;
  return c;
}

function rewriteSecondPersonNarrationOutsideQuotes(original: string): { text: string; changed: boolean } {
  const { masked, spans } = maskQuotedChineseDialogue(original);
  if (!masked) return { text: original, changed: false };

  // Build a mutable char array for outside-quote edits.
  const chars = [...original];
  const isInsideQuote = (idx: number) => spans.some((sp) => idx >= sp.start && idx < sp.end);
  const isSentencePunct = (c: string) => c === "。" || c === "！" || c === "？" || c === "\n" || c === "\r";
  const isSkippableAfterSentence = (c: string) => c === " " || c === "\t" || c === "”";
  const prevNonSkippable = (idx: number): { ch: string; idx: number } | null => {
    for (let j = idx - 1; j >= 0; j--) {
      const ch = chars[j] ?? "";
      if (ch === "" || ch === " " || ch === "\t") continue;
      return { ch, idx: j };
    }
    return null;
  };

  // Replace leading narration "你" → "我" when it appears at sentence start outside quotes.
  for (let i = 0; i < chars.length; i++) {
    if (isInsideQuote(i)) continue;
    if (chars[i] !== "你") continue;
    if (i === 0) {
      chars[i] = "我";
      continue;
    }
    const prev1 = chars[i - 1] ?? "";
    // 常见：对白结束后紧接叙事句首 `…”你…`，这里的 `你` 必然是旁白主语，直接收束为第一人称。
    if (prev1 === "”") {
      chars[i] = "我";
      continue;
    }
    // 常规：紧跟句号/问叹/换行
    if (isSentencePunct(prev1)) {
      chars[i] = "我";
      continue;
    }
    // 处理：`。”你…` / `！”你…` —— 句末标点在引号内时，前一个字符可能是 ”。
    if (isSkippableAfterSentence(prev1)) {
      const p = prevNonSkippable(i);
      if (!p) continue;
      if (isSentencePunct(p.ch)) {
        chars[i] = "我";
        continue;
      }
      // `。”你`：p.ch 可能是 "”"，再往前一位是句末标点
      if (p.ch === "”") {
        const p2 = prevNonSkippable(p.idx);
        if (p2 && isSentencePunct(p2.ch)) {
          chars[i] = "我";
          continue;
        }
      }
    }
    // 否则不动：避免误伤叙事中“对你”这类宾语结构
  }

  // Second pass: handle mid-sentence narration patterns that strongly imply player-as-"you" (still outside quotes).
  // Keep it narrow to avoid touching "对你/给你" etc.
  for (let i = 0; i < chars.length; i++) {
    if (isInsideQuote(i)) continue;
    if (chars[i] !== "你") continue;
    const prev2 = i >= 2 ? `${chars[i - 2] ?? ""}${chars[i - 1] ?? ""}` : "";
    const prev1 = i >= 1 ? (chars[i - 1] ?? "") : "";
    if (prev2 === "然后" || prev1 === "，") {
      chars[i] = "我";
    }
  }

  let out = chars.join("");
  // 补丁：句末标点在引号内时常出现 `。”你…`，上面逐字扫描在某些边界仍可能漏掉。
  // 这里做一个极窄的结构替换：仅匹配 `。/！/？ + ” + 你`，不触碰引号内部对白。
  out = out.replace(/([。！？])”[\s\t]*你/g, "$1”我");
  // 保险：部分运行时/字体环境下全角标点与引号字符可能导致直观字符匹配失败，补一个明确的 unicode 版本。
  out = out.replace(/\u3002\u201d[\s\t]*\u4f60/g, "\u3002\u201d\u6211");
  return { text: out, changed: out !== original };
}

export function applyPovPostGeneration(narrative: string): {
  narrative: string;
  severity: PovSeverity;
  triggered: boolean;
  debug: { secondPersonHits: number; firstSentenceSecondPerson: boolean };
} {
  const src = String(narrative ?? "");
  const trimmed = src.trim();
  if (!trimmed) {
    return {
      narrative: src,
      severity: "none",
      triggered: false,
      debug: { secondPersonHits: 0, firstSentenceSecondPerson: false },
    };
  }

  const { masked } = maskQuotedChineseDialogue(src);
  const secondHits = countMatches(SECOND_PERSON_ANY_RE, masked.slice(0, 900));
  const firstSentenceSecondPerson = SECOND_PERSON_NARRATION_RE.test(masked.slice(0, 220));
  SECOND_PERSON_NARRATION_RE.lastIndex = 0;

  if (secondHits === 0 && !firstSentenceSecondPerson) {
    return {
      narrative: src,
      severity: "none",
      triggered: false,
      debug: { secondPersonHits: 0, firstSentenceSecondPerson: false },
    };
  }

  const rewrite1 = rewriteSecondPersonNarrationOutsideQuotes(src);
  const { masked: maskedAfter } = maskQuotedChineseDialogue(rewrite1.text);
  const remaining = countMatches(SECOND_PERSON_ANY_RE, maskedAfter.slice(0, 900));

  const severity: PovSeverity =
    firstSentenceSecondPerson || secondHits >= 4 ? "severe" : secondHits >= 2 ? "moderate" : "minor";

  // Severe fallback: if still lots of second-person narration, prepend a hard POV anchor and scrub first sentence.
  if (severity === "severe" && remaining >= 2) {
    const anchored =
      "我" +
      (trimmed.startsWith("我") ? "" : "——") +
      "我压下呼吸，让自己从上一瞬的余震里继续往前。\n" +
      src.replace(/(^\s*你[^\n\r。！？]{0,80}[。！？]\s*)/, "");
    return {
      narrative: clamp(anchored, 50000),
      severity: "severe",
      triggered: true,
      debug: { secondPersonHits: secondHits, firstSentenceSecondPerson },
    };
  }

  return {
    narrative: clamp(rewrite1.text, 50000),
    severity,
    triggered: rewrite1.changed,
    debug: { secondPersonHits: secondHits, firstSentenceSecondPerson },
  };
}

