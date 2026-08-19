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

test("removes direct dialogue attributed only to a door-gap voice when nobody is present", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: { narrative: "我贴近房门检查划痕。门缝里飘出一句：‘把钥匙留下。’我立刻退回走廊中央。" },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /把钥匙留下|飘出一句/);
  assert.match(String(out.narrative), /检查划痕.*退回走廊中央/s);
});

test("removes a young voice replying from the other side of a door", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我贴着门缝问：\"你是谁？\"门板那头安静了片刻，那道年轻嗓音又压着气音飘出来：\"你是活人？没灯，我出不去。\"我退回墙边。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /年轻嗓音|你是活人|没灯/);
  assert.match(String(out.narrative), /我退回墙边|没有在场人物/);
  assert.ok((out._commit_flags as string[]).includes("offscreen_npc_presence_removed_v1"));
});

test("keeps non-actor audio and explicit no-response observations", () => {
  for (const narrative of [
    "门后的录音机反复播放：‘请核对日期。’",
    "我敲了敲门，门后无人回应，只有管道里传来咕噜声。",
  ]) {
    const input = { narrative };
    assert.deepEqual(
      applyPresentNpcNarrativeBoundaryGuard({ dmRecord: input, clientState: { presentNpcIds: [] } }),
      input,
    );
  }
});

test("removes an unregistered human figure and corner-bracket dialogue from live prose", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "墙根下的铁门半开着，一条瘦长的人影倚在门框上。那人背对着我说：「你要走出去，就别数门牌。」我停在原地。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /人影|那人|别数门牌/);
  assert.match(String(out.narrative), /我停在原地/);
  assert.ok((out._commit_flags as string[]).includes("offscreen_npc_presence_removed_v1"));
});

test("removes a door-gap eye and quoted speech when no NPC is present", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "门缝里先漏出一句沙哑的问话：“找谁？”一只布满皱纹的眼睛从缝里露出来，隔着黑暗打量我。",
      codex_updates: [{ id: "N-011", name: "夜读老人" }],
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /找谁|眼睛|打量/);
  assert.deepEqual(out.codex_updates, []);
});

test("removes live pronoun beats and personified close-range voices with no present NPC", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我看见门后的绿灯。\n\n她没说完后半句。风停了。\n\n\"别看了。\"一个声音贴着我的后颈响起，很轻，\"那扇门后面，是你可以离开的地方。\"\n\n我退回墙边。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /她没说完|别看了|一个声音|你可以离开/);
  assert.match(String(out.narrative), /我看见门后的绿灯.*我退回墙边/s);
});

test("keeps player speech and personified voice when a registered NPC is present", () => {
  const input = {
    narrative: "我喊：\"有人吗？\"欣蓝的声音从门边响起：\"我在。\"",
  };
  assert.equal(
    applyPresentNpcNarrativeBoundaryGuard({
      dmRecord: input,
      clientState: { presentNpcIds: ["N-010"] },
    }),
    input,
  );
});

test("removes the live white-coat old-man appearance when no NPC is present", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我刚要再推，手腕突然被一只手按住。回头一看，楼梯口站着一个穿白大褂的老头，声音沙哑：\"那扇门，不是给你推的。\"我站在原地，门再没动静。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /白大褂|老头|不是给你推的/);
  assert.match(String(out.narrative), /我站在原地|没有在场人物/);
});

test("removes sudden unattributed speaker and dependent pronoun beat from the live trace", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我检查门框。\n\n\"你听见了吗。\"身后突然有人说话。\n\n我猛地回头。\n\n我顺着她的目光看过去，门框上刻着一行字。\n\n风从门缝吹来。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /你听见了吗|有人说话|她的目光/);
  assert.match(String(out.narrative), /我检查门框.*风从门缝吹来/s);
});

test("removes a personified rasping voice and backlit shadow when no NPC is present", () => {
  const out = applyPresentNpcNarrativeBoundaryGuard({
    dmRecord: {
      narrative: "我贴墙细听。走廊另一头，一个沙哑的嗓门贴着墙壁飘来：「你也听见了。」灯光一闪，一个瘦高的影子斜倚在门框里。他没有露出脸。我退回原地。",
    },
    clientState: { presentNpcIds: [] },
  });
  assert.doesNotMatch(String(out.narrative), /沙哑的嗓门|你也听见了|瘦高的影子|他没有露出脸/);
  assert.match(String(out.narrative), /我贴墙细听.*我退回原地/s);
});
