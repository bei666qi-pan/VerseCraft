// src/app/api/leaderboard/route.ts
//
// add-public-leaderboard：公开排行榜 GET 入口。
// - 仅 GET；鉴权走 auth()；游客返回 requiresLogin: true。
// - 入参：outcome? / grade? / page? / limit?
// - 失败仍 HTTP 200 + envelope；前端始终能解析（CLAUDE.md §5.4 性能预算）。
// - 不上 /api/chat 首字前链路（独立路由）。
// - 入参解析纯函数见 ./route.parseQuery，便于测试隔离。

import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { fetchLeaderboardEntries, type LeaderboardEntry } from "@/lib/leaderboard/repository";
import {
  publicOk,
  publicFail,
  publicJson,
  type PublicApiEnvelope,
} from "@/lib/api/publicEnvelope";
import { parseLeaderboardQueryFromSearchParams } from "./route.parseQuery";

export const dynamic = "force-dynamic";

type LeaderboardData = {
  entries: LeaderboardEntry[];
  totalReturned: number;
  page: number;
  limit: number;
  requiresLogin: boolean;
};

export async function GET(req: NextRequest): Promise<NextResponse<PublicApiEnvelope<LeaderboardData>>> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const url = new URL(req.url);
  const { outcome, grade, page, limit, offset } =
    parseLeaderboardQueryFromSearchParams(url.searchParams);

  // 游客引导登录；仍 200 + envelope，不暴露数据。
  if (!userId) {
    return publicJson(
      publicOk<LeaderboardData>({
        entries: [],
        totalReturned: 0,
        page,
        limit,
        requiresLogin: true,
      }),
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  }

  try {
    const entries = await fetchLeaderboardEntries({ outcome, grade, limit, offset });
    return publicJson(
      publicOk<LeaderboardData>({
        entries,
        totalReturned: entries.length,
        page,
        limit,
        requiresLogin: false,
      }),
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  } catch (error) {
    console.error("[api/leaderboard] failed", error);
    return publicJson(
      publicFail<LeaderboardData>("leaderboard_unavailable", {
        entries: [],
        totalReturned: 0,
        page,
        limit,
        requiresLogin: false,
      }),
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}

// Re-export 入参解析，便于 route.test.ts 直接 import（避免触发 ./route 的 server-only + auth 链）。
export {
  parseOutcome,
  parseGrade,
  parsePage,
  parseLimit,
  parseLeaderboardQueryFromSearchParams,
  LEADERBOARD_ALLOWED_OUTCOMES,
  LEADERBOARD_ALLOWED_GRADES,
} from "./route.parseQuery";
export {
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_DEFAULT_LIMIT,
} from "@/lib/leaderboard/utils";