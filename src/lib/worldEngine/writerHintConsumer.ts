import "server-only";

import type { WorldRuntimeScope } from "./contracts";
import { loadDueDirectorAgenda } from "./agenda";
import { projectDirectorDirective, type ProjectedDirectorDirective } from "./directorDirective";

/** The only Writer-facing Director projection used by prompt assembly and probes. */
export async function loadDirectorDirectiveForWriter(args: {
  scope: WorldRuntimeScope;
  turnIndex: number;
  timeoutMs?: number;
}): Promise<ProjectedDirectorDirective | null> {
  const agenda = await loadDueDirectorAgenda({
    ...args.scope,
    turnIndex: args.turnIndex,
    timeoutMs: args.timeoutMs,
  }).catch(() => null);
  return agenda ? projectDirectorDirective({ ...args, agenda }) : null;
}
