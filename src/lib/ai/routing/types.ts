// src/lib/ai/routing/types.ts
import type { AllowedModelId } from "@/lib/ai/models/registry";
import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AiProviderId, TaskType } from "@/lib/ai/types/core";
import type { AiFailureKind, AiFailureSeverity } from "@/lib/ai/types/routingErrors";

export interface AiRoutingAttempt {
  modelId: AllowedModelId;
  providerId: AiProviderId;
  phase: "http" | "stream_body";
  failureKind?: AiFailureKind;
  severity?: AiFailureSeverity;
  httpStatus?: number;
  message?: string;
  latencyMs?: number;
}

export interface AiRoutingReport {
  requestId: string;
  task: TaskType;
  operationMode: OperationMode;
  intendedModel: AllowedModelId;
  actualModel: AllowedModelId | null;
  fallbackCount: number;
  attempts: AiRoutingAttempt[];
  finalStatus: "success" | "fallback_sse_payload" | "upstream_exhausted" | "aborted";
  lastFailureSummary?: string;
}
