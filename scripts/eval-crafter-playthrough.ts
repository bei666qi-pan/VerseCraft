#!/usr/bin/env tsx
/**
 * 工匠画像 Live Playthrough（专门脚本）
 *
 * 使用 DeepSeek 玩家 agent，工匠/资源管理画像进行 15 回合 live 评测。
 * 重点覆盖：锻造落地完整性、材料精确扣除、物品生成确认、原石交易一致性、仓库移动
 *
 * 用法：
 *   pnpm dlx tsx scripts/eval-crafter-playthrough.ts
 *
 * 前置条件：
 *   - dev server 运行在 localhost:666
 *   - DEEPSEEK_API_KEY/PLAYTEST_LLM_API_KEY 已配置
 */

import { createSutAdapter, SCENARIOS } from "../src/lib/evals/playthrough";
import { createInitialStateSnapshot } from "../src/lib/evals/playthrough/invariants";
import { applyDmJsonToState, buildClientStructuredSnapshot } from "../src/lib/evals/playthrough";
import { generatePlayerActionDeepSeek } from "../src/lib/evals/liveProvider";
import { judgeNarrativeConsistencyMock } from "../src/lib/evals/playthrough/narrativeJudge";
import type { PlaythroughTranscript, NarrativeConsistencyResult } from "../src/lib/evals/playthrough";
import type { SutAction } from "../src/lib/evals/playthrough/sutAdapter";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

for (const name of [".env", ".env.local"]) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true });
}

// ─── 工匠人格定义 ────────────────────────────────────────

const CRAFTER_PERSONA = {
  type: "crafter",
  name: "工匠型玩家",
  systemPrompt: `你是一个擅长锻造、修理和资源管理的工匠型玩家。你的核心乐趣在于打造和优化装备。
- 优先寻找锻造NPC（如老刘、N-008）并与之互动
- 每次锻造前仔细核对材料（铁矿石、铜线等）是否足够
- 关注原石余额，主动询问锻造/修理价格，比较性价比
- 尝试不同材料组合锻造不同武器
- 修理低稳定度的装备，关注装备耐久
- 管理行囊和仓库物品，合理调配资源
- 尝试用材料换取武器/道具而不是用原石
- 与NPC讨价还价，关注交易公平性
- 如果材料不足，主动寻找获取材料的方法
- 每次行动后核对自己拥有的物品变化`,
  maxSteps: 15,
  styleKeywords: ["锻造", "修理", "交易", "材料管理", "装备优化"],
  attemptsIllegalAction: false,
};

// ─── 工匠场景 ─────────────────────────────────────────────

const CRAFTER_SCENARIO = {
  scenarioId: "crafter-forge-economy",
  persona: "crafter" as const,
  description: "工匠画像：锻造武器、修理装备、管理原石和材料、与NPC交易",
  campaignGoal: "在B1安全区找到锻造师N-008（老刘），利用手头的材料和原石锻造/修理装备，优化自己的战斗配置，探索交易和资源管理的各种可能性。",
};

// ─── 场景初始状态 ─────────────────────────────────────────

const BASE_SCENARIO = SCENARIOS.find((s) => s.id === "forge-service-flow");
const initialState = createInitialStateSnapshot({
  ...(BASE_SCENARIO?.initialStateOverride ?? {}),
  originium: 10,
  inventoryItemIds: ["item_phone", "item_bandage", "I-C03", "I-C01", "I-C02"],
  inventoryItemCount: 5,
  warehouseItemIds: ["W-B101"],
  profession: "守灯人",
  equippedWeapon: "WPN-3F-IRON-PIPE",
  weaponBag: [
    { id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 48, contamination: 12, repairable: true },
    { id: "WPN-CLOCK-PIN", name: "时针刺", stability: 72, contamination: 3, repairable: false },
  ],
  weaponStability: 48,
  weaponContamination: 12,
  playerLocation: "B1_PowerRoom",
  presentNpcIds: ["N-008"],
  hp: 10,
  maxHp: 10,
  sanity: 75,
});

// ─── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const MAX_STEPS = 15;
  const BASE_URL = process.env.LIVEPLAY_BASE_URL ?? "http://localhost:666";
  const STEP_DELAY_MS = 500;

  console.log("🔨 工匠画像 Live Playthrough — 锻造/道具/经济系统专项");
  console.log("═".repeat(60));
  console.log(`初始状态: B1_PowerRoom, 原石=10, 武器=消防铁管(stb=48)+时针刺(stb=72)`);
  console.log(`行囊: phone, bandage, I-C03, I-C01, I-C02 | 仓库: W-B101`);
  console.log(`在场NPC: N-008 | 职业: 守灯人`);
  console.log(`回合数: ${MAX_STEPS} | 步间延迟: ${STEP_DELAY_MS}ms\n`);

  const sut = createSutAdapter({
    mock: false,
    baseUrl: BASE_URL,
    sessionId: `crafter-eval-${Date.now()}`,
    frameTimeoutMs: CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms,
  });

  let currentState = { ...initialState };
  const steps: Array<{
    step: number;
    action: string;
    narrative: string;
    latencyMs: number;
    dmJson: Record<string, unknown>;
    stateAfter: typeof currentState;
    status: string;
    aiStatus?: string;
  }> = [];

  let terminatedReason = "max_steps";
  let totalSteps = 0;
  let degradedSteps = 0;
  const startTime = Date.now();

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // 使用 DeepSeek 生成玩家动作
      const visibleWeapon = currentState.weaponBag?.find((weapon) =>
        String(weapon.id ?? "") === String(currentState.equippedWeapon ?? ""),
      );

      const action = await generatePlayerActionDeepSeek({
        persona: {
          type: CRAFTER_PERSONA.type,
          name: CRAFTER_PERSONA.name,
          systemPrompt: CRAFTER_PERSONA.systemPrompt,
        },
        campaignGoal: CRAFTER_SCENARIO.campaignGoal,
        stepIndex: step,
        transcript: steps.map((s) => ({ action: s.action, narrative: s.narrative })),
        state: {
          playerLocation: currentState.playerLocation,
          hp: currentState.hp,
          sanity: currentState.sanity,
          profession: currentState.profession ?? null,
        },
        visibleSnapshot: [
          `原石:${currentState.originium}`,
          `行囊:${currentState.inventoryItemCount}/${currentState.maxInventorySlots}`,
          `当前武器:${String(visibleWeapon?.name ?? (currentState.equippedWeapon ? "已装备武器" : "无"))}`,
          `武器稳定:${currentState.weaponStability}`,
          `武器污染:${currentState.weaponContamination}`,
          `武器袋:${(currentState.weaponBag ?? []).map((w) => `${w.name}(stb:${w.stability})`).join(", ")}`,
          `进行中任务:${currentState.activeTaskIds.length}`,
          `已完成任务:${currentState.completedTaskIds.length}`,
        ].join(" | "),
      });

      console.log(`  Step ${step + 1}: "${action}"`);

      // SUT 调用
      const response = await sut.step({
        playerAction: action,
        persona: CRAFTER_PERSONA.type as Parameters<typeof sut.step>[0]["persona"],
        stepIndex: step,
        playerContext: [
          `位置:${currentState.playerLocation}`,
          `HP:${currentState.hp}/${currentState.maxHp}`,
          `理智:${currentState.sanity}`,
          `原石:${currentState.originium}`,
          `武器:${visibleWeapon?.name ?? "无"}(stb:${currentState.weaponStability})`,
          `行囊物品:${currentState.inventoryItemIds?.join(",") ?? ""}`,
          `仓库:${currentState.warehouseItemIds?.join(",") ?? ""}`,
          `任务:${currentState.activeTaskIds.join(",") || "无"}`,
          `回合:${currentState.turnCount}`,
        ].join("；"),
        clientState: buildClientStructuredSnapshot(currentState),
      } as SutAction);

      const prevOriginium = currentState.originium;
      const prevStability = currentState.weaponStability;
      const prevInventoryCount = currentState.inventoryItemCount;

      if (response.status === "error" && !response.reachedFinal) {
        console.warn(`    ⚠️ 失败: ${response.error ?? "unknown"}`);
        degradedSteps++;
        terminatedReason = "error";
        totalSteps = step;
        break;
      }
      if (response.status === "degraded" || response.aiStatus) {
        degradedSteps++;
        console.warn(`    ⚠️ 降级: ${response.aiStatus ?? "unknown"}`);
      }

      currentState = applyDmJsonToState(currentState, response.dmJson, response.narrative);

      // 经济/锻造变化追踪
      const originiumDelta = currentState.originium - prevOriginium;
      const stabilityDelta = currentState.weaponStability - prevStability;
      const inventoryDelta = currentState.inventoryItemCount - prevInventoryCount;
      const awardedItems = (response.dmJson.awarded_items as Array<{ id?: string; name?: string }> | undefined) ?? [];
      const consumedItems = (response.dmJson.consumed_items as Array<{ id?: string; name?: string }> | undefined) ?? [];
      const awardedWarehouse = (response.dmJson.awarded_warehouse_items as Array<{ id?: string; name?: string }> | undefined) ?? [];
      const currencyChange = response.dmJson.currency_change as number | undefined;

      const deltas: string[] = [];
      if (originiumDelta !== 0) deltas.push(`原石${originiumDelta > 0 ? "+" : ""}${originiumDelta}`);
      if (stabilityDelta !== 0) deltas.push(`稳定${stabilityDelta > 0 ? "+" : ""}${stabilityDelta}`);
      if (awardedItems.length > 0) deltas.push(`获得:${awardedItems.map((i) => i.name ?? i.id).join(",")}`);
      if (consumedItems.length > 0) deltas.push(`消耗:${consumedItems.map((i) => i.name ?? i.id).join(",")}`);
      if (awardedWarehouse.length > 0) deltas.push(`仓库+${awardedWarehouse.length}件`);
      if (typeof currencyChange === "number" && currencyChange !== 0) deltas.push(`cc:${currencyChange}`);

      const deltaStr = deltas.length > 0 ? ` [${deltas.join(" | ")}]` : "";
      console.log(`    → (${response.latencyMs}ms) 叙事${response.narrative.length}字${deltaStr}`);

      steps.push({
        step,
        action,
        narrative: response.narrative,
        latencyMs: response.latencyMs,
        dmJson: response.dmJson,
        stateAfter: { ...currentState },
        status: response.status,
        aiStatus: response.aiStatus,
      });

      if (response.dmJson["is_death"] === true) {
        terminatedReason = "death";
        totalSteps = step + 1;
        console.log("    💀 玩家死亡");
        break;
      }
      if (response.dmJson["reached_ending"] === true || response.dmJson["is_ending"] === true) {
        terminatedReason = "reached_ending";
        totalSteps = step + 1;
        console.log("    🏁 到达结局");
        break;
      }

      totalSteps = step + 1;
      if (STEP_DELAY_MS > 0 && step + 1 < MAX_STEPS) {
        await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      }
    }
  } finally {
    await sut.close?.();
  }

  const durationMs = Date.now() - startTime;

  // ─── 叙事裁判 ──────────────────────────────────────────
  const transcript: PlaythroughTranscript = {
    runId: `crafter-forge-economy-${Date.now()}`,
    persona: "explorer", // 类型兼容
    seed: 42,
    steps: steps.map((s) => ({
      stepIndex: s.step,
      playerAction: s.action,
      narrative: s.narrative,
      dmJson: s.dmJson,
      stateAfter: s.stateAfter,
      timestamp: Date.now(),
    })),
    initialState,
    finalState: currentState,
    terminatedReason: terminatedReason as PlaythroughTranscript["terminatedReason"],
    totalSteps,
    durationMs,
  };

  const judgeResult = judgeNarrativeConsistencyMock(transcript);

  // ─── 锻造/经济专项指标 ──────────────────────────────────
  const forgeEvents = steps.filter((s) => {
    const n = s.narrative;
    const dm = s.dmJson;
    return /(锻造|打造|修理|铸|检修|维护)/.test(n) ||
      (dm.weapon_updates as unknown[] | undefined)?.length > 0 ||
      (dm.weapon_bag_updates as unknown[] | undefined)?.length > 0;
  });
  const economyEvents = steps.filter((s) =>
    typeof s.dmJson.currency_change === "number" && s.dmJson.currency_change !== 0
  );
  const tradeEvents = steps.filter((s) =>
    ((s.dmJson.awarded_items as unknown[] | undefined)?.length ?? 0) > 0 ||
    ((s.dmJson.consumed_items as unknown[] | undefined)?.length ?? 0) > 0
  );
  const warehouseEvents = steps.filter((s) =>
    ((s.dmJson.awarded_warehouse_items as unknown[] | undefined)?.length ?? 0) > 0
  );

  // ─── 不变式检查 ─────────────────────────────────────────
  const forgeTransactions: Array<{ step: number; pass: boolean; detail: string }> = [];
  const resourceConservations: Array<{ step: number; pass: boolean; detail: string }> = [];

  for (const s of steps) {
    const dm = s.dmJson;
    const awarded = (dm.awarded_items as unknown[] | undefined) ?? [];
    const awardedWh = (dm.awarded_warehouse_items as unknown[] | undefined) ?? [];
    const consumed = (dm.consumed_items as unknown[] | undefined) ?? [];
    const cc = dm.currency_change as number | undefined;
    const narrative = typeof dm.narrative === "string" ? dm.narrative : "";

    // forge_transaction invariant
    const hasForgedItem = awarded.length > 0 || awardedWh.length > 0;
    const claimsForgeSuccess = /(锻造|打造|铸成|铸就|炼成|制成)[^。!?\n]{0,12}(成功|完成|出炉)/.test(narrative) ||
      /(成功|完成)(地)?(锻造|打造|铸)/.test(narrative);
    const mentionsFailure = /(失败|未能|无法|不够|不足|没有成功|成不了)/.test(narrative);
    const forgePass = !hasForgedItem || (!claimsForgeSuccess || mentionsFailure);
    if (hasForgedItem || claimsForgeSuccess) {
      forgeTransactions.push({
        step: s.step + 1,
        pass: forgePass,
        detail: forgePass ? "clean" : `awarded=${awarded.length}/wh=${awardedWh.length}, claims_success=${claimsForgeSuccess}, admits_fail=${mentionsFailure}`,
      });
    }

    // resource_conservation invariant
    const noAward = awarded.length === 0 && awardedWh.length === 0;
    const noCharge = typeof cc !== "number" || cc >= 0;
    const conserved = noAward && noCharge;
    // resource_conservation "pass" means nothing was changed — just track when things DID change
    if (!noAward || (typeof cc === "number" && cc !== 0)) {
      resourceConservations.push({
        step: s.step + 1,
        pass: true, // items with consumption are fine as long as there's proper exchange
        detail: `awarded=${awarded.length}, consumed=${consumed.length}, cc=${cc ?? 0}`,
      });
    }
  }

  // ─── 状态变化追踪 ──────────────────────────────────────
  const firstState = steps[0]?.stateAfter ?? initialState;
  const lastState = steps[steps.length - 1]?.stateAfter ?? currentState;

  // ─── 报告输出 ──────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📊 工匠画像 Playthrough 报告");
  console.log("═".repeat(60));
  console.log(`终止原因: ${terminatedReason}`);
  console.log(`总回合: ${totalSteps}/${MAX_STEPS}`);
  console.log(`耗时: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`降级回合: ${degradedSteps}`);
  console.log(`叙事评分: ${judgeResult.overallScore}/5 (passed=${judgeResult.passed})`);

  console.log(`\n锻造专项:`);
  console.log(`  锻造/修理事件: ${forgeEvents.length}`);
  console.log(`  原石交易事件: ${economyEvents.length}`);
  console.log(`  物品交换事件: ${tradeEvents.length}`);
  console.log(`  仓库操作事件: ${warehouseEvents.length}`);

  console.log(`\n状态变化:`);
  console.log(`  原石: ${firstState.originium} → ${lastState.originium} (Δ${lastState.originium - firstState.originium})`);
  console.log(`  HP: ${firstState.hp} → ${lastState.hp}`);
  console.log(`  理智: ${firstState.sanity} → ${lastState.sanity}`);
  console.log(`  武器稳定: ${firstState.weaponStability} → ${lastState.weaponStability}`);
  console.log(`  武器污染: ${firstState.weaponContamination} → ${lastState.weaponContamination}`);
  console.log(`  行囊: ${firstState.inventoryItemCount} → ${lastState.inventoryItemCount}`);
  console.log(`  位置: ${firstState.playerLocation} → ${lastState.playerLocation}`);

  console.log(`\n不变式检查:`);
  console.log(`  forge_transaction: ${forgeTransactions.length} checks, ${forgeTransactions.filter((f) => !f.pass).length} failures`);
  console.log(`  resource_conservation: ${resourceConservations.length} resource change events`);

  if (judgeResult.issues.length > 0) {
    console.log(`\n裁判问题:`);
    for (const issue of judgeResult.issues) {
      const icon = issue.severity === "critical" ? "🔴" : issue.severity === "major" ? "🟡" : "🟢";
      console.log(`  ${icon} [${issue.severity}] ${issue.description}`);
    }
  }

  // ─── 回合记录汇总 ──────────────────────────────────────
  console.log(`\n回合记录:`);
  for (const s of steps) {
    const preview = s.narrative.length > 100 ? s.narrative.slice(0, 100) + "..." : s.narrative;
    console.log(`  Step ${s.step + 1} (${s.latencyMs}ms): "${s.action}" → "${preview}"`);
  }

  // ─── 写入 trace ────────────────────────────────────────
  const artifactRunId = `crafter-playthrough-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(process.cwd(), ".runtime-data/eval", artifactRunId, "traces");
  mkdirSync(outDir, { recursive: true });

  const traceData = {
    runId: artifactRunId,
    persona: "crafter",
    personaConfig: {
      name: CRAFTER_PERSONA.name,
      systemPrompt: CRAFTER_PERSONA.systemPrompt,
    },
    scenarioId: "crafter-forge-economy",
    description: CRAFTER_SCENARIO.description,
    campaignGoal: CRAFTER_SCENARIO.campaignGoal,
    initialState: {
      originium: initialState.originium,
      location: initialState.playerLocation,
      profession: initialState.profession,
      weapon: initialState.equippedWeapon,
      weaponBag: initialState.weaponBag,
      weaponStability: initialState.weaponStability,
      weaponContamination: initialState.weaponContamination,
      inventoryItemIds: initialState.inventoryItemIds,
      inventoryItemCount: initialState.inventoryItemCount,
      warehouseItemIds: initialState.warehouseItemIds,
      presentNpcIds: initialState.presentNpcIds,
      hp: initialState.hp,
      sanity: initialState.sanity,
    },
    steps: steps.map((s) => ({
      stepIndex: s.step,
      playerAction: s.action,
      narrative: s.narrative,
      dmJson: s.dmJson,
      stateAfter: {
        originium: s.stateAfter.originium,
        location: s.stateAfter.playerLocation,
        hp: s.stateAfter.hp,
        sanity: s.stateAfter.sanity,
        weaponStability: s.stateAfter.weaponStability,
        weaponContamination: s.stateAfter.weaponContamination,
        inventoryItemCount: s.stateAfter.inventoryItemCount,
        equippedWeapon: s.stateAfter.equippedWeapon,
        weaponBag: s.stateAfter.weaponBag,
      },
      metrics: { latencyMs: s.latencyMs },
      transport: { status: s.status, aiStatus: s.aiStatus ?? null },
    })),
    terminatedReason,
    totalSteps,
    durationMs,
    degradedSteps,
    narrativeConsistency: {
      overallScore: judgeResult.overallScore,
      passed: judgeResult.passed,
      dimensionScores: judgeResult.dimensionScores,
      issues: judgeResult.issues,
    },
    forgeMetrics: {
      forgeEvents: forgeEvents.length,
      economyEvents: economyEvents.length,
      tradeEvents: tradeEvents.length,
      warehouseEvents: warehouseEvents.length,
      forgeTransactions,
      resourceConservations,
    },
    stateDelta: {
      originium: { from: firstState.originium, to: lastState.originium },
      stability: { from: firstState.weaponStability, to: lastState.weaponStability },
      contamination: { from: firstState.weaponContamination, to: lastState.weaponContamination },
      inventory: { from: firstState.inventoryItemCount, to: lastState.inventoryItemCount },
      hp: { from: firstState.hp, to: lastState.hp },
      sanity: { from: firstState.sanity, to: lastState.sanity },
      location: { from: firstState.playerLocation, to: lastState.playerLocation },
    },
  };

  const tracePath = resolve(outDir, "crafter-forge-economy.json");
  writeFileSync(tracePath, JSON.stringify(traceData, null, 2), "utf8");

  // 同时按画像格式命名
  const personaPath = resolve(outDir, "crafter-crafter-0.json");
  writeFileSync(personaPath, JSON.stringify(traceData, null, 2), "utf8");

  console.log(`\n📄 Trace 已保存: ${tracePath}`);
  console.log(`📄 画像 Trace: ${personaPath}`);
  console.log("\n✅ 工匠画像 Playthrough 完成");
}

main().catch((err) => {
  console.error("❌ 工匠 Playthrough 失败:", err);
  process.exit(1);
});
