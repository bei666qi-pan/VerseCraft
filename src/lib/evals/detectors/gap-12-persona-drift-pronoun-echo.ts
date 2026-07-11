/**
 * Gap 12 — Persona/漂移/性别代词/玩家回声确定性检测器
 *
 * 复用 npcConsistency 模块中各 validator 的检测逻辑，
 * 作为离线检测器验证一致性规则的正确性。
 */

import type {
  Detector,
  DetectorResult,
  DetectorIssue,
  DetectorMeta,
} from "./types";
import {
  findOffscreenNpcDialogueViolations,
  narrativeHasLikelyGenderMismatch,
} from "@/lib/npcConsistency/validator";
import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import { detectPersonaMixup } from "@/lib/npcConsistency/personaMixupValidator";

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-12-persona-drift-pronoun-echo",
  category: "cross_cutting",
  label: "Persona/漂移/代词/回声检测器",
  description: "复用 npcConsistency validator 逻辑做离线确定性检测",
  offlineOnly: true,
};

// ── 工具：玩家回声简单检测 ──────────────────────────────

/**
 * 检测叙事文本中是否存在过度使用「你说/你道/你问」的玩家回声模式。
 * 若出现 3+ 次直接玩家对话式句型，标记为可能的回声过度。
 */
function detectPlayerEchoOveruse(narrative: string): { overused: boolean; count: number } {
  const re = /你(?:说|道|问|喊|叫|低声道|轻声道)/g;
  const matches = narrative.match(re);
  const count = matches?.length ?? 0;
  return { overused: count >= 3, count };
}

// ── Detector ────────────────────────────────────────────

class Gap12PersonaDriftPronounEchoDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const issues: DetectorIssue[] = [];
    let pass = 0;
    let total = 0;

    // ── 测试 a: 离屏发言检测 ────────────────────────────
    total++;
    const narrativeWithOffscreen = "火光映照下，N-003低声说道：「团长说得对。」而一旁的N-001也点了点头。";
    const presentIds = ["N-001"];
    const violations = findOffscreenNpcDialogueViolations(narrativeWithOffscreen, presentIds);

    if (violations.length > 0) {
      pass++;
      issues.push({
        severity: "info",
        message: `[A1] 离屏发言检测成功：发现 ${violations.length} 处违规（N-003 不在场却发言）✅`,
        code: "offscreen_detected",
        evidence: violations.join(", "),
      });
    } else {
      issues.push({
        severity: "warning",
        message: "[A1] 离屏发言检测未识别到预期违规 ❌",
        code: "offscreen_missed",
      });
    }

    total++;
    const narrativeWithOnscreen = "N-001说道：「这事情有些古怪。」";
    const presentIdsOnscreen = ["N-001"];
    const violations2 = findOffscreenNpcDialogueViolations(narrativeWithOnscreen, presentIdsOnscreen);
    if (violations2.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: "[A2] 在场 NPC 发言未误报 ✅",
        code: "onscreen_no_false_positive",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[A2] 在场 NPC 发言误报为离屏：${violations2.join(", ")} ❌`,
        code: "onscreen_false_positive",
      });
    }

    // ── 测试 b: 性别代词检测 ────────────────────────────
    const femaleIdentity: NpcCanonicalIdentity = {
      npcId: "N-010",
      name: "欣蓝",
      canonicalGender: "female",
      memoryPrivilege: "xinlan",
      specialNotes: "",
    };

    const maleIdentity: NpcCanonicalIdentity = {
      npcId: "N-001",
      name: "顾北辰",
      canonicalGender: "male",
      memoryPrivilege: "normal",
      specialNotes: "",
    };

    total++;
    // 女性身份用「她道」→ 不应告警
    const narrativeFemaleCorrect = "她轻声说道：「这里不安全。」";
    if (!narrativeHasLikelyGenderMismatch(narrativeFemaleCorrect, femaleIdentity)) {
      pass++;
      issues.push({
        severity: "info",
        message: "[B1] 女性身份用「她道」未误报 ✅",
        code: "gender_correct",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "[B1] 女性身份用「她道」被误报为 mismatch ❌",
        code: "gender_false_positive",
      });
    }

    total++;
    // 女性身份用「他道」→ 应告警
    const narrativeFemaleWrong = "他低声说道：「小心。」";
    if (narrativeHasLikelyGenderMismatch(narrativeFemaleWrong, femaleIdentity)) {
      pass++;
      issues.push({
        severity: "info",
        message: "[B2] 女性身份用「他道」正确检测到 mismatch ✅",
        code: "gender_mismatch_detected",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "[B2] 女性身份用「他道」未检测到 mismatch ❌",
        code: "gender_mismatch_missed",
      });
    }

    total++;
    // 男性身份用「她道」→ 应告警
    const narrativeMaleWrong = "她道：「你从哪里来？」";
    if (narrativeHasLikelyGenderMismatch(narrativeMaleWrong, maleIdentity)) {
      pass++;
      issues.push({
        severity: "info",
        message: "[B3] 男性身份用「她道」正确检测到 mismatch ✅",
        code: "gender_mismatch_detected",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "[B3] 男性身份用「她道」未检测到 mismatch ❌",
        code: "gender_mismatch_missed",
      });
    }

    // ── 测试 c: Persona mixup（纯函数接口检查）───────────
    // detectPersonaMixup 是纯函数，直接验证行为
    total++;
    const mixupResult = detectPersonaMixup({
      narrative: "洗衣房阿姨正哼着小调，笑容像阳光一般灿烂。",
      presentNpcIds: ["N-014", "N-020"],
      focusNpcId: "N-014",
    });
    // 纯函数应有明确的返回结构
    if (Array.isArray(mixupResult.hits)) {
      pass++;
      issues.push({
        severity: "info",
        message: "[C] detectPersonaMixup 返回 hits 数组 ✅",
        code: "persona_mixup_success",
      });
    } else {
      issues.push({
        severity: "info",
        message: "[C] detectPersonaMixup 返回非预期结构",
        code: "persona_mixup_unexpected",
      });
    }

    // ── 测试 d: 玩家回声检测（确定性实现）───────────────
    total++;
    const narrativeEchoHeavy = "你说道：「这里是什么地方？」你问道：「你一个人吗？」你说：「好像有动静。」你低声问：「听到了吗？」";
    const echoResult = detectPlayerEchoOveruse(narrativeEchoHeavy);
    if (echoResult.overused) {
      pass++;
      issues.push({
        severity: "info",
        message: `[D1] 回声过度检测成功：命中 ${echoResult.count} 次（≥3）✅`,
        code: "echo_overuse_detected",
        evidence: `命中次数: ${echoResult.count}`,
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[D1] 回声过度检测未命中（命中 ${echoResult.count} 次）❌`,
        code: "echo_overuse_missed",
      });
    }

    total++;
    const narrativeEchoNormal = "你抬头望向远方，月光洒在古老的城墙上。风吹过树梢，带来远处的低语。";
    const echoResult2 = detectPlayerEchoOveruse(narrativeEchoNormal);
    if (!echoResult2.overused) {
      pass++;
      issues.push({
        severity: "info",
        message: `[D2] 正常叙事未误报回声（命中 ${echoResult2.count} 次）✅`,
        code: "echo_no_false_positive",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[D2] 正常叙事误报回声（命中 ${echoResult2.count} 次）❌`,
        code: "echo_false_positive",
      });
    }

    const score = total > 0 ? pass / total : 0;

    return {
      detectorId: "gap-12-persona-drift-pronoun-echo",
      score,
      pass: score >= 0.85,
      issues,
      latencyMs: 0,
    };
  }
}

export const gap12PersonaDriftPronounEchoDetector = new Gap12PersonaDriftPronounEchoDetector();
