// src/app/leaderboard/page.tsx
//
// add-public-leaderboard：公开排行榜页面（RSC）。
// - 服务端读取 session，仅用于"是否高亮当前用户"。
// - 不读取 users 表；按 userId.slice(0,8) 派生脱敏昵称（repository 层）。
// - 客户端壳见 LeaderboardPageShell。

import { auth } from "../../../auth";
import { LeaderboardPageShell } from "@/components/leaderboard/LeaderboardPageShell";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  return <LeaderboardPageShell currentUserId={currentUserId} />;
}