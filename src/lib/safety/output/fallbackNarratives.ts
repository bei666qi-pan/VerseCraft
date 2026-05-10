import type {
  RiskLevel,
  ModerationDecision,
  ModerationScene,
  ModerationStage,
} from "@/lib/safety/policy/model";
import {
  isVisibleSafetyDegradeReason,
  VISIBLE_SAFETY_DEGRADE_MESSAGE,
} from "@/lib/security/visibleSafety";

const EMPTY_OPTIONS: string[] = [];

function truncate(s: string, max = 1200): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}...`;
}

/**
 * 开局首轮（OPENING_SYSTEM_PROMPT 触发）若命中 visible safety reasonCode，
 * 不再展示"本回合涉及涉黄、涉暴或违法伤害内容，不能继续"硬性合规话术；
 * 改用克制的中性中文承接句保留沉浸感（合规拦截行为本身仍由上游执行）。
 */
const OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE =
  "夜风从走廊深处吹来，我先把心稳一稳，再决定下一步。";

function privateStoryOutputFallback(reasonCode: string, isOpeningTurn: boolean): string {
  if (isVisibleSafetyDegradeReason(reasonCode)) {
    return isOpeningTurn ? OPENING_TURN_NEUTRAL_FALLBACK_NARRATIVE : VISIBLE_SAFETY_DEGRADE_MESSAGE;
  }
  return "这一步已做安全改写，请继续当前行动。";
}

export function buildOutputFallback(args: {
  scene: ModerationScene;
  stage: ModerationStage;
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  reasonCode: string;
  isProviderFailureFallback: boolean;
  /**
   * 是否为开场首轮（OPENING_SYSTEM_PROMPT 触发的回合）。
   * 命中时若仍为可见安全降级原因，会改用中性中文承接句，避免污染既定开场白沉浸感。
   */
  isOpeningTurn?: boolean;
}): { narrative: string; options?: string[] } {
  const { scene, stage, reasonCode, isProviderFailureFallback } = args;
  const isOpeningTurn = Boolean(args.isOpeningTurn);

  if (isProviderFailureFallback) {
    if (scene === "private_story_output") {
      return {
        narrative: truncate("网站生成通道暂时繁忙，请稍后重试。", 400),
        options: [...EMPTY_OPTIONS],
      };
    }
    if (stage === "public_display") {
      return {
        narrative: truncate("当前无法完成公开展示前的校验，这段内容先不展示。", 400),
      };
    }
    return {
      narrative: truncate("这段内容暂时无法完成校验，请稍后重试。", 400),
    };
  }

  if (scene === "private_story_output") {
    return {
      narrative: truncate(privateStoryOutputFallback(reasonCode, isOpeningTurn), 900),
      options: [...EMPTY_OPTIONS],
    };
  }

  if (scene === "codex_text") {
    return {
      narrative: truncate("图鉴条目暂时只保留更抽象的记录，细节需要等更可靠的线索补上。", 600),
    };
  }

  if (scene === "task_text") {
    return {
      narrative: truncate("任务文本先收束成方向：确认现场、避开过早判断，再寻找下一处可验证的线索。", 600),
    };
  }

  if (stage === "public_display") {
    return {
      narrative: truncate("这段内容暂时不适合公开展示，已保留为更克制的版本。", 350),
    };
  }

  return {
    narrative: truncate(privateStoryOutputFallback(reasonCode, isOpeningTurn), 400),
  };
}
