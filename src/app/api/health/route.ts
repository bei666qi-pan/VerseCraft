import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { resolveDeepSeekConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    const deepSeek = resolveDeepSeekConfig();
    const hasAiKey = deepSeek.apiKey.length > 0;

    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        checks: {
          database: "ok",
          aiKey: hasAiKey ? "configured" : "missing",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[health] GET /api/health failed", error);
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        checks: {
          database: "failed",
        },
      },
      { status: 503 }
    );
  }
}
