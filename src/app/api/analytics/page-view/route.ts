import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { parsePageViewRequest, shouldCollectPageView } from "@/lib/analytics/pageViewRequest";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";

export const dynamic = "force-dynamic";

type PageViewBody = { pathname?: unknown; visitorId?: unknown; eventId?: unknown };

export async function POST(req: Request) {
  if (!shouldCollectPageView(getVerseCraftRolloutFlags().enableWebTrafficAnalytics)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: PageViewBody;
  try {
    body = (await req.json()) as PageViewBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const pageView = parsePageViewRequest(body);
  if (!pageView) {
    return NextResponse.json({ ok: false, error: "invalid_page_view" }, { status: 400 });
  }

  const requestHeaders = await headers();
  void recordGenericAnalyticsEvent({
    eventId: `page_viewed:${pageView.eventId}`,
    idempotencyKey: `page_viewed:${pageView.eventId}`,
    userId: null,
    sessionId: `web:${pageView.visitorId}`,
    eventName: "page_viewed",
    eventTime: new Date(),
    page: pageView.pathname,
    source: "web_traffic_tracker",
    platform: derivePlatformFromUserAgent(requestHeaders.get("user-agent")),
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: { visitorId: pageView.visitorId },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
