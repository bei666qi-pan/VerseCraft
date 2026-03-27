export type HomeEntryState = "guest_fresh" | "guest_has_progress" | "authed_has_progress" | "authed_no_progress";

export function resolveHomeEntryState(input: {
  authed: boolean;
  localHasAny: boolean;
  hasCloudAnySave: boolean;
  hasPlayableResumeShadow: boolean;
}): HomeEntryState {
  const localHas = input.localHasAny || input.hasPlayableResumeShadow;
  const cloudHas = input.hasCloudAnySave;
  if (!input.authed && !localHas) return "guest_fresh";
  if (!input.authed && localHas) return "guest_has_progress";
  if (input.authed && (cloudHas || localHas)) return "authed_has_progress";
  return "authed_no_progress";
}

export function shouldUseResumeShadowFallback(input: {
  slotId: string;
  rowExists: boolean;
  hasPlayableResumeShadow: boolean;
}): boolean {
  if (!input.hasPlayableResumeShadow) return false;
  if (input.slotId === "__resume_shadow__") return true;
  if (!input.rowExists) return true;
  return false;
}
