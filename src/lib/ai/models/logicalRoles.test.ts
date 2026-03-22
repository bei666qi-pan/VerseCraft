import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_LOGICAL_ROLES,
  legacyVendorModelIdToRole,
  normalizeAiLogicalRole,
  parseRoleChain,
} from "@/lib/ai/models/logicalRoles";

test("AI_LOGICAL_ROLES has four roles", () => {
  assert.deepEqual([...AI_LOGICAL_ROLES].sort(), ["control", "enhance", "main", "reasoner"]);
});

test("normalizeAiLogicalRole accepts canonical names", () => {
  assert.equal(normalizeAiLogicalRole("main"), "main");
  assert.equal(normalizeAiLogicalRole("CONTROL"), "control");
  assert.equal(normalizeAiLogicalRole("gpt-4"), null);
  assert.equal(normalizeAiLogicalRole(""), null);
  assert.equal(normalizeAiLogicalRole(undefined), null);
});

test("legacyVendorModelIdToRole maps old env ids", () => {
  assert.equal(legacyVendorModelIdToRole("deepseek-v3.2"), "main");
  assert.equal(legacyVendorModelIdToRole("glm-5-air"), "control");
  assert.equal(legacyVendorModelIdToRole("deepseek-reasoner"), "reasoner");
  assert.equal(legacyVendorModelIdToRole("MiniMax-M2.7-highspeed"), "enhance");
});

test("parseRoleChain parses comma list", () => {
  assert.deepEqual(parseRoleChain("main, control", ["main"]), ["main", "control"]);
});
