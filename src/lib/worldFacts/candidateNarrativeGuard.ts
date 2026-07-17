import type { NarrativeAuditCandidateNewFact } from "./narrativeAudit";

const UNCERTAIN_RE = /(可能|也许|像是|似乎|大概|猜测|未必|不确定|不能当真|尚不能)/;
const LOW_SIGNAL_BIGRAMS = new Set(["可能", "情况", "公寓", "一个", "这个", "那个", "似乎", "事实"]);

function cjkBigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const run of text.match(/[一-龥]{2,}/g) ?? []) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const pair = run.slice(i, i + 2);
      if (!LOW_SIGNAL_BIGRAMS.has(pair)) out.add(pair);
    }
  }
  return out;
}

export function softenPendingCandidateFacts(args: {
  narrative: string;
  candidates: readonly NarrativeAuditCandidateNewFact[];
}): { narrative: string; rewritten: boolean; matchedCandidateCount: number } {
  const source = String(args.narrative ?? "");
  if (!source || args.candidates.length === 0) return { narrative: source, rewritten: false, matchedCandidateCount: 0 };
  const candidatePairs = args.candidates.map((candidate) => cjkBigrams(String(candidate.text ?? ""))).filter((pairs) => pairs.size >= 2);
  if (candidatePairs.length === 0) return { narrative: source, rewritten: false, matchedCandidateCount: 0 };

  let matchedCandidateCount = 0;
  let didRewrite = false;
  const narrative = source.replace(/[^。！？\n]+[。！？]?/g, (sentence) => {
    if (didRewrite || UNCERTAIN_RE.test(sentence)) return sentence;
    const sentencePairs = cjkBigrams(sentence);
    const matched = candidatePairs.filter((pairs) => [...pairs].filter((pair) => sentencePairs.has(pair)).length >= 2).length;
    if (matched === 0) return sentence;
    didRewrite = true;
    matchedCandidateCount = matched;
    return `${sentence.trimEnd().replace(/[。！？]$/, "")}。不过，这些迹象尚不能证明背后的事实。`;
  });
  return { narrative, rewritten: didRewrite, matchedCandidateCount };
}
