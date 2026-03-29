import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNpcEpistemicProfile } from "./builders";
import { detectEpistemicAnomaly, inputMentionsFactContent } from "./detector";
import type { EpistemicSceneContext, KnowledgeFact, NpcEpistemicProfile } from "./types";
import { XINLAN_NPC_ID } from "./policy";

const now = "2026-01-01T00:00:00.000Z";

function scene(present: string[]): EpistemicSceneContext {
  return { presentNpcIds: present };
}

describe("detectEpistemicAnomaly", () => {
  it("玩家说出普通 NPC 不该知道的世界/校史碎片 → 质疑/警惕类反应", () => {
    const npcId = "N-020";
    const facts: KnowledgeFact[] = [
      {
        id: "w1",
        content: "旧校史档案馆记载闭环纠错链的七处锚点编号",
        scope: "world",
        sourceType: "system_canon",
        certainty: "confirmed",
        visibleTo: [],
        inferableByOthers: false,
        tags: [],
        createdAt: now,
      },
    ];
    const input = "我直接告诉你旧校史档案馆记载闭环纠错链的七处锚点编号";
    const r = detectEpistemicAnomaly({
      npcId,
      playerInput: input,
      allFacts: facts,
      scene: scene([npcId]),
      profile: buildNpcEpistemicProfile(npcId, { overrides: { remembersPlayerIdentity: "vague" } }),
      nowIso: now,
    });
    assert.equal(r.anomaly, true);
    assert.equal(r.reactionStyle, "suspicious");
    assert.equal(r.severity, "high");
    assert.ok(r.mustInclude.some((x) => x.includes("追问")));
  });

  it("玩家提到另一 NPC 的私密壳事实 → 当前 NPC 不能自然确认", () => {
    const npcId = "N-030";
    const facts: KnowledgeFact[] = [
      {
        id: "other",
        content: "电工老刘私下藏匿了备用配电间的第二把钥匙",
        scope: "npc",
        ownerId: "N-008",
        sourceType: "memory",
        certainty: "confirmed",
        visibleTo: ["N-008"],
        inferableByOthers: false,
        tags: [],
        createdAt: now,
      },
    ];
    const input = "我知道电工老刘私下藏匿了备用配电间的第二把钥匙";
    const r = detectEpistemicAnomaly({
      npcId,
      playerInput: input,
      allFacts: facts,
      scene: scene([npcId, "N-008"]),
      profile: buildNpcEpistemicProfile(npcId),
      nowIso: now,
    });
    assert.equal(r.anomaly, true);
    assert.equal(r.reactionStyle, "suspicious");
    assert.ok(r.forbiddenResponseTags.includes("confirm_secret_out_of_nowhere"));
  });

  it("玩家仅复述公共可见事实 → 不误判", () => {
    const npcId = "N-040";
    const facts: KnowledgeFact[] = [
      {
        id: "pub",
        content: "一楼大厅的灯昨晚整夜没关",
        scope: "public",
        sourceType: "memory",
        certainty: "confirmed",
        visibleTo: [],
        inferableByOthers: true,
        tags: [],
        createdAt: now,
      },
    ];
    const input = "大家都说一楼大厅的灯昨晚整夜没关";
    const r = detectEpistemicAnomaly({
      npcId,
      playerInput: input,
      allFacts: facts,
      scene: scene([npcId]),
      profile: buildNpcEpistemicProfile(npcId),
      nowIso: now,
    });
    assert.equal(r.anomaly, false);
  });

  it("相同越界措辞：欣蓝与普通 NPC 反应档位不同", () => {
    const facts: KnowledgeFact[] = [
      {
        id: "w2",
        content: "地下二层门闩的仪式性封印需要三名见证者在场",
        scope: "world",
        sourceType: "system_canon",
        certainty: "confirmed",
        visibleTo: [],
        inferableByOthers: false,
        tags: [],
        createdAt: now,
      },
    ];
    const input = "地下二层门闩的仪式性封印需要三名见证者在场对吧";
    const normal = detectEpistemicAnomaly({
      npcId: "N-050",
      playerInput: input,
      allFacts: facts,
      scene: scene(["N-050"]),
      profile: buildNpcEpistemicProfile("N-050", { overrides: { remembersPlayerIdentity: "vague" } }),
      nowIso: now,
    });
    const xinlan = detectEpistemicAnomaly({
      npcId: XINLAN_NPC_ID,
      playerInput: input,
      allFacts: facts,
      scene: scene([XINLAN_NPC_ID]),
      profile: buildNpcEpistemicProfile(XINLAN_NPC_ID),
      nowIso: now,
    });
    assert.equal(normal.anomaly, true);
    assert.equal(normal.reactionStyle, "suspicious");
    assert.equal(xinlan.anomaly, true);
    assert.equal(xinlan.reactionStyle, "defensive");
    assert.ok(xinlan.mustInclude.some((s) => s.includes("牵引")));
  });

  it("仅情绪残响策略的 NPC：表现为困惑路线且禁止精确细节", () => {
    const npcId = "N-060";
    const residueProfile: NpcEpistemicProfile = {
      npcId,
      isXinlanException: false,
      remembersPlayerIdentity: "none",
      remembersPastLoops: false,
      retainsEmotionalResidue: true,
      canRecognizeForbiddenKnowledge: false,
    };
    const facts: KnowledgeFact[] = [
      {
        id: "w3",
        content: "学生会档案室墙后有隐藏的监听线路走向图",
        scope: "world",
        sourceType: "memory",
        certainty: "confirmed",
        visibleTo: [],
        inferableByOthers: false,
        tags: [],
        createdAt: now,
      },
    ];
    const input = "学生会档案室墙后有隐藏的监听线路走向图你知不知道";
    const r = detectEpistemicAnomaly({
      npcId,
      playerInput: input,
      allFacts: facts,
      scene: scene([npcId]),
      profile: residueProfile,
      nowIso: now,
    });
    assert.equal(r.anomaly, true);
    assert.equal(r.reactionStyle, "confused");
    assert.ok(r.mustInclude.some((s) => s.includes("莫名熟悉")));
    assert.ok(r.forbiddenResponseTags.includes("precise_secret_detail"));
  });
});

describe("inputMentionsFactContent", () => {
  it("matches long substring", () => {
    assert.equal(
      inputMentionsFactContent("无关前缀七处锚点编号在后缀", "旧校史档案馆记载闭环纠错链的七处锚点编号"),
      true
    );
  });
});
