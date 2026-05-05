import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { env } from "@/lib/env";

export type AdminActor = {
  actor: "shadow_admin" | "admin_cron";
  actorId: string;
  ipHash: string | null;
  userAgentHash: string | null;
};

export class AdminAuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AdminAuthError";
  }
}

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hashAdminRequestValue(value: string | null | undefined): string | null {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  return createHmac("sha256", env.auditHmacSecret).update(clean).digest("hex").slice(0, 64);
}

function readCookieFromRequest(req: Request | undefined, name: string): string | undefined {
  const raw = req?.headers.get("cookie") ?? "";
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

async function readHeader(req: Request | undefined, name: string): Promise<string | null> {
  if (req) return req.headers.get(name);
  try {
    const h = await headers();
    return h.get(name);
  } catch {
    return null;
  }
}

export async function getAdminRequestFingerprint(req?: Request): Promise<Pick<AdminActor, "ipHash" | "userAgentHash">> {
  const forwarded = await readHeader(req, "x-forwarded-for");
  const realIp = await readHeader(req, "x-real-ip");
  const cfIp = await readHeader(req, "cf-connecting-ip");
  const ua = await readHeader(req, "user-agent");
  const ip = (cfIp ?? realIp ?? forwarded?.split(",")[0] ?? "").trim();
  return {
    ipHash: hashAdminRequestValue(ip),
    userAgentHash: hashAdminRequestValue(ua),
  };
}

export async function requireAdminSession(req?: Request): Promise<AdminActor | null> {
  const shadowCookie =
    readCookieFromRequest(req, ADMIN_SHADOW_COOKIE) ??
    (await cookies().catch(() => null))?.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) return null;
  const fingerprint = await getAdminRequestFingerprint(req);
  return { actor: "shadow_admin", actorId: "shadow_admin", ...fingerprint };
}

export async function verifyAdminRequest(req?: Request): Promise<
  | { ok: true; actor: AdminActor }
  | { ok: false; response: ReturnType<typeof adminUnauthorizedJson> }
> {
  const actor = await requireAdminSession(req);
  if (!actor) return { ok: false, response: adminUnauthorizedJson() };
  return { ok: true, actor };
}

export function getAdminActor(actor: AdminActor | null | undefined): string {
  return actor?.actorId ?? "unknown_admin";
}

export async function assertAdminApiAccess(req?: Request): Promise<AdminActor> {
  const actor = await requireAdminSession(req);
  if (!actor) throw new AdminAuthError();
  return actor;
}

export async function verifyAdminCronRequest(req: Request): Promise<
  | { ok: true; actor: AdminActor }
  | { ok: false; response: ReturnType<typeof adminJson> }
> {
  const configured = (env.adminCronSecret ?? "").trim();
  const supplied = (req.headers.get("x-cron-secret") ?? "").trim();
  if (!configured) {
    return {
      ok: false,
      response: adminJson(adminFail<null>("admin_cron_secret_missing", null), { status: 403 }),
    };
  }
  if (!supplied || !safeCompare(supplied, configured)) {
    return {
      ok: false,
      response: adminJson(adminFail<null>("unauthorized", null), { status: 403 }),
    };
  }
  const fingerprint = await getAdminRequestFingerprint(req);
  return { ok: true, actor: { actor: "admin_cron", actorId: "admin_cron", ...fingerprint } };
}
