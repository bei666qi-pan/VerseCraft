import test from "node:test";
import assert from "node:assert/strict";
import { getVerseCraftStyleProfile } from "./styleBible";
import { validateNarrativeStyle, type NarrativeStyleIssueCode } from "./styleValidator";

const styleProfile = getVerseCraftStyleProfile();

function codes(text: string, turnMode?: string): NarrativeStyleIssueCode[] {
  return validateNarrativeStyle({
    narrative: text,
    styleProfile,
    focus: "investigate",
    turnMode,
  }).issues.map((issue) => issue.code);
}

test("validateNarrativeStyle flags system broadcast register", () => {
  assert.ok(codes("系统提示：本回合判定成功，你获得了钥匙。").includes("mechanical_exposition"));
});

test("validateNarrativeStyle flags explicit forbidden phrases", () => {
  const hitCodes = codes("玩家输入被系统判定为有效。任务已完成，奖励已发放。");
  assert.ok(hitCodes.includes("forbidden_phrase_hit"));
  assert.ok(hitCodes.includes("mechanical_exposition"));
});

test("validateNarrativeStyle flags NPC dialogue that over-explains truth", () => {
  const hitCodes = codes(
    "她说：“这座公寓的真相就是循环，根因来自校源机制，所以所有人都必须遵守规则，否则答案会被重置。”墙灯轻轻一晃。"
  );
  assert.ok(hitCodes.includes("dialogue_over_explains"));
});

test("validateNarrativeStyle accepts an investigation passage in profile", () => {
  const report = validateNarrativeStyle({
    narrative: "门缝里没有风，灰却向外走。我蹲下去，看见鞋印停在门内半寸。下一秒，楼上有人停住了脚步。",
    styleProfile,
    focus: "investigate",
  });
  assert.equal(report.ok, true);
});

test("validateNarrativeStyle accepts restrained dialogue", () => {
  const report = validateNarrativeStyle({
    narrative: "“别问楼上。”她把钥匙推回我掌心。门后的灯灭了一下，她没有再说第二遍。",
    styleProfile,
    focus: "dialogue",
  });
  assert.equal(report.ok, true);
});

test("validateNarrativeStyle flags narrative_only ending without hook", () => {
  const hitCodes = codes("我把门关好，确认走廊里没有任何问题。事情到此为止。", "narrative_only");
  assert.ok(hitCodes.includes("hook_missing"));
});

test("validateNarrativeStyle does not flag mixed short and medium rhythm", () => {
  const report = validateNarrativeStyle({
    narrative: "灯灭了。我停在原地，听见楼上传来一声很轻的笑。门牌慢慢发冷。有人在背后念出了我的名字。",
    styleProfile,
    focus: "investigate",
    turnMode: "decision_required",
  });
  assert.equal(report.ok, true);
});
