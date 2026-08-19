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
      resolveCodexDisplayName({ id: "XQ-N001", name: "XQ-N001", type: "npc" }),
      "顾玄岳"
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

  it("name and intro lookup reject cross-world registry ids", () => {
    assert.equal(
      resolveCodexDisplayName({ id: "N-008", name: "N-008", type: "npc" }, "xingni_taichu"),
      "某位住户",
    );
    assert.equal(
      resolveCodexDisplayName({ id: "XQ-N002", name: "XQ-N002", type: "npc" }, "dark_moon_prologue"),
      "某位住户",
    );
    assert.equal(buildCodexIntro({ id: "N-008", type: "npc" }, "xingni_taichu"), "");
    assert.equal(buildCodexIntro({ id: "XQ-N002", type: "npc" }, "dark_moon_prologue"), "");
  });

  it("buildCodexIntro 不含文档指针类开发者残片", () => {
    const intro = buildCodexIntro({ id: "N-010", type: "npc" });
    assert.ok(intro.length > 0);
    assert.ok(!intro.includes("majorNpcDeepCanon"));
    assert.ok(!intro.includes("详情见"));
  });

  it("buildCodexIntro uses the registered Xingni role and realm", () => {
    assert.equal(buildCodexIntro({ id: "XQ-N003", type: "npc" }), "神工坊炼器师，修为筑基中期。");
  });

  it("computeRelationshipLabel follows default rules", () => {
    assert.equal(computeRelationshipLabel({ type: "npc", favorability: -30 }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", fear: 45 }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", betrayalFlags: ["x"] }), "敌人");
    assert.equal(computeRelationshipLabel({ type: "npc", trust: 40 }), "盟友");
    assert.equal(computeRelationshipLabel({ type: "npc", favorability: 50 }), "盟友");
    assert.equal(computeRelationshipLabel({ type: "npc" }), "暂无");
    assert.equal(computeRelationshipLabel({ type: "anomaly" }), "暂无");
  });
});
