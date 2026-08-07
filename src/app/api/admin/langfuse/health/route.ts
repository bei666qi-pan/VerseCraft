import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { isLangfuseReadEnabled, getLangfuseConfig } from "@/lib/observability/langfuse/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const enabled = isLangfuseReadEnabled();
    const cfg = getLangfuseConfig();

    if (!enabled) {
      return adminJson(adminOk({
        connected: false,
        lastIngestionTime: null,
        exportErrorCount: 0,
      }, { degraded: true, reason: "langfuse_read_disabled" }), {
        headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
      });
    }

    // Perform a lightweight ping: try to list 1 trace to verify connectivity
    let connected = false;
    let lastIngestionTime: string | null = null;
    let exportErrorCount = 0;

    try {
      const { LangfuseClient } = await import("@langfuse/client");
      const client = new LangfuseClient({
        publicKey: cfg.publicKey!,
        secretKey: cfg.secretKey!,
        baseUrl: cfg.baseUrl,
      });

      const result = await Promise.race([
        client.trace.list({ page: 1, limit: 1 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), cfg.readTimeoutMs)),
      ]);

      const data = result as { data?: Array<{ timestamp?: string }>; meta?: { totalItems?: number } };
      connected = true;

      if (data?.data?.[0]?.timestamp) {
        lastIngestionTime = data.data[0].timestamp;
      }
    } catch (_err) {
      connected = false;
      exportErrorCount = 1;
    }

    return adminJson(adminOk({
      connected,
      lastIngestionTime,
      exportErrorCount,
    }, { degraded: !connected, reason: !connected ? "langfuse_unreachable" : null }), {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/health] failed", error);
    return adminJson(adminFail("langfuse_unavailable", {
      connected: false,
      lastIngestionTime: null,
      exportErrorCount: 0,
    }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
