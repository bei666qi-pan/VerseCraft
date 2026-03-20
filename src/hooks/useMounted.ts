"use client";

/**
 * Returns true only after the component has mounted (client-side).
 * Use to gate storage-dependent or environment-API-dependent UI
 * and avoid React 19 hydration mismatch.
 */
export function useMounted(): boolean {
  return typeof window !== "undefined";
}

/** Alias for useMounted; matches Phase 12+ defensive coding convention. */
export const useIsMounted = useMounted;
