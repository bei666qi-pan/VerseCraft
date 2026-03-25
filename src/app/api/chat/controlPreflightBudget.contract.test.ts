import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: control preflight 预算命中必须快速放行（不等待 task timeout）", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");

  // 预算必须传递到 parsePlayerIntent（让预检本体可被更早 abort）。
  assert.ok(
    content.includes("parsePlayerIntent({") && content.includes("budgetMs:"),
    "missing budgetMs pass-through to parsePlayerIntent"
  );

  // 预算 winner 命中后必须 abort，走降级路径（pipelinePreflightFailed 保持 true）。
  assert.ok(content.includes("winner.tag === \"budget\""), "missing budget race branch");
  assert.ok(content.includes("hardAc.abort()"), "budget hit must abort preflight");
  assert.ok(content.includes("controlPreflightBudgetHit = true"), "must keep telemetry flag");
});

