import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorAgendaHintBlock, type ServerDirectorAgendaHint } from "./serverHint";

test("buildDirectorAgendaHintBlock: returns non-empty text for due agenda", () => {
  const agenda: ServerDirectorAgendaHint[] = [
    {
      eventCode: "EVT_WATER_WARNING",
      title: "红色自来水出现预兆",
      injectionHint: "水龙头发出异响，管道隐约传来脉搏般的声音。",
      triggerConditions: ["玩家靠近洗手间或厨房"],
      agencyConstraints: ["不得强制玩家喝水"],
      forbiddenOutcomes: ["不得直接告知管道生物真相"],
    },
  ];
  const block = buildDirectorAgendaHintBlock(agenda);
  assert.ok(block.length > 0, "block should be non-empty");
  assert.ok(block.includes("后台导演提示"), "should contain director hint header");
  assert.ok(block.includes("EVT_WATER_WARNING"), "should include event code");
  assert.ok(block.includes("红色自来水出现预兆"), "should include title");
});

test("buildDirectorAgendaHintBlock: returns empty for empty agenda", () => {
  const block = buildDirectorAgendaHintBlock([]);
  assert.equal(block, "");
});

test("buildDirectorAgendaHintBlock: respects maxChars limit", () => {
  const agenda: ServerDirectorAgendaHint[] = [
    {
      eventCode: "EVT_LONG",
      title: "测试事件",
      injectionHint: "A".repeat(300),
    },
  ];
  const block = buildDirectorAgendaHintBlock(agenda, { maxChars: 400 });
  assert.ok(block.length <= 400, "should respect maxChars");
});
