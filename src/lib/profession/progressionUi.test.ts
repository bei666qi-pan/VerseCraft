import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProfessionState, PROFESSION_IDS } from "./registry";
import { buildProfessionApproachSnapshots, buildProfessionIdentityDigest } from "./progressionUi";

test("buildProfessionApproachSnapshots should rank professions and stay lightweight", () => {
  const st = createDefaultProfessionState();
  const list = buildProfessionApproachSnapshots(st);
  assert.equal(list.length, 5);
  assert.ok(PROFESSION_IDS.includes(list[0]!.profession), "top profession must be a known profession");
  assert.ok(Number.isFinite(list[0]!.score));
  assert.ok(Array.isArray(list[0]!.why));
  assert.ok(Array.isArray(list[0]!.next));
  // 分数降序
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1]!.score >= list[i]!.score, `scores not descending at index ${i}`);
  }
});

test("buildProfessionIdentityDigest should produce a compact string", () => {
  const st = createDefaultProfessionState();
  const s = buildProfessionIdentityDigest(st);
  assert.equal(typeof s, "string");
  assert.ok(s.length >= 20, `digest too short: ${s.length}`);
});

