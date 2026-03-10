"use server";

import bcrypt from "bcryptjs";
import { verifySolution } from "altcha-lib";
import { randomUUID } from "node:crypto";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "../../../auth";

type AuthActionState = {
  success: boolean;
  message?: string;
  error?: string;
};

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
const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY ?? process.env.AUTH_SECRET ?? "versecraft-altcha-fallback";

function isHoneypotTriggered(formData: FormData): boolean {
  const val = formData.get(HONEYPOT_FIELD);
  return val != null && String(val).trim().length > 0;
}

async function verifyAltcha(formData: FormData): Promise<boolean> {
  const payload = formData.get("altcha");
  if (!payload || typeof payload !== "string") return false;
  try {
    return await verifySolution(payload, ALTCHA_HMAC_KEY);
  } catch {
    return false;
  }
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

export async function registerUser(
  _prevState: AuthActionState,
  formData: FormData
) : Promise<AuthActionState> {
  if (isHoneypotTriggered(formData)) {
    return { success: false, error: "系统异常，注册中止。" };
  }
  const altchaOk = await verifyAltcha(formData);
  if (!altchaOk) {
    return { success: false, error: "验证未通过，请刷新页面重试。" };
  }
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2 || password.length < 6) {
    return { success: false, error: "注册失败：账号至少 2 位且密码至少 6 位" };
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: randomUUID(),
      name,
      password: hashed,
    });
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
      redirectTo: "/",
    });
    return { success: true, message: "注册成功" };
  } catch (error) {
    if (isRedirectError(error)) {
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

export async function loginUser(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (isHoneypotTriggered(formData)) {
    return { success: false, error: "系统异常，登录中止。" };
  }
  const altchaOk = await verifyAltcha(formData);
  if (!altchaOk) {
    return { success: false, error: "验证未通过，请刷新页面重试。" };
  }
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !password) {
    return { success: false, error: "登录失败：请输入账号和密码" };
  }

  try {
    await signIn("credentials", {
      name,
      password,
      redirectTo: "/",
    });
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
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("Login Backend Error:", error);
    return { success: false, error: "系统异常，登录中止。" };
  }
}
