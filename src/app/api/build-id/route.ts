// src/app/api/build-id/route.ts
import { NextResponse } from "next/server";
import { resolveServerBuildId } from "@/lib/config/buildMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buildId = resolveServerBuildId();

  return NextResponse.json(
    { buildId },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
