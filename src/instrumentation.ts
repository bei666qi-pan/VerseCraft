// src/instrumentation.ts
/**
 * Runs once on server runtime startup. Importing `serverConfig` validates required env vars early
 * (fail fast) before serving requests. Next.js loads `.env.local` / Coolify injects env before this runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/config/serverConfig");
  }
}
