"use client";

import type { StateCreator, StoreApi, StoreMutatorIdentifier } from "zustand";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type IntegrityMetaState = {
  _checksum_fingerprint: string;
};

export function hashLikeCrc32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeForHash(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeForHash(item))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value !== "object") return undefined;

  const out: Record<string, JsonValue> = {};
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    if (key === "_checksum_fingerprint") continue;
    if (key.startsWith("_integrity_")) continue;
    const normalized = normalizeForHash(obj[key]);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function stableSerializeForChecksum(state: object): string {
  const normalized = normalizeForHash(state);
  return JSON.stringify(normalized ?? {});
}

export function createStateChecksum(state: object): string {
  return hashLikeCrc32(stableSerializeForChecksum(state));
}

export function checksumMiddleware<
  T extends IntegrityMetaState,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  config: StateCreator<T, Mps, Mcs>
): StateCreator<T, Mps, Mcs> {
  return ((set, get, api) => {
    // Zustand v5 `setState` overloads are strict; runtime paths here match upstream `set`.
    const applySet = set as (
      partial: T | Partial<T> | ((state: T) => T | Partial<T>) | null | undefined,
      replace?: boolean | undefined
    ) => void;

    const wrappedSet: StoreApi<T>["setState"] = (partial, replace) => {
      const prevState = get();
      const currentFingerprint = prevState._checksum_fingerprint;
      const nextPartial =
        typeof partial === "function"
          ? (partial as (state: T) => T | Partial<T>)(prevState)
          : partial;

      if (nextPartial === undefined || nextPartial === null) {
        applySet(nextPartial, replace);
        return;
      }

      const mergedState = (replace
        ? (nextPartial as T)
        : { ...prevState, ...(nextPartial as Partial<T>) }) as T;
      const nextFingerprint = createStateChecksum(mergedState);

      const withFingerprint = (
        replace
          ? { ...(nextPartial as T), _checksum_fingerprint: nextFingerprint }
          : { ...(nextPartial as Partial<T>), _checksum_fingerprint: nextFingerprint }
      ) as T | Partial<T>;

      if (!replace && currentFingerprint === nextFingerprint) {
        applySet(nextPartial as T | Partial<T>, replace);
        return;
      }

      applySet(withFingerprint, replace);
    };

    const state = config(wrappedSet as typeof set, get, api);
    const seededFingerprint = createStateChecksum(state);
    return { ...state, _checksum_fingerprint: seededFingerprint };
  }) as StateCreator<T, Mps, Mcs>;
}
