/**
 * 高魅力 questHooks / relink 针 / 支线种子 对齐；NPC 表 lore 与 profile 双层一致。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NPCS } from "@/lib/registry/npcs";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { MAJOR_NPC_BRANCH_SEEDS } from "@/lib/registry/majorNpcBranchSeeds";
import {
  assertAllMajorNpcQuestHooksPresent,
  questHooksForMajorNpc,
  relinkTriggerNeedlesForMajorNpc,
} from "@/lib/registry/majorNpcQuestHooks";
import { buildRegistryWorldKnowledgeDraft } from "@/lib/worldKnowledge/bootstrap/registryAdapters";
import { clipPacketLine } from "@/lib/registry/runtimePacketStrings";

test("六人均有非空 questHooks", () => {
  assert.doesNotThrow(() => assertAllMajorNpcQuestHooksPresent());
});

test("支线种子的 relatedQuestHook 必落在对应 profile.questHooks 内", () => {
  for (const s of MAJOR_NPC_BRANCH_SEEDS) {
    const hooks = questHooksForMajorNpc(s.npcId);
    assert.ok(hooks.includes(s.relatedQuestHook), `${s.npcId} hook ${s.relatedQuestHook}`);
  }
});

test("questHook 应能被 relinkTriggerTasks 中某针匹配或互为子串（弱约束防完全脱节）", () => {
  for (const id of MAJOR_NPC_IDS) {
    const hooks = questHooksForMajorNpc(id);
    const needles = relinkTriggerNeedlesForMajorNpc(id);
    assert.ok(needles.length > 0, id);
    for (const h of hooks) {
      const hl = h.toLowerCase();
      const ok = needles.some((n) => {
        const nl = n.toLowerCase();
        return hl.includes(nl) || nl.includes(hl);
      });
      assert.ok(ok, `${id} hook ${h} should overlap relink needles`);
    }
  }
});

test("bootstrap：major_npc_branch 实体带 reveal_fracture 及以上，不宜当 surface 默认检索", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const branch = draft.entities.filter((e) => e.tags.includes("major_npc_branch"));
  assert.ok(branch.length >= 6);
  for (const e of branch) {
    assert.ok(
      e.tags.some((t) => t === "reveal_fracture" || t === "reveal_deep" || t === "reveal_abyss"),
      e.code
    );
    assert.ok(e.tags.some((t) => t.startsWith("hook:")), e.code);
  }
});

test("高魅力：CORE_NPC_PROFILES_V2 双层必须成立；NPCS 仅在不遭 ContentSpec 覆写时验收双层", () => {
  for (const id of MAJOR_NPC_IDS) {
    const p = CORE_NPC_PROFILES_V2.find((x) => x.id === id);
    assert.ok(p, id);
    const ss = p!.interaction.surfaceSecrets.join("；");
    assert.ok(ss.includes("公寓职能面") && ss.includes("校源面"), `${id} profile surfaceSecrets`);
    const row = NPCS.find((n) => n.id === id);
    assert.ok(row, id);
    if (row!.lore.includes("公寓职能面")) {
      assert.ok(row!.lore.includes("校源面"), `${id} NPCS.lore dual layer`);
    }
  }
});

test("clipPacketLine：长度恰等于 max 时不截断", () => {
  const s = "x".repeat(10);
  assert.strictEqual(clipPacketLine(s, 10), s);
  assert.ok(clipPacketLine(s + "y", 10).endsWith("…"));
});
