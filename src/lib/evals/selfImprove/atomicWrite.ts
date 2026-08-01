/**
 * Atomic JSON persistence helpers for the self-improve system.
 *
 * Write path: `<file>.tmp-<pid>-<ts>` → fsync → rename (POSIX atomic).
 * A copy of the previous good file is kept at `<file>.bak` (last-known-good).
 * Read path: validate main file; on parse/validation failure fall back to
 * `.bak` with a loud warning; never silently swallow a corrupted state file.
 */

import {
  existsSync, copyFileSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync,
  readFileSync, renameSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export interface AtomicWriteResult {
  ok: boolean;
  backupCreated: boolean;
  error?: string;
}

export function atomicWriteJsonSync(path: string, data: unknown): AtomicWriteResult {
  const abs = resolve(process.cwd(), path);
  try {
    mkdirSync(dirname(abs), { recursive: true });
    let backupCreated = false;
    if (existsSync(abs)) {
      try {
        copyFileSync(abs, `${abs}.bak`);
        backupCreated = true;
      } catch { /* best effort: never block the write on backup failure */ }
    }
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(data, null, 2), null, "utf-8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, abs);
    return { ok: true, backupCreated };
  } catch (e) {
    return { ok: false, backupCreated: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface LoadResult<T> {
  value: T | null;
  source: "main" | "backup" | "none";
  corrupted: boolean;
}

/**
 * Load JSON with last-known-good fallback.
 * `validate` returns true when the parsed value has the required shape.
 * Corruption is reported loudly (console.error) instead of silently
 * returning null.
 */
export function loadJsonWithFallback<T>(
  path: string,
  validate?: (v: unknown) => v is T,
): LoadResult<T> {
  const abs = resolve(process.cwd(), path);
  const attempt = (p: string): { ok: boolean; value: T | null } => {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf-8"));
      if (validate && !validate(parsed)) return { ok: false, value: null };
      return { ok: true, value: parsed as T };
    } catch {
      return { ok: false, value: null };
    }
  };

  if (existsSync(abs)) {
    const main = attempt(abs);
    if (main.ok) return { value: main.value, source: "main", corrupted: false };
    console.error(`[atomicWrite] WARNING: ${path} is corrupted or fails validation; trying .bak`);
    const bak = `${abs}.bak`;
    if (existsSync(bak)) {
      const backup = attempt(bak);
      if (backup.ok) {
        console.error(`[atomicWrite] recovered ${path} from last-known-good backup`);
        return { value: backup.value, source: "backup", corrupted: true };
      }
    }
    console.error(`[atomicWrite] ERROR: no usable backup for ${path}; starting fresh`);
    return { value: null, source: "none", corrupted: true };
  }
  return { value: null, source: "none", corrupted: false };
}
