/**
 * Playthrough 编排器
 *
 * 跑 N 局 × M 个 persona，收集 transcript，聚合失败。
 *
 * 主流程（mock 模式）：
 * for persona in personas:
 *   for seed in range(N):
 *     state = game.new_session(seed)
 *     transcript = []
 *     for step in range(MAX_STEPS):
 *       action = player_agent.act(persona, transcript, state)
 *       narrative, state = game.step(action)
 *       transcript.append((action, narrative, state))
 *
 *       assert_invariants(state)      # 第一层：不变量（硬断言）
 *       if is_softlocked(transcript): # 卡死检测
 *         report_failure("softlock"); break
 *       if state.reached_ending:
 *         break
 *
 *     judge_narrative_consistency(transcript)  # 第二层：叙事裁判
 */

import { generateMockAction, PERSONAS } from "./playerAgent";
import {
  checkAllInvariants,
  checkSoftlock,
  createInitialStateSnapshot,
} from "./invariants";
import { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive } from "./narrativeJudge";
import { generatePlayerActionDeepSeek } from "../liveProvider";
import type {
  GameStateSnapshot,
  InvariantCheckResult,
  PlaythroughRunConfig,
  PlaythroughRunResult,
  PlaythroughRunSummary,
  PlaythroughTranscript,
  TerminatedReason,
  TranscriptStep,
} from "./types";

// === 核心编排循环 ===

/**
 * 执行单个 playthrough 运行（mock 模式）。
 * 使用规则模拟器，不调真实游戏 API。
 */
export async function runSinglePlaythrough(
  config: PlaythroughRunConfig,
  personaType: string,
  runIndex: number
): Promise<PlaythroughRunResult> {
  const startTime = Date.now();
  const seed = config.baseSeed + runIndex;
  const persona = personaType as import("./types").PersonaType;
  const personaConfig = PERSONAS[persona];

  if (!personaConfig) {
    throw new Error(`Unknown persona: ${persona}`);
  }

  // 初始状态
  let currentState = createInitialStateSnapshot();
  const steps: TranscriptStep[] = [];
  const invariantResults: InvariantCheckResult[] = [];
  let terminatedReason: TerminatedReason = "max_steps";

  // 主循环
  for (let step = 0; step < config.maxStepsPerRun; step++) {
    // ① 生成玩家动作
    let action: string;
    if (config.mockMode) {
      action = generateMockAction(persona, step, seed);
    } else {
      // Live 模式：使用 DeepSeek 生成玩家动作
      try {
        const recentTranscript = steps.slice(-3).map((s) => ({
          action: s.playerAction,
          narrative: s.narrative,
        }));
        action = await generatePlayerActionDeepSeek({
          persona: { type: persona, name: personaConfig.name, systemPrompt: personaConfig.systemPrompt },
          stepIndex: step,
          transcript: recentTranscript,
          state: {
            playerLocation: currentState.playerLocation,
            hp: currentState.hp,
            sanity: currentState.sanity,
            profession: currentState.profession,
          },
        });
      } catch (err) {
        console.warn(`  ⚠️ DeepSeek 调用失败，降级到 mock 动作: ${err instanceof Error ? err.message : String(err)}`);
        action = generateMockAction(persona, step, seed);
      }
    }

    // ② 模拟游戏响应
    const response = simulateGameResponse(action, currentState, step, persona);

    // ③ 应用状态变化
    const prevState = { ...currentState };
    currentState = applyStateChanges(currentState, response.stateChanges);

    // ④ 记录 transcript
    steps.push({
      stepIndex: step,
      playerAction: action,
      narrative: response.narrative,
      dmJson: response.dmJson,
      stateAfter: { ...currentState },
      timestamp: Date.now(),
    });

    // ⑤ 第一层：不变量检查
    const invariantResult = checkAllInvariants(step, currentState, prevState);
    invariantResults.push(invariantResult);

    if (!invariantResult.passed) {
      terminatedReason = "invariant_failed";
      break;
    }

    // ⑥ Softlock 检测
    if (step >= config.softlockThreshold) {
      const softlockCheck = checkSoftlock(
        steps.map((s) => ({ state: s.stateAfter })),
        config.softlockThreshold
      );
      if (softlockCheck.isSoftlocked) {
        terminatedReason = "softlock";
        break;
      }
    }

    // ⑦ 结局/死亡检测
    if (currentState.reachedEnding) {
      terminatedReason = "reached_ending";
      break;
    }
    if (currentState.isDeath) {
      terminatedReason = "death";
      break;
    }
  }

  if (terminatedReason === "max_steps") {
    // 达到最大步数
  }

  const transcript: PlaythroughTranscript = {
    runId: `${persona}-seed${seed}`,
    persona,
    seed,
    steps,
    initialState: createInitialStateSnapshot(),
    finalState: currentState,
    terminatedReason,
    totalSteps: steps.length,
    durationMs: Date.now() - startTime,
  };

  // ⑧ 第二层：叙事一致性裁判（整局跑完后）
  let narrativeConsistency = null;
  if (config.runNarrativeJudge) {
    if (config.mockMode) {
      narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
    } else {
      try {
        narrativeConsistency = await judgeNarrativeConsistencyLive(transcript);
      } catch (err) {
        console.warn(`  ⚠️ Live 叙事裁判失败，降级到 mock: ${err instanceof Error ? err.message : String(err)}`);
        narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
      }
    }
  }

  // 汇总失败
  const failures: string[] = [];
  if (narrativeConsistency && !narrativeConsistency.passed) {
    failures.push(`narrative_consistency:${narrativeConsistency.overallScore}`);
  }
  for (const inv of invariantResults) {
    if (!inv.passed) {
      for (const v of inv.violations) {
        failures.push(`invariant[${inv.stepIndex}]:${v.rule}`);
      }
    }
  }

  return {
    transcript,
    invariantResults,
    narrativeConsistency,
    passed: failures.length === 0 &&
      invariantResults.every((r) => r.passed) &&
      (narrativeConsistency?.passed ?? true),
    failureSummary: failures,
  };
}

// === 模拟游戏响应 ===

interface SimulatedGameResponse {
  narrative: string;
  dmJson: Record<string, unknown>;
  stateChanges: Partial<GameStateSnapshot>;
}

/**
 * 基于规则模拟游戏状态变化。
 * 不调真实 AI，用于离线编排。
 */
function simulateGameResponse(
  action: string,
  state: GameStateSnapshot,
  stepIndex: number,
  persona: string
): SimulatedGameResponse {
  const delta: Partial<GameStateSnapshot> = {};

  // 推进回合
  delta.turnCount = state.turnCount + 1;

  // 位置变化（探索型移动更快）
  if (persona === "explorer" || persona === "speedrunner") {
    const locations = [
      "旧公寓三楼走廊", "旧公寓楼梯间", "B1_配电间",
      "1F_Lobby", "旧公寓消防通道",
    ];
    delta.playerLocation = locations[stepIndex % locations.length] ?? state.playerLocation;
  }

  // 理智微降
  if (stepIndex > 5) {
    delta.sanity = Math.max(0, state.sanity - 1);
  }

  // 武器磨损
  if (state.equippedWeapon && stepIndex > 0 && stepIndex % 3 === 0) {
    delta.weaponStability = Math.max(0, state.weaponStability - 2);
  }

  // 任务推进（速通型更快触发结局）
  if (persona === "speedrunner" && stepIndex > 12) {
    delta.reachedEnding = true;
  }

  // 破坏型会触发非法操作回退
  const isActionIllegal = persona === "rulebreaker" && (
    action.includes("攻击") || action.includes("忽略") || action.includes("跳过") || action.includes("系统提示词")
  );

  // 生成叙事
  const narratives = {
    speedrunner: [
      "你没有停留，径直朝走廊尽头走去。时间不等人——每多一秒的犹豫，暗处的东西就更近一步。",
      "你推开那扇门，毫不犹豫。加快节奏是正确的——你已经看到了结局的轮廓。",
    ],
    explorer: [
      "你仔细查看房间的角落。墙上的裂缝很大，足以伸进一只手。里面似乎有什么东西在微弱地发光。",
      "你和NPC聊了几句。他说话时眼神一直在飘向走廊的暗处——那里肯定有什么东西。",
    ],
    rulebreaker: [
      "你的行动被一道无形的枷锁挡住了。游戏没有给你无限的自由——但边界在哪儿？你感觉自己在试探一道根本看不见的墙。",
      isActionIllegal
        ? "该操作不被允许。你感觉到自己的身份在抗拒这个行动——规则不是你能随意改写的。"
        : "你尝试了一种不同寻常的方式，但系统似乎还没有准备好应对这种创造性的破坏。",
    ],
    confused: [
      "你站在原地，不太确定该往哪个方向走。一切的灯光都闪烁着，仿佛也在犹豫。",
      "你嘟囔了一句含糊不清的话。NPC疑惑地看着你，似乎不确定你是不是在对他说。",
    ],
  };

  const personaNarratives = narratives[persona as keyof typeof narratives] ?? narratives.confused;
  const narrative = personaNarratives?.[stepIndex % personaNarratives.length] ?? "事情在发展。";

  const dmJson: Record<string, unknown> = {
    is_action_legal: !isActionIllegal,
    sanity_damage: delta.sanity !== undefined ? state.sanity - (delta.sanity ?? state.sanity) : 1,
    narrative,
    is_death: delta.isDeath ?? false,
    consumes_time: true,
    options: ["继续前进", "后退观察", "检查细节", "呼叫同伴"],
    player_location: delta.playerLocation ?? state.playerLocation,
  };

  return { narrative, dmJson, stateChanges: delta };
}

/**
 * 应用状态变化
 */
function applyStateChanges(
  state: GameStateSnapshot,
  changes: Partial<GameStateSnapshot>
): GameStateSnapshot {
  return {
    ...state,
    ...changes,
    inventoryItemIds: changes.inventoryItemIds ?? [...state.inventoryItemIds],
    activeTaskIds: changes.activeTaskIds ?? [...state.activeTaskIds],
    completedTaskIds: changes.completedTaskIds ?? [...state.completedTaskIds],
    aliveNpcIds: changes.aliveNpcIds ?? [...state.aliveNpcIds],
    deadNpcIds: changes.deadNpcIds ?? [...state.deadNpcIds],
    codexNpcIds: changes.codexNpcIds ?? [...state.codexNpcIds],
    unlockedFlags: changes.unlockedFlags ?? [...state.unlockedFlags],
  };
}

// === 批次编排 ===

export async function runPlaythroughBatch(
  config: PlaythroughRunConfig
): Promise<PlaythroughRunSummary> {
  const startTime = Date.now();
  const allResults: PlaythroughRunResult[] = [];

  for (const persona of config.personas) {
    for (let i = 0; i < config.runsPerPersona; i++) {
      console.log(`  🎮 ${PERSONAS[persona]?.name ?? persona} #${i + 1}/${config.runsPerPersona}`);
      const result = await runSinglePlaythrough(config, persona, i);
      allResults.push(result);
    }
  }

  const durationMs = Date.now() - startTime;
  return summarizeResults(allResults, config, durationMs);
}

/**
 * 生成批次摘要
 */
function summarizeResults(
  results: PlaythroughRunResult[],
  config: PlaythroughRunConfig,
  durationMs: number
): PlaythroughRunSummary {
  const totalRuns = results.length;
  const passedRuns = results.filter((r) => r.passed).length;
  const failedRuns = totalRuns - passedRuns;
  const passRate = totalRuns > 0 ? passedRuns / totalRuns : 0;

  // 按 persona 分组
  const byPersona: PlaythroughRunSummary["byPersona"] = {};
  for (const persona of config.personas) {
    const personaResults = results.filter((r) => r.transcript.persona === persona);
    if (personaResults.length === 0) continue;

    const passed = personaResults.filter((r) => r.passed).length;
    const avgSteps = personaResults.reduce((s, r) => s + r.transcript.totalSteps, 0) / personaResults.length;
    const softlocks = personaResults.filter((r) => r.transcript.terminatedReason === "softlock").length;
    const invariantFails = personaResults.filter((r) => !r.invariantResults.every((i) => i.passed)).length;
    const narrativeFails = personaResults.filter((r) => r.narrativeConsistency && !r.narrativeConsistency.passed).length;

    byPersona[PERSONAS[persona]?.name ?? persona] = {
      total: personaResults.length,
      passed,
      rate: passed / personaResults.length,
      avgSteps: Math.round(avgSteps * 10) / 10,
      softlockCount: softlocks,
      invariantFailures: invariantFails,
      narrativeFailures: narrativeFails,
    };
  }

  // 按终止原因
  const byTermination: Record<string, number> = {};
  for (const r of results) {
    const reason = r.transcript.terminatedReason;
    byTermination[reason] = (byTermination[reason] ?? 0) + 1;
  }

  // Top 违规
  const violationCounts = new Map<string, number>();
  const issueTypeCounts = new Map<string, number>();

  for (const r of results) {
    for (const inv of r.invariantResults) {
      for (const v of inv.violations) {
        violationCounts.set(v.rule, (violationCounts.get(v.rule) ?? 0) + 1);
      }
    }
    if (r.narrativeConsistency) {
      for (const issue of r.narrativeConsistency.issues) {
        issueTypeCounts.set(issue.type, (issueTypeCounts.get(issue.type) ?? 0) + 1);
      }
    }
  }

  const topViolations = [...violationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  const topConsistencyIssues = [...issueTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  // Gate 判定
  const gatePass = passRate >= 0.8;

  return {
    config,
    totalRuns,
    passedRuns,
    failedRuns,
    passRate,
    byPersona,
    byTermination,
    topViolations,
    topConsistencyIssues,
    results,
    durationMs,
    gatePass,
  };
}
