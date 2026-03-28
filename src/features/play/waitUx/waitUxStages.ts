/** 等待期展示阶段（与后端 `__VERSECRAFT_STATUS__` 的 `stage` 对齐，含纯前端兜底）。 */
export type PlayWaitUxStage =
  | "idle"
  | "request_sent"
  | "routing"
  | "context_building"
  | "generating"
  | "streaming"
  | "finalizing";

export const PLAY_WAIT_UX_STAGE_ORDER: readonly PlayWaitUxStage[] = [
  "idle",
  "request_sent",
  "routing",
  "context_building",
  "generating",
  "streaming",
  "finalizing",
] as const;

export function rankWaitUxStage(s: PlayWaitUxStage): number {
  const i = PLAY_WAIT_UX_STAGE_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

export function waitUxStageAtRank(r: number): PlayWaitUxStage {
  const order = PLAY_WAIT_UX_STAGE_ORDER;
  const clamped = Math.max(0, Math.min(order.length - 1, Math.floor(r)));
  return order[clamped]!;
}

export function parseBackendWaitStage(raw: string | null | undefined): PlayWaitUxStage | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (PLAY_WAIT_UX_STAGE_ORDER.includes(t as PlayWaitUxStage)) return t as PlayWaitUxStage;
  return null;
}
