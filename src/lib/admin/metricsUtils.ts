import { getUtcDateKey } from "@/lib/analytics/dateKeys";

export type DailyActivityPoint = { userId: string; dateKey: string };

export function computeDauWauMau(points: DailyActivityPoint[], targetDateKey: string): { dau: number; wau: number; mau: number } {
  const target = new Date(`${targetDateKey}T00:00:00.000Z`);
  const wauStart = new Date(target.getTime());
  wauStart.setUTCDate(wauStart.getUTCDate() - 6);
  const mauStart = new Date(target.getTime());
  mauStart.setUTCDate(mauStart.getUTCDate() - 29);

  const dau = new Set<string>();
  const wau = new Set<string>();
  const mau = new Set<string>();
  for (const p of points) {
    if (!p.userId || !p.dateKey) continue;
    const d = new Date(`${p.dateKey}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getTime() === target.getTime()) dau.add(p.userId);
    if (d >= wauStart && d <= target) wau.add(p.userId);
    if (d >= mauStart && d <= target) mau.add(p.userId);
  }
  return { dau: dau.size, wau: wau.size, mau: mau.size };
}

export function computeRetention(cohort: Array<{ userId: string; registerDateKey: string }>, activePoints: DailyActivityPoint[]): { d1: number; d3: number; d7: number; cohortSize: number } {
  const activeSet = new Set(activePoints.map((p) => `${p.userId}:${p.dateKey}`));
  let d1 = 0;
  let d3 = 0;
  let d7 = 0;
  for (const c of cohort) {
    if (!c.userId || !c.registerDateKey) continue;
    const base = new Date(`${c.registerDateKey}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) continue;
    const day1 = new Date(base.getTime());
    day1.setUTCDate(day1.getUTCDate() + 1);
    const day3 = new Date(base.getTime());
    day3.setUTCDate(day3.getUTCDate() + 3);
    const day7 = new Date(base.getTime());
    day7.setUTCDate(day7.getUTCDate() + 7);
    if (activeSet.has(`${c.userId}:${getUtcDateKey(day1)}`)) d1 += 1;
    if (activeSet.has(`${c.userId}:${getUtcDateKey(day3)}`)) d3 += 1;
    if (activeSet.has(`${c.userId}:${getUtcDateKey(day7)}`)) d7 += 1;
  }
  return { d1, d3, d7, cohortSize: cohort.length };
}

export function computeFunnel(eventOrder: string[], eventUsers: Record<string, number>): Array<{ eventName: string; users: number; conversionRate: number }> {
  const base = Number(eventUsers[eventOrder[0] ?? ""] ?? 0);
  return eventOrder.map((eventName) => {
    const users = Number(eventUsers[eventName] ?? 0);
    return { eventName, users, conversionRate: base > 0 ? users / base : 0 };
  });
}

export function computeFunnelTriColumn(
  eventOrder: string[],
  registered: Record<string, number>,
  guest: Record<string, number>,
  all: Record<string, number>
): Array<{
  eventName: string;
  registered: number;
  guest: number;
  all: number;
  conversionRateRegistered: number;
  conversionRateGuest: number;
  conversionRateAll: number;
}> {
  const regBase = Math.max(0, Number(registered[eventOrder[0] ?? ""] ?? 0));
  let guestBase = 0;
  for (const name of eventOrder) {
    const gv = Math.max(0, Number(guest[name] ?? 0));
    if (gv > 0) {
      guestBase = gv;
      break;
    }
  }
  let allBase = Math.max(0, Number(all[eventOrder[0] ?? ""] ?? 0));
  if (allBase === 0) {
    for (const name of eventOrder) {
      const av = Math.max(0, Number(all[name] ?? 0));
      if (av > 0) {
        allBase = av;
        break;
      }
    }
  }
  if (allBase === 0) allBase = 1;
  return eventOrder.map((eventName) => {
    const r = Math.max(0, Number(registered[eventName] ?? 0));
    const g = Math.max(0, Number(guest[eventName] ?? 0));
    const a = Math.max(0, Number(all[eventName] ?? 0));
    return {
      eventName,
      registered: r,
      guest: g,
      all: a,
      conversionRateRegistered: regBase > 0 ? r / regBase : 0,
      conversionRateGuest: guestBase > 0 ? g / guestBase : 0,
      conversionRateAll: allBase > 0 ? a / allBase : 0,
    };
  });
}

export function computeTokenStats(totalTokenCost: number, activeUsers: number): { totalTokenCost: number; tokenPerActive: number } {
  const total = Number.isFinite(totalTokenCost) ? Math.max(0, Number(totalTokenCost)) : 0;
  const active = Number.isFinite(activeUsers) ? Math.max(0, Number(activeUsers)) : 0;
  return { totalTokenCost: total, tokenPerActive: active > 0 ? total / active : 0 };
}

export function isOnline(lastSeenAt: Date | string, now: Date, windowMs: number): boolean {
  const d = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return false;
  return now.getTime() - d.getTime() <= windowMs;
}

export function splitSessionsByInactivity(
  events: Array<{ userId: string; eventTime: Date | string; idempotencyKey?: string }>,
  thresholdMinutes = 30
): Record<string, Array<{ startAt: string; endAt: string; count: number }>> {
  const thresholdMs = thresholdMinutes * 60_000;
  const byUser = new Map<string, Array<{ t: number; key: string }>>();
  const dedupe = new Set<string>();
  for (const e of events) {
    const t = e.eventTime instanceof Date ? e.eventTime.getTime() : new Date(e.eventTime).getTime();
    if (!e.userId || Number.isNaN(t)) continue;
    const key = e.idempotencyKey ?? `${e.userId}:${t}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    const arr = byUser.get(e.userId) ?? [];
    arr.push({ t, key });
    byUser.set(e.userId, arr);
  }
  const result: Record<string, Array<{ startAt: string; endAt: string; count: number }>> = {};
  for (const [userId, arr] of byUser.entries()) {
    const sorted = arr.sort((a, b) => a.t - b.t);
    const sessions: Array<{ startAt: string; endAt: string; count: number }> = [];
    for (const item of sorted) {
      const last = sessions[sessions.length - 1];
      if (!last) {
        sessions.push({ startAt: new Date(item.t).toISOString(), endAt: new Date(item.t).toISOString(), count: 1 });
        continue;
      }
      const gap = item.t - new Date(last.endAt).getTime();
      if (gap > thresholdMs) {
        sessions.push({ startAt: new Date(item.t).toISOString(), endAt: new Date(item.t).toISOString(), count: 1 });
      } else {
        last.endAt = new Date(item.t).toISOString();
        last.count += 1;
      }
    }
    result[userId] = sessions;
  }
  return result;
}

