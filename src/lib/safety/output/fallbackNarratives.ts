import type { RiskLevel, ModerationDecision, ModerationScene, ModerationStage } from "@/lib/safety/policy/model";

// 降级场景不内置本地选项，仍交给模型选项链路实时补齐。
const EMPTY_OPTIONS: string[] = [];

function truncate(s: string, max = 1200): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function privateStoryFallback(max = 900): string {
  return truncate(
    "话音刚落，门缝后的摩擦声停了一下。那不是回应，更像有什么东西在黑暗里重新确认我的位置。老人抬手按低我的手腕，眼神第一次变得严厉：别再用声音试探它。这个短暂的停顿反而露出一个机会，我可以趁它判断错方向时后撤，也可以逼老人说出那扇门后到底是什么。",
    max
  );
}

export function buildOutputFallback(args: {
  scene: ModerationScene;
  stage: ModerationStage;
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  reasonCode: string;
  isProviderFailureFallback: boolean;
}): { narrative: string; options?: string[] } {
  const { scene, stage, isProviderFailureFallback } = args;

  if (isProviderFailureFallback) {
    if (scene === "private_story_output") {
      return {
        narrative: truncate(
          "灯光忽然跳了一下，像有人在远处拨动了整层楼的电闸。老人把茶杯放下，朝走廊尽头看去；那里的脚步声没有靠近，反而绕开了半圈。这个偏移很短，却足够我抓住机会换位置，或者追问老人刚才为什么紧张。",
          900
        ),
        options: [...EMPTY_OPTIONS],
      };
    }
    if (stage === "public_display") {
      return {
        narrative: truncate("当前无法完成公开展示前的校验，这段内容先不展示。", 400),
      };
    }
    return {
      narrative: truncate("这段内容暂时无法完成校验，系统已保留更稳妥的版本。", 400),
    };
  }

  if (scene === "private_story_output") {
    return {
      narrative: privateStoryFallback(900),
      options: [...EMPTY_OPTIONS],
    };
  }

  if (scene === "codex_text") {
    return {
      narrative: truncate("图鉴条目暂时只保留更抽象的记录：现象仍在，细节需要等更可靠的线索补上。", 600),
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
    narrative: truncate(
      "话刚出口，老人先看向走廊尽头。灯管抖了一下，门缝里的摩擦声忽然换了节奏，像是有东西被我的声音引偏。它没有替我解决眼前的问题，却露出一个可以利用的空档：退到柜边、追问老人，或贴墙换路。",
      400
    ),
  };
}
