// src/lib/config/validateCriticalEnv.ts
/** Thrown when required env fails validation at boot (message is safe to log). */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(`[VerseCraft config] ${message}`);
    this.name = "EnvValidationError";
  }
}

/** Strip wrapping quotes from DATABASE_URL pasted from some panels. */
export function normalizeDatabaseUrl(raw: string): string {
  return raw.replace(/^['"]|['"]$/g, "").trim();
}

export function validatePostgresDatabaseUrl(url: string): void {
  const normalized = normalizeDatabaseUrl(url);
  if (!/^postgres(ql)?:\/\//i.test(normalized)) {
    throw new EnvValidationError(
      "DATABASE_URL must be a PostgreSQL URL (scheme postgres:// or postgresql://)."
    );
  }
}

export function validateAuthSecretLength(secret: string): void {
  if (secret.length < 16) {
    throw new EnvValidationError("AUTH_SECRET must be at least 16 characters (32+ recommended).");
  }
}
