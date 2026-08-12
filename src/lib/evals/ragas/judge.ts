import { callDeepSeekCompletion } from "@/lib/evals/liveProvider";
import type { RagasCase, RagasMetricResult } from "./types";

function numericScore(value: unknown): number | null {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
}

export async function judgeRagasCase(testCase: RagasCase): Promise<RagasMetricResult[]> {
  try {
    const response = await callDeepSeekCompletion({
      jsonMode: true,
      temperature: 0,
      maxTokens: 320,
      timeoutMs: 45_000,
      messages: [
        {
          role: "system",
          content: [
            "你是 RAG 质量评测器。请严格以 JSON 格式输出。",
            '只输出 {"faithfulness":0到1,"answer_relevancy":0到1}。',
            "faithfulness 衡量回答中的断言是否能被 contexts 支持；answer_relevancy 衡量回答是否直接回答 question。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ question: testCase.question, answer: testCase.answer, contexts: testCase.contexts.map((context) => context.text), ground_truth: testCase.groundTruth }),
        },
      ],
    });
    const parsed = JSON.parse(response.content) as Record<string, unknown>;
    const faithfulness = numericScore(parsed.faithfulness);
    const answerRelevancy = numericScore(parsed.answer_relevancy);
    if (faithfulness === null || answerRelevancy === null) throw new Error("judge_scores_invalid");
    return [
      { name: "faithfulness", value: faithfulness, status: "ok", method: "model_judge" },
      { name: "answer_relevancy", value: answerRelevancy, status: "ok", method: "model_judge" },
    ];
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 160) : "live_judge_failed";
    return [
      { name: "faithfulness", value: null, status: "unavailable", method: "model_judge", reason },
      { name: "answer_relevancy", value: null, status: "unavailable", method: "model_judge", reason },
    ];
  }
}
