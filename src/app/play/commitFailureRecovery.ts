export function getCommitFailureRecovery(args: {
  committedNarrativeForRescue: string | null;
}):
  | {
      kind: "narrative_rescued";
      narrative: string;
      hint: string | null;
    }
  | {
      kind: "fatal";
      liveNarrative: string;
    } {
  const s = String(args.committedNarrativeForRescue ?? "").trim();
  if (s) {
    return {
      kind: "narrative_rescued",
      narrative: s,
      hint: null,
    };
  }
  return { kind: "fatal", liveNarrative: "" };
}
