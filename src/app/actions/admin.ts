"use server";

import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, buildAdminShadowSession } from "@/lib/adminShadow";
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

  return { ok: true };
}
