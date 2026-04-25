export type CodexPortrait = {
  src: string;
  alt: string;
  objectPosition?: string;
};

export const CODEX_PORTRAITS: Partial<Record<string, CodexPortrait>> = {
  // 后续补图示例：
  // "N-008": { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" },
};

export function resolveCodexPortrait(
  id: string,
  portraits: Partial<Record<string, CodexPortrait>> = CODEX_PORTRAITS
): CodexPortrait | null {
  return portraits[id] ?? null;
}
