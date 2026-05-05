import { buildChatQueueResponsePayload, getChatQueueStatus } from "@/lib/chatQueue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function getQueueId(req: Request): string {
  const url = new URL(req.url);
  return (url.searchParams.get("queueId") ?? "").trim();
}

export async function GET(req: Request) {
  const queueId = getQueueId(req);
  if (!queueId) {
    return jsonResponse({ status: "missing", retryAfterSeconds: 2 }, { status: 400 });
  }

  const result = await getChatQueueStatus(queueId);
  if (!result.ok) {
    const status = result.status === "missing" ? 404 : 200;
    return jsonResponse(
      {
        queueId,
        status: result.status,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      {
        status,
        headers: { "retry-after": String(result.retryAfterSeconds) },
      }
    );
  }

  return jsonResponse(buildChatQueueResponsePayload(result.ticket), {
    status: 200,
    headers: { "retry-after": String(result.retryAfterSeconds) },
  });
}
