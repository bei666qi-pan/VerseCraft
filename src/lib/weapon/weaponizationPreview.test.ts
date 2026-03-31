import test from "node:test";
import assert from "node:assert/strict";
import { buildWeaponizationPreviews } from "./weaponizationPreview";

test("buildWeaponizationPreviews should produce commands and be compat-safe", () => {
  const inv = [
    { id: "I-C12", name: "样本C12", tier: "C", description: "", tags: "sound", ownerId: "X" },
    { id: "I-C13", name: "样本C13", tier: "C", description: "", tags: "sound", ownerId: "X" },
    { id: "I-C14", name: "样本C14", tier: "C", description: "", tags: "sound", ownerId: "X" },
  ] as any;
  const previews = buildWeaponizationPreviews({ inventory: inv, originium: 10, equippedWeapon: null });
  assert.ok(previews.length > 0);
  const c = previews.find((p) => p.targetTier === "C");
  assert.ok(c);
  assert.ok(c!.suggestedCommand.includes("forge_weaponize_c"));
  assert.equal(typeof c!.ready, "boolean");
});

