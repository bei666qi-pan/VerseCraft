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

function privateStoryOutputFallback(reasonCode: string): string {
  if (isVisibleSafetyDegradeReason(reasonCode)) return VISIBLE_SAFETY_DEGRADE_MESSAGE;
  return "这一步已做安全改写，请继续当前行动。";
}

export function buildOutputFallback(args: {
  scene: ModerationScene;
  stage: ModerationStage;
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  reasonCode: string;
  isProviderFailureFallback: boolean;
}): { narrative: string; options?: string[] } {
  const { scene, stage, reasonCode, isProviderFailureFallback } = args;

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
      narrative: truncate(privateStoryOutputFallback(reasonCode), 900),
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
    narrative: truncate(privateStoryOutputFallback(reasonCode), 400),
  };
}
