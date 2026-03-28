/**
 * 世界观 registry 聚合导出口（兼容旧路径 `import … from worldCanon`）。
 * 真相已拆分为 rootCanon / floorLoreRegistry / worldOrderRegistry / revealRegistry / playerSurfaceLore。
 */

export * from "./revealTierRank";
export * from "./rootCanon";
export * from "./floorLoreRegistry";
export * from "./worldOrderRegistry";
export * from "./revealRegistry";
export * from "./playerSurfaceLore";
export * from "./schoolCycleCanon";
export type { SchoolCycleResonanceNpcId } from "./schoolCycleIds";
export { parsePlayerWorldSignals, type MainThreatPhase, type PlayerWorldSignals } from "./playerWorldSignals";
