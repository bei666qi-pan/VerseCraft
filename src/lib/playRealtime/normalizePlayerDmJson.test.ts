import test from "node:test";
import assert from "node:assert/strict";
import { tryParseDM } from "@/features/play/stream/dmParse";
import {
  normalizePlayerDmJson,
  parseAccumulatedPlayerDmJson,
} from "@/lib/playRealtime/normalizePlayerDmJson";

test("normalizePlayerDmJson returns null when required keys missing", () => {
  assert.equal(normalizePlayerDmJson(null), null);
  assert.equal(normalizePlayerDmJson({}), null);
  assert.equal(
    normalizePlayerDmJson({
      is_action_legal: true,
      narrative: "x",
      is_death: false,
    }),
    null
  );
});

test("normalizePlayerDmJson fills array defaults and consumes_time true", () => {
  const n = normalizePlayerDmJson({
    is_action_legal: true,
    sanity_damage: 1,
    narrative: "你好",
    is_death: false,
  });
  assert.ok(n);
  assert.deepEqual(n!.consumed_items, []);
  assert.deepEqual(n!.awarded_items, []);
  assert.deepEqual(n!.codex_updates, []);
  assert.deepEqual(n!.relationship_updates, []);
  assert.deepEqual(n!.main_threat_updates, []);
  assert.deepEqual(n!.weapon_updates, []);
  assert.deepEqual(n!.weapon_bag_updates, []);
  assert.equal(n!.currency_change, 0);
  assert.equal(n!.consumes_time, true);
  assert.ok(!("options" in n!));
});

test("normalizePlayerDmJson preserves consumes_time false and optional strings", () => {
  const n = normalizePlayerDmJson({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "。",
    is_death: false,
    consumes_time: false,
    player_location: "B1_SafeZone",
    bgm_track: "bgm_2_suspense",
    currency_change: -2,
  });
  assert.ok(n);
  assert.equal(n!.consumes_time, false);
  assert.equal(n!.player_location, "B1_SafeZone");
  assert.equal(n!.bgm_track, "bgm_2_suspense");
  assert.equal(n!.currency_change, -2);
});

test("normalizePlayerDmJson sanitizes weapon_updates to whitelist shape", () => {
  const n = normalizePlayerDmJson({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "x",
    is_death: false,
    weapon_updates: [
      { weaponId: "WPN-001", stability: 999, contamination: -5, hacked: true, weapon: { id: "WZ-1" } },
      { hacked: "x" },
    ],
    weapon_bag_updates: [
      { removeWeaponId: "WZ-001", extra: 1 },
      { addEquippedWeaponId: "WPN-001", nope: true },
      { addWeapon: { id: "WZ-002" }, x: 1 },
      { nonsense: 1 },
    ],
    currency_change: 99999999,
    security_meta: { big: "x".repeat(5000) },
  });
  assert.ok(n);
  const wu = Array.isArray(n!.weapon_updates) ? n!.weapon_updates : [];
  assert.equal(wu.length, 1);
  assert.equal((wu[0] as any).weaponId, "WPN-001");
  assert.equal((wu[0] as any).stability, 100);
  assert.equal((wu[0] as any).contamination, 0);
  assert.equal((wu[0] as any).hacked, undefined);
  const wbu = Array.isArray(n!.weapon_bag_updates) ? n!.weapon_bag_updates : [];
  assert.equal(wbu.length, 3);
  assert.equal(n!.currency_change, 999999);
  assert.deepEqual(n!.security_meta, { trimmed: true });
});

test("parseAccumulatedPlayerDmJson extracts first balanced object", () => {
  const raw =
    'xx {"is_action_legal":true,"sanity_damage":0,"narrative":"x","is_death":false} yy';
  const p = parseAccumulatedPlayerDmJson(raw);
  assert.ok(p && typeof p === "object");
  const n = normalizePlayerDmJson(p);
  assert.ok(n);
  assert.equal(n!.narrative, "x");
});

test("normalized JSON string remains parseable by client tryParseDM", () => {
  const n = normalizePlayerDmJson({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试",
    is_death: false,
  });
  assert.ok(n);
  const wire = JSON.stringify(n);
  const parsed = tryParseDM(wire);
  assert.ok(parsed);
  assert.equal(parsed!.narrative, "测试");
  assert.deepEqual(parsed!.consumed_items ?? [], []);
});
