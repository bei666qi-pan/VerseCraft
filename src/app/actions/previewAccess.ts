"use server";

import { cookies } from "next/headers";
import {
  clearPreviewAccessSession,
  decidePreviewAccessPassword,
  getPreviewAccessCookieName,
  sanitizePreviewAccessNext,
} from "@/lib/previewAccess";

export type PreviewAccessAuthState = {
  ok: boolean;
  error?: string;
  next?: string;
};

export async function authenticatePreviewAccess(
  _prevState: PreviewAccessAuthState,
  formData: FormData
): Promise<PreviewAccessAuthState> {
  const inputPassword = String(formData.get("password") ?? "");
  const next = sanitizePreviewAccessNext(formData.get("next"));
  const cookieStore = await cookies();

  const decision = await decidePreviewAccessPassword(inputPassword);
  if (!decision.ok) {
    const clearCookie = clearPreviewAccessSession();
    cookieStore.set(clearCookie.name, clearCookie.value, {
      ...clearCookie.options,
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });

    return {
      ok: false,
      next,
      error: "访问密码错误",
    };
  }

  cookieStore.set(getPreviewAccessCookieName(), decision.session.value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: decision.session.maxAge,
  });

  return { ok: true, next };
}
