import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { enrichOptionsFromNarrative } from "@/lib/playRealtime/legalTurnOptionsFallback";

/**
 * Projects a playable choice set from the committed narrative without a
 * network request. These choices are presentation hints only: selecting one
 * still goes through the normal authoritative player-turn workflow.
 */
export function projectLocalPlayableOptions(args: {
  narrative: string;
  seedOptions: string[];
  language?: "zh-CN" | "en-US";
}): string[] {
  const seeds = filterNarrativeActionOptions(args.seedOptions, 4);
  const fallback = args.language === "en-US"
    ? projectEnglishFallback(args.narrative)
    : enrichOptionsFromNarrative({ currentOptions: [], narrative: args.narrative });

  return filterNarrativeActionOptions(
    [...new Set([...seeds, ...fallback].map((option) => option.trim()).filter(Boolean))],
    4,
  );
}

function projectEnglishFallback(narrative: string): string[] {
  if (/danger|threat|enemy|attack|escape|blood|footsteps? close in/i.test(narrative)) {
    return [
      "I fall back to a safer distance and stay alert.",
      "I look for something nearby that can protect me.",
      "I keep low and move without making a sound.",
      "I confirm an escape route before acting.",
    ];
  }
  if (/(?:“[^”]{4,}”|"[^"]{4,}")/u.test(narrative) || /\b(?:said|asked|replied)\b/i.test(narrative)) {
    return [
      "I ask a direct follow-up question.",
      "I rephrase the question and watch the response.",
      "I study their expression before deciding whether to trust them.",
      "I thank them and prepare to move on.",
    ];
  }
  return [
    "I move forward carefully and watch for changes.",
    "I inspect the nearest doorway for a safe path.",
    "I pause and listen for movement nearby.",
    "I look for a light source or a clear landmark.",
  ];
}
