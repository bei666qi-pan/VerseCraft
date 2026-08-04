import test from "node:test";
import assert from "node:assert/strict";
import { getProfessionActiveSkillName } from "./benefits";
import { PROFESSION_IDS } from "./registry";

test("getProfessionActiveSkillName returns non-empty for all professions", () => {
  const knownNames = ["稳心定灯", "疾行断压", "征兆聚焦", "缓锋陈词", "断链重组"];
  for (const id of PROFESSION_IDS) {
    const name = getProfessionActiveSkillName(id);
    assert.equal(typeof name, "string");
    assert.ok(knownNames.includes(name), `"${name}" is not a known profession skill name`);
  }
});

