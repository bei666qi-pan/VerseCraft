import { validateChatRequest } from "@/lib/security/chatValidation";
import { checkRiskControl } from "@/lib/security/riskControl";
import {
  buildChatQueueIdentity,
  buildChatQueueResponsePayload,
  enqueueChatRequest,
  getClientIpFromHeaders,
} from "@/lib/chatQueue/service";
import { createVerseCraftRequestId, isSafeVerseCraftRequestId, VERSECRAFT_REQUEST_ID_HEADER } from "@/lib/telemetry/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function hasAuthSessionCookie(headers: Headers): boolean {
  const cookie = headers.get("cookie") ?? "";
  if (!cookie) return false;
  return /(?:^|;\s*)(?:authjs\.session-token|__Secure-authjs\.session-token|next-auth\.session-token|__Secure-next-auth\.session-token)=/.test(
    cookie
  );
}
async function maybeUserId(headers: Headers): Promise<string | null> {
  if (!hasAuthSessionCookie(headers)) return null;
  try {
    const { auth } = await import("../../../../../auth");
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  const validated = validateChatRequest(body);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, { status: validated.status });
  }

  if (validated.clientPurpose === "options_regen_only") {
    return jsonResponse(
      buildChatQueueResponsePayload(null, {
        disabled: true,
        skipped: "options_regen_only",
      }),
      { status: 200 }
    );
  }

  const inboundRequestId = req.headers.get(VERSECRAFT_REQUEST_ID_HEADER);
  const requestId = isSafeVerseCraftRequestId(inboundRequestId)
    ? inboundRequestId
    : createVerseCraftRequestId("chatq");
  const userId = await maybeUserId(req.headers);
  const clientIp = getClientIpFromHeaders(req.headers);
  const risk = checkRiskControl({ ip: clientIp, sessionId: validated.sessionId, userId });
  if (!risk.ok) {
    const retryAfterSeconds = risk.blockedUntil
      ? Math.max(1, Math.ceil((risk.blockedUntil - Date.now()) / 1000))
      : 30;
    return jsonResponse(
      {
        error: "risk_control",
        status: "rejected",
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(retryAfterSeconds) },
      }
    );
  }

  const admission = await enqueueChatRequest({
    requestId,
    identity: buildChatQueueIdentity({
      headers: req.headers,
      sessionId: validated.sessionId,
      userId,
    }),
    reason: "peak",
  });

  if (!admission.ok) {
    return jsonResponse(
      {
        status: "rejected",
        reason: admission.reason,
        retryAfterSeconds: admission.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(admission.retryAfterSeconds) },
      }
    );
  }

  if (admission.kind === "disabled") {
    return jsonResponse(
      buildChatQueueResponsePayload(null, {
        disabled: true,
      }),
      { status: 200 }
    );
  }

  const status = admission.ticket.status === "queued" ? 202 : 200;
  return jsonResponse(
    buildChatQueueResponsePayload(admission.ticket, {
      reused: admission.kind === "reused",
    }),
    {
      status,
      headers: { "retry-after": String(admission.retryAfterSeconds) },
    }
  );
}
