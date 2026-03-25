// src/lib/ai/governance/preflightCache.ts
import "server-only";

import { aiGovernanceEnv } from "@/lib/ai/governance/env";
import type { ControlDigestLike, ControlRuleFlagsCompact } from "@/lib/ai/governance/preflightCacheKey";
import { buildPreflightFingerprintLegacy, buildPreflightFingerprintV2 } from "@/lib/ai/governance/preflightCacheKey";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import { getAppRedisClient } from "@/lib/ratelimit";

const mem = new Map<string, { exp: number; val: string }>();

function fpV2(args: {
  latestUserInput: string;
  digest?: ControlDigestLike | null;
  ruleFlags?: ControlRuleFlagsCompact | null;
}): string {
  return buildPreflightFingerprintV2(args);
}

function fpLegacy(latestUserInput: string, playerContext: string, ruleJson: string): string {
  return buildPreflightFingerprintLegacy({ latestUserInput, playerContext, ruleJson });
}

function key(
  userId: string | null | undefined,
  sessionId: string | null | undefined,
  fingerprint: string
): string {
  return `vc:ai:pf:${aiGovernanceEnv.cacheContentVersion}:${userId ?? "anon"}:${sessionId ?? "anon"}:${fingerprint}`;
}

export async function readPreflightPlane(args: {
  latestUserInput: string;
  playerContext: string;
  ruleJson: string;
  /** Optional: control-level digest (preferred, stable). */
  digest?: ControlDigestLike | null;
  /** Optional: compact rule flags (preferred, stable). */
  ruleFlags?: ControlRuleFlagsCompact | null;
  userId: string | null | undefined;
  sessionId: string | null | undefined;
}): Promise<PlayerControlPlane | null> {
  if (!aiGovernanceEnv.responseCacheEnabled) return null;
  // Prefer semantic, stable key; fall back to legacy key for compatibility when digest/rules are unavailable.
  const fingerprint =
    args.digest || args.ruleFlags
      ? fpV2({
          latestUserInput: args.latestUserInput,
          digest: args.digest ?? null,
          ruleFlags: args.ruleFlags ?? null,
        })
      : fpLegacy(args.latestUserInput, args.playerContext, args.ruleJson);
  const k = key(args.userId, args.sessionId, fingerprint);

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(k);
      if (!raw) return null;
      return JSON.parse(raw) as PlayerControlPlane;
    } catch {
      return null;
    }
  }

  const row = mem.get(k);
  if (!row || row.exp <= Date.now()) return null;
  try {
    return JSON.parse(row.val) as PlayerControlPlane;
  } catch {
    return null;
  }
}

export async function writePreflightPlane(args: {
  latestUserInput: string;
  playerContext: string;
  ruleJson: string;
  digest?: ControlDigestLike | null;
  ruleFlags?: ControlRuleFlagsCompact | null;
  userId: string | null | undefined;
  sessionId: string | null | undefined;
  control: PlayerControlPlane;
}): Promise<void> {
  if (!aiGovernanceEnv.responseCacheEnabled) return;
  if (args.control.risk_level === "high") return;

  const fingerprint =
    args.digest || args.ruleFlags
      ? fpV2({
          latestUserInput: args.latestUserInput,
          digest: args.digest ?? null,
          ruleFlags: args.ruleFlags ?? null,
        })
      : fpLegacy(args.latestUserInput, args.playerContext, args.ruleJson);
  const k = key(args.userId, args.sessionId, fingerprint);
  const ttl = Math.max(15, Math.min(180, aiGovernanceEnv.controlPreflightCacheTtlSec));
  const val = JSON.stringify(args.control);

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      await redis.set(k, val, { EX: ttl });
    } catch {
      // memory fallback
    }
    return;
  }

  mem.set(k, { val, exp: Date.now() + ttl * 1000 });
  if (mem.size > 600) {
    const first = mem.keys().next().value;
    if (first) mem.delete(first);
  }
}
