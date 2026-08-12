import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("supported evaluation commands are non-mutating and autonomous writer commands are absent", () => {
  for (const name of ["eval:campaign", "eval:baseline", "eval:report", "eval:verify:strict"]) {
    assert.equal(typeof pkg.scripts[name], "string", `${name} should exist`);
  }

  for (const name of [
    "self-improve:supervise",
    "self-improve:calibration",
    "verse:ds",
    "autoops:local-codex",
    "autoops:local-loop",
    "autoops:start:codex",
    "autoops:start:deepseek",
  ]) {
    assert.equal(pkg.scripts[name], undefined, `${name} must remain retired`);
  }

  const campaignCommand = pkg.scripts["eval:campaign"];
  assert.doesNotMatch(campaignCommand, /codex|claude|repair-backend|supervis/i);
});
