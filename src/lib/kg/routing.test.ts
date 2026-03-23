import { test } from "node:test";
import assert from "node:assert/strict";
import { routeUserInput } from "./routing";

test("云海城特产星光草 → PUBLIC_CANDIDATE", () => {
  const r = routeUserInput("云海城特产星光草");
  assert.equal(r.kind, "PUBLIC_CANDIDATE");
  assert.ok(r.confidence >= 0.5);
  assert.ok(r.reasons.some((x) => x.includes("特产") || x.startsWith("pattern:assertion")));
});

test("我拔了村长的胡子 → PRIVATE_FACT", () => {
  const r = routeUserInput("我拔了村长的胡子");
  assert.equal(r.kind, "PRIVATE_FACT");
  assert.ok(r.confidence >= 0.5);
  assert.ok(r.reasons.some((x) => x.startsWith("first_person:")));
});

test("云海城在哪里 → CODEX_QUERY", () => {
  const r = routeUserInput("云海城在哪里");
  assert.equal(r.kind, "CODEX_QUERY");
  assert.ok(r.reasons.length > 0);
});

test("空输入 → UNKNOWN", () => {
  const r = routeUserInput("   ");
  assert.equal(r.kind, "UNKNOWN");
});
