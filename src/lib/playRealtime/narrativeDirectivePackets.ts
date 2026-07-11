/**
 * Phase-2.4: 每回合节奏指令 packet。
 *
 * 确定性构建节奏指令块，注入到 prompt suffix 中以引导模型输出节奏。
 * 灰度开关 VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE（默认关）。
 *
 * 指令内容基于：
 * - 当前 lane（FAST/RULE/REVEAL）
 * - 当前 beatState（setup/rising/choice/peak/aftermath/cooldown）
 * - 近三回合情绪档位分布（来自 narrative_pacing_ledger，fallback 为空）
 * - agenda 提示（来自 world director）
 *
 * 产出为一至两行中文指令，加在 dynamic suffix 中。
 *
 * @module narrativeDirectivePackets
 */

import type { TurnLane } from "@/lib/turnEngine/types";
import { dueToDirectiveFragment, type ForeshadowEntry } from "@/lib/narrativeGovernance/foreshadowLifecycle";

// ============================================================
// 指令构建
// ============================================================

/** 节奏指令构建参数。 */
export type NarrativeDirectiveParams = {
  /** 当前路由 lane。 */
  lane: TurnLane;
  /** 当前 beat 状态。 */
  beatState: string | null | undefined;
  /** 近 N 回合 register 分布（最多 3 个）。 */
  recentRegisters?: readonly string[];
  /** 世界导演 agenda 提示（可选）。 */
  directorAgendaHint?: string | null;
  /** 在场可对话 NPC 数量（来自 sceneActorGate）。为 0 或省略时不提对白。 */
  talkableNpcCount?: number;
  /** 在场焦点 NPC 名称（最多 2 个，用于指令中点名）。 */
  talkableNpcNames?: readonly string[];
  /** 到期伏笔条目（来自 foreshadow_ledger，最多 2 条）。 */
  dueForeshadow?: readonly ForeshadowEntry[];
};

/**
 * 构建节奏指令块。
 *
 * 如果没有可用的指令，返回空字符串（注入方应跳过空 block）。
 */
export function buildNarrativeDirectiveBlock(
  params: NarrativeDirectiveParams
): string {
  const parts: string[] = [];

  // === 1. beat 指令 ===
  const beatDirective = buildBeatDirective(params.beatState);
  if (beatDirective) parts.push(beatDirective);

  // === 2. register 配比指令 ===
  const registerDirective = buildRegisterDirective(params.recentRegisters);
  if (registerDirective) parts.push(registerDirective);

  // === 3. 对白配额指令 ===
  const dialogueDirective = buildDialogueDirective(
    params.talkableNpcCount,
    params.talkableNpcNames,
  );
  if (dialogueDirective) parts.push(dialogueDirective);

  // === 4. 到期伏笔回收指令（建议式） ===
  const foreshadowDirective = dueToDirectiveFragment(params.dueForeshadow ?? []);
  if (foreshadowDirective) parts.push(foreshadowDirective);

  if (parts.length === 0) return "";

  return `【节奏指令】${parts.join("；")}`;
}

// ============================================================
// beat 指令生成（同步 styleBible.ts pacing_policy 语义）
// ============================================================

function buildBeatDirective(
  beatState: string | null | undefined,
): string {
  if (!beatState) return "";

  switch (beatState) {
    case "setup":
      return "当前为铺垫阶段，推进场景细节与 NPC 互动，积蓄信息差，不释放重大真相";
    case "rising":
      return "当前为推进阶段，给玩家一个实质性推进（线索、NPC 反应、环境变化），为后续冲突做铺垫";
    case "choice":
      return "当前为决策节点，选项应展示有代价的区别，暗示不同路径的风险与回报";
    case "peak":
      return "当前为危机高潮，先写身体代价与距离变化，再写结果；高压之后需在尾部或下回合给情绪出口";
    case "aftermath":
      return "当前为后果承接阶段，反映上一回合决策的结果，展示状态变化而非重复危机";
    case "cooldown":
      return "当前为缓和阶段，侧重人物反应与日常细节，不释放重大推进";
    default:
      return "";
  }
}

// ============================================================
// register 配比指令（三回合法则：不连三同 / 缓和不连二）
// ============================================================

function buildRegisterDirective(
  recentRegisters?: readonly string[]
): string {
  if (!recentRegisters || recentRegisters.length < 2) return "";

  // 确保都是非 null 字符串
  const registers = recentRegisters.filter(
    (r): r is string => typeof r === "string" && r.length > 0
  );
  if (registers.length < 2) return "";

  const lastSeq = registers.slice(0, 3); // 最近最多 3 个

  // 连续两个缓和档位（幽默/温情）
  const LEVITY_OR_WARMTH = new Set(["levity", "warmth"]);
  if (
    lastSeq.length >= 2 &&
    LEVITY_OR_WARMTH.has(lastSeq[0]!) &&
    LEVITY_OR_WARMTH.has(lastSeq[1]!)
  ) {
    return "这是第三个回合了，请切换到悬疑推进或智斗方向";
  }

  // 连续三个相同主档位（非缓和的）
  if (
    lastSeq.length >= 3 &&
    lastSeq[0] === lastSeq[1] &&
    lastSeq[1] === lastSeq[2]
  ) {
    return "请切换情绪档位，避免连续三回合同一种叙事基调";
  }

  return "";
}

// ============================================================
// 对白配额指令（在场 NPC ≥1 → 鼓励对白落地到动作）
// ============================================================

function buildDialogueDirective(
  talkableNpcCount?: number,
  talkableNpcNames?: readonly string[],
): string {
  const count = talkableNpcCount ?? 0;
  if (count <= 0) return "";

  const names = (talkableNpcNames ?? [])
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .slice(0, 2);

  if (names.length > 0) {
    const nameStr = names.join("、");
    return `${nameStr}在场，本回合安排一句对白让其开口；对白后须落地到具体动作或反应，不要悬在半空`;
  }
  return `有 ${count} 名可对话 NPC 在场，本回合安排一句对白；对白后须落地到动作或反应`;
}
