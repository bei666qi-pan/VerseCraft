import assert from "node:assert/strict";
import test from "node:test";
import { requestClientOptionsRegenEvidence, shouldRequestClientOptionsRegen } from "./clientOptionsRegenEvidence";
import { createInitialStateSnapshot } from "./playthrough/invariants";

function sse(value: unknown): Response {
  return new Response(`data: __VERSECRAFT_FINAL__:${JSON.stringify(value)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("client options evidence accepts four real options-only choices after the UI quality gates", async () => {
  const calls: RequestInit[] = [];
  const result = await requestClientOptionsRegenEvidence({
    baseUrl: "http://example.test",
    sessionId: "trace-test",
    playerAction: "观察走廊尽头的门缝",
    narrative: "走廊尽头的门缝透出微光，墙角有一串潮湿脚印。",
    state: createInitialStateSnapshot({ playerLocation: "旧公寓三楼走廊" }),
    fetcher: async (_url, init) => {
      calls.push(init ?? {});
      return sse({ ok: true, options: ["检查门缝", "沿走廊撤退", "用手机照亮墙角", "顺着脚印靠近墙角"] });
    },
  });
  assert.equal(result.applied, true);
  assert.equal(result.complete, true);
  assert.equal(result.options.length, 4);
  assert.equal(result.attempts, 1);
  assert.equal((calls[0]?.headers as Record<string, string>)["X-VerseCraft-Chat-Purpose"], "options_regen_only");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-versecraft-output-language"], "zh-CN");
  assert.match(String(calls[0]?.body), /"clientPurpose":"options_regen_only"/);
});

test("client-equivalent repair starts only below the four-choice target", () => {
  assert.equal(shouldRequestClientOptionsRegen([]), true);
  assert.equal(shouldRequestClientOptionsRegen(["检查门缝", "沿走廊撤退", "照亮墙角"]), true);
  assert.equal(shouldRequestClientOptionsRegen(["检查门缝", "沿走廊撤退", "照亮墙角", "呼叫老刘"]), false);
});

test("client options evidence preserves two real gated choices as playable without claiming full completion", async () => {
  const result = await requestClientOptionsRegenEvidence({
    baseUrl: "http://example.test",
    sessionId: "trace-test",
    playerAction: "观察走廊尽头的门缝",
    narrative: "走廊尽头的门缝透出微光，墙角有一串潮湿脚印。",
    state: createInitialStateSnapshot({ playerLocation: "旧公寓三楼走廊" }),
    fetcher: async () => sse({ ok: true, options: ["检查门缝", "用手机照亮墙角"] }),
  });
  assert.equal(result.applied, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.options, ["检查门缝", "用手机照亮墙角"]);
  assert.equal(result.failureReason, null);
});

test("client options evidence accepts aliases of a concrete object already visible in narrative", async () => {
  const result = await requestClientOptionsRegenEvidence({
    baseUrl: "http://example.test",
    sessionId: "trace-test",
    playerAction: "查看门缝里的纸片",
    narrative: "一张泛黄纸片从门缝边缘露出来，旁边的裂纹还在渗水。",
    state: createInitialStateSnapshot({ playerLocation: "旧公寓三楼走廊" }),
    fetcher: async () => sse({ ok: true, options: ["抽出那张纸条查看", "沿着裂缝检查墙面"] }),
  });

  assert.equal(result.applied, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.options, ["抽出那张纸条查看", "沿着裂缝检查墙面"]);
});

test("client options evidence rejects a single real choice as insufficient", async () => {
  const result = await requestClientOptionsRegenEvidence({
    baseUrl: "http://example.test",
    sessionId: "trace-test",
    playerAction: "观察门缝",
    narrative: "门缝里传来脚步声。",
    state: createInitialStateSnapshot({ playerLocation: "旧公寓三楼走廊" }),
    fetcher: async () => sse({ ok: true, options: ["检查门缝"] }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.options, []);
  assert.equal(result.failureReason, "insufficient_options_after_repair");
});
