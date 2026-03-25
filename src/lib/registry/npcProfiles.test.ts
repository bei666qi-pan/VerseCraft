import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NPCS } from "./npcs";

describe("npc profile overrides", () => {
  it("applies core reshaped roles on stable ids", () => {
    const merchant = NPCS.find((x) => x.id === "N-018");
    assert.equal(merchant?.name, "北夏");
    const knight = NPCS.find((x) => x.id === "N-015");
    assert.equal(knight?.name, "麟泽");
    const girl = NPCS.find((x) => x.id === "N-020");
    assert.equal(girl?.name, "灵伤");
  });
});
