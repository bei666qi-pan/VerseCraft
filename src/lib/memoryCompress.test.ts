import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceRowToMemoryForDm,
  hydrateEpistemicFromSessionRow,
  parseCompressionResponseToEpistemic,
  safeFallbackEpistemicMemory,
  sanitizeEpistemicCompressedMemory,
  SESSION_MEMORY_EPISTEMIC_EMBED_KEY,
  sessionMemoryToDbRow,
  toLegacyCompressedMemory,
  type EpistemicCompressedMemory,
  type SessionMemoryRow,
} from "./memoryCompress";
import { buildEpistemicMemorySnapshot } from "./epistemic/sessionAdapters";
import { XINLAN_NPC_ID } from "./epistemic/policy";

describe("memoryCompress epistemic layering", () => {
  it("does not put world:/system: fact ids into arbitrary NPC snapshots after sanitize", () => {
    const ep: EpistemicCompressedMemory = {
      plot_summary: "p",
      player_status: {},
      npc_relationships: {},
      npc_epistemic_snapshots: [
        {
          npcId: "N-099",
          knownFactIds: ["world:secret", "system:truth", "dm:plot", "canon:x", "fact_ok"],
          playerPerceptionLevel: "familiar",
          emotionalResidueNotes: "",
        },
      ],
    };
    const s = sanitizeEpistemicCompressedMemory(ep);
    assert.deepEqual(s.npc_epistemic_snapshots?.[0].knownFactIds, ["fact_ok"]);
  });

  it("does not give non-Xinlan NPC player_secret or recognized_loop via sanitize", () => {
    const ep: EpistemicCompressedMemory = {
      plot_summary: "p",
      player_status: {},
      npc_relationships: {},
      npc_epistemic_snapshots: [
        {
          npcId: "N-001",
          knownFactIds: ["player_secret_x"],
          playerPerceptionLevel: "recognized_loop",
          emotionalResidueNotes: "",
        },
        {
          npcId: XINLAN_NPC_ID,
          knownFactIds: ["player_secret_allowed_for_tests"],
          playerPerceptionLevel: "recognized_loop",
          emotionalResidueNotes: "牵引",
        },
      ],
    };
    const s = sanitizeEpistemicCompressedMemory(ep);
    const other = s.npc_epistemic_snapshots?.find((x) => x.npcId === "N-001");
    const xinlan = s.npc_epistemic_snapshots?.find((x) => x.npcId === XINLAN_NPC_ID);
    assert.ok(other);
    assert.deepEqual(other.knownFactIds, []);
    assert.equal(other.playerPerceptionLevel, "named");
    assert.ok(xinlan);
    assert.ok(xinlan!.knownFactIds.includes("player_secret_allowed_for_tests"));
  });

  it("keeps public/scene layer separate in snapshot builder", () => {
    const ep: EpistemicCompressedMemory = {
      plot_summary: "dm plot",
      player_status: {},
      npc_relationships: {},
      public_plot_summary: "众人只见门开着",
      scene_public_state: "灯灭，走廊有脚步声",
      dm_only_truth_summary: "真凶在 B2",
    };
    const snap = buildEpistemicMemorySnapshot(ep);
    assert.equal(snap.publicLayer.plotSummary, "众人只见门开着");
    assert.equal(snap.publicLayer.sceneState, "灯灭，走廊有脚步声");
    assert.equal(snap.dmOnlyTruth, "真凶在 B2");
  });

  it("toLegacyCompressedMemory strips embed key and preserves three-field contract", () => {
    const embed = {
      public_plot_summary: "pub",
      scene_public_state: "scene",
    };
    const ep: EpistemicCompressedMemory = {
      plot_summary: "full",
      player_status: { hp: 1, [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: embed },
      npc_relationships: { "N-001": 1 },
    };
    const leg = toLegacyCompressedMemory(ep);
    assert.equal(leg.plot_summary, "full");
    assert.deepEqual(leg.player_status, { hp: 1 });
    assert.deepEqual(leg.npc_relationships, { "N-001": 1 });
  });

  it("sessionMemoryToDbRow stores layered fields only inside embed, legacy plot from strip", () => {
    const ep: EpistemicCompressedMemory = {
      plot_summary: "dm",
      player_status: { sanity: 80 },
      npc_relationships: {},
      dm_only_truth_summary: "truth",
      npc_epistemic_snapshots: [{ npcId: "N-002", knownFactIds: ["a"], playerPerceptionLevel: "stranger", emotionalResidueNotes: "" }],
    };
    const row = sessionMemoryToDbRow(ep);
    assert.equal(row.plotSummary, "dm");
    const ps = row.playerStatus as Record<string, unknown>;
    assert.equal(ps.sanity, 80);
    const emb = ps[SESSION_MEMORY_EPISTEMIC_EMBED_KEY] as Record<string, unknown>;
    assert.equal(emb.dm_only_truth_summary, "truth");
    assert.ok(Array.isArray(emb.npc_epistemic_snapshots));
  });

  it("safeFallbackEpistemicMemory does not expand NPC known ids on compress failure path", () => {
    const prev: EpistemicCompressedMemory = {
      plot_summary: "old",
      player_status: {},
      npc_relationships: {},
      npc_epistemic_snapshots: [
        { npcId: "N-003", knownFactIds: ["world:x", "heard_rumor"], playerPerceptionLevel: "stranger", emotionalResidueNotes: "" },
      ],
    };
    const fb = safeFallbackEpistemicMemory(prev);
    assert.ok(fb);
    assert.deepEqual(fb!.npc_epistemic_snapshots?.[0].knownFactIds, ["heard_rumor"]);
  });

  it("parseCompressionResponse invalid JSON yields null (caller uses fallback, no new NPC facts)", () => {
    assert.equal(parseCompressionResponseToEpistemic("not json {{{"), null);
  });

  it("parseCompressionResponseToEpistemic 解析 actor_scoped / npc_private_index / reveal_refs", () => {
    const json = JSON.stringify({
      plot_summary: "dm",
      player_status: {},
      npc_relationships: {},
      actor_scoped_memory_snapshots: [{ npcId: "N-001", scopedNarrativeHint: "hint" }],
      npc_private_memory_index: { "N-001": ["k1"] },
      reveal_tier_sensitive_facts: [{ id: "fact_a", minRevealRank: 2 }],
    });
    const ep = parseCompressionResponseToEpistemic(json);
    assert.ok(ep);
    assert.equal(ep!.actor_scoped_memory_snapshots?.[0].npcId, "N-001");
    assert.equal(ep!.npc_private_memory_index?.["N-001"]?.[0], "k1");
    assert.equal(ep!.reveal_tier_sensitive_facts?.[0].id, "fact_a");
  });

  it("sessionMemoryToDbRow embed 含 actor_scoped 等并可 hydrate", () => {
    const ep: EpistemicCompressedMemory = {
      plot_summary: "x",
      player_status: {},
      npc_relationships: {},
      actor_scoped_memory_snapshots: [{ npcId: "N-001", scopedNarrativeHint: "h" }],
    };
    const row = sessionMemoryToDbRow(ep);
    const ps = row.playerStatus as Record<string, unknown>;
    const emb = ps[SESSION_MEMORY_EPISTEMIC_EMBED_KEY] as Record<string, unknown>;
    assert.ok(Array.isArray(emb.actor_scoped_memory_snapshots));
    const back = hydrateEpistemicFromSessionRow({
      plotSummary: row.plotSummary,
      playerStatus: row.playerStatus,
      npcRelationships: row.npcRelationships,
    });
    assert.ok(back?.actor_scoped_memory_snapshots?.length);
  });

  it("coerceRowToMemoryForDm lifts scene_public_state from embed and strips __vc key from player_status", () => {
    const row: SessionMemoryRow = {
      plot_summary: "",
      player_status: {
        sanity: 50,
        [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: { scene_public_state: "大门敞开，灯未亮" },
      },
      npc_relationships: {},
    };
    const dm = coerceRowToMemoryForDm(row);
    assert.ok(dm);
    assert.equal(dm!.scene_public_state, "大门敞开，灯未亮");
    assert.deepEqual(dm!.player_status, { sanity: 50 });
    assert.ok(!(SESSION_MEMORY_EPISTEMIC_EMBED_KEY in dm!.player_status));
  });
});
