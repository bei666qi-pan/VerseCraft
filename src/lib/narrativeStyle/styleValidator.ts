import {
  DEFAULT_VERSECRAFT_STYLE_PROFILE_ID,
  getVerseCraftStyleProfile,
  type VerseCraftStyleProfile,
} from "./styleBible";

export type NarrativeStyleIssueCode =
  | "style_drift"
  | "mechanical_exposition"
  | "forbidden_phrase_hit"
  | "sentence_rhythm_flat"
  | "dialogue_over_explains"
  | "hook_missing"
  | "purple_prose_overload"
  // === 2026-07 新增：多维叙事质量检测（遥测用，不硬拦截） ===
  | "sensory_density_low"
  | "rhythm_variation_flat"
  | "dialogue_ungrounded"
  | "info_density_low";

export type NarrativeStyleIssue = {
  code: NarrativeStyleIssueCode;
  severity: "low" | "medium";
  detail?: string;
  anchor?: string;
};

export type NarrativeStyleTelemetry = {
  styleProfileId: string;
  totalIssues: number;
  byCode: Partial<Record<NarrativeStyleIssueCode, number>>;
  forbiddenPhraseHits: string[];
  sentenceCount: number;
  averageSentenceLength: number;
  sentenceLengthSpread: number;
  dialogueSpanCount: number;
  /** 2026-07 新增质量维度 */
  sensoryWordCount: number;
  longSentenceCount: number;
  shortSentenceCount: number;
  dialogueGroundedCount: number;
  dialogueTotalCount: number;
  uniqueWordRatio: number;
};

export type NarrativeStyleValidationReport = {
  ok: boolean;
  issues: NarrativeStyleIssue[];
  telemetry: NarrativeStyleTelemetry;
};

export type ValidateNarrativeStyleArgs = {
  narrative: string;
  styleProfile?: VerseCraftStyleProfile | null;
  focus?: string | null;
  turnMode?: string | null;
};

const MECHANICAL_RE =
  /(系统提示|系统判定|任务已完成|你获得了|奖励已发放|作为AI|玩家输入|用户输入|本回合|任务目标|根据规则|判定结果|综上所述|接下来你可以)/;

const EXPLAIN_TERMS_RE = /(真相|根因|规则|循环|原因|所以|因为|所有人|公寓|校源|机制|答案|你必须|这座楼)/g;

const STYLE_DRIFT_RE =
  /(热血沸腾|王者归来|无敌|爽|燃起来|逆天|霸气|全场震惊|嘴角.*邪魅|轻松解决|完美通关)/;
const RULE_CREEPYPASTA_RE =
  /(守则第[一二三四五六七八九十\d]+条|规则怪谈|违反规则|请遵守规则|公寓规则写着|不得违反|否则后果自负)/;

const PURPLE_RE = /(仿佛|像是|如同|宛如|燃烧|盛大|绚烂|华丽|璀璨|永恒|宿命|深渊|命运)/g;

const CLOSED_ENDING_RE =
  /(一切都结束了|没有任何问题|终于安全了|再也没有异常|事情到此为止|我松了一口气|没有后续|尘埃落定|圆满结束)[。.!！]?$/;

const HOOK_RE = /(？|\?|……|…|还没有|没有回答|停在|门后|楼上|背后|下一|只剩|忽然|突然|可能|像是|不对|声音|影子|名字|缺口|裂缝|灯|钥匙|登记册|门牌|脚步|回声)/;

const MECHANICAL_ZH_RE =
  /(系统提示|系统判定|任务已完成|你获得了|奖励已发放|作为AI|玩家输入|用户输入|本回合|任务目标|根据规则|判定结果|综上所述|接下来你可以)/;
const EXPLAIN_TERMS_ZH_RE =
  /(真相|根因|规则|循环|原因|所以|因为|所有人|公寓|校源|机制|答案|你必须|这座楼)/g;
const STYLE_DRIFT_ZH_RE =
  /(爽文|王者归来|无敌|燃起来|逆天|霸气|全场震惊|嘴角.*邪魅|轻松解决|完美通关)/;
const CLOSED_ENDING_ZH_RE =
  /(一切都结束了|没有任何问题|终于安全了|再也没有异常|事情到此为止|我松了一口气|没有后续|尘埃落定|圆满结束)[。?!？！?]?$/;
const HOOK_ZH_RE =
  /(？|\?|……|…|还没有|没有回答|停在|门后|楼上|背后|下一|只剩|忽然|突然|可能|像是|不对|声音|影子|名字|缺口|裂缝|灯|钥匙|登记册|门牌|脚步|回声)/;

function splitSentences(text: string): string[] {
  return text
    .replace(/[“”"『』「」]/g, "")
    .split(/(?<=[。！？!?；;…])|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function collectDialogueSpans(text: string): string[] {
  const spans: string[] = [];
  const re = /[“「『"]([^“”「」『』"]{2,})[”」』"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) spans.push(match[1].trim());
  }
  return spans;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function countByCode(issues: readonly NarrativeStyleIssue[]): Partial<Record<NarrativeStyleIssueCode, number>> {
  const byCode: Partial<Record<NarrativeStyleIssueCode, number>> = {};
  for (const issue of issues) {
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
  }
  return byCode;
}

export function validateNarrativeStyle(args: ValidateNarrativeStyleArgs): NarrativeStyleValidationReport {
  const styleProfile = args.styleProfile ?? getVerseCraftStyleProfile(DEFAULT_VERSECRAFT_STYLE_PROFILE_ID);
  const narrative = String(args.narrative ?? "").trim();
  const issues: NarrativeStyleIssue[] = [];
  const forbiddenPhraseHits = styleProfile.forbidden_phrases.filter((phrase) => narrative.includes(phrase));

  if (MECHANICAL_RE.test(narrative) || MECHANICAL_ZH_RE.test(narrative)) {
    issues.push({
      code: "mechanical_exposition",
      severity: "medium",
      detail: "mechanical_register",
    });
  }

  for (const phrase of forbiddenPhraseHits.slice(0, 4)) {
    issues.push({
      code: "forbidden_phrase_hit",
      severity: "medium",
      detail: phrase,
    });
  }

  if (STYLE_DRIFT_RE.test(narrative) || STYLE_DRIFT_ZH_RE.test(narrative) || RULE_CREEPYPASTA_RE.test(narrative)) {
    issues.push({
      code: "style_drift",
      severity: "low",
      detail: "non_versecraft_register",
    });
  }

  const sentences = splitSentences(narrative);
  const sentenceLengths = sentences.map((s) => s.replace(/\s+/g, "").length);
  const avgLen = average(sentenceLengths);
  const spread = sentenceLengths.length > 0
    ? Math.max(...sentenceLengths) - Math.min(...sentenceLengths)
    : 0;
  if (sentenceLengths.length >= 4 && avgLen >= 8 && spread <= 2) {
    issues.push({
      code: "sentence_rhythm_flat",
      severity: "low",
      detail: `sentences=${sentenceLengths.length}|spread=${spread}`,
    });
  }

  const dialogueSpans = collectDialogueSpans(narrative);
  for (let i = 0; i < dialogueSpans.length; i += 1) {
    const span = dialogueSpans[i] ?? "";
    const explainHits = countMatches(span, EXPLAIN_TERMS_RE) + countMatches(span, EXPLAIN_TERMS_ZH_RE);
    if (span.length >= 30 && explainHits >= 3) {
      issues.push({
        code: "dialogue_over_explains",
        severity: "medium",
        detail: `dialogue[${i}]|terms=${explainHits}`,
      });
      break;
    }
  }

  // 文风改造后允许更丰富的比喻密度（尤其 reveal/climax/ending 等更长档位），
  // 改用长度密度判定（约每 100 字 1.4 次命中）而非固定次数，避免长文本被误判为堆砌。
  const purpleHits = countMatches(narrative, PURPLE_RE);
  const purpleThreshold = Math.max(6, Math.ceil((narrative.length * 1.4) / 100));
  if (purpleHits >= purpleThreshold) {
    issues.push({
      code: "purple_prose_overload",
      severity: "low",
      detail: `hits=${purpleHits}|len=${narrative.length}|threshold=${purpleThreshold}`,
    });
  }

  if (args.turnMode === "narrative_only" && narrative.length >= 24) {
    const tail = narrative.slice(-36);
    if ((CLOSED_ENDING_RE.test(tail) || CLOSED_ENDING_ZH_RE.test(tail)) || !(HOOK_RE.test(tail) || HOOK_ZH_RE.test(tail))) {
      issues.push({
        code: "hook_missing",
        severity: "medium",
        detail: args.focus ? `focus=${args.focus}` : "narrative_only_closed_tail",
      });
    }
  }

  // === 2026-07 新增：多维叙事质量检测（仅遥测，不硬拦截）===

  // 1. 画面感：感官词汇密度
  const SENSORY_WORDS =
    /(看|看见|望|注视|听|听见|闻|嗅|尝|触|摸|冷|热|凉|烫|疼|痛|刺|麻|痒|光|暗|亮|黑|白|红|蓝|绿|灰|反射|映|照|闪|晃|湿|干|滑|糙|黏|锈|灰|霉|潮|粉笔|血|水|油|药)/g;
  const sensoryHits = countMatches(narrative, SENSORY_WORDS);
  const sensoryDensity = narrative.length > 0 ? (sensoryHits / narrative.length) * 100 : 0;
  if (narrative.length >= 100 && sensoryDensity < 2.5) {
    issues.push({
      code: "sensory_density_low",
      severity: "low",
      detail: `sensoryHits=${sensoryHits}|len=${narrative.length}|density=${sensoryDensity.toFixed(2)}`,
    });
  }

  // 2. 节奏变化：长句与短句的对比（仅对足够长的叙事检测）
  const longSentences = sentenceLengths.filter((l) => l >= 30);
  const shortSentences = sentenceLengths.filter((l) => l <= 8);
  if (sentenceLengths.length >= 4 && narrative.length >= 180 && (longSentences.length === 0 || shortSentences.length === 0)) {
    issues.push({
      code: "rhythm_variation_flat",
      severity: "low",
      detail: `long=${longSentences.length}|short=${shortSentences.length}|total=${sentenceLengths.length}`,
    });
  }

  // 3. 对话落地：每段对话后是否有动作/环境/神情描述
  let dialogueGrounded = 0;
  const dialogueTotal = dialogueSpans.length;
  if (dialogueTotal > 0) {
    for (let i = 0; i < dialogueSpans.length; i++) {
      const span = dialogueSpans[i] ?? "";
      const spanEnd = narrative.indexOf(span);
      if (spanEnd < 0) continue;
      // 检查对话结束后的 40 个字符是否包含动作/环境词汇
      const afterDialogue = narrative.slice(spanEnd + span.length, spanEnd + span.length + 60);
      const GROUNDING_RE = /(，|。|！|？|看|听|闻|摸|走|站|坐|拿|放|推|拉|指|盯|笑|叹|点头|摇头|皱眉|沉默|转身|后退|上前)/;
      if (GROUNDING_RE.test(afterDialogue)) {
        dialogueGrounded += 1;
      }
    }
    if (dialogueGrounded < dialogueTotal) {
      issues.push({
        code: "dialogue_ungrounded",
        severity: "low",
        detail: `grounded=${dialogueGrounded}/${dialogueTotal}`,
      });
    }
  }

  // 4. 信息密度：非重复内容词占比
  const contentWords = narrative
    .replace(/[，。！？、；：""''「」『』《》（）\s\d]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2);
  const uniqueWords = new Set(contentWords);
  const uniqueRatio = contentWords.length > 0 ? uniqueWords.size / contentWords.length : 0;
  if (contentWords.length >= 40 && uniqueRatio < 0.55) {
    issues.push({
      code: "info_density_low",
      severity: "low",
      detail: `uniqueRatio=${uniqueRatio.toFixed(2)}|words=${contentWords.length}`,
    });
  }

  const byCode = countByCode(issues);
  return {
    ok: issues.length === 0,
    issues,
    telemetry: {
      styleProfileId: styleProfile.style_profile_id,
      totalIssues: issues.length,
      byCode,
      forbiddenPhraseHits,
      sentenceCount: sentences.length,
      averageSentenceLength: Number(avgLen.toFixed(2)),
      sentenceLengthSpread: spread,
      dialogueSpanCount: dialogueSpans.length,
      sensoryWordCount: sensoryHits,
      longSentenceCount: longSentences.length,
      shortSentenceCount: shortSentences.length,
      dialogueGroundedCount: dialogueGrounded,
      dialogueTotalCount: dialogueTotal,
      uniqueWordRatio: Number(uniqueRatio.toFixed(3)),
    },
  };
}
