import test from "node:test";
import assert from "node:assert/strict";
import { enableEpistemicValidator, enableNpcResidue } from "./featureFlags";

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
