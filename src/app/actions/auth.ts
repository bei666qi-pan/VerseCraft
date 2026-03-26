"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "../../../auth";
import { recordGenericAnalyticsEvent, recordUserRegisteredAnalytics } from "@/lib/analytics/repository";
import { eq } from "drizzle-orm";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

type AuthActionState = {
  success: boolean;
  message?: string;
  error?: string;
};

/** Avoid importing `next/dist/*`; Next.js uses digest-prefixed errors for redirects from server actions. */
function isNextRedirectError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isDuplicateUserError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string; cause?: unknown };
  const message = getErrorMessage(error).toLowerCase();
  const code = String(maybeError.code ?? "").toUpperCase();
  const causeMessage = getErrorMessage(maybeError.cause).toLowerCase();
  return (
    code === "ER_DUP_ENTRY" ||
    message.includes("duplicate") ||
    message.includes("users_name_unique") ||
    causeMessage.includes("duplicate")
  );
}

function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string; cause?: unknown };
  const code = String(maybeError.code ?? "").toUpperCase();
  const message = getErrorMessage(error).toLowerCase();
  const causeMessage = getErrorMessage(maybeError.cause).toLowerCase();
  const merged = `${message} ${causeMessage}`;
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ER_ACCESS_DENIED_ERROR" ||
    merged.includes("timeout") ||
    merged.includes("timed out") ||
    merged.includes("connect") ||
    merged.includes("connection") ||
    merged.includes("access denied")
  );
}

const HONEYPOT_FIELD = "fax_number";

function isHoneypotTriggered(formData: FormData): boolean {
  const val = formData.get(HONEYPOT_FIELD);
  return val != null && String(val).trim().length > 0;
}

function resolveCredentialsError(error: AuthError): string | null {
  const authError = error as AuthError & {
    cause?: { err?: Error; message?: string };
    message?: string;
  };
  const allowedMessages = new Set([
    "密码错误或档案不存在。",
    "深渊意志干扰了数据库连接，请稍后再试。",
  ]);
  const nestedErrorMessage = authError.cause?.err?.message?.trim();
  if (nestedErrorMessage && allowedMessages.has(nestedErrorMessage)) return nestedErrorMessage;
  const nestedCauseMessage = authError.cause?.message?.trim();
  if (nestedCauseMessage && allowedMessages.has(nestedCauseMessage)) return nestedCauseMessage;
  const directMessage = authError.message?.trim();
  if (directMessage && allowedMessages.has(directMessage)) {
    return directMessage;
  }
  return null;
}

async function recordLoginSuccess(name: string): Promise<void> {
  const found = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  const uid = found[0]?.id ?? null;
  void recordGenericAnalyticsEvent({
    eventId: `${uid ?? name}:user_login_success:${Date.now()}`,
    idempotencyKey: `user_login_success:${uid ?? name}:${Date.now()}`,
    userId: uid,
    sessionId: "system",
    eventName: "user_login_success",
    eventTime: new Date(),
    page: "/",
    source: "auth",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {},
  }).catch(() => {});
}

function readConsentFromFormData(formData: FormData): { userAgreement: boolean; privacyPolicy: boolean } {
  const consentUserAgreement = String(formData.get("consent_user_agreement") ?? "").trim() === "1";
  const consentPrivacyPolicy = String(formData.get("consent_privacy_policy") ?? "").trim() === "1";
  return { userAgreement: consentUserAgreement, privacyPolicy: consentPrivacyPolicy };
}

function validateAuthInputs(name: string, password: string): string | null {
  if (name.length < 2) return "笔名至少 2 个字符。";
  if (password.length < 6) return "密码至少 6 位。";
  return null;
}

/** 插入新用户 + 注册分析 + 凭证登录（档案须尚不存在）。 */
async function performRegisterNewUser(name: string, password: string): Promise<AuthActionState> {
  const safety = await moderateInputOnServer({
    scene: "profile_input",
    text: name,
    sessionId: "system",
  });
  if (safety.decision !== "allow") {
    return { success: false, error: safety.userMessage };
  }

  try {
    // 显式注册：先查重，给出“已被占用”的确定性反馈
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
    if (existing[0]) {
      return { success: false, error: "该笔名已被占用，请换一个。" };
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUserId = randomUUID();
    await db.insert(users).values({
      id: newUserId,
      name,
      password: hashed,
    });

    void recordUserRegisteredAnalytics({
      eventId: `${newUserId}:user_registered`,
      idempotencyKey: `${newUserId}:user_registered`,
      userId: newUserId,
      sessionId: "system",
      eventTime: new Date(),
      page: "/",
      source: "auth",
      platform: "unknown",
      payload: { name },
    }).catch(() => {});
  } catch (error) {
    console.error("Registration Backend Error:", error);
    if (isDuplicateUserError(error)) {
      return { success: false, error: "该名称已被占用，档案已存在。" };
    }
    if (isDatabaseConnectionError(error)) {
      return { success: false, error: "深渊意志干扰了数据库连接，请稍后再试。" };
    }
    return { success: false, error: "系统异常，注册中止。" };
  }

  try {
    await signIn("credentials", {
      name,
      password,
      redirectTo: "/?auth=registered",
    });
    return { success: true, message: "注册成功" };
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error("Registration Auto SignIn Error:", error);
    if (error instanceof AuthError) {
      const explicitMessage = resolveCredentialsError(error);
      if (explicitMessage) {
        return { success: false, error: explicitMessage };
      }
    }
    return { success: false, error: "系统异常，注册中止。" };
  }
}

/** 已存在用户：仅凭证登录 + 登录分析。 */
async function performCredentialsLogin(name: string, password: string): Promise<AuthActionState> {
  // 显式登录：先确认账号存在，避免“输错当注册”的不确定性
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1).catch(() => []);
  if (!existing[0]) {
    return { success: false, error: "账号不存在：该笔名尚未创建，请先注册。" };
  }

  try {
    await signIn("credentials", {
      name,
      password,
      redirectTo: "/?auth=logged_in",
    });
    await recordLoginSuccess(name);
    return { success: true, message: "登录成功" };
  } catch (error) {
    if (error instanceof AuthError) {
      const explicitMessage = resolveCredentialsError(error);
      if (explicitMessage) {
        return { success: false, error: explicitMessage };
      }
      switch (error.type) {
        case "CredentialsSignin":
          return { success: false, error: "密码错误或档案不存在。" };
        default:
          return { success: false, error: "登录验证时发生未知错误" };
      }
    }
    if (isNextRedirectError(error)) {
      const found = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1).catch(() => []);
      const uid = found[0]?.id ?? null;
      void recordGenericAnalyticsEvent({
        eventId: `${uid ?? name}:user_login_success:${Date.now()}`,
        idempotencyKey: `user_login_success:${uid ?? name}:${Date.now()}`,
        userId: uid,
        sessionId: "system",
        eventName: "user_login_success",
        eventTime: new Date(),
        page: "/",
        source: "auth",
        platform: "unknown",
        tokenCost: 0,
        playDurationDeltaSec: 0,
        payload: {},
      }).catch(() => {});
      throw error;
    }
    console.error("Login Backend Error:", error);
    return { success: false, error: "系统异常，登录中止。" };
  }
}

/** 单一表单：库中无此名则注册，有则登录。 */
export async function signInOrRegister(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (isHoneypotTriggered(formData)) {
    return { success: false, error: "系统异常，认证中止。" };
  }
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const consent = readConsentFromFormData(formData);
  if (!consent.userAgreement || !consent.privacyPolicy) {
    return { success: false, error: "请先勾选用户协议与隐私政策后继续。" };
  }
  const inputErr = validateAuthInputs(name, password);
  if (inputErr) return { success: false, error: inputErr };

  // Moderate profile name before hitting DB (avoid storing abusive/advertising names).
  const safety = await moderateInputOnServer({
    scene: "profile_input",
    text: name,
    sessionId: "system",
  });
  if (safety.decision !== "allow") {
    return { success: false, error: safety.userMessage };
  }

  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
    if (!existing[0]) {
      return performRegisterNewUser(name, password);
    }
    return performCredentialsLogin(name, password);
  } catch (error) {
    console.error("signInOrRegister lookup error:", error);
    if (isDatabaseConnectionError(error)) {
      return { success: false, error: "深渊意志干扰了数据库连接，请稍后再试。" };
    }
    return { success: false, error: "系统异常，认证中止。" };
  }
}

export async function registerUser(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (isHoneypotTriggered(formData)) {
    return { success: false, error: "系统异常，注册中止。" };
  }
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const consent = readConsentFromFormData(formData);
  if (!consent.userAgreement || !consent.privacyPolicy) {
    return { success: false, error: "注册需要先同意用户协议与隐私政策。" };
  }
  const inputErr = validateAuthInputs(name, password);
  if (inputErr) return { success: false, error: inputErr };

  return performRegisterNewUser(name, password);
}

export async function loginUser(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (isHoneypotTriggered(formData)) {
    return { success: false, error: "系统异常，登录中止。" };
  }
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const consent = readConsentFromFormData(formData);
  if (!consent.userAgreement || !consent.privacyPolicy) {
    return { success: false, error: "登录需要先同意用户协议与隐私政策。" };
  }
  const inputErr = validateAuthInputs(name, password);
  if (inputErr) return { success: false, error: inputErr };

  return performCredentialsLogin(name, password);
}

export async function checkNameAvailability(input: { name: string }): Promise<{
  ok: boolean;
  available: boolean;
  message: string;
}> {
  const name = String(input?.name ?? "").trim();
  if (name.length < 2) return { ok: true, available: false, message: "笔名至少 2 个字符。" };

  const safety = await moderateInputOnServer({
    scene: "profile_input",
    text: name,
    sessionId: "system",
  });
  if (safety.decision !== "allow") {
    return { ok: false, available: false, message: safety.userMessage };
  }

  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
    if (existing[0]) return { ok: true, available: false, message: "已被占用" };
    return { ok: true, available: true, message: "可用" };
  } catch (error) {
    console.error("[auth] checkNameAvailability failed", error);
    return { ok: false, available: false, message: "暂时无法校验，请稍后重试。" };
  }
}
