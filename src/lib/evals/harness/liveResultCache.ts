import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEnvelope<T> {
  version: number;
  createdAt: number;
  value: T;
}

function cacheDir(): string {
  return path.resolve(".runtime-data", "eval-live-cache");
}

export function buildLiveResultCacheKey(input: unknown): string {
  return createHash("sha256").update(JSON.stringify({ version: CACHE_VERSION, input })).digest("hex");
}

export function readLiveResultCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (process.env.VERSECRAFT_EVAL_DISABLE_CACHE === "1") return null;
  try {
    const envelope = JSON.parse(fs.readFileSync(path.join(cacheDir(), `${key}.json`), "utf8")) as CacheEnvelope<T>;
    if (envelope.version !== CACHE_VERSION || Date.now() - envelope.createdAt > ttlMs) return null;
    return envelope.value;
  } catch {
    return null;
  }
}

export function writeLiveResultCache<T>(key: string, value: T): void {
  if (process.env.VERSECRAFT_EVAL_DISABLE_CACHE === "1") return;
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir(), `${key}.json`),
    JSON.stringify({ version: CACHE_VERSION, createdAt: Date.now(), value } satisfies CacheEnvelope<T>),
  );
}
