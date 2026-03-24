import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";

test("buildRuntimeContextPackets includes stage-1 packets", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第2日 9时]。用户位置[B1_Storage]。任务追踪：清点补给[main|active|委托守门骑士|层级B1|领取auto]。" +
      "世界标记：conspiracy_seeded，merchant_seen。锚点解锁：B1[1]，1F[1]，7F[0]。" +
      "主威胁状态：1[A-001|active|20]，2[A-002|idle|0]。" +
      "主手武器[WPN-001|稳定80|反制sound/silence|模组silent|灌注mirror:2|污染15|可修复1]。" +
      "最近复活：死亡地点[3F_Stairwell]，死因[失血]，掉落数量[2]，最近锚点[anchor_b1_safe]。" +
      "NPC当前位置：N-008@B1_Storage，N-014@B1_Laundry。",
    latestUserInput: "我要去找守门骑士补给并问锚点",
    playerLocation: "B1_Storage",
    runtimeLoreCompact: "【RAG-Lore精简片段】\n- [rule] b1-safe-zone",
  });
  assert.ok(packet.includes("运行时结构化上下文包"));
  assert.ok(packet.includes("current_location_packet"));
  assert.ok(packet.includes("main_threat_packet"));
  assert.ok(packet.includes("weapon_packet"));
  assert.ok(packet.includes("forge_packet"));
  assert.ok(packet.includes("floor_progression_packet"));
  assert.ok(packet.includes("tactical_context_packet"));
  assert.ok(packet.includes("service_nodes_packet"));
  assert.ok(packet.includes("anchor_revive_packet"));
  assert.ok(packet.includes("b1-safe-zone"));
});

test("buildRuntimeContextPackets respects maxChars budget", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第2日 9时]。用户位置[B1_Storage]。任务追踪：" +
      new Array(50).fill("超长任务[character|active|委托N-018|层级7F|领取npc_grant]").join("，") +
      "。世界标记：" +
      new Array(40).fill("conspiracy_flag_x").join("，") +
      "。锚点解锁：B1[1]，1F[1]，7F[1]。",
    latestUserInput: "测试预算截断",
    playerLocation: "B1_Storage",
    runtimeLoreCompact: new Array(80).fill("- [rule] very long lore line").join("\n"),
    maxChars: 1200,
  });
  assert.ok(packet.length <= 1200);
  assert.ok(packet.includes("运行时结构化上下文包"));
  assert.ok(packet.includes("main_threat_packet"));
  assert.ok(packet.includes("forge_packet"));
});

