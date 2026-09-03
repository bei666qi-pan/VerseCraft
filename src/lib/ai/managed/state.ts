import type { TaskType } from "@/lib/ai/types/core";
import { purposeForTask, type AiPurpose, type ManagedAiBinding, type ManagedAiSnapshot } from "./types";

const EMPTY_BY_PURPOSE: Readonly<Record<AiPurpose, readonly ManagedAiBinding[]>> = Object.freeze({
  story: Object.freeze([]), rules: Object.freeze([]), polish: Object.freeze([]),
  background: Object.freeze([]), embedding: Object.freeze([]), judge: Object.freeze([]),
});
let snapshot: ManagedAiSnapshot = Object.freeze({ version: 0, loadedAt: 0, ready: false, health: "not_initialized", byPurpose: EMPTY_BY_PURPOSE });

export function emptyManagedAiSnapshot(health: ManagedAiSnapshot["health"], version = snapshot.version): ManagedAiSnapshot {
  return Object.freeze({ version, loadedAt: Date.now(), ready: false, health, byPurpose: EMPTY_BY_PURPOSE });
}
export function getManagedAiSnapshot(): ManagedAiSnapshot { return snapshot; }
export function setManagedAiSnapshot(value: ManagedAiSnapshot): void { snapshot = value; }
export function getManagedBindingsForTask(task: TaskType = "PLAYER_CHAT"): readonly ManagedAiBinding[] { return snapshot.ready ? (snapshot.byPurpose[purposeForTask(task)] ?? []) : []; }
export function getManagedEmbeddingBindings(): readonly ManagedAiBinding[] { return snapshot.ready ? snapshot.byPurpose.embedding : []; }
export function managedAiConfiguredForTask(task: TaskType = "PLAYER_CHAT"): boolean { return getManagedBindingsForTask(task).length > 0; }
