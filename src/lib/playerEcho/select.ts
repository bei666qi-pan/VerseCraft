import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import {
  PLAYER_ECHO_MAX_FRAGMENT_CHARS,
  PLAYER_ECHO_MAX_FRAGMENTS,
} from "./constants";
import type {
  EchoFragment,
  PlayerEchoCanon,
  PlayerEchoSelectionContext,
  SelectedEchoFragment,
} from "./types";

function clampText(value: string, maxChars: number): string {
  const s = String(value ?? "").trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}

function uniq(values: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const s = String(value ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function revealRank(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : REVEAL_TIER_RANK.surface;
}

function primaryNpcId(fragment: EchoFragment): string | null {
  if (fragment.targetType === "npc" && fragment.targetId) return fragment.targetId;
  return fragment.anchors?.npcIds?.find((id) => id.trim()) ?? null;
}

function includesText(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  return Boolean(n && h.includes(n));
}

function relevanceScore(fragment: EchoFragment, context: PlayerEchoSelectionContext): number {
  const latest = context.latestUserInput ?? "";
  const npcId = primaryNpcId(fragment);
  const activeNpcId = context.activeNpcId?.trim() || null;
  const presentNpcIds = new Set(uniq(context.presentNpcIds));
  let score = 0;

  if (npcId) {
    if (activeNpcId && npcId === activeNpcId) score += 1.4;
    else if (activeNpcId && !includesText(latest, npcId)) return 0;
    else if (presentNpcIds.has(npcId)) score += 0.45;
    else if (includesText(latest, npcId)) score += 0.8;
    else return 0;
  }

  const locationId = context.locationId?.trim();
  if (locationId && (fragment.targetId === locationId || fragment.anchors?.locationIds?.includes(locationId))) {
    score += 0.8;
  }

  const floorId = context.floorId?.trim();
  if (floorId && (fragment.targetId === floorId || fragment.anchors?.floorIds?.includes(floorId))) {
    score += 0.45;
  }

  if (fragment.targetId && includesText(latest, fragment.targetId)) score += 0.35;
  if (fragment.anchors?.keywords?.some((keyword) => includesText(latest, keyword))) score += 0.35;
  if (includesText(latest, fragment.summary.slice(0, 10))) score += 0.1;

  return score;
}

function passesReveal(fragment: EchoFragment, context: PlayerEchoSelectionContext): boolean {
  const rank = revealRank(context.revealTier);
  const min = Math.max(0, Math.trunc(Number(fragment.revealTierMin ?? 0)));
  if (rank < min) return false;
  if (fragment.safetyLevel === 4 && rank < Math.max(min, REVEAL_TIER_RANK.abyss)) return false;
  return true;
}

function passesPrivilege(fragment: EchoFragment, context: PlayerEchoSelectionContext): boolean {
  const allowed = fragment.allowedNpcPrivilege ?? [];
  if (allowed.length === 0) return true;
  const npcId = primaryNpcId(fragment);
  if (!npcId) return true;
  const privilege = context.npcMemoryPrivilegeById?.[npcId];
  return privilege ? allowed.includes(privilege) : true;
}

export function selectPlayerEchoFragments(
  canon: PlayerEchoCanon | null | undefined,
  context: PlayerEchoSelectionContext,
  opts?: { maxFragments?: number; maxFragmentChars?: number }
): SelectedEchoFragment[] {
  const maxFragments = Math.max(0, Math.min(PLAYER_ECHO_MAX_FRAGMENTS, opts?.maxFragments ?? PLAYER_ECHO_MAX_FRAGMENTS));
  const maxFragmentChars = Math.max(16, Math.min(PLAYER_ECHO_MAX_FRAGMENT_CHARS, opts?.maxFragmentChars ?? PLAYER_ECHO_MAX_FRAGMENT_CHARS));
  if (!canon || maxFragments <= 0 || !Array.isArray(canon.fragments)) return [];

  const rows = canon.fragments
    .filter((fragment) => fragment && fragment.status === "active")
    .filter((fragment) => passesReveal(fragment, context))
    .filter((fragment) => passesPrivilege(fragment, context))
    .map((fragment) => {
      const anchor = relevanceScore(fragment, context);
      const score =
        anchor * 0.58 +
        Number(fragment.emotionalWeight ?? 0) * 0.18 +
        Number(fragment.salience ?? 0) * 0.16 +
        Number(fragment.confidence ?? 0) * 0.08;
      return { fragment, anchor, score, npcId: primaryNpcId(fragment) };
    })
    .filter((row) => row.anchor > 0 && row.score > 0.05);

  rows.sort((a, b) => b.score - a.score || a.fragment.id.localeCompare(b.fragment.id));

  const selected: SelectedEchoFragment[] = [];
  const seenKeys = new Set<string>();
  const perNpc = new Map<string, number>();
  for (const row of rows) {
    const fragment = row.fragment;
    const summary = clampText(fragment.summary, maxFragmentChars);
    if (!summary) continue;
    const dedupeKey = `${fragment.type}|${fragment.targetType}|${fragment.targetId ?? ""}|${summary}`;
    if (seenKeys.has(dedupeKey)) continue;
    if (row.npcId) {
      const count = perNpc.get(row.npcId) ?? 0;
      if (count >= 2) continue;
      perNpc.set(row.npcId, count + 1);
    }
    seenKeys.add(dedupeKey);
    selected.push({
      id: fragment.id,
      type: fragment.type,
      targetType: fragment.targetType,
      targetId: fragment.targetId,
      npcId: row.npcId,
      summary,
      safetyLevel: fragment.safetyLevel,
      score: Number(row.score.toFixed(4)),
    });
    if (selected.length >= maxFragments) break;
  }

  return selected;
}
