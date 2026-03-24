import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiAnalysisSnapshots } from "@/db/schema";
import type { AnalysisTask } from "./schema";

export type AiAnalysisSnapshotRow = {
  task: AnalysisTask;
  scopeKey: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  modelRole: string;
  dataRevision: string;
  staleAt: string;
  generatedAt: string;
};

export async function readLatestAiAnalysisSnapshot(args: {
  task: AnalysisTask;
  scopeKey: string;
}): Promise<AiAnalysisSnapshotRow | null> {
  const rows = await db
    .select({
      task: aiAnalysisSnapshots.task,
      scopeKey: aiAnalysisSnapshots.scopeKey,
      inputJson: aiAnalysisSnapshots.inputJson,
      outputJson: aiAnalysisSnapshots.outputJson,
      modelRole: aiAnalysisSnapshots.modelRole,
      dataRevision: aiAnalysisSnapshots.dataRevision,
      staleAt: aiAnalysisSnapshots.staleAt,
      generatedAt: aiAnalysisSnapshots.generatedAt,
    })
    .from(aiAnalysisSnapshots)
    .where(and(eq(aiAnalysisSnapshots.task, args.task), eq(aiAnalysisSnapshots.scopeKey, args.scopeKey)))
    .orderBy(desc(aiAnalysisSnapshots.generatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    task: row.task as AnalysisTask,
    scopeKey: row.scopeKey,
    inputJson: (row.inputJson as Record<string, unknown>) ?? {},
    outputJson: (row.outputJson as Record<string, unknown>) ?? {},
    modelRole: row.modelRole ?? "none",
    dataRevision: row.dataRevision ?? "",
    staleAt: row.staleAt instanceof Date ? row.staleAt.toISOString() : String(row.staleAt),
    generatedAt:
      row.generatedAt instanceof Date
        ? row.generatedAt.toISOString()
        : String(row.generatedAt),
  };
}

export async function upsertAiAnalysisSnapshot(args: {
  task: AnalysisTask;
  scopeKey: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  modelRole: string;
  dataRevision: string;
  staleAt: Date;
  generatedAt: Date;
}): Promise<void> {
  await db
    .insert(aiAnalysisSnapshots)
    .values({
      task: args.task,
      scopeKey: args.scopeKey,
      inputJson: args.inputJson,
      outputJson: args.outputJson,
      modelRole: args.modelRole,
      dataRevision: args.dataRevision,
      staleAt: args.staleAt,
      generatedAt: args.generatedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [aiAnalysisSnapshots.task, aiAnalysisSnapshots.scopeKey],
      set: {
        inputJson: args.inputJson,
        outputJson: args.outputJson,
        modelRole: args.modelRole,
        dataRevision: args.dataRevision,
        staleAt: args.staleAt,
        generatedAt: args.generatedAt,
        updatedAt: new Date(),
      },
    });
}

export async function invalidateAiAnalysisSnapshot(args: {
  task: AnalysisTask;
  scopeKey?: string;
}): Promise<number> {
  if (args.scopeKey) {
    const r = await db
      .delete(aiAnalysisSnapshots)
      .where(and(eq(aiAnalysisSnapshots.task, args.task), eq(aiAnalysisSnapshots.scopeKey, args.scopeKey)));
    return Number(r.rowCount ?? 0);
  }
  const r = await db.delete(aiAnalysisSnapshots).where(eq(aiAnalysisSnapshots.task, args.task));
  return Number(r.rowCount ?? 0);
}
