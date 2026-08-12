// src/instrumentation.ts
/**
 * Runs once on server runtime startup. Importing `serverConfig` validates required env vars early
 * (fail fast) before serving requests.
 * `loadVerseCraftEnvFilesOnce` resolves the real app root and merges `.env` / `.env.local` into
 * `process.env` (covers wrong `cwd`, standalone, and hosts where implicit load order differs).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Register global process guards early — handles unhandledRejection / uncaughtException.
    await import("@/lib/observability/processGuards");

    const { loadVerseCraftEnvFilesOnce } = await import("@/lib/config/loadVerseCraftEnv");
    loadVerseCraftEnvFilesOnce();
    const { assertServerConfigLoaded } = await import("@/lib/config/serverConfig");
    assertServerConfigLoaded();

    // Langfuse: fire-and-forget init — must not block request handling.
    // Runs after env is loaded but before first request.
    initLangfuseAsync();

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

/**
 * Initialize Langfuse tracing in the background.
 * Must not throw or block the server startup.
 */
function initLangfuseAsync(): void {
  void (async () => {
    try {
      const { initLangfuse, markLangfuseInitialized } = await import(
        "@/lib/observability/langfuse/client"
      );
      await initLangfuse();
      markLangfuseInitialized();
    } catch {
      // Langfuse init failure is non-fatal — observability degrades gracefully
    }
  })();
}
