// src/lib/registry/world.ts
// 如月公寓地图与楼层结构

import type { FloorId } from "./types";

/** Floor structure: B2=exit, B1=spawn, 1-7=above ground. Each of 1-7 has exactly 1 anomaly. */
export const FLOORS: readonly { id: FloorId; label: string; description: string }[] = [
  { id: "B2", label: "地下 B2 层", description: "出口所在，第 8 诡异守门" },
  { id: "B1", label: "地下 B1 层", description: "玩家初始复苏地" },
  { id: "1", label: "1 楼", description: "门厅、物业" },
  { id: "2", label: "2 楼", description: "" },
  { id: "3", label: "3 楼", description: "" },
  { id: "4", label: "4 楼", description: "" },
  { id: "5", label: "5 楼", description: "" },
  { id: "6", label: "6 楼", description: "" },
  { id: "7", label: "7 楼", description: "" },
];

export const SPAWN_FLOOR: FloorId = "B1";
export const EXIT_FLOOR: FloorId = "B2";
