// src/instrumentation.ts
/**
 * Runs once on server runtime startup. Importing `serverConfig` validates required env vars early
 * (fail fast) before serving requests.
 * `loadVerseCraftEnvFilesOnce` resolves the real app root and merges `.env` / `.env.local` into
 * `process.env` (covers wrong `cwd`, standalone, and hosts where implicit load order differs).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadVerseCraftEnvFilesOnce } = await import("@/lib/config/loadVerseCraftEnv");
    loadVerseCraftEnvFilesOnce();
    const { assertServerConfigLoaded } = await import("@/lib/config/serverConfig");
    assertServerConfigLoaded();
    // Coolify: `schema_v1` may be marked applied before analytics_events existed; migrate.js also reconciles on boot.
    try {
      const { ensureRuntimeSchema } = await import("@/db/ensureSchema");
      await ensureRuntimeSchema();
    } catch (e) {
      const { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } = await import("@/lib/db/postgresErrors");
      if (isPostgresUnavailableError(e)) {
        warnOptionalPostgresUnavailableOnce("instrumentation.ensureRuntimeSchema");
        return;
      }
      console.warn("[instrumentation] ensureRuntimeSchema failed (non-fatal)", e);
    }
  }
}
