import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), ".env"), override: false, quiet: true });

async function main(): Promise<void> {
  const { getLangfuseConfig } = await import("../src/lib/observability/langfuse/config");
  const { evaluateLangfusePreflight } = await import("../src/lib/observability/langfuse/preflight");
  const config = getLangfuseConfig();
  const result = evaluateLangfusePreflight(config);
  let endpoint: { status: "not_checked" | "healthy" | "unreachable"; httpStatus?: number; version?: string; reason?: string } = { status: "not_checked" };
  if (result.ready) {
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/public/health`, { signal: AbortSignal.timeout(5000) });
      const payload = await response.json().catch(() => null) as { version?: unknown } | null;
      endpoint = response.ok
        ? { status: "healthy", httpStatus: response.status, version: typeof payload?.version === "string" ? payload.version : undefined }
        : { status: "unreachable", httpStatus: response.status, reason: "health_endpoint_rejected" };
    } catch (error) {
      endpoint = { status: "unreachable", reason: error instanceof Error ? error.message.slice(0, 160) : "health_endpoint_failed" };
    }
  }
  const output = { ...result, endpoint, healthy: result.ready && endpoint.status === "healthy" };
  console.log(JSON.stringify(output, null, 2));
  if (result.state === "misconfigured" || (result.ready && endpoint.status !== "healthy")) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
