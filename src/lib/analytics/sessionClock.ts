export type HeartbeatKind = "active" | "passive";
export type VisibilityStateHint = "visible" | "hidden";

export type ClockDelta = {
  onlineSec: number;
  activePlaySec: number;
  readSec: number;
  idleSec: number;
};

export function computeHeartbeatDelta(args: {
  lastSeenAtMs: number | null;
  nowMs: number;
  kind: HeartbeatKind;
  visibility: VisibilityStateHint;
  /**
   * 防爆：超过该间隔的缺口不直接计入（避免睡眠/挂起导致离谱在线时长）。
   * 一期取 120 秒：既能容忍 60s heartbeat 抖动，又能压住长时间离线。
   */
  maxGapMs?: number;
}): ClockDelta {
  const maxGapMs = typeof args.maxGapMs === "number" && Number.isFinite(args.maxGapMs) ? args.maxGapMs : 120_000;
  const last = typeof args.lastSeenAtMs === "number" && Number.isFinite(args.lastSeenAtMs) ? args.lastSeenAtMs : null;
  const rawGap = last ? args.nowMs - last : 0;
  const gapMs = Math.max(0, Math.min(maxGapMs, rawGap));
  const onlineSec = Math.max(0, Math.trunc(gapMs / 1000));
  if (onlineSec <= 0) return { onlineSec: 0, activePlaySec: 0, readSec: 0, idleSec: 0 };

  if (args.visibility === "hidden") {
    return { onlineSec, activePlaySec: 0, readSec: 0, idleSec: onlineSec };
  }
  if (args.kind === "active") {
    return { onlineSec, activePlaySec: onlineSec, readSec: 0, idleSec: 0 };
  }
  return { onlineSec, activePlaySec: 0, readSec: onlineSec, idleSec: 0 };
}

