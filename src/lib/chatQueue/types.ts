export const CHAT_QUEUE_ID_HEADER = "x-versecraft-chat-queue-id";
export const CHAT_QUEUE_CLIENT_FINGERPRINT_HEADER = "x-versecraft-client-fingerprint";

export type ChatQueueStatus =
  | "queued"
  | "running"
  | "ready"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export type ChatQueueReason = "peak" | "rate_limited" | "capacity_guard" | "manual";

export type ChatQueueTicket = {
  queueId: string;
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  clientFingerprint: string;
  createdAt: number;
  updatedAt: number;
  status: ChatQueueStatus;
  position: number;
  etaSeconds: number | null;
  retryAfterSeconds: number;
  reason: ChatQueueReason;
};

export type ChatQueueIdentity = {
  sessionId: string | null;
  userId: string | null;
  clientFingerprint: string;
};

export type ChatQueueAdmissionResult =
  | {
      ok: true;
      kind: "disabled";
      ticket: null;
      retryAfterSeconds: number;
    }
  | {
      ok: true;
      kind: "running" | "queued" | "reused";
      ticket: ChatQueueTicket;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      kind: "rejected";
      ticket: null;
      retryAfterSeconds: number;
      reason: "queue_full" | "invalid_ticket" | "ticket_not_ready" | "ticket_terminal";
    };

export type ChatQueueCapacityDecision = {
  enabled: boolean;
  shouldQueue: boolean;
  runningCount: number | null;
  queuedCount: number | null;
  maxRunning: number;
  maxQueued: number;
  retryAfterSeconds: number;
};

export type ChatQueueStatusResult =
  | {
      ok: true;
      ticket: ChatQueueTicket;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      status: "missing" | "invalid" | "expired" | "cancelled" | "failed" | "completed";
      retryAfterSeconds: number;
    };
