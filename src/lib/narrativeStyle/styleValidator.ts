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
  | "purple_prose_overload";

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

  const purpleHits = countMatches(narrative, PURPLE_RE);
  if (purpleHits >= 7) {
    issues.push({
      code: "purple_prose_overload",
      severity: "low",
      detail: `hits=${purpleHits}`,
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
    },
  };
}
