import type { SnapshotTask, SnapshotTasks } from "./types";

export function splitTasksByStatus(tasks: SnapshotTask[]): SnapshotTasks {
  const out: SnapshotTasks = {
    active: [],
    completed: [],
    failed: [],
    hidden: [],
    available: [],
  };
  for (const t of tasks ?? []) {
    if (!t || typeof t.id !== "string" || typeof t.title !== "string") continue;
    if (t.status === "completed") out.completed.push(t);
    else if (t.status === "failed") out.failed.push(t);
    else if (t.status === "hidden") out.hidden.push(t);
    else if (t.status === "available") out.available.push(t);
    else out.active.push({ ...t, status: "active" });
  }
  return out;
}

export function flattenTasks(s: SnapshotTasks): SnapshotTask[] {
  return [
    ...(s.active ?? []),
    ...(s.completed ?? []),
    ...(s.failed ?? []),
    ...(s.hidden ?? []),
    ...(s.available ?? []),
  ];
}
