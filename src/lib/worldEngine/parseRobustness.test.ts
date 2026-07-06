import assert from "node:assert/strict";
import test from "node:test";
import { parseWorldEngineDeltaJson } from "./contracts";

/**
 * 回归防线：离线 reasoner（vc-reasoner / 思考类模型）在强制 JSON 时，真实输出经常带
 * markdown 围栏、前后缀说明文字或尾逗号。修复前 parseWorldEngineDeltaJson 用裸 JSON.parse，
 * 这类输出一律解析失败 → world director 整轮丢弃 → agenda 永不落地（沦为空谈）。
 * 修复后应能兜底修复并成功产出 director plan 与 agenda。
 */

const VALID_PLAN = {
  schema_version: "director_plan_v1",
  director_intent: "维持节奏，不削弱玩家自主性",
  current_phase: "build_up",
  target_phase: "pressure",
  risk_assessment: { agency_risk: "low", continuity_risk: "low", spoiler_risk: "low", safety_risk: "low" },
  reveal_policy: "hint_only",
  world_events_to_schedule: [
    {
      event_code: "NIGHT_MARKET_STIR",
      title: "夜市骚动",
      due_in_turns: 1,
      ttl_turns: 6,
      priority: "medium",
      injection_hint: "远处夜市传来一阵不寻常的骚动，可自然引出。",
      agency_constraints: ["玩家可以选择无视"],
      forbidden_outcomes: ["不得强制玩家前往"],
    },
  ],
};

test("干净 JSON：正常解析出 agenda", () => {
  const delta = parseWorldEngineDeltaJson(JSON.stringify(VALID_PLAN));
  assert.ok(delta, "干净 JSON 应解析成功");
  assert.equal(delta!.world_events_to_schedule.length, 1);
  assert.equal(delta!.world_events_to_schedule[0]!.event_code, "NIGHT_MARKET_STIR");
  assert.equal(delta!.agenda_write_allowed, true);
});

test("markdown 围栏 + 尾逗号：修复前失败，修复后救回 agenda", () => {
  const messy =
    "```json\n" +
    JSON.stringify(VALID_PLAN, null, 2).replace(/\}\s*$/, ",\n}") +
    "\n```";
  // 证明这类输出对裸 JSON.parse 一定失败（即修复前的行为会返回 null）
  assert.throws(() => JSON.parse(messy), "裸 JSON.parse 应失败");
  const delta = parseWorldEngineDeltaJson(messy);
  assert.ok(delta, "兜底修复后应解析成功");
  assert.equal(delta!.world_events_to_schedule[0]!.event_code, "NIGHT_MARKET_STIR");
  assert.equal(delta!.agenda_write_allowed, true);
});

test("前言说明文字 + 对象：提取并解析", () => {
  const messy = "好的，根据当前信号，这是导演计划：\n" + JSON.stringify(VALID_PLAN) + "\n（仅供主笔参考）";
  assert.throws(() => JSON.parse(messy));
  const delta = parseWorldEngineDeltaJson(messy);
  assert.ok(delta);
  assert.equal(delta!.world_events_to_schedule.length, 1);
});

test("纯垃圾输入仍返回 null（不误报成功）", () => {
  assert.equal(parseWorldEngineDeltaJson("模型这次没有输出任何 JSON"), null);
  assert.equal(parseWorldEngineDeltaJson(""), null);
});
