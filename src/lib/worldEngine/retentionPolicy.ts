const TERMINAL_EVENT_STATUSES = new Set(["resolved", "expired", "rejected"]);

export function canDeleteWorldEngineRun(args: {
  createdAt: Date;
  now: Date;
  retentionDays: number;
  eventStatuses: readonly string[];
}): boolean {
  const retentionMs = Math.max(1, Math.trunc(args.retentionDays)) * 86_400_000;
  if (args.now.getTime() - args.createdAt.getTime() < retentionMs) return false;
  return args.eventStatuses.every((status) => TERMINAL_EVENT_STATUSES.has(status));
}
