// src/lib/config/buildMetadata.ts
import "server-only";

import { envRaw } from "@/lib/config/envRaw";

/** Non-secret deploy identity for `/api/build-id` and diagnostics. */
export function resolveServerBuildId(): string {
  return (
    envRaw("NEXT_PUBLIC_BUILD_ID") ??
    envRaw("BUILD_ID") ??
    envRaw("VERCEL_GIT_COMMIT_SHA") ??
    "unknown"
  );
}
