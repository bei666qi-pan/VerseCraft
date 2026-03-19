import { env } from "@/lib/env";

type CounterEntry = { count: number; resetAt: number };
type StrikeEntry = { strikes: number; resetAt: number };
type BlockEntry = { blockedUntil: number; reason: string; level: "gray" | "black" };

const counters = new Map<string, CounterEntry>();
const strikes = new Map<string, StrikeEntry>();
const blocks = new Map<string, BlockEntry>();

function now() {
  return Date.now();
}

function withCounter(key: string, limit: number, intervalMs: number): boolean {
  const n = now();
  const cur = counters.get(key);
  if (!cur || n >= cur.resetAt) {
    counters.set(key, { count: 1, resetAt: n + intervalMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

function buildKeys(ip: string, sessionId?: string | null, userId?: string | null): string[] {
  const keys = [`ip:${ip}`];
  if (sessionId) keys.push(`session:${sessionId}`);
  if (userId) keys.push(`user:${userId}`);
  return keys;
}

export type RiskControlContext = {
  ip: string;
  sessionId?: string | null;
  userId?: string | null;
};

export type RiskControlDecision = {
  ok: boolean;
  reason: string;
  level: "normal" | "gray" | "black";
  blockedUntil?: number;
};

export function checkRiskControl(ctx: RiskControlContext): RiskControlDecision {
  const keys = buildKeys(ctx.ip, ctx.sessionId, ctx.userId);
  const n = now();

  for (const key of keys) {
    const b = blocks.get(key);
    if (b && b.blockedUntil > n) {
      return { ok: false, reason: b.reason, level: b.level, blockedUntil: b.blockedUntil };
    }
  }

  const ipOk = withCounter(`rpm:ip:${ctx.ip}`, env.securityIpLimitPerMinute, 60_000);
  if (!ipOk) {
    return { ok: false, reason: "ip_rate_limited", level: "gray" };
  }
  if (ctx.sessionId) {
    const sOk = withCounter(`rpm:session:${ctx.sessionId}`, env.securitySessionLimitPerMinute, 60_000);
    if (!sOk) return { ok: false, reason: "session_rate_limited", level: "gray" };
  }
  if (ctx.userId) {
    const uOk = withCounter(`rpm:user:${ctx.userId}`, env.securityUserLimitPerMinute, 60_000);
    if (!uOk) return { ok: false, reason: "user_rate_limited", level: "gray" };
  }

  return { ok: true, reason: "allow", level: "normal" };
}

export function recordHighRisk(ctx: RiskControlContext, reason: string): RiskControlDecision {
  const keys = buildKeys(ctx.ip, ctx.sessionId, ctx.userId);
  const n = now();
  const resetAt = n + 60 * 60 * 1000;
  let maxStrikes = 0;

  for (const key of keys) {
    const sk = `strike:${key}`;
    const cur = strikes.get(sk);
    if (!cur || n >= cur.resetAt) {
      strikes.set(sk, { strikes: 1, resetAt });
      maxStrikes = Math.max(maxStrikes, 1);
    } else {
      cur.strikes += 1;
      maxStrikes = Math.max(maxStrikes, cur.strikes);
    }
  }

  if (maxStrikes >= env.securityHighRiskStrikeThreshold) {
    const blockedUntil = n + env.securityTempBlockSeconds * 1000;
    for (const key of keys) {
      blocks.set(key, { blockedUntil, reason: `high_risk_escalation:${reason}`, level: "black" });
    }
    return { ok: false, reason: "high_risk_escalation", level: "black", blockedUntil };
  }

  return { ok: true, reason: "high_risk_recorded", level: "gray" };
}
