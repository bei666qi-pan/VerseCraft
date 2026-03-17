// src/app/api/heartbeat/route.ts
import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { markUserActive, linkGuestToUser } from "@/lib/presence";

type HeartbeatBody = {
  guestId?: string | null;
  linkGuestToUserId?: string | null;
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const body = (await request.json().catch(() => ({}))) as HeartbeatBody | undefined;
    const rawGuestId = body?.guestId?.trim() || null;
    const linkTargetUserId = body?.linkGuestToUserId?.trim() || null;

    if (userId && rawGuestId && linkTargetUserId === userId) {
      const guestMember = rawGuestId.startsWith("guest_") ? rawGuestId : `guest_${rawGuestId}`;
      await linkGuestToUser(guestMember, userId);
      return NextResponse.json({ ok: true, mode: "linked" });
    }

    let memberId: string | null = null;
    let isGuest = false;

    if (userId) {
      memberId = userId;
    } else if (rawGuestId) {
      memberId = rawGuestId.startsWith("guest_") ? rawGuestId : `guest_${rawGuestId}`;
      isGuest = true;
    }

    if (!memberId) {
      return NextResponse.json({ ok: false, reason: "no_identity" });
    }

    await markUserActive(memberId);

    return NextResponse.json({ ok: true, isGuest });
  } catch (error) {
    console.error("[heartbeat] POST /api/heartbeat failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

