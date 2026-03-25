import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/db";
import { safetyAuditEvents } from "@/db/schema";
import { lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(90, Math.trunc(n)));
}

export async function POST(req: Request) {
  const token = req.headers.get("x-cron-secret") ?? "";
  if (!token || token !== (env.adminPassword ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const deleted = await db.delete(safetyAuditEvents).where(lt(safetyAuditEvents.createdAt, cutoff));

  return NextResponse.json({
    ok: true,
    days,
    cutoff: cutoff.toISOString(),
    deletedCount: deleted.count ?? undefined,
  });
}

