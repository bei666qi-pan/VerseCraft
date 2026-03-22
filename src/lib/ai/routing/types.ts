// src/lib/ai/routing/types.ts
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AiProviderId, TaskType } from "@/lib/ai/types/core";
import type { AiFailureKind, AiFailureSeverity } from "@/lib/ai/types/routingErrors";

export interface AiRoutingAttempt {
  logicalRole: AiLogicalRole;
  providerId: AiProviderId;
  /** Opaque upstream model name sent to the gateway (for debug only). */
  gatewayModel?: string;
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
  intendedRole: AiLogicalRole;
  actualLogicalRole: AiLogicalRole | null;
  fallbackCount: number;
  attempts: AiRoutingAttempt[];
  finalStatus: "success" | "fallback_sse_payload" | "upstream_exhausted" | "aborted";
  lastFailureSummary?: string;
}
