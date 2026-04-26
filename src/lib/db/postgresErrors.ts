const POSTGRES_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorCode(value: unknown): string | null {
  if (!isObject(value)) return null;
  const code = value.code;
  return typeof code === "string" ? code : null;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (isObject(value)) {
    const message = value.message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function isPostgresUnavailableError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const code = errorCode(current);
    if (code && POSTGRES_UNAVAILABLE_CODES.has(code)) return true;

    const message = errorMessage(current);
    if (
      /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)\b/.test(message) &&
      /\b(postgres|postgresql|5432|database|db)\b/i.test(message)
    ) {
      return true;
    }

    if (!isObject(current)) continue;
    if ("cause" in current) stack.push(current.cause);
    if (Array.isArray(current.errors)) stack.push(...current.errors);
  }

  return false;
}

const optionalPostgresWarnings = new Set<string>();

export function warnOptionalPostgresUnavailableOnce(label: string): void {
  if (optionalPostgresWarnings.has(label)) return;
  optionalPostgresWarnings.add(label);
  console.warn(`[${label}] PostgreSQL unavailable; optional database work skipped.`);
}
