const RECOVERABLE_STALE_TICKET_REASONS = new Set(["invalid_ticket", "ticket_terminal"]);

/**
 * A request that carries a queue ticket has not reached the model when its
 * claim returns one of these explicit 409 reasons. This also covers a
 * queue-store degradation boundary where a newly admitted ticket disappears
 * before execution. Re-admission is safe exactly once; other failures retain
 * the normal player-visible failure path.
 */
export function shouldRecoverStaleChatQueueTicket(input: {
  status: number;
  reason: string;
  hasQueueTicket: boolean;
  alreadyRetried: boolean | undefined;
}): boolean {
  return (
    input.status === 409 &&
    input.hasQueueTicket &&
    input.alreadyRetried !== true &&
    RECOVERABLE_STALE_TICKET_REASONS.has(input.reason.trim().toLowerCase())
  );
}
