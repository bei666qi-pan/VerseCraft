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

function hasNarrative(progress: ChapterProgress): boolean {
  return progress.turnCount >= 1 && progress.narrativeCharCount > 0;
}

function hasAnyChoice(progress: ChapterProgress): boolean {
  return progress.keyChoiceCount >= 1;
}

function hasRequiredChoices(definition: ChapterDefinition, progress: ChapterProgress): boolean {
  return progress.keyChoiceCount >= Math.max(0, definition.minKeyChoices);
}

function hasStateChange(progress: ChapterProgress): boolean {
  return progress.stateChangeCount >= 1;
}

function hasLocalClosingShape(definition: ChapterDefinition, progress: ChapterProgress): boolean {
  return (
    progress.turnCount >= definition.minTurns &&
    hasNarrative(progress) &&
    hasRequiredChoices(definition, progress) &&
    hasStateChange(progress)
  );
}

function canCompleteKnownBeat(
  beatId: string,
  definition: ChapterDefinition,
  progress: ChapterProgress
): boolean | null {
  switch (beatId) {
    case "wake":
      return progress.turnCount >= 1;
    case "observe":
      return hasNarrative(progress);
    case "first-choice":
      return hasAnyChoice(progress);
    case "first-clue":
      return hasStateChange(progress);
    case "hook":
      return hasLocalClosingShape(definition, progress);
    case "new-objective":
      return hasNarrative(progress);
    case "search":
      return progress.turnCount >= 2 || hasAnyChoice(progress);
    case "obstacle":
      return hasStateChange(progress) || (progress.turnCount >= 2 && hasAnyChoice(progress));
    case "key-choice":
      return progress.keyChoiceCount >= Math.max(1, definition.minKeyChoices);
    case "state-change":
      return hasStateChange(progress);
    case "next-risk":
      return hasLocalClosingShape(definition, progress);
    default:
      return null;
  }
}

export function advanceChapterBeats(
  definition: ChapterDefinition,
  progress: ChapterProgress
): string[] {
  const completed = new Set(progress.completedBeatIds);
  for (const beat of definition.beats) {
    const knownDecision = canCompleteKnownBeat(beat.id, definition, progress);
    const canComplete =
      knownDecision ??
      (beat.required === false &&
        progress.turnCount >= Math.max(definition.minTurns, Math.max(1, definition.maxTurns - 1)));
    if (canComplete) completed.add(beat.id);
  }
  return uniqueStrings(Array.from(completed));
}
