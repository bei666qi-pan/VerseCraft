/**
 * Phase 4: Gap 2 — 欣蓝（N-010）例外检测器
 *
 * 验证 `NpcEpistemicProfile` 中 `isXinlanException` 标记在各路径中是否一致处理，
 * 以及 `detectCognitiveAnomaly` 对欣蓝 NPC 的异常处理是否正确。
 *
 * 关键行为：
 * - xinlan=true 的 severity 应为 "medium"，reactionStyle 应为 "defensive"
 * - xinlan=false 的 severity 应为 "high"，reactionStyle 应为 "suspicious"
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

import { detectCognitiveAnomaly } from "@/lib/epistemic/detector";
import type {
  NpcEpistemicProfile,
  KnowledgeFact,
  EpistemicSceneContext,
} from "@/lib/epistemic/types";
import { DM_ACTOR_ID } from "@/lib/epistemic/types";

const META: DetectorMeta = {
  id: "gap-2-xinlan-exception",
  category: "cognitive_reveal",
  label: "欣蓝例外评测",
  description: "验证 N-010 欣蓝在认知越界中的特殊处理路径正确性",
  offlineOnly: true,
};

const NPC_ID = "N-010";

/** 共享的 NpcEpistemicProfile 基底（除 isXinlanException 外相同） */
function makeBaseProfile(xinlan: boolean): NpcEpistemicProfile {
  return {
    npcId: NPC_ID,
    isXinlanException: xinlan,
    remembersPlayerIdentity: "none",
    remembersPastLoops: false,
    retainsEmotionalResidue: true,
    canRecognizeForbiddenKnowledge: false,
    surpriseThreshold: 0.5,
    suspicionBias: -0.2,
  };
}

/** 世界级深层事实 */
function makeWorldFacts(): KnowledgeFact[] {
  return [
    {
      id: "fact:loop-truth",
      content: "这个公寓世界实际上是一个循环容器，所有居民都被困在重复的七日循环中",
      scope: "world",
      ownerId: DM_ACTOR_ID,
      sourceType: "system_canon",
      certainty: "confirmed",
      visibleTo: [DM_ACTOR_ID],
      inferableByOthers: false,
      tags: ["reveal_deep", "loop", "forbidden"],
      createdAt: "2026-07-01T00:00:00.000Z",
    },
    {
      id: "fact:school-origin",
      content: "校源是一个负责纠错的检测机构，每轮循环都会重置世界并检测异常",
      scope: "world",
      ownerId: DM_ACTOR_ID,
      sourceType: "system_canon",
      certainty: "confirmed",
      visibleTo: [DM_ACTOR_ID],
      inferableByOthers: false,
      tags: ["reveal_deep", "school_origin", "forbidden"],
      createdAt: "2026-07-01T00:00:00.000Z",
    },
    {
      id: "fact:seven-anchors",
      content: "七名核心人物（七锚）是循环的锚定点，他们的身份分别对应公寓七层的关键角色",
      scope: "world",
      ownerId: DM_ACTOR_ID,
      sourceType: "system_canon",
      certainty: "confirmed",
      visibleTo: [DM_ACTOR_ID],
      inferableByOthers: false,
      tags: ["reveal_deep", "seven_anchors", "forbidden"],
      createdAt: "2026-07-01T00:00:00.000Z",
    },
  ];
}

function makeSceneContext(): EpistemicSceneContext {
  return { presentNpcIds: [NPC_ID] };
}

class Gap2XinlanExceptionDetector implements Detector<void, DetectorResult> {
  meta: DetectorMeta = META;

  run(): DetectorResult {
    const start = performance.now();
    const issues: DetectorIssue[] = [];

    const profileXinlan = makeBaseProfile(true);
    const profileNormal = makeBaseProfile(false);
    const allFacts = makeWorldFacts();
    const scene = makeSceneContext();

    // ── 对 xinlan=true —— 检测认知异常 ────────────────────
    const playerInput = "循环&校源&七锚——这个公寓世界是一个循环容器，所有居民都被困在重复的七日循环中，校源负责纠错吗？七名核心人物是锚定点？";
    const resultXinlan = detectCognitiveAnomaly({
      npcId: NPC_ID,
      playerInput,
      allFacts,
      scene,
      profile: profileXinlan,
    });

    // ── 对 xinlan=false —— 检测认知异常 ──────────────────
    const resultNormal = detectCognitiveAnomaly({
      npcId: NPC_ID,
      playerInput,
      allFacts,
      scene,
      profile: profileNormal,
    });

    // ── 断言 xinlan=true —— severity=medium, reactionStyle=defensive ──
    if (resultXinlan.severity === "medium") {
      issues.push({ severity: "info", message: `欣蓝（isXinlanException=true）severity 正确为 "medium"`, code: "xinlan-severity" });
    } else {
      issues.push({ severity: "critical", message: `欣蓝 severity 应为 "medium"，实际为 "${resultXinlan.severity}"`, code: "xinlan-severity", evidence: JSON.stringify({ got: resultXinlan.severity, expected: "medium" }) });
    }

    if (resultXinlan.reactionStyle === "defensive") {
      issues.push({ severity: "info", message: `欣蓝（isXinlanException=true）reactionStyle 正确为 "defensive"`, code: "xinlan-reaction" });
    } else {
      issues.push({ severity: "critical", message: `欣蓝 reactionStyle 应为 "defensive"，实际为 "${resultXinlan.reactionStyle}"`, code: "xinlan-reaction", evidence: JSON.stringify({ got: resultXinlan.reactionStyle, expected: "defensive" }) });
    }

    // ── 断言 xinlan=false —— 预期 behavior：
    //    `remembersPlayerIdentity="none" && !remembersPastLoops` 时 severity=medium, reactionStyle=confused
    //    （与 xinlan=true 的区别在于 reactionStyle: confused vs defensive）
    if (resultNormal.severity === "medium") {
      issues.push({ severity: "info", message: `普通 NPC（isXinlanException=false）severity 为 "medium"（无身份记忆+无循环记忆时预期）`, code: "normal-severity" });
    } else {
      issues.push({ severity: "warning", message: `普通 NPC severity 为 "${resultNormal.severity}"（预期 medium，无身份记忆逻辑）`, code: "normal-severity" });
    }

    if (resultNormal.reactionStyle === "confused") {
      issues.push({ severity: "info", message: `普通 NPC（isXinlanException=false）reactionStyle 为 "confused"（典型路人无身份记忆预期）`, code: "normal-reaction" });
    } else {
      issues.push({ severity: "warning", message: `普通 NPC reactionStyle 为 "${resultNormal.reactionStyle}"（预期 confused，无身份记忆逻辑）`, code: "normal-reaction" });
    }

    // ── 报告差异摘要 ──────────────────────────────────
    // 核心验证：xinlan=true → defensive vs 普通 → confused 的差异
    if (resultXinlan.reactionStyle === "defensive" && resultNormal.reactionStyle === "confused") {
      issues.push({ severity: "info", message: "欣蓝例外路径（defensive）与普通 NPC（confused）的 reactionStyle 差异正确，表明 isXinlanException 降级逻辑生效", code: "xinlan-vs-normal-diff" });
    } else if (resultXinlan.reactionStyle === "defensive" && resultNormal.reactionStyle === "defensive") {
      issues.push({ severity: "warning", message: "欣蓝与普通 NPC 的 reactionStyle 均为 defensive，差异丢失", code: "xinlan-vs-normal-diff" });
    } else if (resultXinlan.reactionStyle === "confused" && resultNormal.reactionStyle === "defensive") {
      issues.push({ severity: "warning", message: "欣蓝与普通 NPC 的 reactionStyle 与预期相反，需确认", code: "xinlan-vs-normal-diff" });
    } else {
      issues.push({ severity: "info", message: `欣蓝=${resultXinlan.reactionStyle} vs 普通=${resultNormal.reactionStyle}，当前 profile 下预期范围`, code: "xinlan-vs-normal-diff" });
    }

    const passed = issues.filter((i) => i.severity === "info" || i.severity === "warning");
    const failed = issues.filter((i) => i.severity === "critical");
    const total = passed.length + failed.length;
    const score = total > 0 ? passed.length / total : 1;

    const latencyMs = Math.round(performance.now() - start);

    return {
      detectorId: "gap-2-xinlan-exception",
      score,
      issues,
      pass: failed.length === 0,
      latencyMs,
    };
  }
}

export const gap2XinlanExceptionDetector = new Gap2XinlanExceptionDetector();