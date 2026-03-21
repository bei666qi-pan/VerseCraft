// src/lib/config/envRaw.ts
/**
 * Single gateway for reading OS environment variables.
 * Next.js loads `.env`, `.env.local`, `.env.production` automatically (see Next docs); Coolify injects runtime env — same API.
 * Do not call `process.env[...]` elsewhere in application code.
 */

export function envRaw(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** First defined non-empty value among aliases (canonical names should appear first). */
export function envRawFirst(names: readonly string[]): string | undefined {
  for (const n of names) {
    const v = envRaw(n);
    if (v) return v;
  }
  return undefined;
}

export function envBoolean(name: string, fallback: boolean): boolean {
  const v = envRaw(name);
  if (!v) return fallback;
  const l = v.toLowerCase();
  if (l === "1" || l === "true" || l === "yes" || l === "on") return true;
  if (l === "0" || l === "false" || l === "no" || l === "off") return false;
  return fallback;
}

export function envNumber(name: string, fallback: number): number {
  const v = envRaw(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = envRaw(name);
  if (!v) return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
