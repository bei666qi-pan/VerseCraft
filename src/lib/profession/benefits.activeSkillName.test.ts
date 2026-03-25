import test from "node:test";
import assert from "node:assert/strict";
import { getProfessionActiveSkillName } from "./benefits";
import { PROFESSION_IDS } from "./registry";

test("getProfessionActiveSkillName returns non-empty for all professions", () => {
  for (const id of PROFESSION_IDS) {
    const name = getProfessionActiveSkillName(id);
    assert.equal(typeof name, "string");
    assert.ok(name.trim().length > 0);
  }
});

