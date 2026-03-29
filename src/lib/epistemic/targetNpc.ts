import { extractPresentNpcIds } from "@/lib/playRealtime/b1Safety";

const NPC_CODE_RE = /\b(N-\d{3})\b/gi;

export function extractNpcIdsFromText(text: string): string[] {
  const s = new Set<string>();
  for (const m of text.matchAll(NPC_CODE_RE)) {
    const id = (m[1] ?? "").toUpperCase();
    if (id) s.add(id);
  }
  return [...s];
}

/**
 * 解析「本回合对谈焦点 NPC」：优先显式代码，其次控制层 target（仅 N-xxx），再次同场景唯一在场者。
 * 多人在场且无指代时不猜测，避免误判。
 */
export function resolveEpistemicTargetNpcId(args: {
  latestUserInput: string;
  playerContext: string;
  playerLocation: string | null;
  controlTarget?: string | null;
}): string | null {
  const fromText = extractNpcIdsFromText(args.latestUserInput);
  if (fromText.length === 1) return fromText[0]!;

  const t = args.controlTarget?.trim() ?? "";
  if (/^N-\d{3}$/i.test(t)) return t.toUpperCase();

  const present = extractPresentNpcIds(args.playerContext, args.playerLocation);
  if (present.length === 1) return present[0]!;

  if (fromText.length > 0) return fromText[0]!;
  return null;
}
