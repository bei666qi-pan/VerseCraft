// Deterministic query preparation for world-knowledge retrieval.
// Model calls do not belong in this layer: online generation is owned by
// PlayerTurnWorkflow and governed by its single invocation budget.

// ── CJK Tokenization Enhancement ────────────────────────

/**
 * Enhanced CJK tokenizer with:
 * 1. Bigram + trigram segmentation (better phrase matching)
 * 2. Punctuation-aware boundary detection
 * 3. Named entity boundary preservation
 */
const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\u{f900}-\u{faff}]+/gu;

const SENTENCE_BREAKS = /[。，！？；：、\n\r]/g;

// Common Chinese particles and function words to filter
const FUNCTION_WORDS = new Set([
  "的", "了", "在", "是", "我", "你", "他", "她", "它", "们",
  "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也",
  "很", "到", "说", "要", "去", "会", "着", "没有", "看", "好",
  "自己", "这", "那个", "这个", "什么", "怎么", "哪", "哪里",
  "吗", "吧", "呢", "可以", "能", "想", "想要", "想用", "想找",
  "找到", "看到", "应该", "觉得", "知道", "可能", "一下", "一些",
  "有点", "把", "被", "让", "给", "对", "从", "向", "往", "跟",
  "用", "以", "为", "因", "所以", "但是", "虽然", "如果", "因为",
  "然后", "而且", "或者", "还是", "已经", "正在", "将要", "马上",
]);

/**
 * Segment text into meaningful CJK tokens.
 * Uses bigrams (2-char) for recall, trigrams (3-char) for precision,
 * and preserves sentence boundaries for context.
 */
export function enhancedSegmentCJK(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  // Split by sentence boundaries first
  const sentences = text.split(SENTENCE_BREAKS).filter(Boolean);

  for (const sentence of sentences) {
    // Reset lastIndex for the global regex
    CJK_RANGE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CJK_RANGE.exec(sentence)) !== null) {
      const word = match[0];

      // Bigrams (2-char windows) — good for recall
      for (let i = 0; i < word.length - 1; i++) {
        const bigram = word.slice(i, i + 2);
        if (!FUNCTION_WORDS.has(bigram) && !seen.has(bigram)) {
          seen.add(bigram);
          tokens.push(bigram);
        }
      }

      // Trigrams (3-char windows) — better for phrase-level matching
      // Include trigrams longer than 4 chars to avoid capturing function words
      if (word.length >= 3) {
        for (let i = 0; i < word.length - 2; i++) {
          const trigram = word.slice(i, i + 3);
          if (!FUNCTION_WORDS.has(trigram) && !seen.has(trigram)) {
            seen.add(trigram);
            tokens.push(trigram);
          }
        }
      }

      // Keep full words 3+ chars as-is (but not function words)
      if (word.length >= 3 && !FUNCTION_WORDS.has(word) && !seen.has(word)) {
        seen.add(word);
        tokens.push(word);
      }
    }
  }

  return tokens;
}

/**
 * Add bounded deterministic context without incurring an AI invocation.
 */
export function enrichQueryHeuristically(input: string, playerLocation?: string | null): string {
  const parts: string[] = [input];

  // Append location context if the query is location-ambiguous
  if (playerLocation && !/[楼层层FL地下B1B2]/i.test(input)) {
    parts.push(playerLocation);
  }

  return parts.join(" ").slice(0, 512);
}
