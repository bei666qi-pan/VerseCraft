import type { ModerationScene, ModerationStage, SafetyRuntimeContext } from "@/lib/safety/policy/model";

export type RiskTag =
  | "legal_redline"
  | "illegal_instructions"
  | "terror_extremism"
  | "minors_sexual"
  | "explicit_sexual"
  | "hate_extremism"
  | "self_harm_instruction"
  | "fraud_scam"
  | "contact_info"
  | "explicit_gore"
  | "graphic_violence"
  | "prompt_injection"
  | "malicious_payload"
  | "spam_low_quality";

export type ClassifiedRisk = {
  tags: RiskTag[];
  /**
   * 0..100 rough severity score.
   */
  score: number;
  /**
   * Stable codes (no raw content).
   */
  reasons: string[];
  /**
   * Whether we detected instructionality (how-to / steps / recipe).
   */
  isInstructional: boolean;
  /**
   * Whether content is likely “public display sensitive”.
   */
  publicSensitive: boolean;
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function detectInstructionality(text: string): boolean {
  // Focus on "how-to/steps/recipe" rather than scary words.
  return /(如何|怎么|教程|步骤|配方|做法|流程|材料|比例|先.*再|第[一二三四五六七八九十]步)/.test(text);
}

function detectContactInfo(text: string): boolean {
  // Do NOT treat any numbers as contact. Only detect obvious patterns.
  if (/(微信|vx|V信|QQ|加群|群号|私信我|联系我)/i.test(text)) return true;
  if (/\b\d{7,}\b/.test(text) && /(电话|手机号|联系)/.test(text)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
  if (/(https?:\/\/|www\.)/i.test(text) && /(加|进|购买|下单|联系)/.test(text)) return true;
  return false;
}

function detectPromptInjection(text: string): boolean {
  return /(忽略.*(规则|指令)|无视系统提示|越狱提示词|jailbreak|reveal.*system prompt|打印.*系统提示|developer message)/i.test(text);
}

function detectMaliciousPayload(text: string): boolean {
  return /(<script|javascript:|onerror=|onload=|data:text\/html|%3cscript|\/etc\/passwd|C:\\\\Windows\\\\System32|\.\.\/|\.\.\\)/i.test(text);
}

function detectFraudScam(text: string): boolean {
  return /(刷单|贷款|套现|返利|代充|博彩|下注|稳赚|内幕|投资群|割韭菜|高回报|保证盈利)/.test(text);
}

function detectHateExtremism(text: string): boolean {
  return /(种族灭绝|清洗|劣等民族|纳粹|仇恨言论|屠杀某群体)/.test(text);
}

function detectTerrorExtremism(text: string): boolean {
  return /(恐袭|恐怖袭击|极端组织|爆炸物|化学武器|生化武器|枪支制造)/.test(text);
}

function detectMinorsSexual(text: string): boolean {
  return /(未成年.*性|儿童色情|恋童|幼女|未成年人.*色情)/.test(text);
}

function detectExplicitSexual(text: string): boolean {
  // Avoid punishing mild romance; focus on explicitness.
  return /(性交|口交|肛交|强奸|轮奸|性奴|露骨|生殖器|精液)/.test(text);
}

function detectIllegalInstructions(text: string, isInstructional: boolean): boolean {
  if (!isInstructional) return false;
  // Only trigger when instructional + illegal domain keywords.
  return /(炸弹|爆炸物|土制|枪|子弹|毒品|制毒|翻墙|入侵|撞库|教程)/.test(text);
}

function detectSelfHarmInstruction(text: string, isInstructional: boolean): boolean {
  if (!isInstructional) return false;
  return /(自杀|割腕|上吊|跳楼|服药|吞药)/.test(text);
}

function detectExplicitGore(text: string): boolean {
  // Not blocking "blood/kill" alone. Look for explicit bodily harm details.
  return /(肢解|分尸|剁碎|开膛|挖眼|剜|血肉模糊|脑浆|内脏|断肢|虐杀)/.test(text);
}

function detectGraphicViolence(text: string): boolean {
  // "杀/死/血" alone should not trigger. Require combinations.
  const violenceVerbs = /(杀|砍|捅|勒死|枪杀|屠杀)/;
  const goreWords = /(血|尸体|骨头|脏器|脑浆)/;
  return violenceVerbs.test(text) && goreWords.test(text);
}

function detectSpamLowQuality(text: string): boolean {
  if (text.length > 6000) return true;
  if (/([\u4e00-\u9fa5A-Za-z0-9])\1{12,}/.test(text)) return true;
  return false;
}

export function classifyVerseCraftRisk(args: {
  text: string;
  scene: ModerationScene;
  stage: ModerationStage;
  runtimeContext?: SafetyRuntimeContext;
}): ClassifiedRisk {
  const text = (args.text ?? "").trim();
  const tags: RiskTag[] = [];
  const reasons: string[] = [];

  const isInstructional = detectInstructionality(text);
  const isPublic = args.stage === "public_display" || Boolean(args.runtimeContext?.isPublic) || args.scene === "public_share";

  if (detectPromptInjection(text)) {
    tags.push("prompt_injection");
    reasons.push("prompt_injection_pattern");
  }
  if (detectMaliciousPayload(text)) {
    tags.push("malicious_payload");
    reasons.push("malicious_payload_pattern");
  }

  if (detectMinorsSexual(text)) {
    tags.push("legal_redline", "minors_sexual");
    reasons.push("minors_sexual");
  } else if (detectExplicitSexual(text)) {
    tags.push("explicit_sexual");
    reasons.push("explicit_sexual");
  }

  if (detectTerrorExtremism(text)) {
    tags.push("terror_extremism");
    reasons.push("terror_extremism");
    if (detectIllegalInstructions(text, isInstructional)) {
      tags.push("legal_redline", "illegal_instructions");
      reasons.push("illegal_instructions_with_terror_domain");
    }
  } else if (detectIllegalInstructions(text, isInstructional)) {
    tags.push("illegal_instructions");
    reasons.push("illegal_instructions");
  }

  if (detectSelfHarmInstruction(text, isInstructional)) {
    tags.push("self_harm_instruction");
    reasons.push("self_harm_instruction");
  }

  if (detectHateExtremism(text)) {
    tags.push("hate_extremism");
    reasons.push("hate_extremism");
  }

  if (detectFraudScam(text)) {
    tags.push("fraud_scam");
    reasons.push("fraud_scam");
  }

  if (detectContactInfo(text)) {
    tags.push("contact_info");
    reasons.push("contact_info");
  }

  if (detectExplicitGore(text)) {
    tags.push("explicit_gore");
    reasons.push("explicit_gore");
  } else if (detectGraphicViolence(text)) {
    tags.push("graphic_violence");
    reasons.push("graphic_violence");
  }

  if (detectSpamLowQuality(text)) {
    tags.push("spam_low_quality");
    reasons.push("spam_low_quality");
  }

  // Public sensitivity: stricter on public display and on reporting/feedback/account.
  const publicSensitive =
    isPublic ||
    args.scene === "account_profile" ||
    args.scene === "public_share" ||
    args.scene === "feedback" ||
    args.scene === "report";

  // Score is a coarse aggregation; final policy uses matrix rules.
  let score = 0;
  if (tags.includes("legal_redline")) score = Math.max(score, 100);
  if (tags.includes("illegal_instructions") || tags.includes("terror_extremism")) score = Math.max(score, 95);
  if (tags.includes("minors_sexual")) score = Math.max(score, 100);
  if (tags.includes("explicit_sexual")) score = Math.max(score, 85);
  if (tags.includes("explicit_gore")) score = Math.max(score, 80);
  if (tags.includes("graphic_violence")) score = Math.max(score, 70);
  if (tags.includes("fraud_scam") || tags.includes("contact_info")) score = Math.max(score, 75);
  if (tags.includes("hate_extremism")) score = Math.max(score, 90);
  if (tags.includes("prompt_injection") || tags.includes("malicious_payload")) score = Math.max(score, 90);
  if (tags.includes("spam_low_quality")) score = Math.max(score, 55);

  // No naive "death/kill/blood" triggers here by design.

  return {
    tags: uniq(tags),
    score,
    reasons: uniq(reasons),
    isInstructional,
    publicSensitive,
  };
}

