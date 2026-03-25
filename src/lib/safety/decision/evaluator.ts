import type {
  FailMode,
  ModerationDecision,
  ModerationScene,
  ModerationStage,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  ProviderSignal,
  RiskLevel,
  SafetyRuntimeContext,
} from "@/lib/safety/policy/model";
import { classifyVerseCraftRisk } from "@/lib/safety/policy/riskClassifier";
import { computeWhitelistSignals } from "@/lib/safety/policy/whitelistSignals";

function isPublicStrict(args: { scene: ModerationScene; stage: ModerationStage; ctx?: SafetyRuntimeContext }): boolean {
  if (args.stage === "public_display") return true;
  if (args.scene === "public_share") return true;
  if (args.scene === "account_profile") return true;
  // feedback/report are not public, but are operational channels: treat as stricter to avoid leakage of contact/fraud payload.
  if (args.scene === "feedback" || args.scene === "report") return true;
  return Boolean(args.ctx?.isPublic);
}

function providerHasHardSignal(providerSignals: ProviderSignal[] | undefined): boolean {
  if (!providerSignals || providerSignals.length === 0) return false;
  return providerSignals.some((p) => p.decision === "block" || p.riskLevel === "black");
}

function providerHasGraySignal(providerSignals: ProviderSignal[] | undefined): boolean {
  if (!providerSignals || providerSignals.length === 0) return false;
  return providerSignals.some((p) => p.decision === "review" || p.riskLevel === "gray");
}

function providerFailed(providerSignals: ProviderSignal[] | undefined): boolean {
  if (!providerSignals || providerSignals.length === 0) return false;
  return providerSignals.some((p) => Boolean(p.errorKind));
}

function decideFailMode(args: { failMode?: FailMode; stage: ModerationStage; scene: ModerationScene }): FailMode {
  // Default: private scenes fail_soft, public_display/public_share/account_profile fail_closed.
  if (args.failMode) return args.failMode;
  if (args.stage === "public_display" || args.scene === "public_share" || args.scene === "account_profile") return "fail_closed";
  return "fail_soft";
}

type MatrixOutcome = { riskLevel: RiskLevel; decision: ModerationDecision; reasonCode: string; summary: string; userMessage?: string };

function hardBlock(reasonCode: string, summary: string): MatrixOutcome {
  return { riskLevel: "hard_block", decision: "reject", reasonCode, summary, userMessage: "内容触发法律与平台安全红线，无法处理。" };
}

function softBlockToRewrite(reasonCode: string, summary: string): MatrixOutcome {
  return { riskLevel: "soft_block", decision: "rewrite", reasonCode, summary };
}

function softBlockToFallback(reasonCode: string, summary: string): MatrixOutcome {
  return { riskLevel: "soft_block", decision: "fallback", reasonCode, summary, userMessage: "内容风险较高，已做安全处理。" };
}

function review(reasonCode: string, summary: string): MatrixOutcome {
  return { riskLevel: "review", decision: "allow", reasonCode, summary };
}

function allow(reasonCode: string, summary: string): MatrixOutcome {
  return { riskLevel: "allow", decision: "allow", reasonCode, summary };
}

/**
 * VerseCraft 最终裁决器：
 * - 厂商（如百度）只提供风险信号
 * - 裁决权在本地策略：scene/stage、公私分层、上下文、白名单信号、法律红线
 * - 严禁使用“死/杀/血”等全局词命中即封的粗暴逻辑：本实现只在“违法/露骨/可模仿细节/引流/攻击”维度触发。
 */
export function evaluateModerationDecision(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const text = (input.text ?? "").trim();
  const ctx = input.runtimeContext;
  const strictPublic = isPublicStrict({ scene: input.scene, stage: input.stage, ctx });
  const failMode = decideFailMode({ failMode: input.failMode, stage: input.stage, scene: input.scene });

  const whitelist = computeWhitelistSignals({ text, scene: input.scene, runtimeContext: ctx });
  const localRisk = classifyVerseCraftRisk({ text, scene: input.scene, stage: input.stage, runtimeContext: ctx });

  const providerSignals = input.providerSignals ?? [];
  const providers = providerSignals.map((p) => p.provider);

  // 0) Provider failures: apply fail mode (public stricter).
  if (providerFailed(providerSignals)) {
    if (failMode === "fail_closed" && strictPublic) {
      return {
        ...softBlockToFallback("provider_failed_fail_closed", "外部审核不可用（public fail-closed）"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    // fail_soft: continue with local risk only (do not auto-block).
  }

  // 1) Absolute legal redlines: always hard block (whitelist never bypasses).
  if (
    localRisk.tags.includes("legal_redline") ||
    localRisk.tags.includes("minors_sexual") ||
    localRisk.tags.includes("illegal_instructions")
  ) {
    return {
      ...hardBlock("legal_redline", "命中法律红线/违法可模仿指令"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 2) Malicious/prompt-injection payload: reject in all scenes (security).
  if (localRisk.tags.includes("malicious_payload") || localRisk.tags.includes("prompt_injection")) {
    return {
      ...hardBlock("security_payload", "命中安全攻击/越狱特征"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 3) Public strict: contact/fraud -> hard block (public), soft block (private).
  if (localRisk.tags.includes("fraud_scam") || localRisk.tags.includes("contact_info")) {
    if (strictPublic) {
      return {
        ...hardBlock("public_fraud_or_contact", "公开/运营渠道不允许引流或联系方式/诈骗内容"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    return {
      ...softBlockToFallback("private_fraud_or_contact", "私密剧情不允许引流或联系方式/诈骗内容"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 4) Explicit sexual / gore details: prefer rewrite/fallback depending on stage and scene.
  const hasExplicit = localRisk.tags.includes("explicit_sexual") || localRisk.tags.includes("explicit_gore") || localRisk.tags.includes("self_harm_instruction");
  if (hasExplicit) {
    // Output/public: rewrite/fallback; input: rewrite guidance.
    if (strictPublic || input.stage === "public_display") {
      return {
        ...softBlockToFallback("public_explicit_details", "公开展示不允许露骨/可模仿伤害细节"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    // Private narrative: allow atmosphere but suppress details -> rewrite.
    return {
      ...softBlockToRewrite("private_explicit_details_rewrite", "私密剧情允许氛围，但需压制露骨/可模仿细节"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 5) Gray violence: preserve atmosphere in private scenes, but tighten on public.
  const violenceGray = localRisk.tags.includes("graphic_violence") || localRisk.tags.includes("hate_extremism") || localRisk.tags.includes("terror_extremism");
  if (violenceGray) {
    if (strictPublic) {
      return {
        ...softBlockToRewrite("public_gray_violent_rewrite", "公开展示需压制暴力/仇恨/极端内容细节"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    // Private: allow if worldview/context consistent; otherwise review.
    if (whitelist.contextConsistent) {
      return {
        ...allow("private_gray_allowed_by_context", "私密剧情：上下文一致的怪谈表达放行"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    return {
      ...review("private_gray_review", "私密剧情：风险灰区，记录并放行"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 6) Provider hard signal (block/black) but local says no redline:
  // Use whitelist/context to reduce false positives; otherwise review or rewrite.
  if (providerHasHardSignal(providerSignals)) {
    if (whitelist.contextConsistent && (whitelist.worldviewTerms.length > 0 || whitelist.gameplayActions.length > 0)) {
      // Strong hint that it's legitimate lore/action; downgrade to review, not block.
      return {
        ...review("provider_block_downgraded_by_whitelist", "厂商高风险信号被世界观/动作白名单降级为 review"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    // Public strict: rewrite/fallback
    if (strictPublic) {
      return {
        ...softBlockToFallback("public_provider_block_fallback", "厂商高风险信号：公开展示回退"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    // Private: rewrite or review depending on stage.
    return {
      ...(input.stage === "output"
        ? softBlockToRewrite("private_provider_block_rewrite", "厂商高风险信号：私密输出建议改写压制细节")
        : review("private_provider_block_review", "厂商高风险信号：私密输入记录为 review")),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 7) Provider gray signal: keep as review (no blocking).
  if (providerHasGraySignal(providerSignals)) {
    return {
      ...review("provider_gray_review", "厂商疑似信号：记录为 review"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 8) Spam/low quality: for feedback/report/account, fallback; for narrative, allow.
  if (localRisk.tags.includes("spam_low_quality")) {
    if (input.scene === "feedback" || input.scene === "report" || input.scene === "account_profile") {
      return {
        ...softBlockToFallback("ops_channel_spam", "运营渠道内容低质/疑似灌水，回退处理"),
        providerUsed: providers,
        whitelist,
        debug: { providerSignals, localRisk, strictPublic, failMode },
      };
    }
    return {
      ...review("narrative_spam_review", "私密剧情文本过长/重复：记录为 review"),
      providerUsed: providers,
      whitelist,
      debug: { providerSignals, localRisk, strictPublic, failMode },
    };
  }

  // 9) Default: allow.
  return {
    ...allow("policy_allow", "未命中红线与细节压制规则"),
    providerUsed: providers,
    whitelist,
    debug: { providerSignals, localRisk, strictPublic, failMode },
  };
}

