import test from "node:test";
import assert from "node:assert/strict";
import { buildControlPreflightSystemPrompt } from "@/lib/playRealtime/controlPreflightPrompt";

test("shared control preflight prompt retains the strict JSON contract", () => {
  const prompt = buildControlPreflightSystemPrompt(false);
  assert.match(prompt, /请严格以 JSON 格式输出/);
  assert.match(prompt, /"explore"\|"combat"\|"dialogue"/);
  assert.match(prompt, /未启用叙事增强/);
});
