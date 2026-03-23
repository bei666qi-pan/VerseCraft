/**
 * CoreCanon facts seed 映射入口（骨架 + 纯内存映射）。
 *
 * 本文件不会写入数据库，只负责：
 * - 从 `src/lib/registry/*` 生成 `LoreFact[]`
 * - 生成稳定 `factKey` 与用于检索/过滤的 `tags`
 *
 * 后续落库由 ingestion / runtime 接入层完成。
 */

import type { LoreFact } from "../types";
import { buildCoreCanonFactsFromRegistry } from "./coreCanonMapping";
export { buildRegistryWorldKnowledgeDraft } from "./registryAdapters";
export { seedFromRegistry } from "./seedFromRegistry";

export async function seedCoreCanonFacts(): Promise<LoreFact[]> {
  return buildCoreCanonFactsFromRegistry();
}


