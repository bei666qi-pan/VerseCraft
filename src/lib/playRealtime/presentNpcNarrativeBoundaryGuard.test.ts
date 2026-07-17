import test from "node:test";
import assert from "node:assert/strict";
import { applyPresentNpcNarrativeBoundaryGuard } from "./presentNpcNarrativeBoundaryGuard";

test("removes direct appearance and dialogue for registered but absent NPC", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我挥动铁管压向阴影。\n\n一个灰衣女孩走近：“别靠太近。”\n\n她侧过头：“我叫欣蓝。”\n\n阴影缩回墙缝。",
      codex_updates: [{ id: "N-010", name: "欣蓝" }],
    },
    clientState: { presentNpcIds: [] },
  });
  assert.equal(String(out.narrative).includes("欣蓝"), false);
  assert.equal(String(out.narrative).includes("女孩"), false);
  assert.match(String(out.narrative), /挥动铁管.*阴影缩回/s);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("offscreen_npc_presence_removed_v1"));
});

test("keeps present NPC dialogue", () => {
  const input = { narrative: "欣蓝走近一步：“别靠太近。”", codex_updates: [{ id: "N-010", name: "欣蓝" }] };
  assert.deepEqual(applyPresentNpcNarrativeBoundaryGuard({ dmRecord: input, clientState: { presentNpcIds: ["N-010"] } }), input);
});

test("keeps offscreen memory mention without direct presence", () => {
  const input = { narrative: "我想起欣蓝曾经留下的提醒，继续检查门锁。" };
  assert.deepEqual(applyPresentNpcNarrativeBoundaryGuard({ dmRecord: input, clientState: { presentNpcIds: [] } }), input);
});

test("removes an untracked generic cleaner without deleting the player scene", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: { narrative: "我检查走廊里的灯。身后保洁阿姨的扫帚声突然停了。墙缝里的阴影仍在。" },
    clientState: { presentNpcIds: [] },
  });
  assert.equal(String(out.narrative), "我检查走廊里的灯。墙缝里的阴影仍在。");
});

test("removes offscreen NPC aliases and their dangling dialogue", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: { narrative: "一个中年男人站在拐角。“下来找我。”他转身就走。老刘在黑暗里说了一句。我仍站在原地。" },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /中年男人|老刘|下来找我/);
  assert.match(String(out.narrative), /我仍站在原地/);
});
