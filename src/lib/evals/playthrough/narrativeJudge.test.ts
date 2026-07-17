import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  createInitialStateSnapshot,
} from "./invariants";
import { judgeNarrativeConsistencyCodex } from "./narrativeJudge";
import type { PlaythroughTranscript } from "./types";

function makeTranscript(overrides: Partial<PlaythroughTranscript>): PlaythroughTranscript {
  const baseState = createInitialStateSnapshot();
  return {
    runId: "test-run",
    persona: "speedrunner",
    seed: 1,
    steps: [],
    initialState: baseState,
    finalState: baseState,
    terminatedReason: "objective_reached",
    totalSteps: 0,
    durationMs: 0,
    ...overrides,
  };
}

function makeSteps(
  base: PlaythroughTranscript["initialState"],
  transform: (index: number, prevState: PlaythroughTranscript["initialState"]) => PlaythroughTranscript["steps"][number]["stateAfter"],
  narrativeTextPrefix: string,
  uniqueNarratives: string[],
) {
  const steps: PlaythroughTranscript["steps"] = [];
  let prev = base;
  for (let i = 0; i < 8; i++) {
    const next = transform(i, prev);
    steps.push({
      stepIndex: i,
      playerAction: `动作${i}`,
      narrative: uniqueNarratives[i] ?? `${narrativeTextPrefix} 第${i}次尝试`,
      dmJson: { is_action_legal: true, sanity_damage: 0, is_death: false },
      stateAfter: next,
      timestamp: 1000 + i,
    });
    prev = next;
  }
  return steps;
}

function makePayloadForMockModel(overrides?: Partial<{
  overallScore: number;
  judgeConfidence: number;
  passed: boolean;
  reasoning: string;
  issues: Array<{
    type: string;
    severity: string;
    description: string;
    evidence: Array<{ stepIndex: number; excerpt: string }>;
  }>;
}>): Record<string, unknown> {
  return {
    overallScore: overrides?.overallScore ?? 4.5,
    judgeConfidence: overrides?.judgeConfidence ?? 0.93,
    dimensionScores: {
      coherence: 4.5,
      characterVoice: 4.2,
      plotLogic: 4.1,
      immersion: 4.3,
      factConsistency: 4.4,
    },
    passed: overrides?.passed ?? true,
    reasoning: overrides?.reasoning ?? "模型裁判判定通过。",
    issues: overrides?.issues ?? [],
  };
}

describe("Codex 叙事裁判（离线）", () => {
  it("首回合任务进展应计入关键进展判定，避免误报 8+ 回合停滞", async () => {
    const initialState = createInitialStateSnapshot();
    const steps = makeSteps(initialState, (index, prevState) => {
      if (index === 0) {
        return {
          ...prevState,
          completedTaskIds: ["prof_trial_lampkeeper"],
          turnCount: prevState.turnCount + 1,
        };
      }
      return { ...prevState, turnCount: prevState.turnCount + 1 };
    }, "已完成职业任务前置", [
      "你盯着手里的任务清单，确认任务条目被正确标记。",
      "你把手边的纸条折了两下，压平后放入笔记本。",
      "你检查面前的面板，确认按钮不再闪烁。",
      "你握紧灯芯，确认火种不会在这一步熄灭。",
      "你把耳机音量略微调低，排除环境噪音干扰。",
      "你把背包拉链拉紧，准备在原地停留。",
      "你观察墙上的刻痕，确认文字依旧清晰可辨。",
      "你再度回想任务提示，复述了一遍关键条件。",
    ]);

    const transcript = makeTranscript({
      steps,
      finalState: steps.at(-1)?.stateAfter ?? initialState,
      totalSteps: 8,
    });

    const result = await judgeNarrativeConsistencyCodex(transcript);

    assert.equal(result.passed, true);
    assert.ok(!result.issues.some((issue) => issue.description.includes("8+ 回合内状态缺少核心进展")), "首回合任务完成不应触发伪长程停滞判定");
  });

  it("连续 8 回合无任务/位置/武器/库存变化且无血量理智波动应触发停滞告警", async () => {
    const initialState = createInitialStateSnapshot();
    const steps = makeSteps(initialState, (index, prevState) => ({
      ...prevState,
      turnCount: prevState.turnCount + 1,
      // 保持任务/位置/武器/库存不变，确保仅通过文本推进
      playerLocation: prevState.playerLocation,
      completedTaskIds: [...prevState.completedTaskIds],
      activeTaskIds: [...prevState.activeTaskIds],
      profession: prevState.profession,
      equippedWeapon: prevState.equippedWeapon,
      inventoryItemCount: prevState.inventoryItemCount,
      hp: prevState.hp,
      sanity: prevState.sanity,
    }), "持续无实质反馈推进", [
      "你反复检查走廊的门锁，确认它依然紧闭。",
      "你在同一处地毯边缘来回测量，未发现新变化。",
      "你重新整理背包，确认物品摆放没有变化。",
      "你再度抬头凝望天花板，灯光依旧忽明忽暗。",
      "你在同一条走道停顿几秒，又继续迈出下一步。",
      "你再次走到楼道尽头，脚步声仍旧回荡。",
      "你低头观察墙面裂缝，裂缝并未扩大。",
      "你坐在门槛边，等待指示却仍旧未果。",
    ]);

    const transcript = makeTranscript({
      steps,
      finalState: steps.at(-1)?.stateAfter ?? initialState,
      terminatedReason: "max_steps",
      totalSteps: 8,
    });

    const result = await judgeNarrativeConsistencyCodex(transcript);

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((issue) => issue.description.includes("8+ 回合内状态缺少核心进展")), "应触发长程停滞 major 级告警");
  });

  it("当可用模型 key 时，Codex 裁判应走模型路径并返回模型来源标注", async () => {
    const initialState = createInitialStateSnapshot();
    const steps = makeSteps(initialState, (index, prevState) => ({
      ...prevState,
      turnCount: prevState.turnCount + 1,
      completedTaskIds: index === 0 ? ["prof_trial_lampkeeper"] : [...prevState.completedTaskIds],
    }), "模型驱动裁判回归", [
      "你确认任务提示后开始执行第一步。",
      "你沿楼梯走下，沿途检查每个转角。",
      "你注意到墙面上出现可疑的符号。",
      "你再次确认背包内未出现异常道具。",
      "你向同伴复述当前确认的信息。",
      "你重新回头确认出口方向。",
      "你与当前 NPC 进行核实确认。",
      "你将关键状态记录在案并继续前进。",
    ]);
    const transcript = makeTranscript({
      steps,
      finalState: steps.at(-1)?.stateAfter ?? initialState,
      totalSteps: 8,
    });

    const originalFetch = globalThis.fetch;
    const originalKey = process.env.PLAYTEST_LLM_API_KEY;
    const originalBase = process.env.PLAYTEST_LLM_BASE_URL;
    const originalModel = process.env.PLAYTEST_LLM_MODEL;
    const originalCache = process.env.VERSECRAFT_EVAL_DISABLE_CACHE;
    process.env.PLAYTEST_LLM_API_KEY = "sk-test-model-key";
    process.env.PLAYTEST_LLM_BASE_URL = "https://api.deepseek.com/v1";
    process.env.PLAYTEST_LLM_MODEL = "deepseek-v4-flash";
    process.env.VERSECRAFT_EVAL_DISABLE_CACHE = "1";
    let fetchCalled = 0;

    const fetchMock: typeof fetch = (async () => {
      fetchCalled += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(makePayloadForMockModel()),
            },
            finish_reason: "stop",
          }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 240,
            total_tokens: 360,
          },
          model: "deepseek-v4-flash",
        }),
      } as Response;
    }) as typeof fetch;

    globalThis.fetch = fetchMock;
    try {
      const result = await judgeNarrativeConsistencyCodex(transcript);
      assert.equal(result.judgeMode, "codex");
      assert.equal(result.judgeConfidenceSource, "codex");
      assert.equal(result.judgeModel, "deepseek-v4-flash");
      assert.equal(fetchCalled, 1);
      assert.equal(result.passed, true);
      assert.equal(result.judgeConfidence >= 0.5 && result.judgeConfidence <= 1, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey == null) {
        delete process.env.PLAYTEST_LLM_API_KEY;
      } else {
        process.env.PLAYTEST_LLM_API_KEY = originalKey;
      }
      if (originalBase == null) {
        delete process.env.PLAYTEST_LLM_BASE_URL;
      } else {
        process.env.PLAYTEST_LLM_BASE_URL = originalBase;
      }
      if (originalModel == null) {
        delete process.env.PLAYTEST_LLM_MODEL;
      } else {
        process.env.PLAYTEST_LLM_MODEL = originalModel;
      }
      if (originalCache == null) {
        delete process.env.VERSECRAFT_EVAL_DISABLE_CACHE;
      } else {
        process.env.VERSECRAFT_EVAL_DISABLE_CACHE = originalCache;
      }
    }
  });

  it("模型未返回 judgeConfidence 时，不应伪造置信值（返回估计路径）", async () => {
    const initialState = createInitialStateSnapshot();
    const steps = makeSteps(initialState, (index, prevState) => ({
      ...prevState,
      turnCount: prevState.turnCount + 1,
      completedTaskIds: index === 0 ? ["prof_trial_lampkeeper"] : [...prevState.completedTaskIds],
    }), "置信缺失回归", [
      "你确认任务提示后开始执行第一步。",
      "你沿楼梯走下，沿途检查每个转角。",
      "你注意到墙面上出现可疑的符号。",
      "你再次确认背包内未出现异常道具。",
      "你向同伴复述当前确认的信息。",
      "你重新回头确认出口方向。",
      "你与当前 NPC 进行核实确认。",
      "你将关键状态记录在案并继续前进。",
    ]);

    const transcript = makeTranscript({
      steps,
      finalState: steps.at(-1)?.stateAfter ?? initialState,
      totalSteps: 8,
    });

    const originalFetch = globalThis.fetch;
    const originalKey = process.env.PLAYTEST_LLM_API_KEY;
    const originalBase = process.env.PLAYTEST_LLM_BASE_URL;
    const originalModel = process.env.PLAYTEST_LLM_MODEL;
    const originalCache = process.env.VERSECRAFT_EVAL_DISABLE_CACHE;
    process.env.PLAYTEST_LLM_API_KEY = "sk-test-model-key";
    process.env.PLAYTEST_LLM_BASE_URL = "https://api.deepseek.com/v1";
    process.env.PLAYTEST_LLM_MODEL = "deepseek-v4-flash";
    process.env.VERSECRAFT_EVAL_DISABLE_CACHE = "1";

    const payload = makePayloadForMockModel();
    delete payload.judgeConfidence;

    let fetchCalled = 0;
    const fetchMock: typeof fetch = (async () => {
      fetchCalled += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(payload),
            },
            finish_reason: "stop",
          }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 240,
            total_tokens: 360,
          },
          model: "deepseek-v4-flash",
        }),
      } as Response;
    }) as typeof fetch;

    globalThis.fetch = fetchMock;

    try {
      const result = await judgeNarrativeConsistencyCodex(transcript);
      assert.equal(result.judgeMode, "codex");
      assert.equal(result.judgeConfidenceSource, "estimated");
      assert.equal(result.judgeConfidence, null);
      assert.equal(fetchCalled, 1);
      assert.equal(result.passed, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey == null) {
        delete process.env.PLAYTEST_LLM_API_KEY;
      } else {
        process.env.PLAYTEST_LLM_API_KEY = originalKey;
      }
      if (originalBase == null) {
        delete process.env.PLAYTEST_LLM_BASE_URL;
      } else {
        process.env.PLAYTEST_LLM_BASE_URL = originalBase;
      }
      if (originalModel == null) {
        delete process.env.PLAYTEST_LLM_MODEL;
      } else {
        process.env.PLAYTEST_LLM_MODEL = originalModel;
      }
      if (originalCache == null) {
        delete process.env.VERSECRAFT_EVAL_DISABLE_CACHE;
      } else {
        process.env.VERSECRAFT_EVAL_DISABLE_CACHE = originalCache;
      }
    }
  });
});
