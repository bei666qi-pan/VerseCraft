import { assetUrl } from "@/lib/config/publicRuntime";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";

export type CodexPortrait = {
  /** 兜底 PNG 路径（供不支持 avif/webp 的浏览器）。 */
  src: string;
  /** 不含扩展名的路径前缀，用于拼出 `${basePath}@1x.avif` 等多密度档位。见 scripts/optimizeStaticImages.ts。缺省时只渲染兜底 `src`。 */
  basePath?: string;
  alt: string;
  objectPosition?: string;
};

const PORTRAIT_IDS = new Set<string>([
  ...NPCS.map((npc) => npc.id),
  ...ANOMALIES.map((anomaly) => anomaly.id),
]);

export const CODEX_PORTRAITS: Partial<Record<string, CodexPortrait>> = Object.fromEntries(
  [...NPCS, ...ANOMALIES]
    .filter((entry) => PORTRAIT_IDS.has(entry.id))
    .map((entry) => [
      entry.id,
      {
        src: assetUrl(`/assets/npc-avatars/${entry.id}.png`),
        basePath: assetUrl(`/assets/npc-avatars/${entry.id}`),
        alt: entry.name,
        objectPosition: "center top",
      },
    ])
) as Partial<Record<string, CodexPortrait>>;

export function resolveCodexPortrait(
  id: string,
  portraits: Partial<Record<string, CodexPortrait>> = CODEX_PORTRAITS
): CodexPortrait | null {
  return portraits[id] ?? null;
}
