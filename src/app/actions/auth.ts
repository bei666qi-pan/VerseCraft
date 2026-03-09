"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createFallbackUser, getFallbackUserByName } from "@/lib/authFallbackStore";

export async function registerUser(
  _prevState: { ok: boolean; message: string },
  formData: FormData
) {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (name.length < 2 || password.length < 6) {
      return { ok: false, message: "账号至少 2 位，密码至少 6 位。" };
    }

    const hashed = await bcrypt.hash(password, 10);
    try {
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
      if (existing[0]) {
        return { ok: false, message: "该账号已存在，请直接登录。" };
      }

      await db.insert(users).values({
        id: randomUUID(),
        name,
        password: hashed,
      });
    } catch (dbError) {
      const fallbackExisting = await getFallbackUserByName(name);
      if (fallbackExisting) {
        return { ok: false, message: "该账号已存在，请直接登录。" };
      }
      await createFallbackUser(name, hashed);
      console.error("Registration Backend Error:", dbError);
      return { ok: true, message: "数据库暂不可用，已切换本地应急注册，请直接登录。" };
    }

    return { ok: true, message: "注册成功，请直接登录。" };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (isRedirectError(error)) throw error;
    console.error("Registration Backend Error:", error);
    return { ok: false, message: "注册失败，请稍后再试。" };
  }
}
