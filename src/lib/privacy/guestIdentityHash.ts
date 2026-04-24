// src/lib/privacy/guestIdentityHash.ts
import { createHmac } from "node:crypto";
import { envRawFirst } from "@/lib/config/envRaw";

/**
 * Reuses VC/BAIDU safety salts; optional dedicated `GUEST_HASH_SALT` override.
 * Never log raw client IPs; only store 64-hex HMAC.
 */
function guestHashSalt(): string {
  return (
    envRawFirst(["GUEST_HASH_SALT", "VC_SAFETY_HASH_SALT", "BAIDU_SINAN_HASH_SALT", "AUTH_SECRET"] as const) ?? "replace_me_guest_salt"
  );
}

export function hashClientIpForGuest(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== "string") return null;
  const t = ip.split(",")[0]?.trim() ?? "";
  if (!t || t.length > 200) return null;
  return createHmac("sha256", guestHashSalt()).update(t).digest("hex").slice(0, 64);
}

/** e.g. "203.0.113.x" (IPv4) or prefix of IPv6 — never show full address in admin. */
export function shortIpLabel(ip: string | null | undefined): string {
  if (!ip) return "—";
  const t = ip.split(",")[0]?.trim() ?? "";
  if (!t) return "—";
  if (t.includes(".")) {
    const p = t.split(".");
    if (p.length >= 4) return `${p[0]}.${p[1]}.${p[2]}.x`;
  }
  return t.length > 8 ? `${t.slice(0, 8)}…` : t;
}

export function platformFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const s = String(ua);
  if (/Mobile|Android|iPhone|iPad/i.test(s)) return "mobile";
  return "desktop";
}
