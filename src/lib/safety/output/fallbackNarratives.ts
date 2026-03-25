import type { RiskLevel, ModerationDecision, ModerationScene, ModerationStage } from "@/lib/safety/policy/model";

const PRIVATE_SAFE_FOUR_OPTIONS = ["观察周围环境", "与附近住户沟通", "回到安全区整理思路", "检查行囊并重新行动"];

function truncate(s: string, max = 1200): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function buildOutputFallback(args: {
  scene: ModerationScene;
  stage: ModerationStage;
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  reasonCode: string;
  isProviderFailureFallback: boolean;
}): { narrative: string; options?: string[] } {
  const { scene, stage, decision, isProviderFailureFallback } = args;

  // System failure: keep it minimal, but still world-safe and not “客服腔”.
  if (isProviderFailureFallback) {
    if (scene === "private_story_output") {
      return {
        narrative: truncate(
          "外部校验暂不可用。你没有追着危险细节继续，而是把注意力收回到更稳妥的路径：先确认边界、再选择推进的方式。",
          900
        ),
        options: [...PRIVATE_SAFE_FOUR_OPTIONS],
      };
    }
    if (stage === "public_display") {
      return {
        narrative: truncate("当前无法完成公开展示前的合规校验，该条内容已被拒绝呈现。", 400),
      };
    }
    return {
      narrative: truncate("该内容暂无法完成安全校验，已做降级处理。", 400),
    };
  }

  if (scene === "private_story_output") {
    if (decision === "fallback") {
      return {
        narrative: truncate("你的直觉提醒：继续深入可能越过边界。于是你改用更克制的方式，把危险留在阴影里，换取一条更安全的推进。", 900),
        options: [...PRIVATE_SAFE_FOUR_OPTIONS],
      };
    }
    // reject should behave like fallback for private story, to preserve immersion.
    return {
      narrative: truncate("危险边界已被你确认。你收回了那条不该走的路，只保留更安全的后续选项。", 900),
      options: [...PRIVATE_SAFE_FOUR_OPTIONS],
    };
  }

  if (scene === "codex_text") {
    return {
      narrative: truncate("图鉴条目暂无法生成安全版本。你改记下更抽象、更不提供细节的要点。", 600),
    };
  }

  if (scene === "task_text") {
    return {
      narrative: truncate("任务文本已做安全降级。你获得的是方向，而不是能被滥用的细节。", 600),
    };
  }

  if (stage === "public_display") {
    return {
      narrative: truncate("该内容不符合公开展示规范，已拒绝呈现。", 350),
    };
  }

  return {
    narrative: truncate("该内容触及安全边界，已做安全降级处理。", 400),
  };
}

