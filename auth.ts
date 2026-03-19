import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { users } from "./src/db/schema";
import { env } from "./src/lib/env";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  secret: env.authSecret,
  trustHost: env.authTrustHost === "true",
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        name: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      authorize: async (credentials) => {
        const name = String(credentials?.name ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!name || !password) throw new Error("未找到该档案，请检查账号。");
        try {
          const found = await db.select().from(users).where(eq(users.name, name)).limit(1);
          const row = found[0];
          if (!row) throw new Error("密码错误或档案不存在。");

          const ok = await bcrypt.compare(password, row.password);
          if (!ok) throw new Error("密码错误或档案不存在。");

          return { id: row.id, name: row.name };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error ?? "");
          if (message === "密码错误或档案不存在。") {
            throw error;
          }
          throw new Error("深渊意志干扰了数据库连接，请稍后再试。");
        }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.name = token.name ?? session.user.name;
      }
      return session;
    },
  },
});
