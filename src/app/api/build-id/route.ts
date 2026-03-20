// src/app/api/build-id/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "unknown";

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
