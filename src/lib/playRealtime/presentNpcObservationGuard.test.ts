import assert from "node:assert/strict";
import test from "node:test";
import { applyPresentNpcObservationGuard } from "./presentNpcObservationGuard";

test("explicit observation of a present canonical NPC commits one codex entry", () => {
  const out = applyPresentNpcObservationGuard({ dmRecord: { narrative: "欣蓝穿着灰外套看着我。", codex_updates: [] }, latestUserInput: "观察在场的N-010并记录图鉴", clientState: { presentNpcIds: ["N-010"] } });
  assert.equal((out.codex_updates as any[])[0].name, "欣蓝");
  assert.match(String(out.narrative), /欣蓝/);
});

test("requested observation does not fabricate identity or codex when NPC is not presented", () => {
  const out = applyPresentNpcObservationGuard({ dmRecord: { narrative: "身后传来一声轻响，也许只是管道。", codex_updates: [] }, latestUserInput: "观察在场的N-010并记录图鉴", clientState: { presentNpcIds: ["N-010"] } });
  assert.doesNotMatch(String(out.narrative), /我确认眼前的人是|欣蓝/);
  assert.deepEqual(out.codex_updates, []);
});

test("offscreen NPC cannot be committed by observation guard", () => {
  const out = applyPresentNpcObservationGuard({ dmRecord: { narrative: "没人回应。" }, latestUserInput: "观察N-010", clientState: { presentNpcIds: [] } });
  assert.equal(out.codex_updates, undefined);
});

test("single present canonical NPC repairs a generic speaking identity", () => {
  const out = applyPresentNpcObservationGuard({ dmRecord: { narrative: "一个中年女人抬头问我来做什么。" }, latestUserInput: "前往办公室", clientState: { presentNpcIds: ["N-010"] } });
  assert.match(String(out.narrative), /欣蓝抬头问我/);
  assert.doesNotMatch(String(out.narrative), /中年女人/);
});

test("generic present speaker can be repaired before an explicit codex observation commits", () => {
  const out = applyPresentNpcObservationGuard({
    dmRecord: { narrative: "一个年轻女生抬头问我要找谁。", codex_updates: [] },
    latestUserInput: "观察N-010并记录图鉴",
    clientState: { presentNpcIds: ["N-010"] },
  });
  assert.match(String(out.narrative), /欣蓝抬头问我/);
  assert.equal((out.codex_updates as any[])[0].id, "N-010");
  assert.ok((out._commit_flags as string[]).includes("single_present_npc_identity_repaired_v1"));
  assert.ok((out._commit_flags as string[]).includes("present_npc_observation_committed_v1"));
});
