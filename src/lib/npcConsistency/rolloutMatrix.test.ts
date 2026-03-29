/**
 * 验收矩阵索引：每项指向具体单测或 golden scene（便于 PR 对照）。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEpistemicResiduePerformancePlan } from "@/lib/epistemic/residuePerformance";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { getEpistemicRolloutFlags } from "@/lib/epistemic/featureFlags";
import { envBoolean } from "@/lib/config/envRaw";

describe("rolloutMatrix：阶段8 验收索引", () => {
  it("矩阵项与实现存在性（文档化锚点）", () => {
    const flags = getEpistemicRolloutFlags();
    assert.equal(typeof flags.enableNpcCanonGuard, "boolean");
    assert.equal(typeof flags.enableNpcBaselineAttitude, "boolean");
    assert.equal(typeof flags.enableNpcSceneAuthority, "boolean");
    assert.equal(typeof flags.enableActorScopedEpistemic, "boolean");
    assert.equal(typeof flags.enableNpcConsistencyValidator, "boolean");
    assert.equal(typeof flags.enableNpcResidue, "boolean");
    assert.equal(typeof flags.enableXinlanHighPrivilege, "boolean");
    assert.equal(typeof flags.npcDebug, "boolean");
  });

  it("快车道 env 仍可读取（边界用例由 goldenScenes + chat perf flags 覆盖）", () => {
    const v = envBoolean("AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS", true);
    assert.equal(typeof v, "boolean");
  });

  it("残响 packet 约束仍禁止具体旧事命题（矩阵 #10）", () => {
    const npc = "N-888";
    const profile = buildNpcEpistemicProfile(npc);
    let found = false;
    for (let i = 0; i < 120; i++) {
      const plan = buildEpistemicResiduePerformancePlan({
        focusNpcId: npc,
        profile,
        anomalyResult: {
          anomaly: false,
          npcId: npc,
          severity: "low",
          reactionStyle: "confused",
          triggerFactIds: [],
          requiredBehaviorTags: [],
          forbiddenResponseTags: [],
          mustInclude: [],
          mustAvoid: [],
        },
        mem: null,
        latestUserInput: "你好",
        playerContext: '{"hour":10}',
        presentNpcIds: [npc],
        requestId: `mx${i}`,
        nowIso: "2026-03-28T12:00:00.000Z",
      });
      if (plan.packet) {
        found = true;
        assert.ok(plan.packet.narrativeConstraints.some((c) => c.includes("禁止")));
        break;
      }
    }
    assert.ok(found);
  });
});
