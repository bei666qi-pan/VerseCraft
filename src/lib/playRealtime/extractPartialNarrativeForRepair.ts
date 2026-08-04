/**
 * Extracts the partial narrative field from a potentially malformed DM JSON string.
 * Used by runStreamFinalHooks (inlined in route.ts) for the malformed DM repair path.
 */
export function extractPartialNarrativeForRepair(raw: string): string {
  const text = String(raw ?? "");
  const match = text.match(/"narrative"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match?.[1]) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
  }
}
