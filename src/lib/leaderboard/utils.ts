// src/lib/leaderboard/utils.ts
//
// add-public-leaderboard：纯函数工具（不依赖 db / server-only），
// 单独抽出便于在 Node 测试环境下被 route.test.ts / repository.test.ts 直接 import。

export const LEADERBOARD_DEFAULT_LIMIT = 25;
export const LEADERBOARD_MAX_LIMIT = 50;

export type LeaderboardOutcomeFilter = "died" | "survived" | "escaped";
export type LeaderboardGradeFilter = "S" | "A" | "B" | "C" | "D" | "E";

export type LeaderboardQuery = {
  outcome?: LeaderboardOutcomeFilter | null;
  grade?: LeaderboardGradeFilter | null;
  limit?: number;
  offset?: number;
};

export function clampLeaderboardLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return LEADERBOARD_DEFAULT_LIMIT;
  const n = Math.trunc(raw);
  if (n <= 0) return LEADERBOARD_DEFAULT_LIMIT;
  return Math.min(LEADERBOARD_MAX_LIMIT, n);
}

export function clampLeaderboardOffset(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

export function deriveLeaderboardDisplayName(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed) return "匿名旅人";
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8);
  return safe ? `匿名旅人 #${safe}` : "匿名旅人";
}

export type NormalizedLeaderboardQuery = {
  limit: number;
  offset: number;
  outcome: LeaderboardOutcomeFilter | null;
  grade: LeaderboardGradeFilter | null;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  grade: string;
  maxFloorScore: number;
  maxFloorLabel: string;
  survivalTimeSeconds: number;
  killedAnomalies: number;
  profession: string | null;
  outcome: string;
  createdAt: string;
};

export function normalizeLeaderboardQuery(q: LeaderboardQuery): NormalizedLeaderboardQuery {
  return {
    limit: clampLeaderboardLimit(q.limit),
    offset: clampLeaderboardOffset(q.offset),
    outcome: q.outcome ?? null,
    grade: q.grade ?? null,
  };
}