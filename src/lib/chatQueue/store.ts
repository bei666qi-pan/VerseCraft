import { randomUUID } from "node:crypto";
import { getAppRedisClient } from "@/lib/ratelimit";
import type { ChatQueueConfig } from "./config";
import type { ChatQueueIdentity, ChatQueueReason, ChatQueueStatus, ChatQueueTicket } from "./types";

type MutableTicket = Omit<ChatQueueTicket, "position" | "etaSeconds" | "retryAfterSeconds">;

const TERMINAL_STATUSES = new Set<ChatQueueStatus>([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

export type ChatQueueStore = {
  enqueue(args: {
    requestId: string;
    identity: ChatQueueIdentity;
    reason: ChatQueueReason;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ kind: "running" | "queued" | "reused"; ticket: ChatQueueTicket } | { kind: "rejected" }>;
  getStatus(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null>;
  claimForExecution(args: {
    queueId: string;
    identity: ChatQueueIdentity;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ ok: true; ticket: ChatQueueTicket } | { ok: false; reason: "missing" | "not_ready" | "identity_mismatch" | "terminal" }>;
  complete(queueId: string, config: ChatQueueConfig, now: number): Promise<void>;
  fail(queueId: string, config: ChatQueueConfig, now: number): Promise<void>;
  cancel(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null>;
  getDepth(config: ChatQueueConfig, now: number): Promise<{ runningCount: number; queuedCount: number }>;
  resetForTests(): Promise<void>;
};

function createQueueId(): string {
  return `vcq_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function identityKeys(identity: ChatQueueIdentity): string[] {
  const keys: string[] = [];
  if (identity.userId) keys.push(`user:${identity.userId}`);
  if (identity.sessionId) keys.push(`session:${identity.sessionId}`);
  if (identity.clientFingerprint) keys.push(`fp:${identity.clientFingerprint}`);
  return keys;
}

function isTerminal(status: ChatQueueStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isExpired(ticket: MutableTicket, config: ChatQueueConfig, now: number): boolean {
  return now - ticket.createdAt >= config.ticketTtlSeconds * 1000;
}

function withComputedPosition(
  ticket: MutableTicket,
  args: { runningCount: number; queuedBefore: number; config: ChatQueueConfig }
): ChatQueueTicket {
  const activePosition =
    ticket.status === "queued"
      ? Math.max(0, args.runningCount + args.queuedBefore)
      : 0;
  return {
    ...ticket,
    position: activePosition,
    etaSeconds:
      ticket.status === "queued"
        ? Math.max(0, activePosition * args.config.estimatedSecondsPerTurn)
        : 0,
    retryAfterSeconds: args.config.statusPollSeconds,
  };
}

function normalizeTicket(raw: unknown): MutableTicket | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const queueId = typeof o.queueId === "string" ? o.queueId : "";
  const requestId = typeof o.requestId === "string" ? o.requestId : "";
  const status = typeof o.status === "string" ? o.status : "";
  if (!queueId || !requestId) return null;
  if (
    status !== "queued" &&
    status !== "running" &&
    status !== "ready" &&
    status !== "completed" &&
    status !== "failed" &&
    status !== "expired" &&
    status !== "cancelled"
  ) {
    return null;
  }
  const createdAt = Number(o.createdAt);
  const updatedAt = Number(o.updatedAt);
  return {
    queueId,
    requestId,
    sessionId: typeof o.sessionId === "string" && o.sessionId ? o.sessionId : null,
    userId: typeof o.userId === "string" && o.userId ? o.userId : null,
    clientFingerprint: typeof o.clientFingerprint === "string" ? o.clientFingerprint : "",
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    status,
    reason:
      o.reason === "rate_limited" ||
      o.reason === "capacity_guard" ||
      o.reason === "manual" ||
      o.reason === "peak"
        ? o.reason
        : "peak",
  };
}

function sameIdentity(ticket: MutableTicket, identity: ChatQueueIdentity): boolean {
  if (ticket.userId && identity.userId) return ticket.userId === identity.userId;
  if (ticket.sessionId && identity.sessionId) return ticket.sessionId === identity.sessionId;
  return Boolean(ticket.clientFingerprint && ticket.clientFingerprint === identity.clientFingerprint);
}

function logQueueEvent(eventName: string, ticket: MutableTicket | ChatQueueTicket, extra?: Record<string, unknown>) {
  console.info(`[chat_queue] ${eventName}`, {
    queueId: ticket.queueId,
    requestId: ticket.requestId,
    hasSession: Boolean(ticket.sessionId),
    hasUser: Boolean(ticket.userId),
    status: ticket.status,
    position: "position" in ticket ? ticket.position : undefined,
    etaSeconds: "etaSeconds" in ticket ? ticket.etaSeconds : undefined,
    reason: ticket.reason,
    ...extra,
  });
}

class MemoryChatQueueStore implements ChatQueueStore {
  private tickets = new Map<string, MutableTicket>();
  private queued: string[] = [];
  private running = new Set<string>();
  private active = new Map<string, string>();

  private ticketKey(queueId: string): string {
    return queueId;
  }

  private async cleanup(config: ChatQueueConfig, now: number): Promise<void> {
    for (const [queueId, ticket] of this.tickets) {
      if (!isTerminal(ticket.status) && isExpired(ticket, config, now)) {
        ticket.status = "expired";
        ticket.updatedAt = now;
        this.queued = this.queued.filter((id) => id !== queueId);
        this.running.delete(queueId);
        this.clearActive(ticket);
        logQueueEvent("queue_expired", ticket);
      }
    }
    await this.promote(config, now);
  }

  private clearActive(ticket: MutableTicket): void {
    for (const key of identityKeys(ticket)) {
      if (this.active.get(key) === ticket.queueId) this.active.delete(key);
    }
  }

  private setActive(ticket: MutableTicket): void {
    for (const key of identityKeys(ticket)) this.active.set(key, ticket.queueId);
  }

  private async promote(config: ChatQueueConfig, now: number): Promise<void> {
    while (this.running.size < config.maxRunning && this.queued.length > 0) {
      const queueId = this.queued.shift()!;
      const ticket = this.tickets.get(queueId);
      if (!ticket || isTerminal(ticket.status)) continue;
      ticket.status = "running";
      ticket.updatedAt = now;
      this.running.add(queueId);
      logQueueEvent("queue_promoted_running", withComputedPosition(ticket, {
        runningCount: this.running.size,
        queuedBefore: 0,
        config,
      }));
    }
  }

  private compute(ticket: MutableTicket, config: ChatQueueConfig): ChatQueueTicket {
    const queuedBefore = Math.max(0, this.queued.indexOf(ticket.queueId));
    return withComputedPosition(ticket, {
      runningCount: this.running.size,
      queuedBefore,
      config,
    });
  }

  async enqueue(args: {
    requestId: string;
    identity: ChatQueueIdentity;
    reason: ChatQueueReason;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ kind: "running" | "queued" | "reused"; ticket: ChatQueueTicket } | { kind: "rejected" }> {
    await this.cleanup(args.config, args.now);

    for (const key of identityKeys(args.identity)) {
      const existingId = this.active.get(key);
      if (!existingId) continue;
      const existing = this.tickets.get(existingId);
      if (existing && !isTerminal(existing.status) && !isExpired(existing, args.config, args.now)) {
        const ticket = this.compute(existing, args.config);
        logQueueEvent("queue_reused_existing", ticket);
        return { kind: "reused", ticket };
      }
      if (existing) this.clearActive(existing);
    }

    const runningCount = this.running.size;
    const status: ChatQueueStatus = runningCount < args.config.maxRunning ? "running" : "queued";
    if (status === "queued" && this.queued.length >= args.config.maxQueued) {
      console.info("[chat_queue] queue_rejected_full", {
        requestId: args.requestId,
        maxQueued: args.config.maxQueued,
        runningCount,
        queuedCount: this.queued.length,
      });
      return { kind: "rejected" };
    }

    const ticket: MutableTicket = {
      queueId: createQueueId(),
      requestId: args.requestId,
      sessionId: args.identity.sessionId,
      userId: args.identity.userId,
      clientFingerprint: args.identity.clientFingerprint,
      createdAt: args.now,
      updatedAt: args.now,
      status,
      reason: args.reason,
    };
    this.tickets.set(this.ticketKey(ticket.queueId), ticket);
    this.setActive(ticket);
    if (status === "running") this.running.add(ticket.queueId);
    else this.queued.push(ticket.queueId);

    const computed = this.compute(ticket, args.config);
    logQueueEvent(status === "running" ? "queue_promoted_running" : "queue_enqueued", computed);
    return { kind: status, ticket: computed };
  }

  async getStatus(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null> {
    await this.cleanup(config, now);
    const ticket = this.tickets.get(queueId);
    if (!ticket) return null;
    return this.compute(ticket, config);
  }

  async claimForExecution(args: {
    queueId: string;
    identity: ChatQueueIdentity;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ ok: true; ticket: ChatQueueTicket } | { ok: false; reason: "missing" | "not_ready" | "identity_mismatch" | "terminal" }> {
    await this.cleanup(args.config, args.now);
    const ticket = this.tickets.get(args.queueId);
    if (!ticket) return { ok: false, reason: "missing" };
    if (isTerminal(ticket.status)) return { ok: false, reason: "terminal" };
    if (!sameIdentity(ticket, args.identity)) return { ok: false, reason: "identity_mismatch" };
    if (ticket.status === "queued") return { ok: false, reason: "not_ready" };
    ticket.status = "running";
    ticket.updatedAt = args.now;
    this.running.add(ticket.queueId);
    return { ok: true, ticket: this.compute(ticket, args.config) };
  }

  async complete(queueId: string, config: ChatQueueConfig, now: number): Promise<void> {
    const ticket = this.tickets.get(queueId);
    if (!ticket || isTerminal(ticket.status)) return;
    ticket.status = "completed";
    ticket.updatedAt = now;
    this.running.delete(queueId);
    this.queued = this.queued.filter((id) => id !== queueId);
    this.clearActive(ticket);
    logQueueEvent("queue_completed", this.compute(ticket, config));
    await this.promote(config, now);
  }

  async fail(queueId: string, config: ChatQueueConfig, now: number): Promise<void> {
    const ticket = this.tickets.get(queueId);
    if (!ticket || isTerminal(ticket.status)) return;
    ticket.status = "failed";
    ticket.updatedAt = now;
    this.running.delete(queueId);
    this.queued = this.queued.filter((id) => id !== queueId);
    this.clearActive(ticket);
    logQueueEvent("queue_failed", this.compute(ticket, config));
    await this.promote(config, now);
  }

  async cancel(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null> {
    await this.cleanup(config, now);
    const ticket = this.tickets.get(queueId);
    if (!ticket || isTerminal(ticket.status)) return ticket ? this.compute(ticket, config) : null;
    ticket.status = "cancelled";
    ticket.updatedAt = now;
    this.running.delete(queueId);
    this.queued = this.queued.filter((id) => id !== queueId);
    this.clearActive(ticket);
    const computed = this.compute(ticket, config);
    logQueueEvent("queue_cancelled", computed);
    await this.promote(config, now);
    return computed;
  }

  async getDepth(config: ChatQueueConfig, now: number): Promise<{ runningCount: number; queuedCount: number }> {
    await this.cleanup(config, now);
    return {
      runningCount: this.running.size,
      queuedCount: this.queued.length,
    };
  }

  async resetForTests(): Promise<void> {
    this.tickets.clear();
    this.queued = [];
    this.running.clear();
    this.active.clear();
  }
}

class RedisChatQueueStore implements ChatQueueStore {
  private fallback = new MemoryChatQueueStore();

  private keys(config: ChatQueueConfig) {
    const p = config.redisPrefix;
    return {
      ticket: (queueId: string) => `${p}:ticket:${queueId}`,
      queued: `${p}:queued`,
      running: `${p}:running`,
      active: (identityKey: string) => `${p}:active:${identityKey}`,
    };
  }

  private async client() {
    return getAppRedisClient();
  }

  private async getMutable(queueId: string, config: ChatQueueConfig): Promise<MutableTicket | null> {
    const redis = await this.client();
    if (!redis) return null;
    const raw = await redis.get(this.keys(config).ticket(queueId));
    if (!raw) return null;
    try {
      return normalizeTicket(JSON.parse(String(raw)));
    } catch {
      return null;
    }
  }

  private async save(ticket: MutableTicket, config: ChatQueueConfig): Promise<void> {
    const redis = await this.client();
    if (!redis) return;
    await redis.set(this.keys(config).ticket(ticket.queueId), JSON.stringify(ticket), {
      EX: config.ticketTtlSeconds,
    });
  }

  private async clearActive(ticket: MutableTicket, config: ChatQueueConfig): Promise<void> {
    const redis = await this.client();
    if (!redis) return;
    const keys = this.keys(config);
    for (const key of identityKeys(ticket)) {
      const activeKey = keys.active(key);
      const current = await redis.get(activeKey).catch(() => null);
      if (current === ticket.queueId) await redis.del(activeKey).catch(() => undefined);
    }
  }

  private async setActive(ticket: MutableTicket, config: ChatQueueConfig): Promise<void> {
    const redis = await this.client();
    if (!redis) return;
    const keys = this.keys(config);
    for (const key of identityKeys(ticket)) {
      await redis.set(keys.active(key), ticket.queueId, { EX: config.ticketTtlSeconds });
    }
  }

  private async queuedIds(config: ChatQueueConfig): Promise<string[]> {
    const redis = await this.client();
    if (!redis) return [];
    const ids = await redis.zRange(this.keys(config).queued, 0, -1).catch(() => []);
    return ids.map(String);
  }

  private async runningIds(config: ChatQueueConfig): Promise<string[]> {
    const redis = await this.client();
    if (!redis) return [];
    const ids = await redis.zRange(this.keys(config).running, 0, -1).catch(() => []);
    return ids.map(String);
  }

  private async cleanup(config: ChatQueueConfig, now: number): Promise<void> {
    const redis = await this.client();
    if (!redis) return;
    const keys = this.keys(config);
    for (const queueId of [...(await this.queuedIds(config)), ...(await this.runningIds(config))]) {
      const ticket = await this.getMutable(queueId, config);
      if (!ticket) {
        await redis.zRem(keys.queued, queueId).catch(() => undefined);
        await redis.zRem(keys.running, queueId).catch(() => undefined);
        continue;
      }
      if (!isTerminal(ticket.status) && isExpired(ticket, config, now)) {
        ticket.status = "expired";
        ticket.updatedAt = now;
        await this.save(ticket, config);
        await redis.zRem(keys.queued, queueId).catch(() => undefined);
        await redis.zRem(keys.running, queueId).catch(() => undefined);
        await this.clearActive(ticket, config);
        logQueueEvent("queue_expired", ticket);
      }
    }
    await this.promote(config, now);
  }

  private async promote(config: ChatQueueConfig, now: number): Promise<void> {
    const redis = await this.client();
    if (!redis) return;
    const keys = this.keys(config);
    while ((await redis.zCard(keys.running)) < config.maxRunning) {
      const next = (await redis.zRange(keys.queued, 0, 0))[0];
      if (!next) break;
      const queueId = String(next);
      await redis.zRem(keys.queued, queueId);
      const ticket = await this.getMutable(queueId, config);
      if (!ticket || isTerminal(ticket.status)) continue;
      ticket.status = "running";
      ticket.updatedAt = now;
      await this.save(ticket, config);
      await redis.zAdd(keys.running, { score: now, value: queueId });
      logQueueEvent("queue_promoted_running", await this.compute(ticket, config));
    }
  }

  private async compute(ticket: MutableTicket, config: ChatQueueConfig): Promise<ChatQueueTicket> {
    const redis = await this.client();
    if (!redis) {
      return withComputedPosition(ticket, { runningCount: 0, queuedBefore: 0, config });
    }
    const keys = this.keys(config);
    const runningCount = Number(await redis.zCard(keys.running).catch(() => 0));
    const rank = ticket.status === "queued"
      ? await redis.zRank(keys.queued, ticket.queueId).catch(() => null)
      : null;
    return withComputedPosition(ticket, {
      runningCount,
      queuedBefore: typeof rank === "number" ? rank : 0,
      config,
    });
  }

  async enqueue(args: {
    requestId: string;
    identity: ChatQueueIdentity;
    reason: ChatQueueReason;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ kind: "running" | "queued" | "reused"; ticket: ChatQueueTicket } | { kind: "rejected" }> {
    const redis = await this.client();
    if (!redis) return this.fallback.enqueue(args);
    try {
      await this.cleanup(args.config, args.now);
      const keys = this.keys(args.config);
      for (const key of identityKeys(args.identity)) {
        const existingId = await redis.get(keys.active(key));
        if (!existingId) continue;
        const existing = await this.getMutable(String(existingId), args.config);
        if (existing && !isTerminal(existing.status) && !isExpired(existing, args.config, args.now)) {
          const ticket = await this.compute(existing, args.config);
          logQueueEvent("queue_reused_existing", ticket);
          return { kind: "reused", ticket };
        }
        if (existing) await this.clearActive(existing, args.config);
      }

      const runningCount = Number(await redis.zCard(keys.running));
      const queuedCount = Number(await redis.zCard(keys.queued));
      const status: ChatQueueStatus = runningCount < args.config.maxRunning ? "running" : "queued";
      if (status === "queued" && queuedCount >= args.config.maxQueued) {
        console.info("[chat_queue] queue_rejected_full", {
          requestId: args.requestId,
          maxQueued: args.config.maxQueued,
          runningCount,
          queuedCount,
        });
        return { kind: "rejected" };
      }

      const ticket: MutableTicket = {
        queueId: createQueueId(),
        requestId: args.requestId,
        sessionId: args.identity.sessionId,
        userId: args.identity.userId,
        clientFingerprint: args.identity.clientFingerprint,
        createdAt: args.now,
        updatedAt: args.now,
        status,
        reason: args.reason,
      };
      await this.save(ticket, args.config);
      await this.setActive(ticket, args.config);
      if (status === "running") {
        await redis.zAdd(keys.running, { score: args.now, value: ticket.queueId });
      } else {
        await redis.zAdd(keys.queued, { score: args.now, value: ticket.queueId });
      }
      const computed = await this.compute(ticket, args.config);
      logQueueEvent(status === "running" ? "queue_promoted_running" : "queue_enqueued", computed);
      return { kind: status, ticket: computed };
    } catch (error) {
      console.warn("[chat_queue] Redis queue unavailable; falling back to memory", {
        message: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.enqueue(args);
    }
  }

  async getStatus(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null> {
    const redis = await this.client();
    if (!redis) return this.fallback.getStatus(queueId, config, now);
    try {
      await this.cleanup(config, now);
      const ticket = await this.getMutable(queueId, config);
      return ticket ? await this.compute(ticket, config) : null;
    } catch {
      return this.fallback.getStatus(queueId, config, now);
    }
  }

  async claimForExecution(args: {
    queueId: string;
    identity: ChatQueueIdentity;
    config: ChatQueueConfig;
    now: number;
  }): Promise<{ ok: true; ticket: ChatQueueTicket } | { ok: false; reason: "missing" | "not_ready" | "identity_mismatch" | "terminal" }> {
    const redis = await this.client();
    if (!redis) return this.fallback.claimForExecution(args);
    try {
      await this.cleanup(args.config, args.now);
      const ticket = await this.getMutable(args.queueId, args.config);
      if (!ticket) return { ok: false, reason: "missing" };
      if (isTerminal(ticket.status)) return { ok: false, reason: "terminal" };
      if (!sameIdentity(ticket, args.identity)) return { ok: false, reason: "identity_mismatch" };
      if (ticket.status === "queued") return { ok: false, reason: "not_ready" };
      ticket.status = "running";
      ticket.updatedAt = args.now;
      await this.save(ticket, args.config);
      await redis.zRem(this.keys(args.config).queued, ticket.queueId);
      await redis.zAdd(this.keys(args.config).running, { score: args.now, value: ticket.queueId });
      return { ok: true, ticket: await this.compute(ticket, args.config) };
    } catch {
      return this.fallback.claimForExecution(args);
    }
  }

  async complete(queueId: string, config: ChatQueueConfig, now: number): Promise<void> {
    const redis = await this.client();
    if (!redis) return this.fallback.complete(queueId, config, now);
    const ticket = await this.getMutable(queueId, config);
    if (!ticket || isTerminal(ticket.status)) return;
    ticket.status = "completed";
    ticket.updatedAt = now;
    await this.save(ticket, config);
    await redis.zRem(this.keys(config).running, queueId).catch(() => undefined);
    await redis.zRem(this.keys(config).queued, queueId).catch(() => undefined);
    await this.clearActive(ticket, config);
    logQueueEvent("queue_completed", await this.compute(ticket, config));
    await this.promote(config, now);
  }

  async fail(queueId: string, config: ChatQueueConfig, now: number): Promise<void> {
    const redis = await this.client();
    if (!redis) return this.fallback.fail(queueId, config, now);
    const ticket = await this.getMutable(queueId, config);
    if (!ticket || isTerminal(ticket.status)) return;
    ticket.status = "failed";
    ticket.updatedAt = now;
    await this.save(ticket, config);
    await redis.zRem(this.keys(config).running, queueId).catch(() => undefined);
    await redis.zRem(this.keys(config).queued, queueId).catch(() => undefined);
    await this.clearActive(ticket, config);
    logQueueEvent("queue_failed", await this.compute(ticket, config));
    await this.promote(config, now);
  }

  async cancel(queueId: string, config: ChatQueueConfig, now: number): Promise<ChatQueueTicket | null> {
    const redis = await this.client();
    if (!redis) return this.fallback.cancel(queueId, config, now);
    await this.cleanup(config, now);
    const ticket = await this.getMutable(queueId, config);
    if (!ticket) return null;
    if (!isTerminal(ticket.status)) {
      ticket.status = "cancelled";
      ticket.updatedAt = now;
      await this.save(ticket, config);
      await redis.zRem(this.keys(config).running, queueId).catch(() => undefined);
      await redis.zRem(this.keys(config).queued, queueId).catch(() => undefined);
      await this.clearActive(ticket, config);
      logQueueEvent("queue_cancelled", await this.compute(ticket, config));
      await this.promote(config, now);
    }
    return this.compute(ticket, config);
  }

  async getDepth(config: ChatQueueConfig, now: number): Promise<{ runningCount: number; queuedCount: number }> {
    const redis = await this.client();
    if (!redis) return this.fallback.getDepth(config, now);
    try {
      await this.cleanup(config, now);
      const keys = this.keys(config);
      return {
        runningCount: Number(await redis.zCard(keys.running).catch(() => 0)),
        queuedCount: Number(await redis.zCard(keys.queued).catch(() => 0)),
      };
    } catch {
      return this.fallback.getDepth(config, now);
    }
  }

  async resetForTests(): Promise<void> {
    await this.fallback.resetForTests();
  }
}

const store = new RedisChatQueueStore();

export function getChatQueueStore(): ChatQueueStore {
  return store;
}

export async function __resetChatQueueStoreForTests(): Promise<void> {
  await store.resetForTests();
}
