/**
 * Phase 4: Detectors Index
 *
 * 统一出口：`import { ... } from "@/lib/evals/detectors"`
 */

export { createDefaultRegistry } from "./registry";
export type {
  Detector,
  DetectorCategory,
  DetectorId,
  DetectorIssue,
  DetectorMeta,
  DetectorRegistry,
  DetectorResult,
} from "./types";
export { createDetectorRegistry, getDetector, listDetectorsByCategory } from "./types";
