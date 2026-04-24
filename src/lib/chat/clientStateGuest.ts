// src/lib/chat/clientStateGuest.ts
/**
 * Stable guest identity from `getStructuredClientStateForServer` (v1+).
 */
export function getGuestIdFromClientState(clientState: unknown): string | null {
  if (!clientState || typeof clientState !== "object") return null;
  const g = (clientState as { guestId?: unknown }).guestId;
  if (typeof g !== "string") return null;
  const t = g.trim();
  if (!t || t.length > 128) return null;
  return t;
}
