import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { users } from "./src/db/schema";
import { getFallbackUserByName } from "./src/lib/authFallbackStore";

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

        try {
          const found = await db.select().from(users).where(eq(users.name, name)).limit(1);
          const row = found[0];
          if (!row) return null;

          const ok = await bcrypt.compare(password, row.password);
          if (!ok) return null;

          return { id: row.id, name: row.name };
        } catch (dbError) {
          console.error("Credentials authorize fallback:", dbError);
          const fallback = await getFallbackUserByName(name);
          if (!fallback) return null;
          const ok = await bcrypt.compare(password, fallback.password);
          if (!ok) return null;
          return { id: fallback.id, name: fallback.name };
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
