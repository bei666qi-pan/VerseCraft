"use server";

import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, buildAdminShadowSession } from "@/lib/adminShadow";
import { env } from "@/lib/env";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";

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

  if (!configuredPassword) {
    return { ok: false, error: "请在 .env.local 中设置 ADMIN_PASSWORD 后重试。" };
  }

  if (!inputPassword || inputPassword !== configuredPassword) {
    cookieStore.delete(ADMIN_SHADOW_COOKIE);
    return { ok: false, error: "Invalid shadow password." };
  }

  const session = buildAdminShadowSession();
  if (!session) {
    return { ok: false, error: "Failed to issue admin session." };
  }

  cookieStore.set(ADMIN_SHADOW_COOKIE, session.value, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: session.maxAge,
    path: "/saiduhsa",
  });

  void recordGenericAnalyticsEvent({
    eventId: `admin_login_success:${Date.now()}`,
    idempotencyKey: `admin_login_success:${session.value.slice(0, 16)}`,
    userId: null,
    sessionId: "admin_shadow",
    eventName: "admin_login_success",
    eventTime: new Date(),
    page: "/saiduhsa",
    source: "admin_auth",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {},
  }).catch(() => {});

  return { ok: true };
}
