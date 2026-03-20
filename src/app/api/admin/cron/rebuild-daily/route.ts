import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { rebuildAdminMetricsDailyForDateKey } from "@/lib/analytics/aggregation";

export const dynamic = "force-dynamic";

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

export async function POST(req: Request) {
  const token = req.headers.get("x-cron-secret") ?? "";
  if (!token || token !== (env.adminPassword ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") ?? 3) || 3));
  const end = new Date();

  const results: Array<{ dateKey: string; ok: boolean; error?: string }> = [];
  for (let i = 0; i < days; i++) {
    const dateKey = getUtcDateKey(addDaysUtc(end, -i));
    try {
      await rebuildAdminMetricsDailyForDateKey(dateKey);
      results.push({ dateKey, ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ dateKey, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    days,
    results,
  });
}

