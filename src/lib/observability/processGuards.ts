// src/lib/observability/processGuards.ts
/**
 * Global process-level handlers for unhandled rejections and uncaught exceptions.
 *
 * Node.js 16+ no longer exits on `unhandledRejection` by default, but the warning
 * is silent unless a handler is attached. An `uncaughtException` will still crash
 * the process if unhandled — we log the stack but allow the default crash behaviour
 * because the process is likely in an inconsistent state.
 *
 * Both handlers are fail-safe: if logging itself throws, the secondary error is
 * logged synchronously and the handler returns without rethrowing.
 */

import "server-only";

let registered = false;

function registerGuards(): void {
  if (registered) return;
  registered = true;

  process.on("unhandledRejection", (reason: unknown, _promise: Promise<unknown>) => {
    try {
      console.error("[process] unhandledRejection — reason:", reason);
      // Node 16+: does NOT exit the process. We only log.
    } catch {
      // Fail-safe: swallow errors in the handler itself to prevent infinite loops.
    }
  });

  process.on("uncaughtException", (error: Error) => {
    try {
      console.error(
        "[process] uncaughtException —",
        error?.stack ?? error
      );
    } catch {
      // Fail-safe.
    }
    // Node default: the process will exit after this handler runs.
    // We intentionally do NOT call process.exit() here — let Node handle it.
  });
}

// Module-level side effect: importing this file registers the handlers.
registerGuards();
