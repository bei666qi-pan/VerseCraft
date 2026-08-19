import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { envRaw } from "@/lib/config/envRaw";

function parseKey(raw = envRaw("AI_CONFIG_ENCRYPTION_KEY") ?? ""): Buffer {
  const value = raw.trim();
  if (!value) throw new Error("ai_config_encryption_key_missing");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("ai_config_encryption_key_invalid");
  return key;
}

export function hasAiConfigEncryptionKey(): boolean {
  try { parseKey(); return true; } catch { return false; }
}

export function encryptApiKey(plain: string, recordId: string, rawKey?: string): string {
  const secret = plain.trim();
  if (!secret) throw new Error("api_key_required");
  const key = parseKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(recordId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptApiKey(envelope: string, recordId: string, rawKey?: string): string {
  const [version, ivRaw, tagRaw, dataRaw] = envelope.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw new Error("api_key_envelope_invalid");
  const decipher = createDecipheriv("aes-256-gcm", parseKey(rawKey), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(recordId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function keyLastFour(value: string): string {
  const clean = value.trim();
  return clean.slice(-4) || "----";
}
