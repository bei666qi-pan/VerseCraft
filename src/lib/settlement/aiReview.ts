import "server-only";

import { createRequestId } from "@/lib/security/helpers";
import { runBackofficeReasonerJsonTask } from "@/lib/ai/logicalTasks";
import { readLatestAiAnalysisSnapshot, upsertAiAnalysisSnapshot } from "@/lib/ai/analysis/snapshotStore";
import { validateAnalysisOutputBase, type AnalysisOutputBase } from "@/lib/ai/analysis/schema";

export type SettlementAnalysisInput = {
  sessionId: string;
  player: {
    grade: string;
    survivalHours: number;
    maxFloor: number;
    kills: number;
    isDead: boolean;
  };
  signals: {
    playerLocation?: string;
    keyEvents: string[];
  };
  evidenceQuality: "enough" | "insufficient";
};

export type SettlementAnalysisOutput = AnalysisOutputBase & {
  summary: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
};

const SETTLEMENT_ANALYSIS_TTL_MS = 6 * 60 * 60 * 1000;

function fallbackSettlementOutput(input: SettlementAnalysisInput): SettlementAnalysisOutput {
  return {
    summary:
      input.evidenceQuality === "insufficient"
        ? "记忆碎片过碎，难以拼出完整十日：先记下关键抉择与谁说了什么，下一局再谈真假。"
        : "本局宜以「守住生机、辨清规则、少押无解之赌」为轴复盘：先稳住作息与资源，再在关键楼层做可验证的推进，别让谎言替你签字。",
    strengths: [],
    risks: [],
    nextActions: [],
    confidence: {
      score: 0.35,
      level: "low",
      reason: "模型不可用或证据不足，使用降级输出",
    },
    evidence: [
      { metric: "grade", value: input.player.grade, source: "settlement" },
      { metric: "maxFloor", value: String(input.player.maxFloor), source: "settlement" },
    ],
    evidenceSufficiency: input.evidenceQuality,
    generatedAt: new Date().toISOString(),
  };
}

function validateSettlementOutput(input: unknown): SettlementAnalysisOutput | null {
  const base = validateAnalysisOutputBase(input);
  if (!base) return null;
  const x = input as Record<string, unknown>;
  if (typeof x.summary !== "string") return null;
  if (!Array.isArray(x.strengths) || !Array.isArray(x.risks) || !Array.isArray(x.nextActions)) return null;
  return x as SettlementAnalysisOutput;
}

export async function getCachedSettlementAnalysis(sessionId: string): Promise<{
  output: SettlementAnalysisOutput;
  stale: boolean;
} | null> {
  const row = await readLatestAiAnalysisSnapshot({
    task: "settlement_review",
    scopeKey: `session:${sessionId}`,
  });
  if (!row) return null;
  const parsed = validateSettlementOutput(row.outputJson);
  if (!parsed) return null;
  return {
    output: parsed,
    stale: Date.now() >= new Date(row.staleAt).getTime(),
  };
}

export async function refreshSettlementAnalysis(input: SettlementAnalysisInput): Promise<{
  output: SettlementAnalysisOutput;
  degraded: boolean;
  model: string;
}> {
  const requestId = createRequestId("settlement_review");
  const schemaHint = {
    summary: "string",
    strengths: ["string"],
    risks: ["string"],
    nextActions: ["string"],
    confidence: { score: "0-1", level: "high|medium|low", reason: "string" },
    evidence: [{ metric: "string", value: "string", source: "string" }],
    evidenceSufficiency: "enough|insufficient",
    generatedAt: "ISO datetime",
  };
  try {
    const ai = await runBackofficeReasonerJsonTask({
      messages: [
        {
          role: "system",
          content: [
            "你是 VerseCraft 结算复盘分析官。",
            "文风宜贴近高悬念、封闭空间、规则博弈式生存叙事（可参考《十日终焉》一类作品的节奏：困局、博弈、信任与谎言），但必须留在 VerseCraft 公寓设定内，勿照搬原作人物、组织或专有剧情。",
            "必须证据优先，不得编造；证据不足时明确写“证据不足”。",
            "输出必须是单个 JSON 对象，不要 markdown。",
            `结构必须匹配：${JSON.stringify(schemaHint)}`,
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      ctx: {
        requestId,
        sessionId: input.sessionId,
        path: "/lib/settlement/aiReview",
        tags: ["settlement_review", "backoffice_ai"],
      },
      requestTimeoutMs: 20_000,
    });
    if (!ai.ok) {
      return { output: fallbackSettlementOutput(input), degraded: true, model: "none" };
    }
    const parsed = validateSettlementOutput(JSON.parse(String(ai.content ?? "{}")));
    const output = parsed ?? fallbackSettlementOutput(input);
    const generatedAt = new Date(output.generatedAt || Date.now());
    await upsertAiAnalysisSnapshot({
      task: "settlement_review",
      scopeKey: `session:${input.sessionId}`,
      inputJson: input as unknown as Record<string, unknown>,
      outputJson: output as unknown as Record<string, unknown>,
      modelRole: ai.logicalRole,
      dataRevision: `${input.sessionId}|${input.player.grade}|${input.player.maxFloor}|${input.player.kills}`,
      staleAt: new Date(generatedAt.getTime() + SETTLEMENT_ANALYSIS_TTL_MS),
      generatedAt,
    });
    return { output, degraded: parsed == null, model: ai.logicalRole };
  } catch {
    return { output: fallbackSettlementOutput(input), degraded: true, model: "none" };
  }
}
