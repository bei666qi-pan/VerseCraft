/**
 * True only for the very first screen of a new run: no dialogue in logs yet and time not advanced.
 * Used to avoid injecting embedded opening option pools after refresh / continue when persisted
 * `currentOptions` is empty but the run has already left the cold opening.
 */
export function isColdPlayOpening(input: {
  logs?: Array<{ role?: string } | null | undefined> | null;
  time?: { day?: number; hour?: number } | null;
}): boolean {
  const logs = input.logs ?? [];
  if (logs.some((l) => l && l.role === "assistant")) return false;
  if (logs.some((l) => l && l.role === "user")) return false;
  const day = input.time?.day ?? 0;
  const hour = input.time?.hour ?? 0;
  if (day > 0 || hour > 0) return false;
  return true;
}
