import { db } from "@/db";
import { safetyAuditEvents } from "@/db/schema";
import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminCronRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(90, Math.trunc(n)));
}

export async function POST(req: Request) {
  const guard = await verifyAdminCronRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const deleted = await db.delete(safetyAuditEvents).where(lt(safetyAuditEvents.createdAt, cutoff));

  await recordAdminAuditLog({
    action: "admin_cron_safety_audit_cleanup",
    actor: guard.actor,
    success: true,
    metadata: { days, deletedCount: Number(deleted.rowCount ?? 0) },
  });

  return adminJson(
    adminOk({
      days,
      cutoff: cutoff.toISOString(),
      deletedCount: Number(deleted.rowCount ?? 0),
    })
  );
}

