export type AdminCapacityEstimateStatus = "ready" | "near_limit" | "full" | "sample_insufficient" | "unavailable";
export type AdminCapacityConfidence = "high" | "medium" | "low";

export type AdminCapacityEstimateInput = {
  queueEnabled: boolean;
  queueDepthKnown: boolean;
  runningCount: number | null;
  queuedCount: number | null;
  maxRunning: number;
  maxQueued: number;
  dbOk: boolean;
  aiGatewayOk: boolean;
  recentAiSampleSize: number;
};

export type AdminCapacityEstimate = {
  status: AdminCapacityEstimateStatus;
  remainingConcurrentActions: number | null;
  confidence: AdminCapacityConfidence;
  explanation: string;
};

function clampNonNegativeInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function computeAdminCapacityEstimate(input: AdminCapacityEstimateInput): AdminCapacityEstimate {
  const maxRunning = Math.max(1, clampNonNegativeInt(input.maxRunning));
  const maxQueued = clampNonNegativeInt(input.maxQueued);
  const runningCount = input.runningCount == null ? null : clampNonNegativeInt(input.runningCount);
  const queuedCount = input.queuedCount == null ? null : clampNonNegativeInt(input.queuedCount);
  const recentAiSampleSize = clampNonNegativeInt(input.recentAiSampleSize);

  if (!input.dbOk || !input.aiGatewayOk) {
    return {
      status: "unavailable",
      remainingConcurrentActions: null,
      confidence: "low",
      explanation: "数据库或 AI 网关处于降级状态，不能给出可靠承载估算。",
    };
  }

  if (!input.queueEnabled) {
    return {
      status: "sample_insufficient",
      remainingConcurrentActions: null,
      confidence: "low",
      explanation: "聊天排队保护未启用，缺少运行中与排队上限，暂无法可靠估算承载余量。",
    };
  }

  if (!input.queueDepthKnown || runningCount == null || queuedCount == null) {
    return {
      status: "sample_insufficient",
      remainingConcurrentActions: null,
      confidence: "low",
      explanation: "排队深度暂不可用，只能展示当前在线人数，不能估算并发余量。",
    };
  }

  if (recentAiSampleSize < 5) {
    return {
      status: "sample_insufficient",
      remainingConcurrentActions: null,
      confidence: "low",
      explanation: "近 1 小时 AI 回合样本不足，暂不输出承载余量结论。",
    };
  }

  const remainingImmediate = Math.max(0, maxRunning - runningCount);
  const remainingQueueSlots = Math.max(0, maxQueued - queuedCount);
  const confidence: AdminCapacityConfidence = recentAiSampleSize >= 20 ? "high" : "medium";

  if (remainingImmediate <= 0 && remainingQueueSlots <= 0) {
    return {
      status: "full",
      remainingConcurrentActions: 0,
      confidence,
      explanation: "即时处理与排队缓冲都已满，应限制新行动或扩容。",
    };
  }

  if (remainingImmediate <= 0) {
    return {
      status: "near_limit",
      remainingConcurrentActions: 0,
      confidence,
      explanation: `即时处理位已满，仍可进入排队缓冲 ${remainingQueueSlots} 个行动。`,
    };
  }

  return {
    status: "ready",
    remainingConcurrentActions: remainingImmediate,
    confidence,
    explanation: `按聊天队列运行位估算，当前还可即时承接 ${remainingImmediate} 个并发行动。`,
  };
}
