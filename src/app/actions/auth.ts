"use server";

import bcrypt from "bcryptjs";
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

export async function registerUser(
  _prevState: AuthActionState,
  formData: FormData
) : Promise<AuthActionState> {
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
    return { success: true, message: "注册成功" };
  } catch (error) {
    console.error("Registration Backend Error:", error);
    return { success: false, error: "注册失败：该账号已被占用或数据库连接异常" };
  }
}

export async function loginUser(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
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
      switch (error.type) {
        case "CredentialsSignin":
          return { success: false, error: "登录失败：账号或密码错误" };
        default:
          return { success: false, error: "登录验证时发生未知错误" };
      }
    }
    if (isRedirectError(error)) {
      throw error;
    }
    throw error;
  }
}
