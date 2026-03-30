import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "./revealTierRank";
import { MAJOR_NPC_IDS } from "./majorNpcDeepCanon";
import {
  MAJOR_NPC_SCHOOL_REVEAL_LADDERS,
  majorNpcBootstrapLoreFromProfile,
  selectMajorNpcForeshadowRows,
} from "./majorNpcRevealLadder";

const BANNED_EARLY = ["耶里", "学生会", "广播社", "戏剧社", "美术社", "档案干事", "外联", "风纪"];

test("surface / fracture / profile 异常行不得含早泄校籍专名", () => {
  for (const id of MAJOR_NPC_IDS) {
    const L = MAJOR_NPC_SCHOOL_REVEAL_LADDERS[id];
    const blob = [
      L.profileSurfaceAnomalyLine,
      ...L.surface_behavior_hints,
      ...L.fracture_signals,
    ].join("\n");
    for (const w of BANNED_EARLY) {
      assert.ok(!blob.includes(w), `${id} early layer leaked: ${w}`);
    }
  }
});

test("bootstrap lore 拼接不含耶里", () => {
  for (const id of MAJOR_NPC_IDS) {
    const line = majorNpcBootstrapLoreFromProfile("公寓职能面：测试。", id);
    assert.ok(!line.includes("耶里"), id);
    assert.ok(line.includes("公寓职能面"), id);
  }
});

test("surface 档 foreshadow 无 deep 行、无校源确认", () => {
  const rows = selectMajorNpcForeshadowRows({
    npcId: "N-020",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    day: 1,
    ctx: {
      activeTaskTitles: [],
      worldFlags: [],
      locationNode: "B1_Storage",
      hotThreatPresent: false,
    },
  });
  assert.ok(rows.every((r) => r.layer !== "deep"));
  assert.ok(rows.every((r) => !r.hint.includes("校源确认")));
});

test("deep 档才出现校源确认摘要", () => {
  const rows = selectMajorNpcForeshadowRows({
    npcId: "N-015",
    maxRevealRank: REVEAL_TIER_RANK.deep,
    day: 2,
    ctx: { activeTaskTitles: [], worldFlags: [], locationNode: "B1_SafeZone", hotThreatPresent: false },
  });
  assert.ok(rows.some((r) => r.layer === "deep" && r.hint.includes("校源确认")));
});

test("欣蓝 caps 更保守：同档 surface 行数不超过他人", () => {
  const x0 = selectMajorNpcForeshadowRows({
    npcId: "N-010",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    day: 1,
    ctx: { activeTaskTitles: [], worldFlags: [], locationNode: "1F_PropertyOffice", hotThreatPresent: false },
  }).filter((r) => r.layer === "surface");
  const m0 = selectMajorNpcForeshadowRows({
    npcId: "N-018",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    day: 1,
    ctx: { activeTaskTitles: [], worldFlags: [], locationNode: "1F_GuardRoom", hotThreatPresent: false },
  }).filter((r) => r.layer === "surface");
  assert.ok(x0.length <= m0.length);
});

test("验证碎片：任务标题门槛满足才出现 verify 行", () => {
  const without = selectMajorNpcForeshadowRows({
    npcId: "N-020",
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    day: 1,
    ctx: { activeTaskTitles: ["随便走走"], worldFlags: [], locationNode: "B1_Storage", hotThreatPresent: false },
  });
  const withRibbon = selectMajorNpcForeshadowRows({
    npcId: "N-020",
    maxRevealRank: REVEAL_TIER_RANK.fracture,
    day: 1,
    ctx: {
      activeTaskTitles: ["ribbon补给任务"],
      worldFlags: [],
      locationNode: "B1_Storage",
      hotThreatPresent: false,
    },
  });
  const v0 = without.filter((r) => r.layer === "verify").length;
  const v1 = withRibbon.filter((r) => r.layer === "verify").length;
  assert.ok(v1 >= v0);
});
