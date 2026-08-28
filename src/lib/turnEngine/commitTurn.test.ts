import test from "node:test";
import assert from "node:assert/strict";
import { commitTurn } from "@/lib/turnEngine/commitTurn";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyReport,
  NarrativeSafetySeverity,
} from "@/lib/turnEngine/narrativeSafety/types";
import type { NarrativeValidationReport, NarrativeValidationTelemetry } from "@/lib/turnEngine/validateNarrative";

function baseTelemetry(
  overrides: Partial<NarrativeValidationTelemetry> = {}
): NarrativeValidationTelemetry {
  return {
    totalIssues: 0,
    byCode: {},
    styleIssueCount: 0,
    styleDriftCount: 0,
    mechanicalExpositionCount: 0,
    npcKnowledgeIssueCount: 0,
    rootCauseLeakCount: 0,
    unsupportedFactCount: 0,
    unsupportedRelationshipClaimCount: 0,
    factCommitRejectedCount: 0,
    narrativeGovernanceFinalSafe: true,
    optionsOverrideApplied: false,
    safeNarrativeFallbackApplied: false,
    ...overrides,
  };
}

function okReport(): NarrativeValidationReport {
  return {
    ok: true,
    issues: [],
    optionsOverride: null,
    narrativeOverride: null,
    awardedItemsOverride: null,
    telemetry: baseTelemetry(),
  };
}

function safetyReport(
  issues: NarrativeSafetyIssue[],
  decision: NarrativeSafetyReport["decision"] = issues.some((issue) => issue.severity === "high")
    ? "repair"
    : issues.some((issue) => issue.severity === "medium")
      ? "repair"
      : "pass"
): NarrativeSafetyReport {
  const bySeverity: Record<NarrativeSafetySeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };
  const byCode: NarrativeSafetyReport["telemetry"]["byCode"] = {};
  const bySource: NarrativeSafetyReport["telemetry"]["bySource"] = {};
  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
    bySource[issue.source] = (bySource[issue.source] ?? 0) + 1;
  }
  return {
    ok: decision === "pass",
    decision,
    issues,
    invariantsViolated: [
      ...new Set(issues.map((issue) => issue.invariant).filter((value): value is NonNullable<NarrativeSafetyIssue["invariant"]> => Boolean(value))),
    ],
    maxSeverity: issues.some((issue) => issue.severity === "high")
      ? "high"
      : issues.some((issue) => issue.severity === "medium")
        ? "medium"
        : issues.some((issue) => issue.severity === "low")
          ? "low"
          : null,
    telemetry: {
      totalIssues: issues.length,
      byCode,
      bySeverity,
      bySource,
    },
  };
}

test("commitTurn passes through when validator reports ok", () => {
  const candidate = {
    narrative: "你穿过走廊。",
    options: ["继续", "停下", "回头", "观察"],
    player_location: "二楼走廊",
  };
  const result = commitTurn({
    requestId: "req_1",
    sessionId: "s_1",
    turnIndex: 3,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "二楼走廊", consumesTime: true },
    validatorReport: okReport(),
  });
  assert.equal(result.summary.optionsRewriteApplied, false);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.deepEqual(result.committedDmRecord.options, candidate.options);
  assert.equal((result.committedDmRecord.security_meta as any).turn_commit.issues, 0);
  // Input record is not mutated.
  assert.equal((candidate as any).security_meta, undefined);
});

test("commitTurn applies options override", () => {
  const candidate = {
    narrative: "...",
    options: ["攻击", "攻击"],
    player_location: "地下室",
  };
  const report: NarrativeValidationReport = {
    ok: false,
    issues: [],
    optionsOverride: ["观察", "退后", "记录", "思考"],
    narrativeOverride: null,
    awardedItemsOverride: null,
    telemetry: baseTelemetry({
      totalIssues: 1,
      byCode: { options_duplicate_only: 1 },
      optionsOverrideApplied: true,
    }),
  };
  const result = commitTurn({
    requestId: "req_2",
    sessionId: "s_1",
    turnIndex: 7,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "地下室" },
    validatorReport: report,
  });
  assert.deepEqual(result.committedDmRecord.options, ["观察", "退后", "记录", "思考"]);
  assert.equal(result.summary.optionsRewriteApplied, true);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.equal(result.summary.degraded, false);
});

test("commitTurn applies a narrow plain-text narrative rewrite without dropping state", () => {
  const report = okReport();
  report.ok = false;
  report.narrativeOverride = "我摸了摸口袋，那里没有能派上用场的东西。";
  const result = commitTurn({
    requestId: "req_narrow_rewrite",
    sessionId: "s_1",
    turnIndex: 1,
    candidateDmRecord: { narrative: "我摸了摸口袋里的便签。", player_location: "1F_Lobby", task_updates: [{ taskId: "t", status: "active" }] },
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "1F_Lobby" },
    validatorReport: report,
  });
  assert.equal(result.committedDmRecord.narrative, report.narrativeOverride);
  assert.equal(result.committedDmRecord.player_location, "1F_Lobby");
  assert.deepEqual(result.committedDmRecord.task_updates, [{ taskId: "t", status: "active" }]);
  assert.ok(result.summary.commitFlags.includes("narrative_rewrite_applied"));
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
});

test("commitTurn falls back to safe narrative when override present", () => {
  const candidate = {
    narrative: "禁忌内容。",
    options: ["a", "b", "c", "d"],
    player_location: "三楼走廊",
  };
  const report: NarrativeValidationReport = {
    ok: false,
    issues: [],
    optionsOverride: null,
    narrativeOverride: JSON.stringify({
      is_action_legal: false,
      sanity_damage: 1,
      narrative: "你忽然有些头晕，先按下心神。",
      options: ["a2", "b2", "c2", "d2"],
      security_meta: { action: "degrade", stage: "post_model", risk_level: "gray", reason: "x" },
    }),
    awardedItemsOverride: null,
    telemetry: baseTelemetry({
      totalIssues: 1,
      byCode: { dm_only_fact_leaked_in_narrative: 1 },
      safeNarrativeFallbackApplied: true,
    }),
  };
  const result = commitTurn({
    requestId: "req_3",
    sessionId: null,
    turnIndex: 1,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, mustDegrade: false, playerLocation: "三楼走廊" },
    validatorReport: report,
  });
  assert.equal(result.committedDmRecord.narrative, "你忽然有些头晕，先按下心神。");
  assert.equal(result.summary.safeNarrativeFallbackApplied, true);
  assert.equal(result.summary.degraded, true);
  // Preserved fields from the original.
  assert.equal(result.committedDmRecord.player_location, "三楼走廊");
});

test("commitTurn summary captures delta shape for analytics", () => {
  const delta = {
    ...emptyStateDelta(),
    consumesTime: true,
    timeCost: "heavy" as const,
    sanityDamage: 3,
    hpDelta: -5,
    originiumDelta: 10,
    isDeath: false,
    playerLocation: "废弃电梯",
    npcLocationUpdates: [{ npcId: "N-001", location: "大厅" }],
    npcAttitudeUpdates: [],
    taskUpdates: [{ taskId: "T_001", status: "in_progress" }],
    newTasks: [{ taskId: "T_002", title: "调查" }],
    isActionLegal: true,
    illegalReasons: [],
  };
  const result = commitTurn({
    requestId: "req_4",
    sessionId: "s_x",
    turnIndex: 12,
    candidateDmRecord: { narrative: "...", options: ["a", "b", "c", "d"], player_location: "废弃电梯" },
    delta,
    validatorReport: okReport(),
  });
  assert.equal(result.summary.deltaSummary.sanityDamage, 3);
  assert.equal(result.summary.deltaSummary.hpDelta, -5);
  assert.equal(result.summary.deltaSummary.originiumDelta, 10);
  assert.equal(result.summary.deltaSummary.npcLocationUpdates, 1);
  assert.equal(result.summary.deltaSummary.taskUpdates, 1);
  assert.equal(result.summary.deltaSummary.newTasks, 1);
  assert.equal(result.summary.deltaSummary.timeCost, "heavy");
  assert.equal(result.summary.playerLocation, "废弃电梯");
});

test("commitTurn preserves existing security_meta keys", () => {
  const candidate = {
    narrative: "...",
    options: ["a", "b", "c", "d"],
    player_location: "二楼",
    security_meta: { earlier_stage: "input_ok" },
  };
  const result = commitTurn({
    requestId: "req_5",
    sessionId: "s_1",
    turnIndex: 2,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
  });
  const meta = result.committedDmRecord.security_meta as Record<string, unknown>;
  assert.equal(meta.earlier_stage, "input_ok");
  assert.ok(meta.turn_commit);
});

test("commitTurn records fact commit gate metadata", () => {
  const result = commitTurn({
    requestId: "req_fact_gate",
    sessionId: "s_1",
    turnIndex: 4,
    candidateDmRecord: {
      narrative: "...",
      options: ["a", "b", "c", "d"],
      _narrative_audit: { candidate_new_facts: [{ factId: "fact:forged" }] },
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    factCommitGateResult: {
      allowedFacts: [],
      rejectedFacts: [{ candidate: { factId: "fact:forged" }, reason: "candidate_truth_level" }],
      rewriteHints: ["candidate_fact_not_committed:fact:forged"],
      shouldBlockCommit: true,
    },
  });
  assert.ok(result.summary.commitFlags.includes("fact_commit_gate_blocked"));
  assert.equal(result.summary.validatorIssueCounts.fact_commit_gate_blocked, 1);
  const audit = result.committedDmRecord._narrative_audit as Record<string, unknown>;
  assert.deepEqual(audit.rejected_fact_ids, ["fact:forged"]);
});

test("commitTurn does not infer inventory from narrative text", () => {
  const result = commitTurn({
    requestId: "req_no_inventory_inference",
    sessionId: "s_1",
    turnIndex: 5,
    candidateDmRecord: {
      narrative: "你捡起钥匙，但系统没有给出结构化获得字段。",
      options: ["查看门锁", "放回钥匙", "检查脚边", "继续观察"],
      awarded_items: [],
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
  });

  assert.deepEqual(result.committedDmRecord.awarded_items, []);
  assert.equal(result.summary.entityAuditSummary.strippedUnknownEntityCount, 0);
});

test("commitTurn blocks codex updates that contain an unknown NPC in hard mode", () => {
  const result = commitTurn({
    requestId: "req_unknown_codex",
    sessionId: "s_1",
    turnIndex: 6,
    candidateDmRecord: {
      narrative: "柜台后没有新面孔。",
      options: ["问老板", "观察柜台", "检查门口", "继续等待"],
      codex_updates: [{ type: "npc", name: "Avia", summary: "unknown generated npc" }],
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "medium",
        source: "entityAudit",
        detail: "field=codex_updates|surface=Avia",
        anchor: "Avia",
      },
    ]),
  });

  assert.equal(result.committedDmRecord.codex_updates, undefined);
  assert.equal(result.summary.degraded, true);
  assert.ok(result.summary.commitFlags.includes("safety_hard_gate_blocked"));
  assert.ok(result.summary.blockedCommitFields.includes("codex_updates"));
  assert.equal(result.summary.safetyIssueCounts.unknown_entity_surface, 1);
});

test("commitTurn blocks relationship updates with an unknown NPC id", () => {
  const result = commitTurn({
    requestId: "req_unknown_relation",
    sessionId: "s_1",
    turnIndex: 7,
    candidateDmRecord: {
      narrative: "N-999 对你露出熟悉的笑。",
      options: ["后退", "询问", "观察", "离开"],
      relationship_updates: [{ npcId: "N-999", delta: 5 }],
      player_location: "lobby",
    },
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "lobby" },
    validatorReport: okReport(),
    safetyReport: safetyReport(
      [
        {
          code: "unregistered_npc_id",
          invariant: "unregistered_npc_id",
          severity: "high",
          source: "entityAudit",
          detail: "field=relationship_updates|npc=N-999",
          anchor: "N-999",
        },
      ],
      "block_commit"
    ),
  });

  assert.equal(result.committedDmRecord.relationship_updates, undefined);
  assert.equal(result.committedDmRecord.player_location, undefined);
  assert.equal(result.committedDmRecord.sanity_damage, 0);
  assert.equal(result.summary.degraded, true);
  assert.ok(result.summary.commitFlags.includes("safety_hard_gate_blocked"));
  assert.ok(result.summary.blockedCommitFields.includes("accepted_delta"));
});

test("commitTurn replaces an unregistered described NPC with an identity-unconfirmed fallback in hard mode", () => {
  const result = commitTurn({
    requestId: "req_described_unknown_person",
    sessionId: "s_1",
    turnIndex: 7,
    candidateDmRecord: {
      narrative: "格子衫男人从门缝里探出半个身子，眼眶发红地盯着你。",
      options: ["询问男人", "靠近门缝", "后退", "离开"],
      codex_updates: [{ type: "npc", name: "格子衫男人" }],
      player_location: "1F_Lobby",
    },
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "1F_Lobby" },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "high",
        source: "entityAudit",
        detail: "kind=npc|surface=男人|context=generic_described_person",
        anchor: "surface:npc:男人",
      },
    ], "block_commit"),
  });

  assert.equal(result.committedDmRecord.narrative, "四周恢复了安静。灰白的墙皮在灯光下显得有些斑驳，一切如常。");
  assert.deepEqual(result.committedDmRecord.options, []);
  assert.equal(result.committedDmRecord.codex_updates, undefined);
  assert.equal(result.committedDmRecord.player_location, undefined);
  assert.ok(result.summary.commitFlags.includes("safe_narrative_fallback_applied"));
  assert.ok(result.summary.commitFlags.includes("structured_updates_stripped"));
});

test("commitTurn uses Xingni-scoped safety copy instead of apartment ambience", () => {
  const result = commitTurn({
    requestId: "req_xingni_described_unknown_person",
    sessionId: "s_xingni",
    turnIndex: 7,
    worldId: "xingni_taichu",
    candidateDmRecord: {
      narrative: "一个未登记的陌生人突然报出姓名。",
      options: ["追问"],
      player_location: "QS_GUOYAN_INN",
    },
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "QS_GUOYAN_INN" },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "high",
        source: "entityAudit",
        detail: "kind=npc|surface=陌生人|context=generic_described_person",
        anchor: "surface:npc:陌生人",
      },
    ], "block_commit"),
  });

  assert.match(String(result.committedDmRecord.narrative), /青石县/);
  assert.doesNotMatch(String(result.committedDmRecord.narrative), /灯管|电梯|水管|楼道|墙皮|走廊/);
  assert.ok(result.summary.commitFlags.includes("safe_narrative_fallback_applied"));
});

test("commitTurn removes an uncommitted combat claim when hard safety blocks its state", () => {
  const result = commitTurn({
    requestId: "req_blocked_combat_claim",
    sessionId: "s_1",
    turnIndex: 8,
    candidateDmRecord: {
      narrative: "铁管砸中黑影，武器在交锋中承受了实际损耗。",
      options: ["继续压制"],
      conflict_outcome: { outcomeTier: "partial_success" },
      weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 68 }],
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unsupported_new_fact",
        invariant: "unsupported_new_fact",
        severity: "high",
        source: "unsupportedFactDetector",
        detail: "candidate_pending_review",
      },
    ], "block_commit"),
  });

  assert.equal(result.committedDmRecord.narrative, "眼前的动静尚不足以形成可提交的战果；你停下动作重新确认局势，武器与世界状态没有变化。");
  assert.deepEqual(result.committedDmRecord.options, []);
  assert.deepEqual(result.committedDmRecord.weapon_updates, []);
  assert.ok(result.summary.commitFlags.includes("safe_narrative_fallback_applied"));
});

test("commitTurn keeps described-person candidate untouched in shadow mode", () => {
  const candidate = {
    narrative: "格子衫男人从门缝里探出半个身子，眼眶发红地盯着你。",
    options: ["询问男人", "靠近门缝", "后退", "离开"],
  };
  const result = commitTurn({
    requestId: "req_described_unknown_person_shadow",
    sessionId: "s_1",
    turnIndex: 8,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "high",
        source: "entityAudit",
        detail: "kind=npc|surface=男人|context=generic_described_person",
        anchor: "surface:npc:男人",
      },
    ], "block_commit"),
    safetyPolicy: { kernelEnabled: true, mode: "shadow", entityHardGateEnabled: true, pacingValidatorEnabled: true },
  });

  assert.equal(result.committedDmRecord.narrative, candidate.narrative);
  assert.deepEqual(result.committedDmRecord.options, candidate.options);
  assert.ok(!result.summary.commitFlags.includes("safe_narrative_fallback_applied"));
  assert.ok(!result.summary.commitFlags.includes("structured_updates_stripped"));
});

test("commitTurn preserves a valid narrative when only a generated option invents a person", () => {
  const narrative = "柳三娘把账本合上，陈砚在门边停了一瞬，像是在等你追问。";
  const result = commitTurn({
    requestId: "req_unknown_person_option_only",
    sessionId: "s_1",
    turnIndex: 9,
    candidateDmRecord: {
      narrative,
      options: ["跟上那个披着黑斗篷、在门边盯着你的男人"],
      is_action_legal: true,
      sanity_damage: 0,
      is_death: false,
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "high",
        source: "entityAudit",
        detail: "kind=npc|surface=男人|origin=options|context=generic_described_person",
        anchor: "surface:npc:男人",
      },
    ], "block_commit"),
    safetyPolicy: { kernelEnabled: true, mode: "hard", entityHardGateEnabled: true, pacingValidatorEnabled: true },
  });

  assert.equal(result.committedDmRecord.narrative, narrative);
  assert.deepEqual(result.committedDmRecord.options, []);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.equal(result.summary.optionsRewriteApplied, true);
});

test("commitTurn strips state but keeps narrative on high root cause leak", () => {
  const result = commitTurn({
    requestId: "req_root_cause",
    sessionId: "s_1",
    turnIndex: 8,
    candidateDmRecord: {
      narrative: "公寓根因就是七锚闭环。",
      options: ["追问", "记录", "沉默", "离开"],
      new_tasks: [{ taskId: "T_ROOT", title: "追查七锚闭环" }],
      player_location: "B2",
    },
    delta: {
      ...emptyStateDelta(),
      isActionLegal: true,
      playerLocation: "B2",
      newTasks: [{ taskId: "T_ROOT", title: "追查七锚闭环" }],
    },
    validatorReport: okReport(),
    safetyReport: safetyReport(
      [
        {
          code: "unsupported_root_cause_claim",
          invariant: "unsupported_root_cause_claim",
          severity: "high",
          source: "unsupportedFactDetector",
          detail: "root cause without allowed fact",
        },
      ],
      "block_commit"
    ),
  });

  assert.equal(result.committedDmRecord.narrative, "公寓根因就是七锚闭环。");
  assert.equal(result.committedDmRecord.new_tasks, undefined);
  assert.equal(result.committedDmRecord.player_location, undefined);
  assert.equal(result.summary.deltaSummary.newTasks, 0);
  assert.equal(result.summary.playerLocation, null);
  assert.equal(result.summary.fallbackApplied, false);
});

test("commitTurn strips npc updates but keeps narrative on offscreen direct speech", () => {
  const result = commitTurn({
    requestId: "req_offscreen_speech",
    sessionId: "s_1",
    turnIndex: 9,
    candidateDmRecord: {
      narrative: "N-002说：我就在门外。",
      options: ["开门", "后退", "询问老板", "记录声音"],
      npc_location_updates: [{ npcId: "N-002", location: "doorway" }],
    },
    delta: {
      ...emptyStateDelta(),
      isActionLegal: true,
      npcLocationUpdates: [{ npcId: "N-002", location: "doorway" }],
    },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "offscreen_npc_direct_speech",
        invariant: "offscreen_npc_direct_speech",
        severity: "high",
        source: "npcSceneAuthority",
        detail: "npc=N-002|mode=offscreen",
        anchor: "N-002",
      },
    ]),
  });

  assert.equal(result.committedDmRecord.npc_location_updates, undefined);
  assert.equal(result.summary.deltaSummary.npcLocationUpdates, 0);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.equal(result.committedDmRecord.narrative, "N-002说：我就在门外。");
});

test("commitTurn records low style drift without blocking commit", () => {
  const result = commitTurn({
    requestId: "req_low_style",
    sessionId: "s_1",
    turnIndex: 10,
    candidateDmRecord: {
      narrative: "A slightly plain but safe response.",
      options: ["look", "wait", "ask", "leave"],
      codex_updates: [{ type: "clue", title: "safe clue" }],
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport([
      {
        code: "style_drift",
        severity: "low",
        source: "validateNarrative",
        detail: "minor style issue",
      },
    ]),
  });

  assert.equal(result.summary.degraded, false);
  assert.equal(result.summary.fallbackApplied, false);
  assert.deepEqual(result.summary.blockedCommitFields, []);
  assert.deepEqual(result.committedDmRecord.codex_updates, [{ type: "clue", title: "safe clue" }]);
  assert.equal(result.summary.safetyIssueCounts.style_drift, 1);
});

test("commitTurn shadow mode records safety issues without changing final", () => {
  const result = commitTurn({
    requestId: "req_shadow_safety",
    sessionId: "s_1",
    turnIndex: 11,
    candidateDmRecord: {
      narrative: "N-999 speaks from the doorway.",
      options: ["listen", "wait", "leave", "record"],
      relationship_updates: [{ npcId: "N-999", delta: 5 }],
      player_location: "lobby",
    },
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "lobby" },
    validatorReport: okReport(),
    safetyReport: safetyReport(
      [
        {
          code: "unregistered_npc_id",
          invariant: "unregistered_npc_id",
          severity: "high",
          source: "entityAudit",
          detail: "field=relationship_updates|npc=N-999",
          anchor: "N-999",
        },
      ],
      "block_commit"
    ),
    safetyPolicy: {
      kernelEnabled: true,
      mode: "shadow",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(result.committedDmRecord.narrative, "N-999 speaks from the doorway.");
  assert.deepEqual(result.committedDmRecord.relationship_updates, [{ npcId: "N-999", delta: 5 }]);
  assert.equal(result.summary.degraded, false);
  assert.deepEqual(result.summary.blockedCommitFields, []);
  assert.equal(result.summary.safetyIssueCounts.unregistered_npc_id, 1);
  const meta = result.committedDmRecord.security_meta as Record<string, any>;
  assert.equal(meta.turn_commit.safety_policy.mode, "shadow");
  assert.equal(meta.turn_commit.safety_policy.decision, "record");
});

test("commitTurn disabled safety policy returns to the legacy no-op safety path", () => {
  const result = commitTurn({
    requestId: "req_safety_disabled",
    sessionId: "s_1",
    turnIndex: 12,
    candidateDmRecord: {
      narrative: "N-999 remains in the output because the kernel is disabled.",
      options: ["listen", "wait", "leave", "record"],
      codex_updates: [{ type: "npc", name: "N-999" }],
    },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
    safetyReport: safetyReport(
      [
        {
          code: "unregistered_npc_id",
          invariant: "unregistered_npc_id",
          severity: "high",
          source: "entityAudit",
          detail: "field=codex_updates|npc=N-999",
          anchor: "N-999",
        },
      ],
      "block_commit"
    ),
    safetyPolicy: {
      kernelEnabled: false,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(result.summary.degraded, false);
  assert.deepEqual(result.summary.blockedCommitFields, []);
  assert.deepEqual(result.committedDmRecord.codex_updates, [{ type: "npc", name: "N-999" }]);
  const meta = result.committedDmRecord.security_meta as Record<string, any>;
  assert.equal(meta.turn_commit.safety_policy.enabled, false);
  assert.equal(meta.turn_commit.safety_policy.decision, "pass");
});

test("commit trace records privacy-safe unsupported fact reason codes", () => {
  const result = commitTurn({
    requestId: "req_fact_reason",
    sessionId: "s_private",
    turnIndex: 1,
    candidateDmRecord: { narrative: "玩家私密正文", options: [] },
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: {
      ...okReport(),
      ok: false,
      issues: [{ code: "unsupported_new_fact", severity: "low", detail: "world_fact:task_completion_without_fact_or_delta" }],
      telemetry: baseTelemetry({ totalIssues: 1, byCode: { unsupported_new_fact: 1 }, unsupportedFactCount: 1 }),
    },
    safetyReport: safetyReport([{
      code: "unsupported_new_fact",
      invariant: "unsupported_new_fact",
      severity: "medium",
      source: "unsupportedFactDetector",
      detail: "task_completion_without_fact_or_delta",
    }], "repair"),
  });
  assert.equal(result.summary.unsupportedFactReasonCounts.task_completion_without_fact_or_delta, 1, "validator and safety copies must not double count");
  const turnCommit = (result.committedDmRecord.security_meta as { turn_commit: Record<string, unknown> }).turn_commit;
  assert.deepEqual(turnCommit.unsupported_fact_reason_counts, { task_completion_without_fact_or_delta: 1 });
  assert.equal(JSON.stringify(turnCommit).includes("玩家私密正文"), false);
});

test("commitTurn soft mode strips state but keeps narrative for block_commit safety report", () => {
  const result = commitTurn({
    requestId: "req_soft_root",
    sessionId: "s_1",
    turnIndex: 13,
    candidateDmRecord: {
      narrative: "The root truth is stated without evidence.",
      options: ["ask", "wait", "record", "leave"],
      new_tasks: [{ taskId: "T_SOFT", title: "Track the clue" }],
      player_location: "B2",
    },
    delta: {
      ...emptyStateDelta(),
      isActionLegal: true,
      playerLocation: "B2",
      newTasks: [{ taskId: "T_SOFT", title: "Track the clue" }],
    },
    validatorReport: okReport(),
    safetyReport: safetyReport(
      [
        {
          code: "unsupported_root_cause_claim",
          invariant: "unsupported_root_cause_claim",
          severity: "high",
          source: "unsupportedFactDetector",
          detail: "root cause without allowed fact",
        },
      ],
      "block_commit"
    ),
    safetyPolicy: {
      kernelEnabled: true,
      mode: "soft",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(result.committedDmRecord.narrative, "The root truth is stated without evidence.");
  assert.equal(result.committedDmRecord.new_tasks, undefined);
  assert.equal(result.committedDmRecord.player_location, undefined);
  assert.equal(result.summary.degraded, true);
  assert.equal(result.summary.fallbackApplied, false);
  assert.ok(result.summary.commitFlags.includes("safety_hard_gate_blocked"));
  assert.ok(result.summary.blockedCommitFields.includes("new_tasks"));
});
