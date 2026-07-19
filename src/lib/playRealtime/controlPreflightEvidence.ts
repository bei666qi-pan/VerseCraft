/** Provenance for a control-plane result, kept dependency-free for eval gates. */
export type ControlPreflightSource = "cache" | "fast_path" | "model" | "unavailable";

export function isLiveModelControlEvidence(result: {
  ok: boolean;
  source: ControlPreflightSource;
}): boolean {
  return result.ok && result.source === "model";
}
