"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export type AuthActionState = {
  ok: boolean;
  message: string;
};

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = {
  ok: false,
  message: "",
};

export async function registerUser(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (name.length < 2 || password.length < 6) {
    return { ok: false, message: "账号至少 2 位，密码至少 6 位。" };
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  if (existing[0]) {
    return { ok: false, message: "该账号已存在，请直接登录。" };
  }

  const hashed = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    id: randomUUID(),
    name,
    password: hashed,
  });

  return { ok: true, message: "注册成功，请直接登录。" };
}
