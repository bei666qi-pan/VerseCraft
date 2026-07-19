import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibleOptionsSceneAnchors } from "./optionsSceneAnchors";

test("visible options scene anchors use display labels and a bounded public location alias", () => {
  const anchors = buildVisibleOptionsSceneAnchors({
    playerLocation: "B1_PowerRoom",
    presentNpcIds: ["N-008"],
    equippedWeapon: { id: "WPN-003", name: "铁管" },
    inventoryHints: ["I-C03"],
  });
  assert.deepEqual(anchors, ["地下一层配电间", "配电间", "电源室", "电工老刘", "老刘", "武器", "铁管", "钢管", "防爆手电筒", "手电筒", "手电"]);
});

test("visible options scene anchors retain display aliases for legacy inventory ids", () => {
  const anchors = buildVisibleOptionsSceneAnchors({ inventoryHints: ["item_phone", "item_bandage"] });
  assert.deepEqual(anchors, ["item_phone", "手机", "item_bandage", "绷带"]);
});

test("visible options scene anchors expose only aliases for objects already described in the latest narrative", () => {
  const anchors = buildVisibleOptionsSceneAnchors({
    latestNarrative: "门缝塞着一张泛黄纸片，墙上的裂纹正缓慢向上爬。",
  });

  assert.deepEqual(anchors, ["纸", "纸条", "纸片", "纸张", "裂缝", "裂纹", "门缝", "房门", "墙", "墙角", "墙面", "墙皮"]);
});
