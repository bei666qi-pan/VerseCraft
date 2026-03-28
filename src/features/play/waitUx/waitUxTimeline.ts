import type { PlayWaitUxStage } from "./waitUxStages";
import { rankWaitUxStage, waitUxStageAtRank } from "./waitUxStages";

const MS_ROUTING = 720;
const MS_CONTEXT = 2000;
const MS_GENERATING = 4800;

const MIN_HOLD_DEFAULT_MS = 440;
const MIN_HOLD_BACKEND_MS = 260;

/**
 * 纯时间推导的「天花板」阶段：TTFT 短时几乎停在 request_sent / routing。
 */
export function timeDerivedWaitStage(elapsedMs: number): PlayWaitUxStage {
  if (elapsedMs < MS_ROUTING) return "request_sent";
  if (elapsedMs < MS_CONTEXT) return "routing";
  if (elapsedMs < MS_GENERATING) return "context_building";
  return "generating";
}

/**
 * 合并后端显式阶段与时间兜底：取秩较大者（更「靠后」）；无后端时仅时间轴。
 */
export function mergeWaitUxTarget(
  elapsedMs: number,
  backend: PlayWaitUxStage | null
): PlayWaitUxStage {
  const t = timeDerivedWaitStage(elapsedMs);
  const tr = rankWaitUxStage(t);
  if (!backend || backend === "idle") return t;
  const br = rankWaitUxStage(backend);
  return waitUxStageAtRank(Math.max(tr, br));
}

export type WaitUxDisplayState = {
  stage: PlayWaitUxStage;
  lastStageChangeAt: number;
};

/**
 * 节流 + 最小展示时长：避免首包内连跳多段；后端推进时可略缩短 hold。
 */
export function advanceWaitUxDisplay(args: {
  now: number;
  requestStartedAt: number;
  backend: PlayWaitUxStage | null;
  prev: WaitUxDisplayState;
}): WaitUxDisplayState {
  const elapsed = Math.max(0, args.now - args.requestStartedAt);
  const target = mergeWaitUxTarget(elapsed, args.backend);
  const prevRank = rankWaitUxStage(args.prev.stage);
  const targetRank = rankWaitUxStage(target);

  if (targetRank <= prevRank) return args.prev;

  const minHold =
    args.backend && rankWaitUxStage(args.backend) > prevRank ? MIN_HOLD_BACKEND_MS : MIN_HOLD_DEFAULT_MS;
  if (args.now - args.prev.lastStageChangeAt < minHold) return args.prev;

  return { stage: target, lastStageChangeAt: args.now };
}

export function initialWaitUxDisplay(now: number): WaitUxDisplayState {
  return { stage: "request_sent", lastStageChangeAt: now };
}
