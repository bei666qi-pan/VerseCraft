import assert from "node:assert/strict";
import test from "node:test";
import { extractNarrative } from "@/features/play/stream/dmParse";
import { accumulateDmFromSseEvent } from "@/features/play/stream/sseFrame";
import {
  buildTurnNarrativePrelude,
  buildTurnNarrativePreludeFrame,
} from "./turnNarrativePrelude";

test("ordinary Writer turns expose concrete action-grounded prose before provider TTFT", () => {
  const prelude = buildTurnNarrativePrelude(
    "我环顾一楼大厅，确认此刻能看见的门、灯光和通道。",
    "dark_moon_prologue",
  );

  assert.match(prelude, /目光|观察|确认/);
  assert.doesNotMatch(prelude, /成功|发现了|已经/);

  const frame = buildTurnNarrativePreludeFrame(prelude);
  const streamed = accumulateDmFromSseEvent(`data: ${frame}`, "");
  assert.equal(extractNarrative(streamed.raw), prelude);

  const final = '{"narrative":"最终叙事","is_action_legal":true}';
  const committed = accumulateDmFromSseEvent(`data: __VERSECRAFT_FINAL__:${final}`, streamed.raw);
  assert.equal(committed.raw, final);
  assert.equal(extractNarrative(committed.raw), "最终叙事");
});

test("prelude describes only an attempted action and never invents a world result", () => {
  assert.match(buildTurnNarrativePrelude("我向柳三娘询问县里的消息", "xingni-taichu"), /开口|询问/);
  assert.match(buildTurnNarrativePrelude("我沿走廊谨慎前进", "dark_moon_prologue"), /脚步|前进|通行/);
  assert.match(buildTurnNarrativePrelude("做一件无法预先分类的事", "dark_moon_prologue"), /行动|反馈/);
});
