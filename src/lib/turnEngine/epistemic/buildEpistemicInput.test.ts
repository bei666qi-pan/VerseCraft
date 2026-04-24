import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEpistemicInput,
  buildDmOnlyEpistemicInput,
  buildPlayerEpistemicInput,
} from "@/lib/turnEngine/epistemic/buildEpistemicInput";
import {
  SESSION_MEMORY_EPISTEMIC_EMBED_KEY,
  type SessionMemoryRow,
} from "@/lib/memoryCompress";
import type { LoreFact } from "@/lib/worldKnowledge/types";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";

const NOW = "2026-04-23T12:00:00.000Z";

function makeSessionMemory(embed: Record<string, unknown>): SessionMemoryRow {
  return {
    plot_summary: "compiled plot",
    player_status: { [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: embed },
    npc_relationships: {},
  };
}

function loreFact(partial: Partial<LoreFact> & { factKey: string; canonicalText: string }): LoreFact {
  return {
    identity: { factKey: partial.factKey },
    layer: partial.layer ?? "shared_public_lore",
    factType: partial.factType ?? "event",
    canonicalText: partial.canonicalText,
    source: partial.source ?? { kind: "registry" },
    tags: partial.tags ?? [],
  };
}

test("buildEpistemicInput merges lore + session + runtime facts with dedup", () => {
  const lorePacket = {
    retrievedFacts: [
      loreFact({
        factKey: "duplicate",
        canonicalText: "同一条事实通过多路召回",
        layer: "shared_public_lore",
      }),
    ],
    sceneFacts: [
      loreFact({
        factKey: "duplicate",
        canonicalText: "同一条事实通过多路召回",
        layer: "session_ephemeral_facts",
      }),
    ],
    privateFacts: [
      loreFact({
        factKey: "npc_shell",
        canonicalText: "欣蓝的秘密",
        layer: "core_canon",
        factType: "npc",
        source: { kind: "db", entityId: XINLAN_NPC_ID },
      }),
    ],
    coreAnchors: [],
    relevantEntities: [],
  };

  const session = makeSessionMemory({
    public_plot_summary: "大家都看见电梯坏了",
    dm_only_truth_summary: "电梯故障其实是校源产生的",
    player_known_summary: "玩家偷偷录下了维修工的对话",
    scene_public_state: "走廊灯光闪烁",
  });

  const result = buildEpistemicInput({
    lorePacket,
    sessionMemory: session,
    presentNpcIds: ["N-008"],
    focusNpcId: "N-008",
    actorId: "N-008",
    maxRevealRank: 0,
    nowIso: NOW,
  });

  assert.ok(result.scenePublicFacts.length >= 1, "public layer must land in scenePublic");
  assert.ok(result.dmOnlyFacts.length >= 1, "dm_only_truth must land in dmOnly");
  assert.equal(
    result.playerOnlyFacts.length,
    0,
    "NPC actor must never receive player_known summary"
  );
  assert.ok(result.telemetry.totalInputFacts > 0);
  assert.equal(
    result.telemetry.actorId,
    "N-008",
    "telemetry must report the NPC actor id"
  );
});

test("buildPlayerEpistemicInput returns player_known layer to the player actor", () => {
  const session = makeSessionMemory({
    player_known_summary: "玩家口袋里有一张旧车票",
    dm_only_truth_summary: "车票来自上一轮循环",
  });

  const result = buildPlayerEpistemicInput({
    lorePacket: null,
    sessionMemory: session,
    presentNpcIds: [],
    focusNpcId: null,
    maxRevealRank: 0,
    nowIso: NOW,
  });

  assert.equal(result.playerOnlyFacts.length, 1, "player actor sees own known summary");
  assert.equal(result.dmOnlyFacts.length, 1, "world truth still gated to DM");
  assert.equal(result.telemetry.actorId, "player");
});

test("buildDmOnlyEpistemicInput gives DM view with all world truths", () => {
  const session = makeSessionMemory({
    dm_only_truth_summary: "校源真相的完整脉络",
    public_plot_summary: "表面看见的是一起停电事故",
  });

  const result = buildDmOnlyEpistemicInput({
    lorePacket: null,
    sessionMemory: session,
    presentNpcIds: ["N-008"],
    focusNpcId: "N-008",
    maxRevealRank: 0,
    nowIso: NOW,
  });

  assert.ok(result.dmOnlyFacts.length >= 1, "DM view retains world truth");
  assert.equal(result.telemetry.actorId, null);
});

test("buildEpistemicInput tolerates empty inputs", () => {
  const result = buildEpistemicInput({
    lorePacket: null,
    sessionMemory: null,
    presentNpcIds: [],
    focusNpcId: null,
    actorId: null,
    maxRevealRank: 0,
    nowIso: NOW,
  });

  assert.equal(result.dmOnlyFacts.length, 0);
  assert.equal(result.scenePublicFacts.length, 0);
  assert.equal(result.playerOnlyFacts.length, 0);
  assert.equal(result.actorScopedFacts.length, 0);
  assert.equal(result.residueFacts.length, 0);
  assert.equal(result.telemetry.totalInputFacts, 0);
});

test("buildEpistemicInput respects reveal-tier gating from session memory", () => {
  const session = makeSessionMemory({
    public_plot_summary: "",
    reveal_tier_sensitive_facts: [{ id: "session:public_plot", minRevealRank: 3 }],
    // public_plot_summary must be non-empty to produce a fact; we test gating
  });
  // Include a public_plot_summary so a fact with id `session:public_plot` is
  // produced, then gated.
  (session.player_status[SESSION_MEMORY_EPISTEMIC_EMBED_KEY] as Record<string, unknown>)
    .public_plot_summary = "公共剧情摘要";

  const lowTier = buildEpistemicInput({
    lorePacket: null,
    sessionMemory: session,
    presentNpcIds: ["N-008"],
    focusNpcId: "N-008",
    actorId: "N-008",
    maxRevealRank: 1,
    nowIso: NOW,
  });
  assert.equal(lowTier.telemetry.revealGatedCount, 1);
  assert.equal(lowTier.scenePublicFacts.length, 0, "gated public plot must NOT land in scene bucket");

  const highTier = buildEpistemicInput({
    lorePacket: null,
    sessionMemory: session,
    presentNpcIds: ["N-008"],
    focusNpcId: "N-008",
    actorId: "N-008",
    maxRevealRank: 5,
    nowIso: NOW,
  });
  assert.equal(highTier.telemetry.revealGatedCount, 0);
  assert.equal(highTier.scenePublicFacts.length, 1);
});
