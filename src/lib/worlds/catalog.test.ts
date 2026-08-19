import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorldIdentity, resolveWorldRuntime, WORLD_CATALOG } from "./catalog";

test("world catalog registers Xingni as a multi-map world", () => {
  assert.equal(WORLD_CATALOG.xingni_taichu.name, "星逆·太初");
  assert.deepEqual(WORLD_CATALOG.xingni_taichu.maps, ["xingni_qingshi_county", "xingni_qingyun_ferry"]);
});

test("runtime rejects cross-world map identities and locked maps", () => {
  assert.equal(resolveWorldRuntime("xingni_taichu", "dark_moon_apartment", { xingniEnabled: true }).ok, false);
  assert.equal(resolveWorldRuntime("xingni_taichu", "xingni_qingyun_ferry", { xingniEnabled: true }).ok, false);
});

test("legacy identity normalizes explicitly to dark moon", () => {
  assert.deepEqual(normalizeWorldIdentity({}), { worldId: "dark_moon_prologue", mapId: "dark_moon_apartment" });
});
