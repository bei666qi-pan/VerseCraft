"use server";

import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, buildAdminShadowSession, getAdminShadowCookieOptions } from "@/lib/adminShadow";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { getAdminRequestFingerprint } from "@/lib/admin/authGuard";
import {
  checkAdminLoginRateLimit,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
} from "@/lib/admin/loginRateLimit";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { env } from "@/lib/env";

export type AdminShadowAuthState = {
  ok: boolean;
  error?: string;
};

export async function authenticateAdminShadow(
  _prevState: AdminShadowAuthState,
  formData: FormData
): Promise<AdminShadowAuthState> {
  const inputPassword = String(formData.get("password") ?? "");
  const configuredPassword = (env.adminPassword ?? "").trim();
  const cookieStore = await cookies();
  const fingerprint = await getAdminRequestFingerprint();

  if (!configuredPassword) {
    await recordAdminAuditLog({
      action: "admin_login_failed",
      actorId: "shadow_admin",
      success: false,
      reason: "admin_password_missing",
      ...fingerprint,
    });
    return { ok: false, error: "ADMIN_PASSWORD is not configured." };
  }

  const limit = await checkAdminLoginRateLimit(fingerprint);
  if (!limit.allowed) {
    await recordAdminAuditLog({
      action: "admin_login_failed",
      actorId: "shadow_admin",
      success: false,
      reason: limit.reason ?? "rate_limited",
      ...fingerprint,
      metadata: { retryAfterSeconds: limit.retryAfterSeconds, degraded: limit.degraded },
    });
    return { ok: false, error: "Too many attempts. Please retry later." };
  }

  if (!inputPassword || inputPassword !== configuredPassword) {
    cookieStore.delete(ADMIN_SHADOW_COOKIE);
    await recordAdminLoginFailure(fingerprint);
    await recordAdminAuditLog({
      action: "admin_login_failed",
      actorId: "shadow_admin",
      success: false,
      reason: "invalid_credentials",
      ...fingerprint,
    });
    return { ok: false, error: "Invalid shadow password." };
  }

  const session = buildAdminShadowSession();
  if (!session) {
    return { ok: false, error: "Failed to issue admin session." };
  }

  await recordAdminLoginSuccess(fingerprint);

  cookieStore.set(ADMIN_SHADOW_COOKIE, session.value, getAdminShadowCookieOptions());

  await recordAdminAuditLog({
    action: "admin_login_success",
    actorId: "shadow_admin",
    success: true,
    ...fingerprint,
    metadata: { maxAgeSeconds: session.maxAge },
  });

  const now = Date.now();
  void recordGenericAnalyticsEvent({
    eventId: `admin_login_success:${now}`,
    idempotencyKey: `admin_login_success:${now}`,
    userId: null,
    sessionId: "admin_shadow",
    eventName: "admin_login_success",
    eventTime: new Date(now),
    page: "/saiduhsa",
    source: "admin_auth",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {},
  }).catch(() => {});

  return { ok: true };
}

export async function clearAdminShadowSession(): Promise<{ ok: true }> {
  const cookieStore = await cookies();
  const fingerprint = await getAdminRequestFingerprint();
  cookieStore.delete({ name: ADMIN_SHADOW_COOKIE, path: "/" });
  cookieStore.delete({ name: ADMIN_SHADOW_COOKIE, path: "/saiduhsa" });
  await recordAdminAuditLog({
    action: "admin_logout",
    actorId: "shadow_admin",
    success: true,
    ...fingerprint,
  });
  return { ok: true };
}
