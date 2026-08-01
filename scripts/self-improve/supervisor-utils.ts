/**
 * Shared helpers for the self-improve supervisor.
 *
 * Kept separate from supervise.ts (which executes on load) so the logic
 * stays unit-testable.
 */

/**
 * Extract the eval run id emitted by scripts/self-improve/run.ts:
 *   `[SelfImprove] Run si-20260731-045534 started. Profile: smoke`
 * Run ids contain hyphens, so the matcher must accept `[\w-]`.
 * Returns null when no run id line is present.
 */
export function extractRunId(output: string): string | null {
  const match = output.match(/Run (si-[\w-]+) started/);
  return match ? match[1]! : null;
}

export interface SnapshotEntry {
  /** Two-letter git porcelain status, e.g. "M " or "??". */
  status: string;
  /** File mtime in ms, or null when the path is a directory or unreadable. */
  mtimeMs: number | null;
}

export type WorkingTreeSnapshot = Map<string, SnapshotEntry>;

/**
 * Compare two working-tree snapshots and return paths that appeared or
 * changed. mtime comparison is required because `git status --porcelain`
 * collapses untracked directories into a single `?? dir/` line, which makes
 * edits to files inside them invisible without `-uall` + mtime.
 */
export function diffSnapshots(before: WorkingTreeSnapshot, after: WorkingTreeSnapshot): string[] {
  const changed: string[] = [];
  for (const [path, entry] of after) {
    const prev = before.get(path);
    if (!prev) { changed.push(path); continue; }
    if (prev.status !== entry.status) { changed.push(path); continue; }
    if (entry.mtimeMs !== null && prev.mtimeMs !== null && entry.mtimeMs !== prev.mtimeMs) {
      changed.push(path);
    }
  }
  return changed;
}
