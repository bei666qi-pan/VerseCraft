/**
 * Phase-5: 伏笔账本写入/读取模块。
 *
 * 写入模式仿照 pacingLedger.ts（Promise 异步 + catch 吞错，fail-open）。
 * 读取用于 directive 注入（due entries → narrativeDirectivePackets）。
 *
 * @module foreshadowLedger
 */

import { narrativeForeshadowLedger } from "@/db/schema";
import { computeDeadlineTurn, type ForeshadowEntry } from "./foreshadowLifecycle";

// ============================================================
// 写入参数
// ============================================================

export type ForeshadowLedgerInsertParams = {
  sessionId: string;
  userId: string | null | undefined;
  turnIndex: number;
  /** DM 发出的 foreshadow_ops（已 normalize，最多 3 条）。 */
  ops: Array<Record<string, unknown>>;
};

// ============================================================
// 火写入口（fire-and-forget）
// ============================================================

/**
 * 异步写伏笔账本，fire-and-forget。
 * 每条 op 转为一行 narrative_foreshadow_ledger 记录。
 * - plant: status=planted, deadlineTurn=computeDeadlineTurn
 * - reinforce: 不写新行（仅遥测标记）
 * - payoff: 按 id 更新已有记录 status=paid_off + payoffTurn（闭环标记）
 *
 * 调用方不得 await。
 */
export function insertForeshadowLedgerRows(params: ForeshadowLedgerInsertParams): void {
  void (async () => {
    try {
      const { db } = await import("@/db");
      const { eq } = await import("drizzle-orm");

      const inserts: Array<{
        sessionId: string;
        userId: string | null;
        seedText: string;
        source: string;
        plantedTurn: number;
        status: string;
        deadlineTurn: number | null;
        importance: number;
        payoffTurn: number | null;
      }> = [];

      for (const op of params.ops) {
        const opType = String(op.op ?? "");
        const seedText = String(op.text ?? "").slice(0, 140);
        if (!seedText) continue;

        const importance = typeof op.importance === "number"
          ? Math.max(1, Math.min(3, Math.round(op.importance)))
          : 1;

        if (opType === "plant") {
          inserts.push({
            sessionId: params.sessionId,
            userId: params.userId ?? null,
            seedText,
            source: "dm",
            plantedTurn: params.turnIndex,
            status: "planted",
            deadlineTurn: computeDeadlineTurn(params.turnIndex, importance),
            importance,
            payoffTurn: null,
          });
        } else if (opType === "payoff") {
          // payoff op: 按 id 标记已有记录兑现（闭环）
          const opId = typeof op.id === "number" ? op.id : null;
          if (opId) {
            await db
              .update(narrativeForeshadowLedger)
              .set({
                status: "paid_off",
                payoffTurn: params.turnIndex,
                updatedAt: new Date(),
              })
              .where(eq(narrativeForeshadowLedger.id, opId));
          }
        }
        // reinforce: 不写新行，仅遥测（未来可扩展）
      }

      if (inserts.length > 0) {
        await db.insert(narrativeForeshadowLedger).values(inserts);
      }
    } catch {
      // fail-open：表可能尚未 db:push，优雅降级
    }
  })();
}

// ============================================================
// 读取：到期伏笔条目（用于 directive 注入）
// ============================================================

/**
 * 读取当前 session 中已到期（due）的伏笔条目。
 * 用于 narrativeDirectivePackets → dueForeshadow 输入。
 *
 * fail-open：表不存在或查询失败时返回空数组。
 */
export async function readDueForeshadowEntries(
  sessionId: string,
  currentTurn: number,
  maxCount: number = 2,
): Promise<ForeshadowEntry[]> {
  try {
    const { db } = await import("@/db");
    const { eq, and, lte, desc, asc } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(narrativeForeshadowLedger)
      .where(
        and(
          eq(narrativeForeshadowLedger.sessionId, sessionId),
          eq(narrativeForeshadowLedger.status, "planted"),
          // deadlineTurn 已设且当前回合已到 due 窗口（deadlineTurn - 3）
          lte(narrativeForeshadowLedger.deadlineTurn, currentTurn + 3),
        ),
      )
      .orderBy(
        desc(narrativeForeshadowLedger.importance),
        asc(narrativeForeshadowLedger.plantedTurn),
      )
      .limit(maxCount);

    return rows.map((r) => ({
      id: r.id,
      seedText: r.seedText,
      source: r.source,
      plantedTurn: r.plantedTurn,
      status: "planted" as const,
      deadlineTurn: r.deadlineTurn,
      importance: r.importance,
      payoffTurn: r.payoffTurn,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// 过期扫描（后台 worker 或 route.ts final hooks 调用）
// ============================================================

/**
 * 将超过 deadline 的伏笔标记为 expired。
 * fire-and-forget，fail-open。
 */
export function expireOverdueForeshadows(sessionId: string, currentTurn: number): void {
  void (async () => {
    try {
      const { db } = await import("@/db");
      const { eq, and, lt } = await import("drizzle-orm");

      await db
        .update(narrativeForeshadowLedger)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(narrativeForeshadowLedger.sessionId, sessionId),
            eq(narrativeForeshadowLedger.status, "planted"),
            // deadlineTurn 已过期（当前回合 > deadlineTurn）
            lt(narrativeForeshadowLedger.deadlineTurn, currentTurn),
          ),
        );
    } catch {
      // fail-open
    }
  })();
}
