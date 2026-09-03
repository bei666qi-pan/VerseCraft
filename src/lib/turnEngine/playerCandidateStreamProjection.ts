export type PlayerCandidateStreamDelta = {
  deltaContent: string;
  toolArgsDelta: string;
};

/**
 * The Writer terminal tool is a transport envelope, not a hidden second
 * response. Feed its narrow JSON arguments into the existing incremental
 * candidate parser so narrative is visible while generated. Authoritative
 * state still arrives only in the TurnFinalizer's FINAL frame.
 */
export function projectPlayerCandidateStreamDelta(
  input: PlayerCandidateStreamDelta,
): { accumulatedDelta: string; visibleDelta: string } {
  const accumulatedDelta = input.deltaContent.length > 0
    ? input.deltaContent
    : input.toolArgsDelta;
  return { accumulatedDelta, visibleDelta: accumulatedDelta };
}
