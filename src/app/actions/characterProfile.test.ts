import test from "node:test";
import assert from "node:assert/strict";
import { validateCharacterProfile } from "@/app/actions/characterProfile";

test("validateCharacterProfile rejects too short name", async () => {
  const r = await validateCharacterProfile({ name: "A", personality: "冷静" });
  assert.equal(r.ok, false);
});

test("validateCharacterProfile accepts normal input", async () => {
  const r = await validateCharacterProfile({ name: "黎川", personality: "冷静" });
  assert.equal(r.ok, true);
});

