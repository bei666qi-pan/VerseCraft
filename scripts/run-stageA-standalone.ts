#!/usr/bin/env tsx
/**
 * Stage A Standalone
 * 真实游玩 ⇒ SUT /api/chat 完整 pipeline
 *
 * v4 串行 + 自适应退避 (respect 网关 ~30 RPM)
 * - 每步 ~8s delay + 3~8s SUT = ~15s/步 → 4 步/分 → ~8 RPM（远低于 30 阈值）
 * - 检测到 429/CHAIN_EXHAUSTED 立即退避 60s
 * - 14 场景 × 1000 步 × ~16s ≈ 15h/场景 → 约 8-10 天全部完成
 *   ⚠️ 可改 MAX_STEPS=200 压缩到 ~2 天内完成
 */
import { config } from "dotenv";
import { writeFileSync } from "fs";
config({ path: ".env.local" });

const LOGFILE = "/tmp/stageA-standalone.log";

function log(msg: string) {
  console.log(msg);
  writeFileSync(LOGFILE, `[${new Date().toISOString()}] ${msg}\n`, { flag: "a" });
}

const BASE_URL = process.env.VERSE_CRAFT_URL ?? "http://localhost:666";
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE = process.env.DEEPSEEK_BASE_URL ?? "https://ai.yxkl.cloud/v1";
const MODEL = process.env.DEEPSEEK_MODEL ?? "ac-deepseek-v4-flash";
const MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "100", 10);
const STEP_DELAY = parseInt(process.env.STEP_DELAY ?? "8000", 10);

interface ScenarioConfig {
  id: string;
  systemPrompt: string;
  personName: string;
}

const SCENARIOS: ScenarioConfig[] = [
  { id: "weapon-lifecycle-speedrunner", systemPrompt: "你是一个游戏速通高手，熟悉各种武器机制。你在古墓中醒来，目标是最快收集并使用武器。行动简洁果断，10-30字。", personName: "速通玩家" },
  { id: "weapon-lifecycle-explorer", systemPrompt: "你是一个谨慎的探索者，喜欢仔细检查周围环境。你在古墓中醒来，会仔细搜索每间房间寻找武器和道具。行动具体，10-30字。", personName: "探索者" },
  { id: "weapon-lifecycle-collector", systemPrompt: "你是一个收藏家，对武器特别感兴趣。你在古墓中醒来，目标是收集尽可能多的武器。行动有条理，10-30字。", personName: "收藏家" },
  { id: "weapon-combat-speedrunner", systemPrompt: "你是一个战斗高手，在古墓中醒来，会积极寻找敌人测试武器。行动果断好战，10-30字。", personName: "战斗速通者" },
  { id: "weapon-combat-explorer", systemPrompt: "你是一个谨慎的探索者，在古墓中醒来。你会在战斗中测试武器性能但避免不必要冒险。行动谨慎务实，10-30字。", personName: "战斗探索者" },
  { id: "profession-progression-speedrunner", systemPrompt: "你是一个了解职业系统的速通玩家，在起始镇醒来。目标是快速完成转职任务，解锁进阶职业。行动简洁果断，10-30字。", personName: "速通玩家" },
  { id: "profession-progression-explorer", systemPrompt: "你是一个谨慎的冒险者，在起始镇醒来。你会仔细探索转职路径，了解每个职业的特性再做选择。行动具体，10-30字。", personName: "探索者" },
  { id: "profession-combat-synergy-speedrunner", systemPrompt: "你是一个战斗型玩家，在起始镇醒来。你擅长将职业技能与战斗结合，追求最大输出效率。行动果断好战，10-30字。", personName: "战斗高手" },
  { id: "profession-combat-synergy-explorer", systemPrompt: "你是一个策略型冒险者，在起始镇醒来。你会仔细搭配职业技能与武器组合，追求战术多样性。行动谨慎务实，10-30字。", personName: "策略家" },
  { id: "combat-basic-speedrunner", systemPrompt: "你是一个好战的冒险者，在古墓中醒来。你会主动引战测试基础战斗机制，追求快速击杀。行动果断，10-30字。", personName: "好战者" },
  { id: "combat-basic-explorer", systemPrompt: "你是一个谨慎的冒险者，在古墓中醒来。你会观察敌人行动模式，试探性战斗避免冒进。行动谨慎，10-30字。", personName: "观察者" },
  { id: "combat-advanced-speedrunner", systemPrompt: "你是一个身经百战的战士，在古墓深处醒来。你精通连击、闪避和技能组合，追求完美战斗表现。行动犀利，10-30字。", personName: "老兵" },
  { id: "combat-advanced-explorer", systemPrompt: "你是一个战术大师，在古墓深处醒来。你会利用地形、道具和敌人弱点制定战斗策略。行动周密，10-30字。", personName: "战术家" },
];

// ── 自适应退避状态 ──
let backoffUntil = 0;
const BACKOFF_MIN = 15_000;
const BACKOFF_MAX = 120_000;

function isSiteBusy(narrative: string): boolean {
  return narrative.includes("网站") && (narrative.includes("繁忙") || narrative.includes("不稳定") || narrative.includes("无法完成"));
}

async function callDeepSeekPlayer(sp: string, pn: string, step: number, history: string, state: string): Promise<string> {
  const userMsg = `## 角色\n你是「${pn}」。\n\n## 当前状态\n${state}\n\n## 最近对话\n${history || "（游戏刚开始）"}\n\n请以玩家身份输入下一步动作。只用简体中文，10-30字，不要解释。`;

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 10000));
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: sp }, { role: "user", content: userMsg }], temperature: 0.8, max_tokens: 500, stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (resp.status === 429) { if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 15000)); continue; } throw new Error("DeepSeek HTTP 429"); }
    if (!resp.ok) { const t = await resp.text().catch(() => ""); throw new Error(`DeepSeek HTTP ${resp.status}: ${t.slice(0, 200)}`); }
    const data = await resp.json() as any;
    let action = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
    if (!action) { if (attempt < maxRetries - 1) continue; throw new Error("DeepSeek returned empty"); }
    return action;
  }
  throw new Error("DeepSeek exhausted retries");
}

async function callSut(sessionId: string, action: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, messages: [{ role: "user", content: action }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`SUT HTTP ${resp.status}`);

  const text = await resp.text();
  const finalMatch = text.match(/__VERSECRAFT_FINAL__:(.+?)(?:\n\n|$)/s);
  if (finalMatch) return finalMatch[1];

  // SSE fallback
  for (const line of text.split("\n")) {
    const m = line.match(/^data:\s*(.+)/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        if (parsed.is_action_legal !== undefined || parsed.narrative !== undefined) return m[1];
      } catch { /* skip */ }
    }
  }

  // If we find the degraded narrative in raw, return it anyway
  if (text.includes('"narrative"')) {
    const m = text.match(/\{.*"narrative".*\}/s);
    if (m) return m[0];
  }
  return JSON.stringify({ is_action_legal: true, sanity_damage: 0, narrative: "(no final frame)", is_death: false, consumes_time: false, consumed_items: [], options: [] });
}

async function runScenario(sc: ScenarioConfig): Promise<void> {
  const sessionId = `sa-${sc.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  log(`\n🎯 ${sc.id}（session=${sessionId}）`);

  let hp = 10, sanity = 10, location = "古墓入口", profession: string | null = null;
  const recentSteps: Array<{ action: string; narrative: string }> = [];
  let stallCount = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    // ── 全局退避：如果网关刚 429，所有场景静默等待 ──
    if (Date.now() < backoffUntil) {
      const remaining = Math.round((backoffUntil - Date.now()) / 1000);
      if (step > 0 && remaining > 0) {
        log(`  ⏳ 网关退避中（剩余${remaining}s）...`);
        await new Promise(r => setTimeout(r, Math.min(remaining * 1000 + 1000, 15000)));
        continue;
      }
    }

    const history = recentSteps.slice(-5).map((t, i) => `[回${recentSteps.length - 5 + i + 1}]\n你: ${t.action}\nDM: ${(t.narrative || "").slice(0, 200)}`).join("\n\n");
    const stateStr = `位置: ${location} | HP: ${hp} | 理智: ${sanity} | 职业: ${profession ?? "无"}`;

    // Step a: 玩家行动
    let action: string;
    try {
      action = await callDeepSeekPlayer(sc.systemPrompt, sc.personName, step, history, stateStr);
      log(`  ⏩ step${step} action="${action.slice(0, 55)}"`);
    } catch (err: any) {
      log(`  ⚠️ step${step} DeepSeek失败: ${err.message}，mock`);
      if (err.message.includes("429")) backoffUntil = Date.now() + 30000;
      const f = ["向前探索", "检查周围环境", "继续前进", "搜索这个房间", "推开前面的门"];
      action = f[step % f.length];
    }

    // Step delay
    await new Promise(r => setTimeout(r, STEP_DELAY));

    // Step b: SUT
    let dmJsonStr: string;
    try {
      dmJsonStr = await callSut(sessionId, action);
    } catch (err: any) {
      log(`  ❌ step${step} SUT失败: ${err.message}`);
      backoffUntil = Date.now() + 30000;
      break;
    }

    let dmJson: any = {};
    try { dmJson = JSON.parse(dmJsonStr); } catch { dmJson = { narrative: dmJsonStr }; }

    const narrative = dmJson.narrative || "";
    const shortNarr = narrative.slice(0, 80).replace(/\n/g, " ");

    if (isSiteBusy(narrative)) {
      stallCount++;
      log(`  📖 DM: "🚫 ${shortNarr}...（#${stallCount}）"`);
      backoffUntil = Date.now() + Math.min(BACKOFF_MIN + stallCount * 5000, BACKOFF_MAX);
      if (stallCount >= 8) { log(`  🛑 ${sc.id} 网关持续不可用(${stallCount}次)，提前结束`); break; }
      continue;
    }
    stallCount = 0;
    log(`  📖 DM: "${shortNarr}..."`);

    // 状态
    hp = typeof dmJson.hp_damage === "number" ? Math.max(0, hp - dmJson.hp_damage) : hp;
    sanity = typeof dmJson.sanity_damage === "number" ? Math.max(0, sanity - dmJson.sanity_damage) : sanity;
    if (dmJson.player_profession) { log(`  🆙 职业: ${profession ?? "无"} → ${dmJson.player_profession}`); profession = dmJson.player_profession; }
    if (dmJson.player_location && location !== dmJson.player_location) { log(`  🗺️ 位置: ${location} → ${dmJson.player_location}`); location = dmJson.player_location; }
    recentSteps.push({ action, narrative });
    if (dmJson.is_death) { log(`  💀 死亡（${step + 1}步）`); break; }
  }
  log(`  ✅ ${sc.id} 完成: ${recentSteps.length}步`);
}

async function main() {
  log("=".repeat(60));
  log("🎮 Stage A Standalone v4（串行+自适应退避）");
  log(`   服务端: ${BASE_URL} | 模型: ${MODEL}`);
  log(`   每局: ${MAX_STEPS}步 | 步间隔: ${STEP_DELAY}ms`);
  log(`   场景: ${SCENARIOS.length}个串行`);
  log(`   时间: ${new Date().toLocaleString()}`);
  log("=".repeat(60));

  // Check SUT
  log("检查 SUT...");
  try { const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(5000) }); log(`  ✅ HTTP ${res.status}`); }
  catch (e: any) { log(`  ❌ SUT 不可达: ${e.message}`); process.exit(1); }

  // Warmup DeepSeek
  log("Warmup DeepSeek...");
  try {
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 5, stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    const d = await resp.json() as any;
    log(`  ✅ warmup: ${d.model || "ok"}`);
  } catch (e: any) { log(`  ⚠️ warmup失败: ${e.message}`); }

  // 串行运行所有场景
  for (let i = 0; i < SCENARIOS.length; i++) {
    log(`\n📦 场景 ${i + 1}/${SCENARIOS.length}: ${SCENARIOS[i].id}`);
    await runScenario(SCENARIOS[i]);
    await new Promise(r => setTimeout(r, 5000));
  }

  log("\n" + "=".repeat(60));
  log("✅ Stage A Standalone 完成");
  log("=".repeat(60));
}

main().catch(err => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) log(err.stack);
  process.exit(1);
});
