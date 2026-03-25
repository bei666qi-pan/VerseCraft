import { envBoolean, envEnum, envNumber, envRaw } from "@/lib/config/envRaw";

export type BaiduSinanProviderId = "baidu_text_censor";

export type BaiduSinanAuthMode = "oauth_access_token" | "api_key_direct";

export type BaiduSinanFailMode = "fail_soft" | "fail_closed";

export type BaiduSinanStrictnessProfile = "balanced" | "strict" | "loose" | "custom";

export type BaiduSinanConfig = {
  enabled: boolean;
  provider: BaiduSinanProviderId;
  apiKey: string;
  secretKey: string;
  authMode: BaiduSinanAuthMode;
  tokenUrl: string;
  textCensorUrl: string;
  timeoutMs: number;
  connectTimeoutMs: number;

  inputEnabled: boolean;
  outputEnabled: boolean;
  publicContentEnabled: boolean;

  failModePrivate: BaiduSinanFailMode;
  failModePublic: BaiduSinanFailMode;

  logRawText: boolean;
  hashSalt: string;
  strictnessProfile: string;
};

function normalizeFailMode(raw: string | undefined, fallback: BaiduSinanFailMode): BaiduSinanFailMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "fail_soft" || v === "soft") return "fail_soft";
  if (v === "fail_closed" || v === "closed") return "fail_closed";
  return fallback;
}

export function getBaiduSinanConfigFromEnv(overrides?: Partial<BaiduSinanConfig>): BaiduSinanConfig {
  const enabled = envBoolean("BAIDU_SINAN_ENABLED", false);
  const provider = envEnum<BaiduSinanProviderId>(
    "BAIDU_SINAN_PROVIDER",
    ["baidu_text_censor"],
    "baidu_text_censor"
  );

  const apiKey = envRaw("BAIDU_SINAN_API_KEY") ?? "";
  const secretKey = envRaw("BAIDU_SINAN_SECRET_KEY") ?? "";

  const authMode = envEnum<BaiduSinanAuthMode>("BAIDU_SINAN_AUTH_MODE", ["oauth_access_token", "api_key_direct"], "oauth_access_token");

  const tokenUrl =
    envRaw("BAIDU_SINAN_TOKEN_URL") ??
    "https://aip.baidubce.com/oauth/2.0/token";
  const textCensorUrl =
    envRaw("BAIDU_SINAN_TEXT_CENSOR_URL") ??
    "https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined";

  const timeoutMs = envNumber("BAIDU_SINAN_TIMEOUT_MS", 2500);
  const connectTimeoutMs = envNumber("BAIDU_SINAN_CONNECT_TIMEOUT_MS", 1200);

  const inputEnabled = envBoolean("BAIDU_SINAN_INPUT_ENABLED", true);
  const outputEnabled = envBoolean("BAIDU_SINAN_OUTPUT_ENABLED", true);
  const publicContentEnabled = envBoolean("BAIDU_SINAN_PUBLIC_CONTENT_ENABLED", true);

  const failModePrivate = normalizeFailMode(envRaw("BAIDU_SINAN_FAIL_MODE_PRIVATE"), "fail_soft");
  const failModePublic = normalizeFailMode(envRaw("BAIDU_SINAN_FAIL_MODE_PUBLIC"), "fail_closed");

  const logRawText = envBoolean("BAIDU_SINAN_LOG_RAW_TEXT", false);
  const hashSalt = envRaw("BAIDU_SINAN_HASH_SALT") ?? "replace_me";

  const strictnessProfile = envRaw("BAIDU_SINAN_STRICTNESS_PROFILE") ?? "balanced";

  return {
    enabled,
    provider,
    apiKey,
    secretKey,
    authMode,
    tokenUrl,
    textCensorUrl,
    timeoutMs,
    connectTimeoutMs,
    inputEnabled,
    outputEnabled,
    publicContentEnabled,
    failModePrivate,
    failModePublic,
    logRawText,
    hashSalt,
    strictnessProfile,
    ...(overrides ?? {}),
  };
}

