import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeNarrativeLeak,
  hasProtocolLeakSignature,
  sanitizeNarrativeLeakageForFinal,
  stripTrailingLeakedObject,
} from "@/lib/playRealtime/protocolGuard";

test("protocolGuard: detect leaked DM keys in narrative", () => {
  assert.equal(hasProtocolLeakSignature('正文... {"is_action_legal":true}'), true);
  assert.equal(hasProtocolLeakSignature("正常叙事，没有协议键。"), false);
});

test("protocolGuard: strip trailing leaked object", () => {
  const input = "你看见门后有光。\n\n{\"is_action_legal\":true,\"sanity_damage\":0}";
  const out = stripTrailingLeakedObject(input);
  assert.equal(out, "你看见门后有光。");
});

test("protocolGuard: detect excessive escaped protocol residue", () => {
  const analysis = analyzeNarrativeLeak('文本\\n\\n\\n\\n\\n\\n\\"a\\" \\"b\\" \\"c\\" \\"d\\"');
  assert.equal(analysis.hasLeak, true);
  assert.equal(analysis.flags.includes("excessive_escape_sequences"), true);
});

test("protocolGuard: sanitize and degrade leaked narrative", () => {
  const out = sanitizeNarrativeLeakageForFinal('正文 {"is_action_legal":true,"consumes_time":false}');
  assert.equal(out.degraded, true);
  assert.equal(out.narrative.includes("协议污染"), true);
});

test("protocolGuard: strips minimax tool_call blocks from narrative", () => {
  const raw = [
    "我抬起头，灯管嗡了一声。",
    "",
    "<minimax:tool_call>",
    "<invoke name=\"b1_node_ref\"/>",
    "<invoke name=\"npc-015_baseline\"/>",
    "</minimax:tool_call>",
    "",
    "墙面像被水擦过一遍。",
  ].join("\n");
  const out = sanitizeNarrativeLeakageForFinal(raw);
  assert.equal(out.degraded, false);
  assert.ok(!out.narrative.includes("minimax:tool_call"));
  assert.ok(!out.narrative.includes("<invoke"));
  assert.ok(out.narrative.includes("灯管"));
});
