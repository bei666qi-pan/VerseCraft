import { envNumber, envRaw } from "@/lib/config/envRaw";

export const DEFAULT_PREVIEW_ACCESS_COOKIE_NAME = "vc_preview_access";

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const encoder = new TextEncoder();

export type PreviewAccessSession = {
  value: string;
  maxAge: number;
};

export type PreviewAccessEnv = {
  cookieSecret?: string;
  cookieName?: string;
  password?: string;
  maxAgeSeconds?: number;
};

export type PreviewAccessPasswordDecision =
  | { ok: true; session: PreviewAccessSession }
  | { ok: false; reason: "missing_config" | "invalid_password" };

export type PreviewAccessClearCookie = {
  name: string;
  value: "";
  options: {
    maxAge: 0;
    path: "/";
  };
};

function readPreviewAccessEnv(): PreviewAccessEnv {
  return {
    cookieSecret: envRaw("PREVIEW_ACCESS_COOKIE_SECRET"),
    cookieName: envRaw("PREVIEW_ACCESS_COOKIE_NAME"),
    password: envRaw("PREVIEW_ACCESS_PASSWORD"),
    maxAgeSeconds: envNumber("PREVIEW_ACCESS_MAX_AGE_SECONDS", DEFAULT_MAX_AGE_SECONDS),
  };
}

export function getPreviewAccessCookieName(env: PreviewAccessEnv = readPreviewAccessEnv()): string {
  const raw = env.cookieName?.trim();
  return raw && COOKIE_NAME_RE.test(raw) ? raw : DEFAULT_PREVIEW_ACCESS_COOKIE_NAME;
}

function getMaxAgeSeconds(env: PreviewAccessEnv): number {
  const n = env.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_AGE_SECONDS;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeCompare(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length === 0 || bBytes.length === 0) return false;

  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function isPreviewAccessConfigured(env: PreviewAccessEnv = readPreviewAccessEnv()): boolean {
  return Boolean(env.password && env.cookieSecret);
}

export async function buildPreviewAccessSession(options: {
  env?: PreviewAccessEnv;
  nonce?: string;
  nowMs?: number;
} = {}): Promise<PreviewAccessSession | null> {
  const env = options.env ?? readPreviewAccessEnv();
  const secret = env.cookieSecret;
  if (!secret) return null;

  const maxAge = getMaxAgeSeconds(env);
  const nowMs = options.nowMs ?? Date.now();
  const exp = Math.floor(nowMs / 1000) + maxAge;
  const nonce = options.nonce ?? makeNonce();
  const payload = `${exp}.${nonce}`;
  const signature = await signPayload(payload, secret);
  return { value: `${payload}.${signature}`, maxAge };
}

export async function verifyPreviewAccessSession(
  value: string | undefined,
  options: { env?: PreviewAccessEnv; nowMs?: number } = {}
): Promise<boolean> {
  const env = options.env ?? readPreviewAccessEnv();
  const secret = env.cookieSecret;
  if (!secret || !value) return false;

  const [expRaw, nonce, signature, ...rest] = value.split(".");
  if (rest.length > 0 || !expRaw || !nonce || !signature) return false;

  const exp = Number(expRaw);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(exp) || exp <= nowSeconds) return false;

  const expected = await signPayload(`${expRaw}.${nonce}`, secret);
  return safeCompare(signature, expected);
}

export async function decidePreviewAccessPassword(
  inputPassword: string,
  options: { env?: PreviewAccessEnv; nowMs?: number; nonce?: string } = {}
): Promise<PreviewAccessPasswordDecision> {
  const env = options.env ?? readPreviewAccessEnv();
  const configuredPassword = env.password;
  if (!configuredPassword || !env.cookieSecret) {
    return { ok: false, reason: "missing_config" };
  }
  if (!safeCompare(inputPassword, configuredPassword)) {
    return { ok: false, reason: "invalid_password" };
  }

  const session = await buildPreviewAccessSession({
    env,
    nonce: options.nonce,
    nowMs: options.nowMs,
  });
  if (!session) return { ok: false, reason: "missing_config" };
  return { ok: true, session };
}

export function clearPreviewAccessSession(): PreviewAccessClearCookie {
  return {
    name: getPreviewAccessCookieName(),
    value: "",
    options: {
      maxAge: 0,
      path: "/",
    },
  };
}

export function sanitizePreviewAccessNext(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (/[\r\n]/.test(raw)) return "/";
  return raw;
}
