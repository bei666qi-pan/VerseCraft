// src/lib/chat/sameOriginSsePost.ts
import { VERSECRAFT_REQUEST_ID_RESPONSE_HEADER } from "@/lib/telemetry/requestId";

export type SameOriginSsePostOk = {
  ok: true;
  status: number;
  statusText: string;
  contentType: string;
  text: string;
  versecraftRequestId: string | null;
  aiStatus: string | null;
};

export type SameOriginSsePostErr = {
  ok: false;
  kind: "network" | "aborted" | "timeout";
  message: string;
};

/**
 * POST JSON and read the full response body as text (for SSE wire format).
 * Same-origin only; aligns with `fetch(..., { credentials: 'include' })`.
 */
export function postSameOriginForSseDocumentText(args: {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<SameOriginSsePostOk | SameOriginSsePostErr> {
  const { url, body, headers, timeoutMs, signal } = args;
  if (signal.aborted) {
    return Promise.resolve({ ok: false, kind: "aborted", message: "aborted" });
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    const done = (out: SameOriginSsePostOk | SameOriginSsePostErr) => {
      signal.removeEventListener("abort", onAbort);
      resolve(out);
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = Math.max(1, timeoutMs);
    xhr.responseType = "";

    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      try {
        xhr.setRequestHeader(key, String(value));
      } catch {
        // ignore invalid header names; caller should only pass valid pairs
      }
    }

    xhr.onload = () => {
      done({
        ok: true,
        status: xhr.status,
        statusText: xhr.statusText ?? "",
        contentType: xhr.getResponseHeader("content-type") ?? "",
        text: xhr.responseText ?? "",
        versecraftRequestId: xhr.getResponseHeader(VERSECRAFT_REQUEST_ID_RESPONSE_HEADER),
        aiStatus: xhr.getResponseHeader("x-versecraft-ai-status"),
      });
    };

    xhr.onerror = () => {
      done({ ok: false, kind: "network", message: "xhr_error" });
    };

    xhr.ontimeout = () => {
      done({ ok: false, kind: "timeout", message: "xhr_timeout" });
    };

    xhr.onabort = () => {
      done({ ok: false, kind: "aborted", message: "xhr_abort" });
    };

    try {
      xhr.send(body);
    } catch (e) {
      done({
        ok: false,
        kind: "network",
        message: e instanceof Error ? e.message : "xhr_send_failed",
      });
    }
  });
}
