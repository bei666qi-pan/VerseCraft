import { buildChatQueueResponsePayload, cancelChatQueueTicket } from "@/lib/chatQueue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export async function POST(req: Request) {
  let queueId = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    queueId = typeof body.queueId === "string" ? body.queueId.trim() : "";
  } catch {
    return jsonResponse({ status: "invalid", retryAfterSeconds: 2 }, { status: 400 });
  }

  if (!queueId) {
    return jsonResponse({ status: "missing", retryAfterSeconds: 2 }, { status: 400 });
  }

  const ticket = await cancelChatQueueTicket(queueId);
  if (!ticket) {
    return jsonResponse({ queueId, status: "missing", retryAfterSeconds: 2 }, { status: 404 });
  }
  return jsonResponse(buildChatQueueResponsePayload(ticket), { status: 200 });
}
