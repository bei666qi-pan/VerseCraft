import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const ADMIN_SHADOW_COOKIE = "admin_shadow_session";
export const ADMIN_SHADOW_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function getAdminPassword(): string {
  return (env.adminPassword ?? "").trim();
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function buildAdminShadowSession(): { value: string; maxAge: number } | null {
  const secret = getAdminPassword();
  if (!secret) return null;

  const exp = Math.floor(Date.now() / 1000) + ADMIN_SHADOW_SESSION_MAX_AGE_SECONDS;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = signPayload(payload, secret);
  return { value: `${payload}.${signature}`, maxAge: ADMIN_SHADOW_SESSION_MAX_AGE_SECONDS };
}

export function getAdminShadowCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  maxAge: number;
  path: "/";
} {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: ADMIN_SHADOW_SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

export function verifyAdminShadowSession(value: string | undefined): boolean {
  const secret = getAdminPassword();
  if (!secret || !value) return false;

  const [expRaw, nonce, signature] = value.split(".");
  if (!expRaw || !nonce || !signature) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;

  const payload = `${expRaw}.${nonce}`;
  const expected = signPayload(payload, secret);
  return safeCompare(signature, expected);
}
