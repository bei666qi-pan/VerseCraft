import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";

function parseRuntimePackets(packet: string): Record<string, unknown> {
  return JSON.parse(packet.split("\n")[2]!) as Record<string, unknown>;
}

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

test("buildRuntimeContextPackets includes stage-1 packets", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第1日 2时]。用户位置[B1_Storage]。任务追踪：清点补给[main|active|委托守门骑士|层级B1|领取auto]。【rt_task_layers】starter_main=formal_task。" +
      "世界标记：conspiracy_seeded，merchant_seen。锚点解锁：B1[1]，1F[1]，7F[0]。" +
      "主威胁状态：1[A-001|active|20]，2[A-004|idle|0]。" +
      "主手武器[WPN-001|稳定80|反制sound/silence|模组silent|灌注mirror:2|污染15|可修复1]。" +
      "职业状态：当前[守灯人]，已认证[守灯人]，可认证[巡迹客/觅兆者]，被动[perk.lampkeeper.threat_telegraph]。" +
      "职业收益：当前[守灯人]，被动摘要[高压主威胁场景下，精神损耗结算-1（最低为0）。]，主动摘要[稳心定灯：下回合若遭受精神损耗，额外-1并保留压制判断窗口提示。]，主动可用[1]。" +
      "职业进度：守灯人[属性1|行为2/2|试炼1|认证1]，巡迹客[属性0|行为1/2|试炼0|认证0]。" +
      "最近复活：死亡地点[3F_Stairwell]，死因[失血]，掉落数量[2]，最近锚点[anchor_b1_safe]。" +
      "NPC当前位置：N-008@B1_Storage，N-014@B1_Laundry，N-015@B1_SafeZone，N-020@B1_Storage。" +
      "图鉴已解锁：守灯人认证纪要[anomaly|好感0]，电工老刘[npc|好感28]。",
    latestUserInput: "我要去找守门骑士补给并问锚点",
    playerLocation: "B1_Storage",
    runtimeLoreCompact: "【RAG-Lore精简片段】\n- [rule] b1-safe-zone",
    /** 完整 packet 体积常超 6k；此处用充足预算断言非截断路径下的键齐全 */
    maxChars: 40000,
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
  assert.ok(packet.includes("survival_loop_packet"));
  assert.ok(packet.includes("relationship_loop_packet"));
  assert.ok(packet.includes("investigation_loop_packet"));
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
  assert.ok(packet.includes("major_npc_foreshadow_packet"));
  assert.ok(packet.includes("actor_personality_packet"));
  assert.ok(packet.includes("narrative_task_mode_packet"));
  assert.ok(packet.includes("action_time_cost_packet"));
  assert.ok(packet.includes("new_player_guide_packet"));
  assert.ok(packet.includes("电工老刘"));
  assert.ok(packet.includes("麟泽"));
  assert.ok(packet.includes("world_feel_packet"));
  assert.ok(packet.includes("space_authority_echo_v1"));
  assert.ok(packet.includes("month_start_student_pressure_v1"));
  assert.ok(packet.includes("\"living_surface\""));
  assert.ok(packet.includes("living_lines"));
  assert.ok(packet.includes("scene_actor_gate_packet"));
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
  // 截断路径仍应保留“三主循环”最小咬合键
  assert.ok(packet.includes("survival_loop_packet"));
  assert.ok(packet.includes("relationship_loop_packet"));
  assert.ok(packet.includes("investigation_loop_packet"));
});

test("new_player_guide_packet turns off outside early window", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第3日 10时]。用户位置[1F_Lobby]。任务追踪：测试任务[main|active|委托N-010|层级1F|领取npc_grant]。" +
      "世界标记：conspiracy_seeded。锚点解锁：B1[1]，1F[1]，7F[0]。" +
      "NPC当前位置：N-010@1F_Lobby，N-008@B1_Storage。",
    latestUserInput: "测试新手包关闭",
    playerLocation: "1F_Lobby",
    contextMode: "minimal",
    maxChars: 20000,
  });
  assert.ok(packet.includes("new_player_guide_packet"));
  // enabled=false 时仍可存在包，但不应强导向
  assert.ok(packet.includes("\"enabled\":false") || packet.includes("\"phase\":\"off\""));
});

test("scene_actor_gate_packet stays compact and prevents multi-present focus fallback", () => {
  const packet = buildRuntimeContextPackets({
    playerContext:
      "游戏时间[第1日 11时]。用户位置[1F_Lobby]。任务追踪：大厅试探[soft|active|委托N-001|层级1F|领取npc_grant]。" +
      "世界标记：conspiracy_seeded。锚点解锁：B1[1]，1F[1]，7F[0]。" +
      "主威胁状态：1[A-001|active|20]。" +
      "NPC当前位置：N-001@1F_Lobby，N-002@1F_Lobby，N-003@1F_Lobby，N-004@1F_Lobby，N-005@1F_Lobby，N-006@1F_Lobby，N-010@7F_Bench，N-018@4F_CorridorEnd。" +
      "图鉴已解锁：电工老刘[npc|好感28|N-010]，旧记录[npc|好感10|N-018]。" +
      "场景外貌已描写：N-001/N-002。" +
      "【rt_task_layers】hall_probe=soft_lead。",
    latestUserInput: "我看向大厅人群，又想起 N-010 留下的那句提醒。",
    playerLocation: "1F_Lobby",
    maxChars: 40000,
  });

  const packets = parseRuntimePackets(packet);
  const gate = packets.scene_actor_gate_packet as {
    f: string | null;
    p: string[];
    s: string[];
    m: Record<string, string>;
    amb: number;
  };
  const personaText = packets.multi_npc_persona_packet as string;

  assert.ok(JSON.stringify(gate).length <= 1000);
  assert.equal(gate.f, null);
  assert.equal(gate.amb, 1);
  assert.deepEqual(gate.p, ["N-001", "N-002", "N-003", "N-004", "N-005", "N-006"]);
  assert.deepEqual(gate.s, ["N-001", "N-002", "N-003", "N-004", "N-005", "N-006"]);
  assert.equal(gate.m["N-010"], "h");
  assert.ok(!(packets.npc_player_baseline_packet as { npcId: string | null }).npcId);
  assert.equal((packets.actor_personality_packet as { npcId: string | null }).npcId, null);
  assert.ok(personaText.length <= 1400);
  assert.ok(personaText.includes('"id":"N-001"'));
  assert.ok(!personaText.includes('"id":"N-010"'));
  assert.ok(!personaText.includes('"id":"N-018"'));
});

/*
test("SceneActorGate rollout off falls back without gate packet", () => {
  withEnv("VERSECRAFT_ENABLE_SCENE_ACTOR_GATE_V1", "0", () => {
    const packet = buildRuntimeContextPackets({
      playerContext:
        "娓告垙鏃堕棿[绗?鏃?11鏃禲銆傜敤鎴蜂綅缃甗B1_SafeZone]銆? +
        "NPC褰撳墠浣嶇疆锛歂-015@B1_SafeZone锛孨-020@B1_SafeZone銆? +
        "鍥鹃壌宸茶В閿侊細欣蓝[npc|濂芥劅10|N-015]銆?,
      latestUserInput: "她怎么看我？",
      playerLocation: "B1_SafeZone",
      maxChars: 40000,
    });
    const packets = parseRuntimePackets(packet);

    assert.equal("scene_actor_gate_packet" in packets, false);
    assert.deepEqual(packets.nearby_npc_packet, ["N-015", "N-020"]);
    assert.equal((packets.npc_player_baseline_packet as { npcId: string | null }).npcId, "N-015");
  });
});
*/

test("SceneActorGate rollout off falls back without gate packet", () => {
  withEnv("VERSECRAFT_ENABLE_SCENE_ACTOR_GATE_V1", "0", () => {
    const packet = buildRuntimeContextPackets({
      playerContext: "N-015@B1_SafeZone N-020@B1_SafeZone",
      latestUserInput: "who is here?",
      playerLocation: "B1_SafeZone",
      maxChars: 40000,
    });
    const packets = parseRuntimePackets(packet);

    assert.equal("scene_actor_gate_packet" in packets, false);
    assert.ok(Array.isArray(packets.nearby_npc_packet));
    assert.equal((packets.current_location_packet as { location: string | null }).location, "B1_SafeZone");
  });
});

