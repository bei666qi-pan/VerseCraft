// src/app/api/leaderboard/route.parseQuery.ts
//
// 入参解析纯函数（与 route.ts 同目录，便于 route.test.ts 直接 import，
// 避免触发 route.ts 顶层 "server-only" + auth 模块链）。
import {
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_DEFAULT_LIMIT,
  clampLeaderboardLimit,
  clampLeaderboardOffset,
  type LeaderboardGradeFilter,
  type LeaderboardOutcomeFilter,
} from "@/lib/leaderboard/utils";

export const LEADERBOARD_ALLOWED_OUTCOMES: ReadonlySet<LeaderboardOutcomeFilter> = new Set([
  "died",
  "survived",
  "escaped",
]);
export const LEADERBOARD_ALLOWED_GRADES: ReadonlySet<LeaderboardGradeFilter> = new Set([
  "S",
  "A",
  "B",
  "C",
  "D",
  "E",
]);

export function parseOutcome(raw: string | null): LeaderboardOutcomeFilter | null {
  if (!raw) return null;
  return LEADERBOARD_ALLOWED_OUTCOMES.has(raw as LeaderboardOutcomeFilter)
    ? (raw as LeaderboardOutcomeFilter)
    : null;
}

export function parseGrade(raw: string | null): LeaderboardGradeFilter | null {
  if (!raw) return null;
  return LEADERBOARD_ALLOWED_GRADES.has(raw as LeaderboardGradeFilter)
    ? (raw as LeaderboardGradeFilter)
    : null;
}

export function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.trunc(n);
}

export function parseLimit(raw: string | null): number {
  if (!raw) return 25;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return clampLeaderboardLimit(n);
}

export function parseLeaderboardQueryFromSearchParams(
  params: URLSearchParams
): {
  outcome: LeaderboardOutcomeFilter | null;
  grade: LeaderboardGradeFilter | null;
  page: number;
  limit: number;
  offset: number;
} {
  const outcome = parseOutcome(params.get("outcome"));
  const grade = parseGrade(params.get("grade"));
  const page = parsePage(params.get("page"));
  const limit = parseLimit(params.get("limit"));
  const offset = clampLeaderboardOffset((page - 1) * limit);
  return { outcome, grade, page, limit, offset };
}

export { LEADERBOARD_MAX_LIMIT, LEADERBOARD_DEFAULT_LIMIT };