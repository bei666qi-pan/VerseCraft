import type { ChapterDefinition, ChapterProgress, ChapterTurnSignals } from "./types";

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

export function countChapterStateChanges(signals: ChapterTurnSignals): number {
  const locationChanged = Boolean(
    signals.previousLocation &&
      signals.nextLocation &&
      String(signals.previousLocation) !== String(signals.nextLocation)
  );
  const changes = [
    locationChanged,
    (signals.newTaskCount ?? 0) > 0,
    (signals.taskUpdateCount ?? 0) > 0,
    (signals.codexUpdateCount ?? 0) > 0,
    (signals.relationshipUpdateCount ?? 0) > 0,
    (signals.awardedItemCount ?? 0) > 0,
    (signals.awardedWarehouseItemCount ?? 0) > 0,
    (signals.clueUpdateCount ?? 0) > 0,
    (signals.sanityDamage ?? 0) > 0,
    (signals.currencyChange ?? 0) !== 0,
    (signals.mainThreatUpdateCount ?? 0) > 0,
    (signals.weaponUpdateCount ?? 0) > 0,
    (signals.weaponBagUpdateCount ?? 0) > 0,
  ];
  return changes.filter(Boolean).length;
}

export function shouldCountChapterTurn(signals: ChapterTurnSignals): boolean {
  return signals.isLegalAction && signals.source !== "system" && signals.source !== "resume";
}

export function shouldCountKeyChoice(signals: ChapterTurnSignals, stateChangeDelta: number): boolean {
  if (!shouldCountChapterTurn(signals)) return false;
  if (signals.source === "option") return true;
  return stateChangeDelta > 0;
}

export function advanceChapterBeats(
  definition: ChapterDefinition,
  progress: ChapterProgress
): string[] {
  const completed = new Set(progress.completedBeatIds);
  const required = definition.beats;
  for (let i = 0; i < required.length; i++) {
    const beat = required[i];
    const index = i + 1;
    const canComplete =
      index === 1
        ? progress.turnCount >= 1
        : index === 2
          ? progress.turnCount >= 1 && progress.narrativeCharCount > 0
          : index === 3
            ? progress.turnCount >= 2 || progress.keyChoiceCount >= 1
            : index === 4
              ? progress.stateChangeCount >= 1 || progress.turnCount >= definition.minTurns
              : index === 5
                ? progress.turnCount >= definition.minTurns && progress.stateChangeCount >= 1
                : progress.turnCount >= definition.minTurns && progress.keyChoiceCount >= definition.minKeyChoices;
    if (canComplete) completed.add(beat.id);
  }
  return uniqueStrings(Array.from(completed));
}
