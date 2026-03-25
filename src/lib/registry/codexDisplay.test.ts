import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRelationshipLabel, resolveCodexDisplayName } from "./codexDisplay";

describe("codexDisplay", () => {
  it("resolveCodexDisplayName maps stable ids to registry names", () => {
    assert.equal(
      resolveCodexDisplayName({ id: "N-015", name: "N-015", type: "npc" }),
      "麟泽"
    );
    assert.equal(
      resolveCodexDisplayName({ id: "A-001", name: "A-001", type: "anomaly" }),
      "时差症候群"
    );
  });

  it("computeRelationshipLabel follows default rules", () => {
    assert.equal(computeRelationshipLabel({ type: "npc", romanceStage: "bonded" }), "恋人");
    assert.equal(computeRelationshipLabel({ type: "npc", favorability: -30 }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", fear: 45 }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", betrayalFlags: ["x"] }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", trust: 40 }), "盟友");
    assert.equal(computeRelationshipLabel({ type: "npc", favorability: 50 }), "盟友");
    assert.equal(computeRelationshipLabel({ type: "npc" }), "暂无");
    assert.equal(computeRelationshipLabel({ type: "anomaly" }), "暂无");
  });
});

