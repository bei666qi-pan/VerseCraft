// src/instrumentation.ts
/**
 * Runs once on server runtime startup. Importing `serverConfig` validates required env vars early
 * (fail fast) before serving requests.
 * Explicit `loadEnvConfig` ensures `.env` / `.env.local` are merged into `process.env` for the Node
 * server (covers standalone / some hosts where implicit load order differs from dev).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    await import("@/lib/config/serverConfig");
  }
}
