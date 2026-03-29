import test from "node:test";
import assert from "node:assert/strict";
import {
  enableEpistemicValidator,
  enableNpcConsistencyValidator,
  enableNpcResidue,
  enableXinlanHighPrivilege,
  getEpistemicRolloutFlags,
} from "./featureFlags";

test("VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR 优先于旧 POST_GUARD", () => {
  process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = "0";
  process.env.VERSECRAFT_EPISTEMIC_POST_GUARD = "1";
  try {
    assert.equal(enableEpistemicValidator(), false);
  } finally {
    delete process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
    delete process.env.VERSECRAFT_EPISTEMIC_POST_GUARD;
  }
});

test("未设新开关时 POST_GUARD=0 关闭 validator", () => {
  process.env.VERSECRAFT_EPISTEMIC_POST_GUARD = "0";
  try {
    assert.equal(enableEpistemicValidator(), false);
  } finally {
    delete process.env.VERSECRAFT_EPISTEMIC_POST_GUARD;
  }
});

test("VERSECRAFT_ENABLE_NPC_RESIDUE 优先于旧 GAMEFEEL", () => {
  process.env.VERSECRAFT_ENABLE_NPC_RESIDUE = "0";
  process.env.VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL = "1";
  try {
    assert.equal(enableNpcResidue(), false);
  } finally {
    delete process.env.VERSECRAFT_ENABLE_NPC_RESIDUE;
    delete process.env.VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL;
  }
});

test("VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE 优先于 STRONG_MEMORY", () => {
  process.env.VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE = "0";
  process.env.VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY = "1";
  try {
    assert.equal(enableXinlanHighPrivilege(), false);
    assert.equal(getEpistemicRolloutFlags().enableXinlanStrongMemory, false);
  } finally {
    delete process.env.VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE;
    delete process.env.VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY;
  }
});

test("NPC_CONSISTENCY_VALIDATOR 可与 EPISTEMIC_VALIDATOR 独立（仅设后者为 0 时叙事层仍可按开关）", () => {
  process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = "0";
  process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR = "1";
  try {
    assert.equal(enableEpistemicValidator(), false);
    assert.equal(enableNpcConsistencyValidator(), true);
  } finally {
    delete process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
    delete process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR;
  }
});
