import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import { buildNpcConsistencyBoundaryCompactBlock } from "./npcConsistencyBoundaryPackets";

const ctx = [
  "用户位置[1F_Lobby]。",
  "游戏时间[第1日 10时]。",
  "NPC当前位置：N-001@1F_Lobby，N-010@1F_Lobby。",
  "图鉴已解锁：无。",
  "场景外貌已描写：无。",
  "主威胁状态：无。",
].join("\n");

function parsePackets(text: string): Record<string, unknown> {
  return JSON.parse(text.split("\n")[1]!) as Record<string, unknown>;
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

describe("buildNpcConsistencyBoundaryCompactBlock", () => {
  it("JSON 含 compact boundary packet 键", () => {
    const { text, charCount } = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "",
      playerLocation: "1F_Lobby",
      focusNpcId: "N-001",
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 2, publicFactCount: 3, forbiddenFactCount: 5 },
    });
    assert.ok(text.includes("## 【npc_consistency_boundary_compact】"));
    const o = parsePackets(text);
    assert.ok(o.actor_canon_packet);
    assert.ok(o.npc_player_baseline_packet);
    assert.ok(o.scene_actor_gate_packet);
    assert.ok(o.npc_scene_authority_packet);
    assert.ok(o.multi_npc_persona_packet);
    assert.ok(o.actor_epistemic_packet);
    assert.ok(o.actor_memory_privilege_packet);
    assert.ok(o.actor_reveal_limit_packet);
    assert.equal((o.actor_epistemic_packet as { ban: number }).ban, 5);
    assert.ok(charCount > 0 && charCount <= 2200);
  });

  it("欣蓝与普通 NPC 的 actor_canon / privilege / reveal 摘要不同", () => {
    const a = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "",
      playerLocation: "1F_Lobby",
      focusNpcId: "N-001",
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
    });
    const x = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "",
      playerLocation: "1F_Lobby",
      focusNpcId: XINLAN_NPC_ID,
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
    });
    const pa = parsePackets(a.text);
    const px = parsePackets(x.text);
    assert.notDeepEqual(pa.actor_canon_packet, px.actor_canon_packet);
    assert.notDeepEqual(pa.actor_memory_privilege_packet, px.actor_memory_privilege_packet);
    assert.equal((px.actor_reveal_limit_packet as { xinlan_tiered: number }).xinlan_tiered, 1);
    assert.equal((pa.actor_reveal_limit_packet as { xinlan_tiered: number }).xinlan_tiered, 0);
  });

  it("maxChars 可截断且仍短", () => {
    const { text, charCount } = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "",
      playerLocation: "1F_Lobby",
      focusNpcId: "N-001",
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
      maxChars: 120,
    });
    assert.ok(charCount <= 120);
    assert.ok(text.endsWith("…"));
  });

  it("灰度：可单独关闭 canon / scene 子包为占位", () => {
    const { text } = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "",
      playerLocation: "1F_Lobby",
      focusNpcId: "N-001",
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
      rollout: { enableNpcCanonGuard: false, enableNpcSceneAuthority: false },
    });
    const o = parsePackets(text);
    assert.equal((o.actor_canon_packet as { canon_guard?: string }).canon_guard, "rollout_off");
    assert.equal((o.npc_scene_authority_packet as { rollout_off?: boolean }).rollout_off, true);
  });

  it("多人同场无明确目标时 focus=null 且 baseline 不绑定 nearbyNpcIds[0]", () => {
    const { text } = buildNpcConsistencyBoundaryCompactBlock({
      playerContext: ctx,
      latestUserInput: "我先观察大厅里的动静。",
      playerLocation: "1F_Lobby",
      focusNpcId: null,
      maxRevealRank: 0,
      epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
    });

    const o = parsePackets(text);
    const gate = o.scene_actor_gate_packet as {
      f: string | null;
      loc: string | null;
      p: string[];
      s: string[];
      m: Record<string, string>;
      amb: number;
      rule: string;
    };
    assert.equal(gate.f, null);
    assert.equal(gate.loc, "1F_Lobby");
    assert.deepEqual(gate.p, ["N-001", "N-010"]);
    assert.deepEqual(gate.s, ["N-001", "N-010"]);
    assert.equal(gate.m["N-001"], "p");
    assert.equal(gate.m["N-010"], "p");
    assert.equal(Object.keys(gate.m).length <= 10, true);
    assert.equal(gate.amb, 1);
    assert.equal(typeof gate.rule, "string");
    assert.equal((o.npc_player_baseline_packet as { npcId: string | null }).npcId, null);
    assert.equal((o.actor_canon_packet as { id: string | null }).id, null);
    assert.equal((o.actor_epistemic_packet as { focus: string | null }).focus, null);
  });

  it("SceneActorGate rollout off omits gate packet and keeps boundary build stable", () => {
    withEnv("VERSECRAFT_ENABLE_SCENE_ACTOR_GATE_V1", "0", () => {
      const { text } = buildNpcConsistencyBoundaryCompactBlock({
        playerContext: ctx,
        latestUserInput: "",
        playerLocation: "1F_Lobby",
        focusNpcId: null,
        maxRevealRank: 0,
        epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
      });
      const o = parsePackets(text);
      assert.equal("scene_actor_gate_packet" in o, false);
      assert.ok(o.npc_player_baseline_packet);
    });
  });
});
