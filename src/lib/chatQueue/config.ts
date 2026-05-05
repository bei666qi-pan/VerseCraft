import { envBoolean, envNumber, envRaw } from "@/lib/config/envRaw";

export type ChatQueueConfig = {
  enabled: boolean;
  maxRunning: number;
  maxQueued: number;
  estimatedSecondsPerTurn: number;
  ticketTtlSeconds: number;
  statusPollSeconds: number;
  redisPrefix: string;
};

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, safe));
}

function sanitizeRedisPrefix(value: string | undefined): string {
  const raw = (value ?? "vc:chat_queue").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 80);
  return cleaned || "vc:chat_queue";
}

export function getChatQueueConfig(): ChatQueueConfig {
  return {
    enabled: envBoolean("VC_CHAT_QUEUE_ENABLED", true),
    maxRunning: clampInt(envNumber("VC_CHAT_QUEUE_MAX_RUNNING", 4), 1, 100),
    maxQueued: clampInt(envNumber("VC_CHAT_QUEUE_MAX_QUEUED", 80), 0, 10_000),
    estimatedSecondsPerTurn: clampInt(envNumber("VC_CHAT_QUEUE_ESTIMATED_SECONDS_PER_TURN", 12), 1, 600),
    ticketTtlSeconds: clampInt(envNumber("VC_CHAT_QUEUE_TICKET_TTL_SECONDS", 180), 10, 3600),
    statusPollSeconds: clampInt(envNumber("VC_CHAT_QUEUE_STATUS_POLL_SECONDS", 2), 1, 30),
    redisPrefix: sanitizeRedisPrefix(envRaw("VC_CHAT_QUEUE_REDIS_PREFIX")),
  };
}
