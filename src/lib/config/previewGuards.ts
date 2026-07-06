import { createHash } from "node:crypto";
import { envRaw } from "@/lib/config/envRaw";
import { EnvValidationError, normalizeDatabaseUrl } from "@/lib/config/validateCriticalEnv";

export const PREVIEW_CANONICAL_HOST = "preview.versecraft.cn";

type PreviewGuardEnv = {
  environmentName?: string;
  appUrl?: string;
  nextPublicAppUrl?: string;
  productionDatabaseUrlFingerprint?: string;
  previewDatabaseUrlFingerprint?: string;
};

function readPreviewGuardEnv(): PreviewGuardEnv {
  return {
    environmentName: envRaw("ENVIRONMENT_NAME"),
    appUrl: envRaw("APP_URL"),
    nextPublicAppUrl: envRaw("NEXT_PUBLIC_APP_URL"),
    productionDatabaseUrlFingerprint: envRaw("PRODUCTION_DATABASE_URL_FINGERPRINT"),
    previewDatabaseUrlFingerprint: envRaw("PREVIEW_DATABASE_URL_FINGERPRINT"),
  };
}

function containsPreviewHost(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes(PREVIEW_CANONICAL_HOST);
}

export function isPreviewEnvironmentSignal(env: PreviewGuardEnv = readPreviewGuardEnv()): boolean {
  return (
    (env.environmentName ?? "").toLowerCase() === "preview" ||
    containsPreviewHost(env.appUrl) ||
    containsPreviewHost(env.nextPublicAppUrl)
  );
}

export function fingerprintPreviewDatabaseUrl(databaseUrl: string): string {
  return createHash("sha256").update(normalizeDatabaseUrl(databaseUrl)).digest("hex");
}

function normalizeFingerprint(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function databaseUrlHasProductionMarker(databaseUrl: string): boolean {
  try {
    const parsed = new URL(normalizeDatabaseUrl(databaseUrl));
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const safeParts = `${parsed.hostname}/${databaseName}`.toLowerCase();
    const segments = safeParts.split(/[^a-z0-9]+/u).filter(Boolean);
    return (
      safeParts.includes("versecraft_prod") ||
      safeParts.includes("versecraft-prod") ||
      segments.includes("prod") ||
      segments.includes("production")
    );
  } catch {
    return false;
  }
}

function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 12);
}

export type AppEnvironmentTag = "production" | "development" | "preview";

/**
 * 进程级环境标签（后台重构第二轮风险排查新增）：用于给 analytics_events 打
 * environment 标记，避免本地开发 / 预览部署产生的流量混入生产后台统计。
 * 这只判断"当前进程属于哪种部署"，不判断"生产环境里有没有人在手动测试"——
 * 后者需要更细的请求级标记，是更大范围的后续工作，这里不处理。
 */
export function resolveAppEnvironmentTag(
  nodeEnv: string,
  env: PreviewGuardEnv = readPreviewGuardEnv()
): AppEnvironmentTag {
  if (isPreviewEnvironmentSignal(env)) return "preview";
  if (nodeEnv !== "production") return "development";
  return "production";
}

export function assertPreviewEnvironmentSafe(
  databaseUrl: string,
  env: PreviewGuardEnv = readPreviewGuardEnv()
): void {
  if (!isPreviewEnvironmentSignal(env)) return;

  const currentFingerprint = fingerprintPreviewDatabaseUrl(databaseUrl);
  const productionFingerprint = normalizeFingerprint(env.productionDatabaseUrlFingerprint);
  const previewFingerprint = normalizeFingerprint(env.previewDatabaseUrlFingerprint);

  if (productionFingerprint && currentFingerprint === productionFingerprint) {
    throw new EnvValidationError(
      `Preview environment guard failed: DATABASE_URL fingerprint matches PRODUCTION_DATABASE_URL_FINGERPRINT (${shortFingerprint(currentFingerprint)}...).`
    );
  }

  if (previewFingerprint && currentFingerprint !== previewFingerprint) {
    throw new EnvValidationError(
      `Preview environment guard failed: DATABASE_URL fingerprint (${shortFingerprint(currentFingerprint)}...) does not match PREVIEW_DATABASE_URL_FINGERPRINT.`
    );
  }

  if (databaseUrlHasProductionMarker(databaseUrl)) {
    throw new EnvValidationError(
      "Preview environment guard failed: DATABASE_URL host or database name contains a production marker."
    );
  }
}
