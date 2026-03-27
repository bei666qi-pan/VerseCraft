import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContentPacks } from "./validators";
import { baseApartmentPack } from "./packs/baseApartmentPack";

test("phase6: content packs validate with no errors", () => {
  const { issues } = validateContentPacks([baseApartmentPack]);
  const errors = issues.filter((x) => x.severity === "error");
  assert.equal(errors.length, 0);
});

test("phase6: validator catches duplicate ids", () => {
  const broken = {
    ...baseApartmentPack,
    npcSpecs: [...(baseApartmentPack.npcSpecs ?? []), ...(baseApartmentPack.npcSpecs ?? [])],
    manifest: { ...baseApartmentPack.manifest, packId: "brokenPack" },
  } as any;
  const { issues } = validateContentPacks([broken]);
  assert.ok(issues.some((x) => x.code === "npc.id.duplicate" && x.severity === "error"));
});

