import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: control preflight 预算命中必须快速放行（不等待 task timeout）", () => {
  // Phase-3 起 control preflight 已从 route.ts 抽离到 turnEngine/preflight.ts。
  // 契约仍有效：预算必须传进 parsePlayerIntent，winner 命中后立刻 abort。
  const candidates = [
    join(process.cwd(), "src/app/api/chat/route.ts"),
    join(process.cwd(), "src/lib/turnEngine/preflight.ts"),
  ];
  const content = candidates.map((p) => readFileSync(p, "utf8")).join("\n/*-*/\n");

  assert.ok(
    /parsePlayerIntent(?:Fn)?\(\{/.test(content) && content.includes("budgetMs:"),
    "missing budgetMs pass-through to parsePlayerIntent"
  );

  // 预算 winner 命中后必须 abort，走降级路径（pipelinePreflightFailed 保持 true）。
  assert.ok(content.includes("winner.tag === \"budget\""), "missing budget race branch");
  assert.ok(content.includes("hardAc.abort()"), "budget hit must abort preflight");
  assert.ok(content.includes("controlPreflightBudgetHit = true"), "must keep telemetry flag");
});

