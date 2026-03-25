import type { BaiduSinanConfig } from "@/lib/safety/baidu/env";
import type { FetchLike } from "@/lib/safety/baidu/tokenClient";

export type BaiduCensorErrorKind = "auth_error" | "network_timeout" | "service_error" | "response_structure_error" | "unknown_error";

export class BaiduCensorError extends Error {
  readonly kind: BaiduCensorErrorKind;
  constructor(kind: BaiduCensorErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type BaiduTextCensorRawResponse = {
  log_id?: number;
  conclusion?: string;
  conclusionType?: number;
  data?: Array<Record<string, unknown>>;
  // error case
  error_msg?: string;
  error_code?: number;
};

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  const msg = String((e as { message?: unknown }).message ?? "");
  return msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
}

async function withFetchTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
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

function inferStrategyId(cfg: Pick<BaiduSinanConfig, "strictnessProfile">): number | undefined {
  const raw = (cfg.strictnessProfile ?? "").trim();
  if (!raw) return undefined;
  if (raw === "balanced") return undefined;

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return Math.trunc(asNum);

  // Fallback placeholders: keep as undefined unless caller explicitly uses numeric strategyId in env.
  return undefined;
}

export async function callBaiduTextCensor(args: {
  cfg: Pick<BaiduSinanConfig, "textCensorUrl" | "timeoutMs" | "connectTimeoutMs" | "strictnessProfile">;
  accessToken: string;
  text: string;
  userId?: string;
  userIp?: string;
  fetchImpl?: FetchLike;
}): Promise<BaiduTextCensorRawResponse> {
  const fetchFn = args.fetchImpl ?? fetch;
  const controller = new AbortController();

  const connectTimeoutMs = Math.max(0, args.cfg.connectTimeoutMs);
  const overallTimeoutMs = Math.max(0, args.cfg.timeoutMs);

  const overallPromise = (async () => {
    const body = new URLSearchParams();
    body.set("text", args.text);

    const strategyId = inferStrategyId(args.cfg);
    if (strategyId != null) body.set("strategyId", String(strategyId));
    if (args.userId) body.set("userId", args.userId);
    if (args.userIp) body.set("userIp", args.userIp);

    const url = `${args.cfg.textCensorUrl}?access_token=${encodeURIComponent(args.accessToken)}`;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new BaiduCensorError("service_error", `censor_http_${res.status}`);
    }

    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") {
      throw new BaiduCensorError("response_structure_error", "censor_json_invalid");
    }
    return json as BaiduTextCensorRawResponse;
  })();

  const connectPromise =
    connectTimeoutMs > 0
      ? withFetchTimeout(overallPromise, connectTimeoutMs, controller).catch((e) => {
          if (isAbortError(e)) throw new BaiduCensorError("network_timeout", "connect_timeout");
          throw e;
        })
      : overallPromise;

  try {
    const res = overallTimeoutMs > 0 ? await withFetchTimeout(connectPromise, overallTimeoutMs, controller) : await connectPromise;
    return res;
  } catch (e) {
    if (e instanceof BaiduCensorError) throw e;
    if (isAbortError(e)) throw new BaiduCensorError("network_timeout", "censor_request_timeout");
    throw new BaiduCensorError("unknown_error", e instanceof Error ? e.message : "censor_unknown_error");
  }
}

