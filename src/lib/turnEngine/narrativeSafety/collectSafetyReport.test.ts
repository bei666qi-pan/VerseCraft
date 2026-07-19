import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSafetyReport,
  extractEntitySurfacesConservatively,
  extractNpcIdsFromDmRecord,
  extractNpcIdsFromNarrative,
  extractNpcIdsFromOptions,
} from "@/lib/turnEngine/narrativeSafety";
import type { NpcSceneAuthorityPacket } from "@/lib/npcSceneAuthority/types";
import type { NarrativeValidationIssue } from "@/lib/turnEngine/validateNarrative";
import type { UnsupportedFactCandidate } from "@/lib/worldFacts/unsupportedFactDetector";
import type { PacingValidationReport } from "@/lib/turnEngine/pacing";

function scenePacket(overrides: Partial<NpcSceneAuthorityPacket> = {}): NpcSceneAuthorityPacket {
  return {
    currentSceneLocation: "B1",
    presentNpcIds: ["N-001"],
    offscreenNpcIds: ["N-002"],
    npcCurrentLocationMap: {
      "N-001": "B1",
      "N-002": "7F",
    },
    npcMentionModes: {
      "N-001": "present",
      "N-002": "heard_only",
    },
    npcCanonicalAppearanceMap: {},
    npcPublicRoleMap: {},
    npcDeepRoleLockedMap: {},
    firstAppearanceRequiredNpcIds: [],
    sceneAppearanceAlreadyWrittenIds: [],
    revealTierCapsByNpc: {},
    authorityRulesSummary: "test packet",
    ...overrides,
  };
}

test("collectSafetyReport maps validateNarrative high issue to repair", () => {
  const issue: NarrativeValidationIssue = {
    code: "dm_only_fact_leaked_in_narrative",
    severity: "high",
    detail: "dm-only fact surfaced",
  };

  const report = collectSafetyReport({
    validateNarrativeIssues: [issue],
  });

  assert.equal(report.ok, false);
  assert.equal(report.decision, "repair");
  assert.equal(report.maxSeverity, "high");
  assert.equal(report.telemetry.bySource.validateNarrative, 1);
});

test("collectSafetyReport flags unknown NPC id as high", () => {
  const report = collectSafetyReport({
    narrative: "N-999 stands beside the locked elevator.",
    npcSceneAuthorityPacket: scenePacket(),
    registeredNpcIds: ["N-001", "N-002"],
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unregistered_npc_id" && issue.severity === "high"));
  assert.ok(report.invariantsViolated.includes("unregistered_npc_id"));
});

test("collectSafetyReport flags offscreen NPC direct speech as high", () => {
  const report = collectSafetyReport({
    narrative: 'N-002: "I can speak from another floor."',
    npcSceneAuthorityPacket: scenePacket(),
    registeredNpcIds: ["N-001", "N-002"],
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "offscreen_npc_direct_speech" && issue.severity === "high"));
});

test("collectSafetyReport maps unsupported root cause claim to high block_commit", () => {
  const candidate: UnsupportedFactCandidate = {
    code: "unsupported_root_cause_claim",
    text: "root truth without gate",
    category: "apartment_root",
    severity: "high",
  };

  const report = collectSafetyReport({
    unsupportedFactIssues: [candidate],
  });

  assert.equal(report.ok, false);
  assert.equal(report.decision, "block_commit");
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_root_cause_claim" && issue.severity === "high"));
});

test("collectSafetyReport records low style issue without fallback", () => {
  const issue: NarrativeValidationIssue = {
    code: "style_drift",
    severity: "low",
    detail: "style only",
  };

  const report = collectSafetyReport({
    validateNarrativeIssues: [issue],
  });

  assert.equal(report.ok, true);
  assert.equal(report.decision, "pass");
  assert.equal(report.maxSeverity, "low");
  assert.ok(report.issues.some((item) => item.code === "style_drift"));
});

test("collectSafetyReport maps high pacing issue to repair", () => {
  const pacingReport: PacingValidationReport = {
    ok: false,
    maxSeverity: "high",
    issues: [
      {
        code: "consecutive_peak",
        severity: "high",
        detail: "previous_peak_to_candidate_peak",
      },
    ],
    telemetry: {
      totalIssues: 1,
      byCode: { consecutive_peak: 1 },
      bySeverity: { low: 0, medium: 0, high: 1 },
      lane: "RULE",
      previousBeatState: "peak",
      candidateBeatState: "peak",
      strongFactCount: 0,
      majorRevealCount: 0,
      allowedMajorRevealCount: 0,
    },
  };

  const report = collectSafetyReport({ pacingReport });

  assert.equal(report.decision, "repair");
  assert.ok(report.invariantsViolated.includes("pacing_budget_breach"));
  assert.equal(report.telemetry.bySource.pacing, 1);
});

test("collectSafetyReport passes on empty input", () => {
  const report = collectSafetyReport();

  assert.equal(report.ok, true);
  assert.equal(report.decision, "pass");
  assert.equal(report.maxSeverity, null);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.invariantsViolated, []);
});

test("entity whitelist flags fabricated Chinese NPC surface in narrative as high", () => {
  const report = collectSafetyReport({
    narrative: "艾薇娅推门进来，银色长发在门缝的冷光里一闪。",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unknown_entity_surface" && issue.severity === "high"));
});

test("entity whitelist flags an individually described unregistered generic person", () => {
  const report = collectSafetyReport({
    narrative:
      "走廊尽头传来木门吱呀一声，门缝里摇曳的光线中探出半个身子。那是一个男人，穿着褪色的格子衫，眼眶发红，头发乱蓬蓬的。",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unknown_entity_surface" && issue.anchor === "surface:npc:男人"));
});

test("entity whitelist flags the live-style workwear stranger with direct speech", () => {
  const report = collectSafetyReport({
    narrative: "一个穿旧工装的男人靠在墙边，叼着烟，开口说：‘拿根铁管跟走廊过不去？’",
    npcSceneAuthorityPacket: scenePacket({ presentNpcIds: [], npcMentionModes: {} }),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unknown_entity_surface" && issue.anchor === "surface:npc:男人"));
});

test("entity whitelist blocks an unregistered ponytail girl staged as an interactive scene actor", () => {
  const report = collectSafetyReport({
    narrative: "一个扎着马尾的女生猛地转身，练习册从她怀中滑落，纸张纷飞。她没有回头，飞快地冲下楼梯。",
    npcSceneAuthorityPacket: scenePacket({ presentNpcIds: [], npcMentionModes: {} }),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unknown_entity_surface" && issue.anchor === "surface:npc:女生"));
});

test("entity whitelist does not let player-induced described-person paraphrases become authorized", () => {
  const report = collectSafetyReport({
    narrative: "门缝里的格子衫男人像被目光烫了一下，往后退了半步，眼眶的红肿在昏黄廊灯下更显扎眼。",
    intent: {
      rawText: "我盯着门缝里那个穿褪色格子衫、眼眶发红的男人，追问他是谁。",
      normalizedText: "询问门缝里的格子衫男人身份",
      kind: "dialogue",
      slots: {},
      riskTags: [],
      isSystemTransition: false,
      isFirstAction: false,
      clientPurpose: "normal",
    },
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unknown_entity_surface" && issue.anchor === "surface:npc:男人"));
});

test("entity whitelist blocks a player-induced person continued only with an anaphor", () => {
  const report = collectSafetyReport({
    narrative: "门缝里的光晃了晃，那件褪色格子衫的肩线在门框边沿蹭出一道褶皱。他没有立刻应声，眼眶红得像刚揉过，手指扣在门板上。",
    intent: {
      rawText: "我盯着门缝里那个穿褪色格子衫、眼眶发红的男人，追问他是谁。",
      normalizedText: "询问门缝里的格子衫男人身份",
      kind: "dialogue",
      slots: {},
      riskTags: [],
      isSystemTransition: false,
      isFirstAction: false,
      clientPurpose: "normal",
    },
    npcSceneAuthorityPacket: scenePacket({ presentNpcIds: [], npcMentionModes: {} }),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.anchor === "surface:npc:player-induced-generic-person"));
});

test("entity whitelist blocks an unanchored described anaphoric actor", () => {
  const report = collectSafetyReport({
    narrative: "肩膀忽然被人拍了一下。她指向门缝，袖口沾着墙灰，随即低声说：别回头。",
    npcSceneAuthorityPacket: scenePacket({ presentNpcIds: [], npcMentionModes: {} }),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.anchor === "surface:npc:unanchored-anaphoric-person"));
});

test("entity whitelist does not infer an unknown person from an anaphor when a scene NPC is authorized", () => {
  const report = collectSafetyReport({
    narrative: "他没有立刻应声，眼眶在走廊冷光里显得很疲惫，手指扣在门板上。",
    intent: {
      rawText: "我问老板昨夜有没有听见声音。",
      normalizedText: "询问老板昨夜声音",
      kind: "dialogue",
      slots: {},
      riskTags: [],
      isSystemTransition: false,
      isFirstAction: false,
      clientPurpose: "normal",
    },
    speakerNpcId: "N-001",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.ok(!report.issues.some((issue) => issue.anchor === "surface:npc:player-induced-generic-person"));
});

test("entity whitelist keeps generic atmospheric people when no individual character is introduced", () => {
  for (const narrative of ["远处有人咳嗽。", "一道模糊的人影从门口掠过。", "楼上传来住户拖动椅子的声音。"]) {
    const report = collectSafetyReport({ narrative, npcSceneAuthorityPacket: scenePacket() });
    assert.ok(!report.issues.some((issue) => issue.code === "unknown_entity_surface"), narrative);
  }
});

test("entity whitelist allows committed NPC surface nickname", () => {
  const report = collectSafetyReport({
    narrative: "老李低声说：昨晚电梯井里确实有声音。",
    sessionCommittedEntityIds: ["夜班保安老李"],
  });

  assert.equal(report.decision, "pass");
  assert.ok(!report.issues.some((issue) => issue.code === "unknown_entity_surface"));
});

test("entity whitelist does not treat pronoun narration as NPC surface", () => {
  const report = collectSafetyReport({
    narrative:
      "我压低声音问出那句话后，老李没有马上回答。他才说昨晚这层楼确实有声音。我可以追问电梯停靠记录，也可以换个方式问他昨晚是否看见有人进出三楼。",
    sessionCommittedEntityIds: ["夜班保安老李"],
  });

  assert.equal(report.decision, "pass");
  assert.ok(!report.issues.some((issue) => issue.code === "unknown_entity_surface"));
});

test("entity whitelist ignores real-trace grammatical fragments before speech verbs", () => {
  for (const narrative of [
    "按理说这里不该有人。",
    "对方没有把话说完。",
    "我回头再问她一句。",
    "她慢吞吞地说：先登记。",
    "她像在等我继续问。",
    "眼神里多了一丝警惕。",
    "纸条上写着：若有疑问，请去前台。",
    "我指着告示问：这上面说的是真的吗？",
  ]) {
    const report = collectSafetyReport({ narrative, npcSceneAuthorityPacket: scenePacket() });
    assert.ok(!report.issues.some((issue) => issue.code === "unknown_entity_surface"), narrative);
  }
});

test("entity whitelist flags unknown NPC id in options as high", () => {
  const report = collectSafetyReport({
    options: ["去找 N-999 问清楚", "留在原地观察"],
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "unregistered_npc_id" && issue.anchor === "N-999"));
});

test("entity whitelist flags offscreen NPC direct speech with N-id attribution", () => {
  const report = collectSafetyReport({
    narrative: "N-002说：你不该在这里。",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "offscreen_npc_direct_speech" && issue.anchor === "N-002"));
});

test("entity whitelist flags offscreen speaker pronoun direct speech", () => {
  const report = collectSafetyReport({
    narrative: "他说：你不该在这里。",
    speakerNpcId: "N-002",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "offscreen_npc_direct_speech" && issue.anchor === "N-002"));
});

test("entity whitelist allows offscreen NPC memory-only mention without direct speech", () => {
  const report = collectSafetyReport({
    narrative: "我想起 N-002 留下的纸条，纸边还有很淡的消毒水味。",
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.notEqual(report.maxSeverity, "high");
  assert.ok(!report.issues.some((issue) => issue.code === "offscreen_npc_direct_speech"));
});

test("entity whitelist flags non-present registered NPC in npc_location_updates as high", () => {
  const report = collectSafetyReport({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你贴着墙根停下。",
      is_death: false,
      options: [],
      npc_location_updates: [{ npc_id: "N-002", location: "B1" }],
    },
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.decision, "repair");
  assert.ok(report.issues.some((issue) => issue.code === "speaker_not_present" && issue.anchor === "N-002"));
});

test("entity whitelist allows denial of player-mentioned unknown silver-haired girl", () => {
  const report = collectSafetyReport({
    narrative: "没有人在那里，老板皱眉，把手里的账本又合上。",
    intent: {
      rawText: "老板旁边那个神秘银发女孩是谁",
      normalizedText: "老板旁边那个神秘银发女孩是谁",
      kind: "dialogue",
      slots: {},
      riskTags: [],
      isSystemTransition: false,
      isFirstAction: false,
      clientPurpose: "normal",
    },
    npcSceneAuthorityPacket: scenePacket(),
  });

  assert.equal(report.ok, true);
  assert.equal(report.decision, "pass");
  assert.deepEqual(report.issues, []);
});

test("entity whitelist exported extractors read narrative, options, dmRecord and surfaces", () => {
  assert.deepEqual(extractNpcIdsFromNarrative("N-001 和 n-002 都被提到"), ["N-001", "N-002"]);
  assert.deepEqual(extractNpcIdsFromOptions(["去找 N-003", { label: "问 N-004" }]), ["N-003", "N-004"]);
  assert.deepEqual(
    extractNpcIdsFromDmRecord({
      narrative: "N-001 看着你。",
      options: ["回头找 N-002"],
      relationship_updates: [{ npcId: "N-003" }],
    }),
    ["N-001", "N-002", "N-003"]
  );
  assert.ok(extractEntitySurfacesConservatively("艾薇娅推门进来").some((ref) => ref.surface === "艾薇娅"));
});
