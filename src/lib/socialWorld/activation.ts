import { normalizeSocialWorldBudget } from "@/lib/socialWorld/budget";
import type { NpcAgentState, SelectActiveNpcsForSocialTickArgs } from "@/lib/socialWorld/types";

function toStateArray(states: SelectActiveNpcsForSocialTickArgs["npcStates"]): NpcAgentState[] {
  return Array.isArray(states) ? [...states] : Object.values(states);
}

function setOf(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((x) => x.trim()).filter(Boolean));
}

function hasDueAgenda(state: NpcAgentState, nowTurn: number): boolean {
  return state.agenda.some((item) => item.dueTurn <= nowTurn || item.priority === "high");
}

function scoreNpc(args: {
  state: NpcAgentState;
  nowTurn: number;
  present: Set<string>;
  dueAgenda: Set<string>;
  mentioned: Set<string>;
  recentRelation: Set<string>;
  escapeRelevant: Set<string>;
  sameLocation: Set<string>;
  highRelevance: Set<string>;
}): { eligible: boolean; score: number; dueOrHigh: boolean } {
  const due = args.dueAgenda.has(args.state.npcId) || hasDueAgenda(args.state, args.nowTurn);
  const high =
    args.highRelevance.has(args.state.npcId) ||
    args.escapeRelevant.has(args.state.npcId) ||
    args.state.plotRelevance >= 0.85;
  const dueOrHigh = due || high;

  if (!args.state.npcId || args.state.status === "blocked") {
    return { eligible: false, score: -Infinity, dueOrHigh };
  }
  if ((args.state.status === "cooldown" || args.state.nextEligibleTurn > args.nowTurn) && !dueOrHigh) {
    return { eligible: false, score: -Infinity, dueOrHigh };
  }
  if (args.state.socialEnergy <= 0 && !dueOrHigh) {
    return { eligible: false, score: -Infinity, dueOrHigh };
  }

  let score = 0;
  score += args.state.plotRelevance * 4;
  score += args.state.agencyWeight * 2;
  score += args.state.socialEnergy;
  score += args.state.volatility * 2;
  if (args.present.has(args.state.npcId)) score += 8;
  if (args.mentioned.has(args.state.npcId)) score += 7;
  if (due) score += 9;
  if (args.recentRelation.has(args.state.npcId)) score += 5;
  if (args.escapeRelevant.has(args.state.npcId)) score += 6;
  if (args.sameLocation.has(args.state.npcId)) score += 3;
  if (args.highRelevance.has(args.state.npcId)) score += 6;
  if (args.state.status === "active") score += 1;
  if (args.state.status === "offscreen") score += 0.5;
  if (args.state.status === "cooldown") score -= 4;

  return { eligible: true, score, dueOrHigh };
}

export function selectActiveNpcsForSocialTick(args: SelectActiveNpcsForSocialTickArgs): NpcAgentState[] {
  const budget = normalizeSocialWorldBudget(args.budget);
  const nowTurn = Number.isFinite(args.nowTurn) ? Math.max(0, Math.trunc(args.nowTurn)) : 0;
  const limit = Math.min(
    7,
    budget.maxActiveNpcPerTick,
    Math.max(1, Math.trunc(args.desiredActiveNpcCount ?? budget.defaultActiveNpcPerTick))
  );
  const states = toStateArray(args.npcStates).slice(0, budget.maxTrackedNpc);
  const scored = states
    .map((state, index) => ({
      state,
      index,
      lastActiveTurn: Number.isFinite(state.lastActiveTurn) ? state.lastActiveTurn : 0,
      ...scoreNpc({
        state,
        nowTurn,
        present: setOf(args.presentNpcIds),
        dueAgenda: setOf(args.dueAgendaNpcIds),
        mentioned: setOf(args.playerMentionedNpcIds),
        recentRelation: setOf(args.recentRelationChangedNpcIds),
        escapeRelevant: setOf(args.escapeRelevantNpcIds),
        sameLocation: setOf(args.sameLocationNpcIds),
        highRelevance: setOf(args.highRelevanceNpcIds),
      }),
    }))
    .filter((entry) => entry.eligible)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.lastActiveTurn !== b.lastActiveTurn) return a.lastActiveTurn - b.lastActiveTurn;
      return a.index - b.index;
    });

  return scored.slice(0, limit).map((entry) => entry.state);
}
