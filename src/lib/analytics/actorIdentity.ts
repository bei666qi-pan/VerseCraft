export type ActorType = "user" | "guest";

export type ActorIdentity = {
  actorId: string;
  actorType: ActorType;
  userId: string | null;
  guestId: string | null;
};

function normId(s: unknown): string | null {
  const t = typeof s === "string" ? s.trim() : "";
  return t ? t : null;
}

export function buildActorIdentity(args: { userId?: string | null; guestId?: string | null }): ActorIdentity | null {
  const userId = normId(args.userId);
  const guestId = normId(args.guestId);
  if (userId) {
    return { actorId: `u:${userId}`, actorType: "user", userId, guestId };
  }
  if (guestId) {
    return { actorId: `g:${guestId}`, actorType: "guest", userId: null, guestId };
  }
  return null;
}

