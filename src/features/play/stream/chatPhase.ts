import type { ChatStreamPhase } from "./types";

/** True while the DM turn holds the session: disable submit/options/talent and block item use from menu. */
export function doesChatPhaseLockInteraction(phase: ChatStreamPhase): boolean {
  return phase !== "idle" && phase !== "error";
}

/**
 * True while the live narrative strip / typewriter should run (upstream wait + token drain + commit tick).
 * Orthogonal to {@link doesChatPhaseLockInteraction}: both can be true, but semantics differ.
 */
export function isStreamVisualActivePhase(phase: ChatStreamPhase): boolean {
  return (
    phase === "waiting_upstream" || phase === "streaming_body" || phase === "turn_committing"
  );
}
