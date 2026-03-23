export type RouteKind = "PUBLIC_CANDIDATE" | "PRIVATE_FACT" | "CODEX_QUERY" | "UNKNOWN";

export interface RouteResult {
  kind: RouteKind;
  confidence: number;
  reasons: string[];
}

const CODEX_Q_PATTERNS = [
  /是什么/,
  /什么叫/,
  /何为/,
  /何為/,
  /在哪/,
  /位于/,
  /位於/,
  /特产/,
  /特產/,
  /规则/,
  /規則/,
  /设定/,
  /設定/,
  /为什么/,
  /為什麼/,
  /为何/,
  /為何/,
  /如何/,
  /怎么/,
  /怎麼/,
  /有哪些/,
  /介绍/,
  /介紹/,
  /讲讲/,
  /講講/,
  /说说/,
  /說說/,
  /告诉我/,
  /告訴我/,
  /是什么东西/,
];

const ASSERTION_HINTS = [/特产/, /特產/, /位于/, /位於/, /又称/, /又稱/, /又名/, /是一种/, /是一種/];

const FP_LEADING = /^我/;
const FP_ACTION_VERBS =
  /我[^，。！？\s]{0,16}?(?:拔|偷|杀|殺|打|揍|吃|喝|去|来|來|要|把|被|受伤|受傷|死了|杀|殺|抢|搶|拿|丢|丟|藏|给|給|说|說|想|觉得|覺得|记得|記得)/;

/**
 * 轻量可解释路由：无 LLM，供缓存门控与 ingest 分流。
 */
export function routeUserInput(input: string): RouteResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { kind: "UNKNOWN", confidence: 0, reasons: ["empty"] };
  }

  const reasons: string[] = [];
  let privateScore = 0;
  let codexScore = 0;
  let assertionScore = 0;

  if (FP_LEADING.test(raw)) {
    reasons.push("first_person:我");
    privateScore += 0.45;
  }
  if (FP_ACTION_VERBS.test(raw)) {
    reasons.push("pattern:first_person_action");
    privateScore += 0.55;
  }
  if (/(?:我要|我想|我能|我会|我會|我把|我被|我已经|我已經)/.test(raw)) {
    reasons.push("pattern:intent_or_state");
    privateScore += 0.35;
  }

  const isQuestion = /[？?]|^(什么|什麼|怎么|怎麼|为什么|為什麼|哪里|哪裡|谁|誰|几|幾|多少|是否)/.test(raw);

  for (const re of CODEX_Q_PATTERNS) {
    if (re.test(raw)) {
      reasons.push(`keyword:${re.source}`);
      codexScore += 0.25;
    }
  }

  if (isQuestion) {
    reasons.push("pattern:question");
    codexScore += 0.2;
  }

  for (const re of ASSERTION_HINTS) {
    if (re.test(raw)) {
      reasons.push(`keyword:${re.source}`);
      assertionScore += 0.2;
    }
  }
  if (!isQuestion && assertionScore > 0 && privateScore < 0.5) {
    reasons.push("pattern:assertion");
    assertionScore += 0.35;
  }

  const max = Math.max(privateScore, codexScore, assertionScore);
  if (privateScore >= 0.5 && privateScore >= codexScore - 0.05) {
    return {
      kind: "PRIVATE_FACT",
      confidence: Math.min(0.95, 0.55 + privateScore * 0.4),
      reasons: reasons.length ? reasons : ["heuristic:private"],
    };
  }
  if (codexScore >= 0.25 && codexScore >= assertionScore) {
    return {
      kind: "CODEX_QUERY",
      confidence: Math.min(0.92, 0.5 + codexScore * 0.35),
      reasons: reasons.length ? reasons : ["heuristic:codex"],
    };
  }
  if (assertionScore >= 0.35 && privateScore < 0.45) {
    return {
      kind: "PUBLIC_CANDIDATE",
      confidence: Math.min(0.88, 0.48 + assertionScore * 0.35),
      reasons: reasons.length ? reasons : ["heuristic:public_candidate"],
    };
  }

  return {
    kind: "UNKNOWN",
    confidence: max > 0 ? Math.min(0.45, max) : 0.15,
    reasons: reasons.length ? reasons : ["low_signal"],
  };
}
