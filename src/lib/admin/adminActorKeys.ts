export function normalizePresenceMemberToActorKey(member: unknown): string {
  const raw = typeof member === "string" ? member.trim() : "";
  if (!raw) return "";
  if (raw.startsWith("u:") || raw.startsWith("g:") || raw.startsWith("s:")) return raw;
  if (raw.startsWith("guest:")) return `g:${raw.slice("guest:".length)}`;
  if (raw.startsWith("guest_")) return `g:${raw.slice("guest_".length)}`;
  return `u:${raw}`;
}

export function buildAdminActorKey(input: {
  actorId?: unknown;
  userId?: unknown;
  guestId?: unknown;
  sessionId?: unknown;
}): string {
  const actorId = typeof input.actorId === "string" ? input.actorId.trim() : "";
  if (actorId) return normalizePresenceMemberToActorKey(actorId);

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (userId) return `u:${userId}`;

  const guestId = typeof input.guestId === "string" ? input.guestId.trim() : "";
  if (guestId) return `g:${guestId}`;

  const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  return sessionId ? `s:${sessionId}` : "";
}
