import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "./codexDisplay";

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
    assert.equal(
      resolveCodexDisplayName({ id: "N-999", name: "N-999", type: "npc" }),
      "某位住户"
    );
    assert.equal(
      resolveCodexDisplayName({ id: "A-999", name: "A-999", type: "anomaly" }),
      "某类异常"
    );
  });

  it("buildCodexIntro 不含文档指针类开发者残片", () => {
    const intro = buildCodexIntro({ id: "N-010", type: "npc" });
    assert.ok(intro.length > 0);
    assert.ok(!intro.includes("majorNpcDeepCanon"));
    assert.ok(!intro.includes("详情见"));
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

