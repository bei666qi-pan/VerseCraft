import { createHash } from "node:crypto";
import { getChatQueueConfig } from "./config";
import { getChatQueueStore, __resetChatQueueStoreForTests } from "./store";
import {
  CHAT_QUEUE_CLIENT_FINGERPRINT_HEADER,
  CHAT_QUEUE_ID_HEADER,
  type ChatQueueAdmissionResult,
  type ChatQueueCapacityDecision,
  type ChatQueueIdentity,
  type ChatQueueReason,
  type ChatQueueStatusResult,
  type ChatQueueTicket,
} from "./types";

const SAFE_HEADER_VALUE = /^[a-zA-Z0-9_.:-]{8,160}$/;

function sanitizeHeaderToken(value: string | null): string | null {
  const s = value?.trim() ?? "";
  if (!s) return null;
  if (!SAFE_HEADER_VALUE.test(s)) return null;
  return s.slice(0, 160);
}

export function getChatQueueIdFromHeaders(headers: Headers): string | null {
  return sanitizeHeaderToken(headers.get(CHAT_QUEUE_ID_HEADER));
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function getChatQueueClientFingerprint(headers: Headers): string {
  const explicit = sanitizeHeaderToken(headers.get(CHAT_QUEUE_CLIENT_FINGERPRINT_HEADER));
  if (explicit) return explicit;
  const ip = getClientIpFromHeaders(headers);
  const ua = headers.get("user-agent")?.slice(0, 200) ?? "";
  return `anon:${createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32)}`;
}

export function buildChatQueueIdentity(args: {
  headers: Headers;
  sessionId: string | null;
  userId: string | null;
}): ChatQueueIdentity {
  return {
    sessionId: args.sessionId,
    userId: args.userId,
    clientFingerprint: getChatQueueClientFingerprint(args.headers),
  };
}

function disabledResult(): ChatQueueAdmissionResult {
  const config = getChatQueueConfig();
  return {
    ok: true,
    kind: "disabled",
    ticket: null,
    retryAfterSeconds: config.statusPollSeconds,
  };
}

export async function enqueueChatRequest(args: {
  requestId: string;
  identity: ChatQueueIdentity;
  reason?: ChatQueueReason;
}): Promise<ChatQueueAdmissionResult> {
  const config = getChatQueueConfig();
  if (!config.enabled) return disabledResult();
  const result = await getChatQueueStore().enqueue({
    requestId: args.requestId,
    identity: args.identity,
    reason: args.reason ?? "peak",
    config,
    now: Date.now(),
  });
  if (result.kind === "rejected") {
    return {
      ok: false,
      kind: "rejected",
      ticket: null,
      retryAfterSeconds: Math.max(config.statusPollSeconds, config.estimatedSecondsPerTurn),
      reason: "queue_full",
    };
  }
  return {
    ok: true,
    kind: result.kind,
    ticket: result.ticket,
    retryAfterSeconds: result.ticket.retryAfterSeconds,
  };
}

export async function shouldQueueChatRequest(): Promise<ChatQueueCapacityDecision> {
  const config = getChatQueueConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      shouldQueue: false,
      runningCount: null,
      queuedCount: null,
      maxRunning: config.maxRunning,
      maxQueued: config.maxQueued,
      retryAfterSeconds: config.statusPollSeconds,
    };
  }

  const depth = await getChatQueueStore().getDepth(config, Date.now());
  return {
    enabled: true,
    shouldQueue: depth.runningCount >= config.maxRunning,
    runningCount: depth.runningCount,
    queuedCount: depth.queuedCount,
    maxRunning: config.maxRunning,
    maxQueued: config.maxQueued,
    retryAfterSeconds: config.statusPollSeconds,
  };
}

export async function getChatQueueStatus(queueId: string): Promise<ChatQueueStatusResult> {
  const config = getChatQueueConfig();
  if (!config.enabled) {
    return { ok: false, status: "missing", retryAfterSeconds: config.statusPollSeconds };
  }
  const ticket = await getChatQueueStore().getStatus(queueId, config, Date.now());
  if (!ticket) return { ok: false, status: "missing", retryAfterSeconds: config.statusPollSeconds };
  if (ticket.status === "expired") return { ok: false, status: "expired", retryAfterSeconds: config.statusPollSeconds };
  if (ticket.status === "cancelled") return { ok: false, status: "cancelled", retryAfterSeconds: config.statusPollSeconds };
  if (ticket.status === "failed") return { ok: false, status: "failed", retryAfterSeconds: config.statusPollSeconds };
  if (ticket.status === "completed") return { ok: false, status: "completed", retryAfterSeconds: config.statusPollSeconds };
  return { ok: true, ticket, retryAfterSeconds: ticket.retryAfterSeconds };
}

export async function claimChatQueueTicketForExecution(args: {
  queueId: string;
  identity: ChatQueueIdentity;
}): Promise<ChatQueueAdmissionResult> {
  const config = getChatQueueConfig();
  if (!config.enabled) return disabledResult();
  const claimed = await getChatQueueStore().claimForExecution({
    queueId: args.queueId,
    identity: args.identity,
    config,
    now: Date.now(),
  });
  if (!claimed.ok) {
    return {
      ok: false,
      kind: "rejected",
      ticket: null,
      retryAfterSeconds: config.statusPollSeconds,
      reason:
        claimed.reason === "not_ready"
          ? "ticket_not_ready"
          : claimed.reason === "terminal"
            ? "ticket_terminal"
            : "invalid_ticket",
    };
  }
  return {
    ok: true,
    kind: claimed.ticket.status === "queued" ? "queued" : "running",
    ticket: claimed.ticket,
    retryAfterSeconds: claimed.ticket.retryAfterSeconds,
  };
}

export async function completeChatQueueTicket(queueId: string | null): Promise<void> {
  if (!queueId) return;
  const config = getChatQueueConfig();
  if (!config.enabled) return;
  await getChatQueueStore().complete(queueId, config, Date.now());
}

export async function failChatQueueTicket(queueId: string | null): Promise<void> {
  if (!queueId) return;
  const config = getChatQueueConfig();
  if (!config.enabled) return;
  await getChatQueueStore().fail(queueId, config, Date.now());
}

export async function cancelChatQueueTicket(queueId: string): Promise<ChatQueueTicket | null> {
  const config = getChatQueueConfig();
  if (!config.enabled) return null;
  return getChatQueueStore().cancel(queueId, config, Date.now());
}

export function buildChatQueueResponsePayload(ticket: ChatQueueTicket | null, extra?: Record<string, unknown>) {
  return {
    queueId: ticket?.queueId ?? null,
    requestId: ticket?.requestId ?? null,
    status: ticket?.status ?? "ready",
    position: ticket?.position ?? 0,
    etaSeconds: ticket?.etaSeconds ?? 0,
    retryAfterSeconds: ticket?.retryAfterSeconds ?? getChatQueueConfig().statusPollSeconds,
    ...extra,
  };
}

export async function __resetChatQueueForTests(): Promise<void> {
  await __resetChatQueueStoreForTests();
}
