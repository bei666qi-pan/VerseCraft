import assert from "node:assert/strict";
import test from "node:test";
import {
  buildServiceContextForLocation,
  getServicesForLocation,
  isAbsoluteSafeZoneLocation,
} from "./serviceNodes";

test("B1 storage exposes structured shop services", () => {
  const services = getServicesForLocation("B1_Storage", {
    shopUnlocked: true,
    forgeUnlocked: true,
    anchorUnlocked: true,
  });
  assert.ok(services.length >= 2);
  assert.ok(services.some((s) => s.kind === "shop_trade" && s.available));
});

test("service context block is generated only for B1 service nodes", () => {
  const b1Block = buildServiceContextForLocation("B1_PowerRoom", {
    forgeUnlocked: true,
  });
  assert.ok(b1Block.includes("当前位置服务节点"));
  assert.ok(b1Block.includes("svc_b1_forge_upgrade"));

  const nonB1Block = buildServiceContextForLocation("1F_Lobby", {});
  assert.equal(nonB1Block, "");
});

test("absolute safe zone includes all B1 service nodes", () => {
  assert.equal(isAbsoluteSafeZoneLocation("B1_SafeZone"), true);
  assert.equal(isAbsoluteSafeZoneLocation("B1_Storage"), true);
  assert.equal(isAbsoluteSafeZoneLocation("B1_Laundry"), true);
  assert.equal(isAbsoluteSafeZoneLocation("B1_PowerRoom"), true);
  assert.equal(isAbsoluteSafeZoneLocation("1F_Lobby"), false);
});
