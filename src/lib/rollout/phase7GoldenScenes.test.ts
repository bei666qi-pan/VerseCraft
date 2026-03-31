import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";

function withEnv(k: string, v: string, fn: () => void) {
  const prev = process.env[k];
  process.env[k] = v;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[k];
    else process.env[k] = prev;
  }
}

test("golden: profession inclination/trial flags can appear in runtime packets", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第1日 2时]。用户位置[B1_Storage]。任务追踪：清点补给[main|active|委托守门骑士|层级B1|领取auto]。【rt_task_layers】starter_main=formal_task。" +
      "世界标记：profession.trial.offered.守灯人，profession.certified.守灯人。锚点解锁：B1[1]，1F[1]，7F[0]。" +
      "主威胁状态：1[A-001|active|20]。" +
      "主手武器[WPN-001|稳定60|反制sound/silence|污染45|可修复1]。" +
      "职业状态：当前[守灯人]，已认证[守灯人]，可认证[巡迹客]，被动[perk.x]。" +
      "职业进度：守灯人[属性1|行为2/2|试炼1|认证1]。",
    latestUserInput: "我想去配电间维护武器",
    playerLocation: "B1_Storage",
    maxChars: 16000,
  });
  assert.ok(packet.includes("profession_packet"));
  assert.ok(packet.includes("profession_progress_packet"));
  assert.ok(packet.includes("profession_identity_packet"));
});

test("golden: weapon lifecycle + playability packets are flag-gated", () => {
  withEnv("VERSECRAFT_ENABLE_PLAYABILITY_CORE_LOOPS_V1", "0", () => {
    const flags = getVerseCraftRolloutFlags();
    assert.equal(flags.enablePlayabilityCoreLoopsV1, false);
    const packet = buildRuntimeContextPackets({
      playerContext:
        "游戏时间[第1日 2时]。用户位置[B1_Storage]。任务追踪：测试[main|active|委托N-008|层级B1|领取auto]。【rt_task_layers】t=formal_task。" +
        "世界标记：conspiracy_seeded。锚点解锁：B1[1]，1F[1]，7F[0]。" +
        "主威胁状态：1[A-001|idle|0]。",
      latestUserInput: "测试",
      playerLocation: "B1_Storage",
      maxChars: 16000,
    });
    assert.ok(!packet.includes("survival_loop_packet"));
    assert.ok(!packet.includes("relationship_loop_packet"));
    assert.ok(!packet.includes("investigation_loop_packet"));
  });
});

