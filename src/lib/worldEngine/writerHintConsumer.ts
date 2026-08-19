import "server-only";

import type { WorldRuntimeScope } from "./contracts";
import {
  renderDirectorHintEnvelope,
  type DirectorHintEnvelope,
} from "./hintEnvelope";
import { loadApplicableDirectorHintEnvelope } from "./hintRepository";

export type CommittedDirectorWriterHint = {
  envelope: DirectorHintEnvelope;
  block: string;
};

/** The only Writer-facing Director hint loader used by prompt assembly and probes. */
export async function loadCommittedDirectorHintForWriter(args: {
  scope: WorldRuntimeScope;
  turnIndex: number;
  timeoutMs?: number;
}): Promise<CommittedDirectorWriterHint | null> {
  const envelope = await loadApplicableDirectorHintEnvelope(args).catch(() => null);
  if (!envelope) return null;
  const block = renderDirectorHintEnvelope(envelope);
  return block ? { envelope, block } : null;
}
