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
      "职业状态：当前[守灯人]，已认证[守灯人]，可认证[巡迹客/觅兆者]，被动[perk.lampkeeper.threat_telegraph]。" +
      "职业收益：当前[守灯人]，被动摘要[高压主威胁场景下，精神损耗结算-1（最低为0）。]，主动摘要[稳心定灯：下回合若遭受精神损耗，额外-1并保留压制判断窗口提示。]，主动可用[1]。" +
      "职业进度：守灯人[属性1|行为2/2|试炼1|认证1]，巡迹客[属性0|行为1/2|试炼0|认证0]。" +
      "最近复活：死亡地点[3F_Stairwell]，死因[失血]，掉落数量[2]，最近锚点[anchor_b1_safe]。" +
      "NPC当前位置：N-008@B1_Storage，N-014@B1_Laundry。" +
      "图鉴已解锁：守灯人认证纪要[anomaly|好感0]，电工老刘[npc|好感28]。",
    latestUserInput: "我要去找守门骑士补给并问锚点",
    playerLocation: "B1_Storage",
    runtimeLoreCompact: "【RAG-Lore精简片段】\n- [rule] b1-safe-zone",
    /** 完整 packet 体积常超 6k；此处用充足预算断言非截断路径下的键齐全 */
    maxChars: 14000,
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
  assert.ok(packet.includes("profession_packet"));
  assert.ok(packet.includes("profession_progress_packet"));
  assert.ok(packet.includes("profession_system_hints_packet"));
  assert.ok(packet.includes("behaviorEvidenceCount"));
  assert.ok(packet.includes("behaviorEvidenceTarget"));
  assert.ok(packet.includes("profession_identity_packet"));
  assert.ok(packet.includes("profession.certified.守灯人"));
  assert.ok(packet.includes("sourceConfidence"));
  assert.ok(packet.includes("\"level\":"));
  assert.ok(packet.includes("professionTacticalBias"));
  assert.ok(packet.includes("b1-safe-zone"));
  assert.ok(packet.includes("reveal_tier_packet"));
  assert.ok(packet.includes("floor_lore_packet"));
  assert.ok(packet.includes("threat_lore_packet"));
  assert.ok(packet.includes("maxRevealRank"));
  assert.ok(packet.includes("school_cycle_arc_packet"));
  assert.ok(packet.includes("major_npc_relink_packet"));
  assert.ok(packet.includes("major_npc_arc_packet"));
  assert.ok(packet.includes("cycle_loop_packet"));
  assert.ok(packet.includes("cycle_time_packet"));
  assert.ok(packet.includes("school_cycle_experience_packet"));
  assert.ok(packet.includes("school_source_packet"));
  assert.ok(packet.includes("team_relink_packet"));
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

