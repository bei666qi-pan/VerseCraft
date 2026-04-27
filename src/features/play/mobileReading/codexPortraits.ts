import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";

export type CodexPortrait = {
  src: string;
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
        src: `/assets/npc-avatars/${entry.id}.png`,
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
