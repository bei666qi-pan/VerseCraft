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
    await import("@/lib/config/serverConfig");
  }
}
