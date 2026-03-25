import test from "node:test";
import assert from "node:assert/strict";
import { auditDmOutputCandidateOnServer } from "@/lib/safety/output/pipeline";
import type { ProviderSignal } from "@/lib/safety/policy/model";

function baseDmRecord(narrative: string) {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: true,
    consumed_items: ["X-001"],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [{ threatId: "T-1", phase: "active" }],
    weapon_updates: [{ weaponId: "W-1", stability: 0.2 }],
    new_tasks: [],
    task_updates: [{ id: "task1", status: "in_progress" }],
    npc_location_updates: [],
  } satisfies Record<string, unknown>;
}

test("rewrite: private explicit gore => narrative sanitized, structured fields preserved", async () => {
  const dm = baseDmRecord("血肉模糊，内脏外翻的细节描写……你继续靠近。");
  const r = await auditDmOutputCandidateOnServer({
    dmRecord: dm,
    sceneKind: "private_story_output",
    traceId: "t-rewrite",
    providerSignalsOverride: [],
  });

  assert.equal(r.verdict, "rewrite");
  assert.equal(r.rewriteUsed, true);
  assert.equal(String(r.updatedDmRecord.main_threat_updates ? "ok" : "ok"), "ok");
  assert.deepEqual(r.updatedDmRecord.main_threat_updates, dm.main_threat_updates);
  assert.deepEqual(r.updatedDmRecord.task_updates, dm.task_updates);
  assert.equal(r.updatedDmRecord.is_action_legal, true);

  const narrative = String(r.updatedDmRecord.narrative ?? "");
  assert.ok(!narrative.includes("内脏外翻"));
  assert.ok(!narrative.includes("血肉模糊"));
});

test("system fault: provider error + private fail_soft => fallback narrative (not overriding local reject)", async () => {
  const dm = baseDmRecord("正常叙事文本，带一点怪谈压迫感。");
  const providerSignals: ProviderSignal[] = [
    { provider: "baidu_text_censor", decision: "allow", riskLevel: "normal", categories: [], errorKind: "network_timeout" },
  ];

  const r = await auditDmOutputCandidateOnServer({
    dmRecord: dm,
    sceneKind: "private_story_output",
    traceId: "t-provider-fail-private",
    providerSignalsOverride: providerSignals,
  });

  assert.equal(r.verdict, "fallback");
  assert.equal(r.fallbackUsed, true);
  assert.ok(String(r.updatedDmRecord.narrative ?? "").includes("外部校验暂不可用"));
});

test("system fault must not downgrade local hard reject", async () => {
  const dm = baseDmRecord("未成年 性 详细描述");
  const providerSignals: ProviderSignal[] = [
    { provider: "baidu_text_censor", decision: "allow", riskLevel: "normal", categories: [], errorKind: "service_error" },
  ];

  const r = await auditDmOutputCandidateOnServer({
    dmRecord: dm,
    sceneKind: "private_story_output",
    traceId: "t-provider-fail-dont-downgrade",
    providerSignalsOverride: providerSignals,
  });

  assert.equal(r.verdict, "reject");
  assert.equal(r.decision, "reject");
});

test("public_display: provider failure + fail_closed => reject (hard block)", async () => {
  const dm = baseDmRecord("正常叙事文本。");
  const providerSignals: ProviderSignal[] = [
    { provider: "baidu_text_censor", decision: "allow", riskLevel: "normal", categories: [], errorKind: "network_timeout" },
  ];

  const r = await auditDmOutputCandidateOnServer({
    dmRecord: dm,
    sceneKind: "public_display_output",
    traceId: "t-provider-fail-public-reject",
    providerSignalsOverride: providerSignals,
  });

  assert.equal(r.verdict, "reject");
  assert.equal(r.decision, "reject");
});

test("private_story_output: contact info in narrative => fallback narrative (world-safe)", async () => {
  const dm = baseDmRecord("我只想留个方式：微信联系后再说。然后继续靠近。");

  const r = await auditDmOutputCandidateOnServer({
    dmRecord: dm,
    sceneKind: "private_story_output",
    traceId: "t-contact-fallback",
    providerSignalsOverride: [],
  });

  assert.equal(r.verdict, "fallback");
  assert.equal(r.decision, "fallback");
  assert.equal(r.fallbackUsed, true);
  // Should keep structured fields intact.
  assert.deepEqual(r.updatedDmRecord.task_updates, dm.task_updates);
  const narrative = String(r.updatedDmRecord.narrative ?? "");
  assert.ok(!narrative.includes("微信"), `narrative should not include contact hints: ${narrative}`);
});

