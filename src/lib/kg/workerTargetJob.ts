/** Parses the opt-in worker target used only by bounded diagnostic probes. */
export function parseWorkerTargetJobId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

/**
 * Targeted diagnostics must never fall through to a normal batch when their
 * requested job is unavailable. This is deliberately pure so the worker's
 * isolation rule can be tested without a database or model call.
 */
export function selectWorkerJobs<T>(args: {
  targetJobId: number | null;
  targetedJob: T | null;
  claimedBatch: readonly T[];
}): T[] {
  if (args.targetJobId !== null) return args.targetedJob === null ? [] : [args.targetedJob];
  return [...args.claimedBatch];
}
