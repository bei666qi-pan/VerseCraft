type RetentionResult = { rowCount?: number };

export async function rollupThenDeleteExpiredUsage(input: {
  rollup: () => Promise<RetentionResult>;
  remove: () => Promise<RetentionResult>;
}): Promise<{ rolledUp: number; deleted: number }> {
  const rolled = await input.rollup();
  const removed = await input.remove();
  return {
    rolledUp: Number(rolled.rowCount ?? 0),
    deleted: Number(removed.rowCount ?? 0),
  };
}
