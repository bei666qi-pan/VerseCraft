// src/lib/ai/resilience/fetchWithRetry.ts
import https from "node:https";
import { Readable } from "node:stream";
import { envBoolean } from "@/lib/config/envRaw";
import { resolveManagedServiceUrlSafe } from "@/lib/ai/managed/urlSafety";
import {
  buildPlayerTurnJsonFallbackInit,
  normalizePlayerTurnTerminalToolResponse,
  shouldFallbackPlayerTurnTerminalTool,
} from "@/lib/ai/stream/playerTurnTerminalToolResponse";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
}

function createFetchTimeoutError(timeoutMs: number): Error {
  const err = new Error(`upstream fetch timeout after ${timeoutMs}ms`);
  err.name = "TimeoutError";
  return err;
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 408;
}

/**
 * HTTP/1.1-only fetch. Node's built-in fetch negotiates HTTP/2 with
 * api.deepseek.com, and a pathological h2 DATA flood was observed to pin the
 * whole event loop inside nghttp2 read callbacks — starving timers, new
 * connections, and every later request (the "turn ~7 wedge"). `node:https`
 * never speaks h2, so gateway traffic cannot take down the process this way.
 */
async function http1Fetch(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  pinnedAddress?: { address: string; family: number }
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: (init.method as string | undefined) ?? "GET",
        hostname: pinnedAddress?.address ?? u.hostname,
        family: pinnedAddress?.family,
        servername: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: { ...(init.headers as Record<string, string> | undefined), Host: u.host },
      },
      (res) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) for (const item of value) headers.append(key, item);
          else if (value !== undefined) headers.set(key, value);
        }
        const status = res.statusCode ?? 0;
        const body =
          status === 204 || status === 304
            ? null
            : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
        resolve(new Response(body, { status, statusText: res.statusMessage ?? "", headers }));
      }
    );
    req.on("error", reject);
    if (signal) {
      if (signal.aborted) {
        req.destroy(signal.reason ?? new Error("aborted"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => req.destroy(signal.reason ?? new Error("aborted")),
        { once: true }
      );
    }
    if (init.body) req.write(init.body as string);
    req.end();
  });
}

/** Whether upstream traffic is forced onto HTTP/1.1 (see http1Fetch). */
export function forceHttp1ForGateway(): boolean {
  return envBoolean("AI_UPSTREAM_FORCE_HTTP1", true);
}

export interface ResilientFetchOptions {
  timeoutMs: number;
  maxRetries: number;
  parentSignal?: AbortSignal;
  /** "http1" forces the HTTP/1.1 transport (see http1Fetch); default is global fetch. */
  transport?: "default" | "http1";
  /** Resolve, reject restricted addresses, then pin the socket to that exact address. */
  validateManagedUrl?: boolean;
  allowLocalhost?: boolean;
  isRetryable?: (response: Response | null, error: unknown) => boolean;
  onRetry?: (ctx: { attempt: number; waitMs: number; cause: "http" | "error"; status?: number }) => void;
}

/**
 * Bounded timeout + retry for upstream LLM HTTP calls. Retries only when retryable (network / 429 / 503…).
 *
 * The PLAYER_CHAT terminal Function Calling envelope is handled at this transport
 * boundary so callers continue to receive the legacy content JSON stream. In
 * prefer mode, a provider compatibility 4xx gets one immediate retry without
 * tools and with json_object restored; required mode never downgrades.
 */
export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions
): Promise<Response> {
  const { timeoutMs, maxRetries, parentSignal } = options;
  const isRetryable =
    options.isRetryable ??
    ((res, err) => {
      if (err) {
        if (isAbortError(err)) return false;
        return true;
      }
      if (!res) return true;
      return isRetryableHttpStatus(res.status);
    });

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signals: AbortSignal[] = [timeoutController.signal];
    if (parentSignal) signals.push(parentSignal);
    const combined =
      typeof AbortSignal !== "undefined" && "any" in AbortSignal
        ? AbortSignal.any(signals)
        : timeoutController.signal;

    try {
      const safeTarget = options.validateManagedUrl
        ? await resolveManagedServiceUrlSafe(url, { allowLocalhost: options.allowLocalhost })
        : null;
      lastResponse =
        options.transport === "http1" || (safeTarget?.url.protocol === "https:")
          ? await http1Fetch(url, init, combined, safeTarget?.addresses[0])
          : await fetch(url, { ...init, signal: combined });
      clearTimeout(timeoutId);

      if (await shouldFallbackPlayerTurnTerminalTool(lastResponse, init)) {
        options.onRetry?.({ attempt, waitMs: 0, cause: "http", status: lastResponse.status });
        return resilientFetch(url, buildPlayerTurnJsonFallbackInit(init), options);
      }

      if (!isRetryable(lastResponse, null)) {
        return normalizePlayerTurnTerminalToolResponse(lastResponse, init);
      }
      if (attempt < maxRetries) {
        const waitMs = 400 * 2 ** attempt;
        options.onRetry?.({ attempt, waitMs, cause: "http", status: lastResponse.status });
        await sleep(waitMs);
        continue;
      }
      return normalizePlayerTurnTerminalToolResponse(lastResponse, init);
    } catch (e) {
      clearTimeout(timeoutId);
      const timeoutHit = timeoutController.signal.aborted && parentSignal?.aborted !== true;
      const normalizedError = timeoutHit ? createFetchTimeoutError(timeoutMs) : e;
      lastError = normalizedError;
      if (!isRetryable(null, normalizedError)) {
        throw normalizedError;
      }
      if (attempt < maxRetries) {
        const waitMs = 400 * 2 ** attempt;
        options.onRetry?.({ attempt, waitMs, cause: "error" });
        await sleep(waitMs);
        continue;
      }
      throw normalizedError;
    }
  }

  if (lastResponse) return normalizePlayerTurnTerminalToolResponse(lastResponse, init);
  throw lastError ?? new Error("resilientFetch: empty result");
}
