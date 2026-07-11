/**
 * JudgeService — LLM-as-Judge 统一入口
 *
 * 将现有 Judge 框架（rubric / prompt / verdict parsing）接入统一 AI service 层。
 * - live mode: 用 EVAL_JUDGE TaskType 调用 AI service
 * - mock mode: 退化到 evaluateOffline 启发式
 *
 * 设计原则：
 * - 不重写现有 judge/judgeExecutor.ts / judgePrompt.ts 逻辑，只包装
 * - 通过 harness budgetGuard 控制 live 调用次数
 * - 入口统一，供 eval 脚本与 harness runner 共用
 */

import { executeChatCompletion } from "@/lib/ai/service";
import { getRubric } from "./rubricRegistry";
import {
  buildJudgePrompt,
  type JudgePromptInput,
} from "./judgePrompt";
import {
  evaluateOffline,
  parseJudgeVerdict,
  aggregateMultiJudge,
  type ExecuteJudgeInput,
  type AggregateMultiJudgeInput,
  type OfflineJudgeInput,
} from "./judgeExecutor";
import {
  type JudgeRubric,
  type JudgeTarget,
  type JudgeVerdict,
  type MultiJudgeResult,
  type PositionScheme,
  generatePositionScheme,
} from "./types";
import { tryConsumeBudget } from "@/lib/evals/harness/budgetGuard";
import { resolveEvalMode } from "@/lib/evals/harness/config";

// === 配置 ===

export interface JudgeServiceConfig {
  /** 每个 target 的 judge 复本数（1-5，默认 3） */
  numJudges: number;
  /** 是否启用位置随机化（默认 true） */
  positionRandomization: boolean;
  /** 是否启用思维链（默认 true） */
  chainOfThought: boolean;
  /** Judge 逻辑角色名（记录用，默认 "eval_judge"） */
  judgeRole: string;
  /** 超时 ms（默认 15000） */
  timeoutMs: number;
  /** 是否强制 mock（跳过 live） */
  forceMock: boolean;
}

export const DEFAULT_JUDGE_CONFIG: JudgeServiceConfig = {
  numJudges: 3,
  positionRandomization: true,
  chainOfThought: true,
  judgeRole: "eval_judge",
  timeoutMs: 15_000,
  forceMock: false,
};

// === JudgeService ===

export class JudgeService {
  /** 单次 judge 评判 */
  static async judge(options: {
    rubricId: string;
    target: JudgeTarget;
    config?: Partial<JudgeServiceConfig>;
  }): Promise<{ verdict: JudgeVerdict | null }> {
    const rubric = getRubric(options.rubricId);
    if (!rubric) throw new Error(`Rubric not found: ${options.rubricId}`);

    const cfg: JudgeServiceConfig = { ...DEFAULT_JUDGE_CONFIG, ...options.config };
    const mode = resolveEvalMode();
    const isMock = mode === "mock" || cfg.forceMock;

    if (!isMock) {
      // Live mode: consume budget before calling
      if (!tryConsumeBudget()) {
        // Budget exhausted, fall back to offline
        const offline: OfflineJudgeInput = { rubric, target: options.target };
        return { verdict: { ...evaluateOffline(offline), judgeModel: "offline_heuristic(budget_exhausted)" } };
      }
    }

    // Build prompt for a single judge (index 0, original position)
    const positionScheme: PositionScheme = cfg.positionRandomization
      ? generatePositionScheme(options.target.caseId.length * 7)
      : "original";

    if (isMock) {
      // Mock mode: use offline heuristic
      const offline: OfflineJudgeInput = { rubric, target: options.target };
      return { verdict: evaluateOffline(offline) };
    }

    // Live mode: call AI service
    const promptOptions: JudgePromptInput = {
      rubric,
      target: options.target,
      positionScheme,
      chainOfThought: cfg.chainOfThought,
    };
    const prompt = buildJudgePrompt(promptOptions);

    try {
      const aiResponse = await executeChatCompletion({
        task: "EVAL_JUDGE",
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
        ctx: {
          requestId: `judge-${options.target.caseId}`,
          task: "EVAL_JUDGE",
          tags: {
            rubricId: options.rubricId,
            judgeRole: cfg.judgeRole,
            positionScheme,
          },
        },
        requestTimeoutMs: cfg.timeoutMs,
        skipCache: true,
      });

      if (!aiResponse.ok) {
        // Fall back to offline on AI failure
        const offline: OfflineJudgeInput = { rubric, target: options.target };
        return { verdict: { ...evaluateOffline(offline), judgeModel: `offline_heuristic(ai_error:${aiResponse.code})` } };
      }

      const judgeInput: ExecuteJudgeInput = {
        rubric,
        target: options.target,
        rawJudgeOutput: aiResponse.content,
        judgeModel: aiResponse.model ?? "unknown",
        judgeRole: cfg.judgeRole,
        positionScheme,
      };

      const verdict = parseJudgeVerdict(judgeInput);
      return { verdict };
    } catch (error) {
      const offline: OfflineJudgeInput = { rubric, target: options.target };
      const message = error instanceof Error ? error.message : String(error);
      return { verdict: { ...evaluateOffline(offline), judgeModel: `offline_heuristic(exception:${message.slice(0, 60)})` } };
    }
  }

  /** 多裁判 judge 评判 */
  static async judgeMulti(options: {
    rubricId: string;
    target: JudgeTarget;
    config?: Partial<JudgeServiceConfig>;
  }): Promise<{ result: MultiJudgeResult }> {
    const rubric = getRubric(options.rubricId);
    if (!rubric) throw new Error(`Rubric not found: ${options.rubricId}`);

    const cfg: JudgeServiceConfig = { ...DEFAULT_JUDGE_CONFIG, ...options.config };
    const mode = resolveEvalMode();

    // Decide how many live calls we can afford
    const budgetOk = mode !== "mock" && !cfg.forceMock ? tryConsumeBudget() : false;
    const liveCount = budgetOk ? Math.min(cfg.numJudges, 5) : 0;
    const offlineCount = cfg.numJudges - liveCount;

    const verdicts: JudgeVerdict[] = [];
    const positionSchemes: PositionScheme[] = [];

    // Build position schemes
    for (let i = 0; i < cfg.numJudges; i++) {
      positionSchemes.push(
        cfg.positionRandomization
          ? generatePositionScheme((options.target.caseId.length + i) * 7)
          : "original"
      );
    }

    // Execute live judges
    for (let i = 0; i < liveCount; i++) {
      const scheme = positionSchemes[i]!;
      const promptInput: JudgePromptInput = {
        rubric,
        target: options.target,
        positionScheme: scheme,
        chainOfThought: cfg.chainOfThought,
      };
      const prompt = buildJudgePrompt(promptInput);

      try {
        const aiResponse = await executeChatCompletion({
          task: "EVAL_JUDGE",
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: prompt.userPrompt },
          ],
          ctx: {
            requestId: `judge-${options.target.caseId}-${i}`,
            task: "EVAL_JUDGE",
            tags: {
              rubricId: options.rubricId,
              judgeIndex: String(i),
              positionScheme: scheme,
            },
          },
          requestTimeoutMs: cfg.timeoutMs,
          skipCache: true,
        });

        if (aiResponse.ok) {
          const verdict = parseJudgeVerdict({
            rubric,
            target: options.target,
            rawJudgeOutput: aiResponse.content,
            judgeModel: aiResponse.model ?? "unknown",
            judgeRole: cfg.judgeRole,
            positionScheme: scheme,
          });
          if (verdict) verdicts.push(verdict);
        }
      } catch {
        // Individual judge failure, skip
      }
    }

    // Execute offline (heuristic) judges to fill remaining slots
    for (let i = 0; i < offlineCount && verdicts.length < cfg.numJudges; i++) {
      const offline: OfflineJudgeInput = { rubric, target: options.target };
      verdicts.push({ ...evaluateOffline(offline), judgeModel: "offline_heuristic", judgeRole: `offline` });
    }

    // Aggregate
    const result = aggregateMultiJudge({
      caseId: options.target.caseId,
      scenario: options.target.scenario,
      verdicts,
      rubric,
    });

    return { result };
  }
}
