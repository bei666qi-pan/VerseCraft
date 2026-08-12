// src/lib/fireAndForget.ts
/**
 * Fire-and-forget an async function with structured error logging.
 *
 * Use this instead of `.catch(() => {})` to ensure silent failures don't go
 * completely unnoticed. Every suppressed error still logs a structured
 * `[fireAndForget]` message to the console so it's grep-able in production
 * logs.
 *
 * @param fn    The async function to run in the background.
 * @param label A human-readable label identifying the call site (e.g.
 *              "recordDailyTokenUsage", "reader.cancel"). This label is
 *              included in the error log so you can pinpoint the source.
 */
export function fireAndForget(fn: () => Promise<unknown>, label: string): void {
  fn().catch((err: unknown) => {
    console.error("[fireAndForget]", label, err instanceof Error ? err.message : String(err));
  });
}
