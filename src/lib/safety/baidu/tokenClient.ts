import type { TokenCacheEntry } from "@/lib/safety/tokenCache";
import type { BaiduSinanConfig } from "@/lib/safety/baidu/env";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  const msg = String((e as { message?: unknown }).message ?? "");
  return msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
}

function withAbortTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export type BaiduTokenErrorKind = "auth_error" | "network_timeout" | "service_error" | "response_structure_error" | "unknown_error";

export class BaiduTokenError extends Error {
  readonly kind: BaiduTokenErrorKind;
  constructor(kind: BaiduTokenErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export async function fetchBaiduAccessToken(args: {
  cfg: Pick<BaiduSinanConfig, "apiKey" | "secretKey" | "authMode" | "tokenUrl" | "timeoutMs" | "connectTimeoutMs">;
  fetchImpl?: FetchLike;
}): Promise<TokenCacheEntry> {
  if (args.cfg.authMode !== "oauth_access_token") {
    // Stage-1 保留 authMode 概念，未来可在这里扩展为直连 AK/Sk 的其它鉴权方式。
    throw new BaiduTokenError("auth_error", `auth_mode_not_supported:${args.cfg.authMode}`);
  }

  const fetchFn = args.fetchImpl ?? fetch;
  const cfg = args.cfg;
  const controller = new AbortController();

  // Note: Node fetch doesn't provide a separate "connect timeout", but aborting early
  // achieves the intended protection against slow connection establishment.
  const overallPromise = (async () => {
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    body.set("client_id", cfg.apiKey);
    body.set("client_secret", cfg.secretKey);

    const res = await fetchFn(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new BaiduTokenError("service_error", `token_http_${res.status}`);
    }

    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") {
      throw new BaiduTokenError("response_structure_error", "token_json_invalid");
    }
    const j = json as Record<string, unknown>;
    const accessToken = typeof j.access_token === "string" ? j.access_token : "";
    const expiresIn = typeof j.expires_in === "number" ? j.expires_in : Number(j.expires_in);
    if (!accessToken) {
      throw new BaiduTokenError("auth_error", "token_missing_access_token");
    }
    const expSec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 2_592_000;
    const obtainedAtMs = Date.now();
    const expiresAtMs = obtainedAtMs + expSec * 1000;
    return { token: accessToken, expiresAtMs, obtainedAtMs };
  })();

  // Dual deadline: connectTimeout aborts earlier, overall timeout aborts later.
  const connectPromise = withAbortTimeout(overallPromise, cfg.connectTimeoutMs, controller).catch((e) => {
    // If connect timeout fired, mark it as timeout kind.
    if (isAbortError(e)) throw new BaiduTokenError("network_timeout", "connect_timeout");
    throw e;
  });

  try {
    return await withAbortTimeout(connectPromise, cfg.timeoutMs, controller);
  } catch (e) {
    if (e instanceof BaiduTokenError) throw e;
    if (isAbortError(e)) throw new BaiduTokenError("network_timeout", "token_request_timeout");
    if (e && typeof e === "object" && "name" in e && String((e as { name?: unknown }).name) === "AbortError") {
      throw new BaiduTokenError("network_timeout", "token_abort_error");
    }
    throw new BaiduTokenError("unknown_error", e instanceof Error ? e.message : "token_unknown_error");
  }
}

