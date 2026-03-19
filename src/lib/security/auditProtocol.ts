export const MAX_ROLLBACK_HISTORY = 60;
export const MAX_SPEED_LIMIT = 2200;

export type AuditInputEvent = {
  id: string;
  timestamp: number;
  x?: number;
  y?: number;
  type?: string;
  action?: string;
  meta?: Record<string, unknown>;
};

export type CorrectionPayload = {
  shouldRollback: boolean;
  reason: "signature_invalid" | "physics_violation" | "frequency_violation" | "none";
  lastLegalTimestamp: number;
  resetStateSnapshot: Record<string, unknown>;
  serverTimestamp: number;
  flaggedEventId?: string;
};

export type AuditUploadRequest = {
  auditTrail: AuditInputEvent[];
  clientStateChecksum: string;
  stateSnapshot: Record<string, unknown>;
  signature: string;
  clientTimestamp: number;
  sessionId?: string;
};

export type AuditUploadResponse = {
  ok: boolean;
  correction: CorrectionPayload;
};

