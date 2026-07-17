import test from "node:test";
import assert from "node:assert/strict";
import { applyPhysicalInjuryNarrativeGuard } from "./physicalInjuryNarrativeGuard";

test("removes newly invented wound sentence when no injury delta exists", () => {
  const out = applyPhysicalInjuryNarrativeGuard({
    narrative: "我检查了武器。手机屏映出脸侧的一小道擦伤，血已经凝住了。远处阴影仍在。",
    conflict_outcome: null,
  });
  assert.equal(out.narrative, "我检查了武器。远处阴影仍在。");
  assert.ok((out._commit_flags as string[]).includes("unsupported_physical_injury_prose_removed_v1"));
});

test("keeps wound prose when the same turn has a structured injury", () => {
  const input = {
    narrative: "脸侧留下了一道擦伤。",
    conflict_outcome: { injury_delta: { injuries: [{ type: "bruise", severity: "minor" }] } },
  };
  assert.deepEqual(applyPhysicalInjuryNarrativeGuard(input), input);
});

test("does not remove ordinary pain or weapon damage prose", () => {
  const input = { narrative: "虎口有些酸麻，铁管表面留下了一道凹痕。" };
  assert.deepEqual(applyPhysicalInjuryNarrativeGuard(input), input);
});

test("removes hand skin break and bleeding without structured injury", () => {
  const out = applyPhysicalInjuryNarrativeGuard({
    narrative: "我低头看自己的手——掌心磨破了皮，渗出血丝。铁管仍在手里。",
    conflict_outcome: null,
  });
  assert.equal(String(out.narrative).includes("渗出血丝"), false);
  assert.match(String(out.narrative), /铁管仍在手里/);
});
