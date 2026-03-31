import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProfessionState } from "./registry";
import { buildProfessionApproachSnapshots, buildProfessionIdentityDigest } from "./progressionUi";

test("buildProfessionApproachSnapshots should rank professions and stay lightweight", () => {
  const st = createDefaultProfessionState();
  const list = buildProfessionApproachSnapshots(st);
  assert.equal(list.length, 5);
  assert.ok(list[0]!.profession);
  assert.ok(Number.isFinite(list[0]!.score));
  assert.ok(Array.isArray(list[0]!.why));
  assert.ok(Array.isArray(list[0]!.next));
});

test("buildProfessionIdentityDigest should produce a compact string", () => {
  const st = createDefaultProfessionState();
  const s = buildProfessionIdentityDigest(st);
  assert.equal(typeof s, "string");
  assert.ok(s.length > 0);
});

