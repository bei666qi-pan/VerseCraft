export function getCommitFailureRecovery(args: {
  committedNarrativeForRescue: string | null;
}):
  | {
      kind: "narrative_rescued";
      narrative: string;
      hint: string;
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
      hint: "本回合正文已保存，但结算发生错误，部分状态可能未写入。可继续手动输入推进。",
    };
  }
  return { kind: "fatal", liveNarrative: "剧情结算时发生错误，请重试本回合。" };
}

