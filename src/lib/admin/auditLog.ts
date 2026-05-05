import "server-only";

import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import type { AdminActor } from "@/lib/admin/authGuard";

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("admin_audit_log_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export type AdminAuditAction =
  | "admin_login_success"
  | "admin_login_failed"
  | "admin_logout"
  | "admin_cron_rebuild_daily"
  | "admin_cron_safety_audit_cleanup"
  | "admin_ai_insight_refresh"
  | "admin_ai_insight_cache_clear"
  | "admin_cache_clear"
  | "admin_quota_update"
  | "admin_user_ban_update";

export type AdminAuditLogInput = {
  action: AdminAuditAction | string;
  actor?: AdminActor | null;
  actorId?: string | null;
  success: boolean;
  reason?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAdminAuditLog(input: AdminAuditLogInput): Promise<void> {
  try {
    await withDeadline(
      db.insert(adminAuditLogs).values({
        action: input.action.slice(0, 96),
        actor: (input.actorId ?? input.actor?.actorId ?? "unknown_admin").slice(0, 96),
        success: input.success,
        reason: input.reason ? input.reason.slice(0, 191) : null,
        ipHash: input.ipHash ?? input.actor?.ipHash ?? null,
        userAgentHash: input.userAgentHash ?? input.actor?.userAgentHash ?? null,
        targetType: input.targetType ? input.targetType.slice(0, 64) : null,
        targetId: input.targetId ? input.targetId.slice(0, 191) : null,
        metadata: input.metadata ?? {},
      }),
      1200
    );
  } catch {
    /* Audit logging must not break admin workflows. */
  }
}

export type AdminAuditLogRow = {
  id: number;
  action: string;
  actor: string;
  success: boolean;
  reason: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function listAdminAuditLogs(opts?: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ rows: AdminAuditLogRow[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.max(1, Math.min(100, Math.trunc(opts?.limit ?? 30)));
  const cursorId = opts?.cursor && /^\d+$/.test(opts.cursor) ? Number(opts.cursor) : null;
  const rows = await db
    .select()
    .from(adminAuditLogs)
    .where(cursorId ? sql`${adminAuditLogs.id} < ${cursorId}` : sql`true`)
    .orderBy(desc(adminAuditLogs.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      success: r.success,
      reason: r.reason ?? null,
      targetType: r.targetType ?? null,
      targetId: r.targetId ?? null,
      metadata: r.metadata ?? {},
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
    })),
    nextCursor: rows.length > limit && last ? String(last.id) : null,
    hasMore: rows.length > limit,
  };
}
