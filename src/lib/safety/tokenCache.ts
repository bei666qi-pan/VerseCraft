import { setTimeout as sleep } from "node:timers/promises";

export type TokenCacheEntry = {
  token: string;
  expiresAtMs: number;
  obtainedAtMs: number;
};

export type TokenFetcher = () => Promise<TokenCacheEntry>;

export type TokenCacheBackend = {
  get: (key: string) => Promise<TokenCacheEntry | null>;
  set: (key: string, entry: TokenCacheEntry) => Promise<void>;
};

class InMemoryTokenCacheBackend implements TokenCacheBackend {
  private mem = new Map<string, TokenCacheEntry>();

  async get(key: string): Promise<TokenCacheEntry | null> {
    return this.mem.get(key) ?? null;
  }

  async set(key: string, entry: TokenCacheEntry): Promise<void> {
    this.mem.set(key, entry);
  }
}

export type SingleFlightTokenCacheOptions = {
  /**
   * Cache key for a specific provider/token type.
   * e.g. "baidu_sinan_access_token".
   */
  key: string;
  /**
   * Refresh early before expiry to avoid edge race.
   */
  refreshWindowMs: number;
  /**
   * Optional backend to allow future shared caches (Redis, etc.).
   */
  backend?: TokenCacheBackend;
  /**
   * Artificial backoff for refresh storms (rare) when multiple awaits hit while a refresh is running.
   * Helps protect the provider under extreme concurrency.
   */
  stampedeBackoffMs?: number;
};

/**
 * Single-flight token cache:
 * - Only one refresh in-flight per key.
 * - Others await the same promise.
 * - Validity checks include a refreshWindowMs.
 */
export function createSingleFlightTokenCache(
  fetcher: TokenFetcher,
  options: SingleFlightTokenCacheOptions
) {
  const backend = options.backend ?? new InMemoryTokenCacheBackend();
  let inFlight: Promise<TokenCacheEntry> | null = null;

  async function isValid(entry: TokenCacheEntry | null, nowMs: number): Promise<boolean> {
    if (!entry?.token) return false;
    // If the token will expire within refreshWindowMs, consider it "not valid" and refresh.
    return entry.expiresAtMs - nowMs > options.refreshWindowMs;
  }

  async function getRemainingMs(): Promise<number> {
    const nowMs = Date.now();
    const entry = await backend.get(options.key);
    if (!entry) return 0;
    return Math.max(0, entry.expiresAtMs - nowMs);
  }

  async function getToken(): Promise<string> {
    const nowMs = Date.now();
    const entry = await backend.get(options.key);
    if (await isValid(entry, nowMs)) {
      return entry!.token;
    }

    if (!inFlight) {
      inFlight = (async () => {
        try {
          const fresh = await fetcher();
          // Minimal sanity check.
          if (!fresh?.token || !Number.isFinite(fresh.expiresAtMs)) {
            throw new Error("token_fetch_structure_error");
          }
          await backend.set(options.key, fresh);
          return fresh;
        } finally {
          inFlight = null;
        }
      })();
    } else if (options.stampedeBackoffMs && options.stampedeBackoffMs > 0) {
      // Optional jitter/backoff to reduce thundering herd in extreme contention.
      await sleep(options.stampedeBackoffMs);
    }

    const awaited = await inFlight;
    return awaited.token;
  }

  return {
    getToken,
    getRemainingMs,
  };
}

