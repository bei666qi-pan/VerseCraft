import test from "node:test";
import assert from "node:assert/strict";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

test("private_story_action: scary words should pass (not global sensitive-word block)", async () => {
  const r = await moderateInputOnServer({
    scene: "private_story_action",
    text: "我想观察走廊尽头的血迹与屠夫的影子。",
    userIdHash: "u1",
    sessionIdHash: "s1",
    ipHash: "i1",
  });
  // Baidu may be disabled in env; either way the engine should not reject by default here.
  assert.notEqual(r.decision, "reject");
});

test("profile_input: empty => reject by precheck", async () => {
  const r = await moderateInputOnServer({
    scene: "profile_input",
    text: "   ",
    userIdHash: "u1",
  });
  assert.equal(r.decision, "reject");
});

test("feedback_input: obvious script payload => reject by precheck", async () => {
  const r = await moderateInputOnServer({
    scene: "feedback_input",
    text: "<script>alert(1)</script>",
    sessionIdHash: "s1",
  });
  assert.equal(r.decision, "reject");
});

test("private_story_action: contact info in private => fallback (soft rewrite)", async () => {
  const r = await moderateInputOnServer({
    scene: "private_story_action",
    text: "我想联系我微信号，问问你接下来怎么走。",
    userIdHash: "u1",
    sessionIdHash: "s1",
    ipHash: "i1",
  });
  assert.equal(r.decision, "fallback");
  // safetyRewriteForInput should remove obvious contact patterns.
  assert.ok(!String(r.text ?? "").includes("微信"), `rewritten=${String(r.text ?? "")}`);
  assert.ok(r.userMessage.length > 0);
});

test("public_publish_input: contact info => reject (fail-closed)", async () => {
  const r = await moderateInputOnServer({
    scene: "public_publish_input",
    text: "这段故事结尾加个QQ/微信联系吧。",
    userIdHash: "u1",
  });
  assert.equal(r.decision, "reject");
});

