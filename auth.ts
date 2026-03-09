import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { users } from "./src/db/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
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
        if (!name || !password) return null;

        const found = await db.select().from(users).where(eq(users.name, name)).limit(1);
        const row = found[0];
        if (!row) return null;

        const ok = await bcrypt.compare(password, row.password);
        if (!ok) return null;

        return { id: row.id, name: row.name };
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
