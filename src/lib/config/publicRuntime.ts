// src/lib/config/publicRuntime.ts
/**
 * Browser-safe configuration: only `NEXT_PUBLIC_*` keys (inlined at build time).
 * Never import server secrets or `serverConfig` from client components.
 */

export interface PublicRuntimeConfig {
  buildId: string | null;
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  const id = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  return {
    buildId: id && id.length > 0 ? id : null,
  };
}
