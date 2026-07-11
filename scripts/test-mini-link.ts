#!/usr/bin/env tsx
/**
 * 极简 Stage A 测试 — 直接验证 DeepSeek → SUT 链路
 * 不依赖 orchestrator，每步都打印 + 强制 flush
 */
import { config } from "dotenv";
import { writeFileSync } from "fs";
config({ path: ".env.local" });

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(msg);
  writeFileSync("/tmp/stageA-mini.log", line + "\n", { flag: "a" });
}

async function main() {
log("=== 极简 Stage A 测试开始 ===");

const BASE_URL = process.env.VERSE_CRAFT_URL ?? "http://localhost:666";
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://ai.yxkl.cloud/v1";
const MODEL = process.env.DEEPSEEK_MODEL ?? "ac-deepseek-v4-flash";

log(`BASE_URL=${BASE_URL}`);
log(`API_BASE=${API_BASE}`);
log(`MODEL=${MODEL}`);

// 1. 检查 SUT
log("\n[1] 检查 SUT...");
try {
  const res = await fetch(`${BASE_URL}/`);
  log(`  SUT: HTTP ${res.status}`);
} catch (e: any) {
  log(`  SUT FAIL: ${e.message}`);
  process.exit(1);
}

// 2. 测试 DeepSeek
log("\n[2] 测试 DeepSeek API...");
try {
  const resp = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "你是一个冒险者，在古墓中苏醒。每次行动用10-30字表达。" },
        { role: "user", content: "请以玩家身份输入第一步动作。" },
      ],
      max_tokens: 500,
      temperature: 0.8,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await resp.json() as any;
  const action = data.choices?.[0]?.message?.content || "(empty)";
  log(`  DeepSeek OK: "${action.slice(0, 80)}"`);
  log(`  耗时: ${data.usage?.total_tokens ?? "?"} tokens`);
} catch (e: any) {
  log(`  DeepSeek FAIL: ${e.message}`);
  process.exit(1);
}

// 3. 测试 SUT /api/chat
log("\n[3] 测试 SUT /api/chat...");
try {
  const sessionId = `test-${Date.now()}`;
  const resp = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      messages: [{ role: "user", content: "我谨慎地环顾四周，看看周围有什么异常。" }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  log(`  POST /api/chat: HTTP ${resp.status} ${resp.statusText}`);

  // Parse SSE
  const text = await resp.text();
  const finalMatch = text.match(/__VERSECRAFT_FINAL__:(.+?)(?:\n\n|$)/s);
  if (finalMatch) {
    const final = JSON.parse(finalMatch[1]);
    const narrative = final.narrative || "(no narrative)";
    log(`  ✅ SSE OK! narrative=${narrative.slice(0, 100)}`);
    log(`  DM keys: ${Object.keys(final).join(", ")}`);
  } else {
    log(`  ⚠️ 未找到 final 帧，text 长=${text.length}，前500字: ${text.slice(0, 500)}`);
  }
} catch (e: any) {
  log(`  SUT /api/chat FAIL: ${e.message}`);
  process.exit(1);
}

// 4. 3 步完整循环
log("\n[4] 3 步完整循环...");
for (let step = 0; step < 3; step++) {
  log(`\n--- Step ${step} ---`);

  // 4a. DeepSeek
  let action: string;
  try {
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "你是一个冒险者，在古墓中苏醒。每次行动用10-30字表达。" },
          { role: "user", content: `第${step + 1}步：请以玩家身份输入动作。` },
        ],
        max_tokens: 500,
        temperature: 0.8,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    action = data.choices?.[0]?.message?.content || "向前走";
    log(`  DeepSeek: "${action.slice(0, 60)}"`);
  } catch (e: any) {
    log(`  DeepSeek FAIL: ${e.message}`);
    break;
  }

  // 4b. SUT
  try {
    const resp = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: `test-${Date.now()}-${step}`,
        messages: [{ role: "user", content: action }],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await resp.text();
    const finalMatch = text.match(/__VERSECRAFT_FINAL__:(.+?)(?:\n\n|$)/s);
    if (finalMatch) {
      const final = JSON.parse(finalMatch[1]);
      log(`  SUT OK: narrative="${(final.narrative || "").slice(0, 60)}"`);
    } else {
      log(`  SUT: 无 final 帧`);
    }
  } catch (e: any) {
    log(`  SUT FAIL: ${e.message}`);
  }

  // 延迟
  await new Promise(r => setTimeout(r, 2000));
}

log("\n=== ✅ 极简测试完成 ===");
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
