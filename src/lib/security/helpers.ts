const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeInputText(input: string, maxLen: number): string {
  const trimmed = input.trim().replace(CONTROL_CHARS_RE, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

export function createRequestId(prefix = "sec"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  return error.name || "error";
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
