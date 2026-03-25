import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("play page: waiting_upstream 语义提示仅在等待阶段出现，首个流式 chunk 到来后让位给真实叙事", () => {
  const p = join(process.cwd(), "src/app/play/page.tsx");
  const content = readFileSync(p, "utf8");

  // 语义提示必须绑定 streamPhase，避免在 streaming_body 期间抢占叙事。
  assert.ok(
    content.includes("semanticWaitingKind={streamPhase === \"waiting_upstream\" ? waitingHintKind : null}"),
    "semanticWaitingKind must be gated by streamPhase === waiting_upstream"
  );

  // 前端在读到首个非空 data: 事件后会切换到 streaming_body（确保等待态自然结束）。
  assert.ok(content.includes("setStreamPhase(\"streaming_body\")"), "missing streaming_body transition");
});

