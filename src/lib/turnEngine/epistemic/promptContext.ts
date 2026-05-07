import type { KnowledgeFact } from "@/lib/epistemic/types";
import type { TurnLane } from "@/lib/turnEngine/types";
import type { EmotionalResidueFact, EpistemicFilterResult } from "./types";

export type EpistemicPromptFact = {
  id: string;
  content: string;
  scope: KnowledgeFact["scope"];
  sourceType: KnowledgeFact["sourceType"];
  certainty: KnowledgeFact["certainty"];
  ownerId?: string;
  tags: string[];
};

export type EpistemicPromptResidueHint = {
  id: string;
  actorId: string;
  mode: EmotionalResidueFact["mode"];
  hint: "body_sense_only" | "hesitation_or_unease" | "identity_anchor_without_fact";
};

export type EpistemicPromptContextTelemetry = {
  actorId: string | null;
  lane: TurnLane;
  compact: boolean;
  allowedCounts: {
    scenePublic: number;
    actorScoped: number;
    residueHints: number;
  };
  blockedCounts: {
    dmOnly: number;
    playerOnly: number;
  };
  revealGatedCount: number;
  promptChars: number;
  truncated: boolean;
  failClosedReason: "none" | "char_budget";
};

export type EpistemicPromptContext = {
  allowedScenePublicFacts: EpistemicPromptFact[];
  allowedActorScopedFacts: EpistemicPromptFact[];
  allowedResidueHints: EpistemicPromptResidueHint[];
  blockedDmOnlyFactIds: string[];
  blockedPlayerOnlyFactIds: string[];
  telemetry: EpistemicPromptContextTelemetry;
  promptBlock: string;
};

export type EpistemicPromptContextCaps = {
  maxScenePublicFacts?: number;
  maxActorScopedFacts?: number;
  maxResidueHints?: number;
  maxFactChars?: number;
  maxPromptChars?: number;
  compact?: boolean;
};

const DEFAULT_CAPS_BY_LANE: Record<TurnLane, Required<EpistemicPromptContextCaps>> = {
  FAST: {
    maxScenePublicFacts: 2,
    maxActorScopedFacts: 1,
    maxResidueHints: 1,
    maxFactChars: 80,
    maxPromptChars: 900,
    compact: true,
  },
  RULE: {
    maxScenePublicFacts: 5,
    maxActorScopedFacts: 4,
    maxResidueHints: 2,
    maxFactChars: 120,
    maxPromptChars: 1800,
    compact: false,
  },
  REVEAL: {
    maxScenePublicFacts: 8,
    maxActorScopedFacts: 8,
    maxResidueHints: 3,
    maxFactChars: 180,
    maxPromptChars: 3200,
    compact: false,
  },
};

function mergeCaps(lane: TurnLane, caps?: EpistemicPromptContextCaps): Required<EpistemicPromptContextCaps> {
  const base = DEFAULT_CAPS_BY_LANE[lane];
  const compact = caps?.compact ?? base.compact;
  return {
    maxScenePublicFacts: Math.max(0, Math.trunc(caps?.maxScenePublicFacts ?? base.maxScenePublicFacts)),
    maxActorScopedFacts: Math.max(0, Math.trunc(caps?.maxActorScopedFacts ?? base.maxActorScopedFacts)),
    maxResidueHints: Math.max(0, Math.trunc(caps?.maxResidueHints ?? base.maxResidueHints)),
    maxFactChars: Math.max(24, Math.trunc(caps?.maxFactChars ?? base.maxFactChars)),
    maxPromptChars: Math.max(240, Math.trunc(caps?.maxPromptChars ?? base.maxPromptChars)),
    compact,
  };
}

function clipText(text: string, maxChars: number): string {
  const trimmed = String(text ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}...`;
}

function factToPromptFact(fact: KnowledgeFact, maxFactChars: number): EpistemicPromptFact | null {
  const content = clipText(fact.content, maxFactChars);
  if (!fact.id || !content) return null;
  return {
    id: fact.id,
    content,
    scope: fact.scope,
    sourceType: fact.sourceType,
    certainty: fact.certainty,
    ownerId: fact.ownerId,
    tags: [...(fact.tags ?? [])].slice(0, 8),
  };
}

function residueHintFor(fact: EmotionalResidueFact): EpistemicPromptResidueHint {
  return {
    id: fact.id,
    actorId: fact.actorId,
    mode: fact.mode,
    hint: fact.mode === "mood_plus_identity_anchor" ? "identity_anchor_without_fact" : "hesitation_or_unease",
  };
}

function buildPromptBlock(args: {
  actorId: string | null;
  lane: TurnLane;
  compact: boolean;
  allowedScenePublicFacts: EpistemicPromptFact[];
  allowedActorScopedFacts: EpistemicPromptFact[];
  allowedResidueHints: EpistemicPromptResidueHint[];
  blockedDmOnlyFactIds: string[];
  blockedPlayerOnlyFactIds: string[];
  revealGatedCount: number;
  truncated: boolean;
}): string {
  const payload = {
    schema: "actor_epistemic_prompt_context_v1",
    actorId: args.actorId,
    lane: args.lane,
    compact: args.compact,
    allowedScenePublicFacts: args.allowedScenePublicFacts,
    allowedActorScopedFacts: args.allowedActorScopedFacts,
    allowedResidueHints: args.allowedResidueHints,
    blockedFactIds: {
      dmOnly: args.blockedDmOnlyFactIds,
      playerOnly: args.blockedPlayerOnlyFactIds,
    },
    revealGatedCount: args.revealGatedCount,
    truncated: args.truncated,
    hardRules: [
      "Use only allowedScenePublicFacts and allowedActorScopedFacts as factual claims.",
      "Never use blockedFactIds as narrative facts.",
      "Residue hints are body sense, hesitation, unease, or vague familiarity only; they are not propositions.",
    ],
  };
  return ["", "## [actor_epistemic_prompt_context_v1]", JSON.stringify(payload), ""].join("\n");
}

function shrinkToBudget(args: {
  actorId: string | null;
  lane: TurnLane;
  compact: boolean;
  maxPromptChars: number;
  allowedScenePublicFacts: EpistemicPromptFact[];
  allowedActorScopedFacts: EpistemicPromptFact[];
  allowedResidueHints: EpistemicPromptResidueHint[];
  blockedDmOnlyFactIds: string[];
  blockedPlayerOnlyFactIds: string[];
  revealGatedCount: number;
}): {
  block: string;
  allowedScenePublicFacts: EpistemicPromptFact[];
  allowedActorScopedFacts: EpistemicPromptFact[];
  allowedResidueHints: EpistemicPromptResidueHint[];
  truncated: boolean;
} {
  let allowedScenePublicFacts = args.allowedScenePublicFacts;
  let allowedActorScopedFacts = args.allowedActorScopedFacts;
  let allowedResidueHints = args.allowedResidueHints;
  let truncated = false;

  const render = (): string =>
    buildPromptBlock({
      actorId: args.actorId,
      lane: args.lane,
      compact: args.compact,
      allowedScenePublicFacts,
      allowedActorScopedFacts,
      allowedResidueHints,
      blockedDmOnlyFactIds: args.blockedDmOnlyFactIds,
      blockedPlayerOnlyFactIds: args.blockedPlayerOnlyFactIds,
      revealGatedCount: args.revealGatedCount,
      truncated,
    });

  let block = render();
  while (block.length > args.maxPromptChars && allowedActorScopedFacts.length > 0) {
    allowedActorScopedFacts = allowedActorScopedFacts.slice(0, -1);
    truncated = true;
    block = render();
  }
  while (block.length > args.maxPromptChars && allowedScenePublicFacts.length > 0) {
    allowedScenePublicFacts = allowedScenePublicFacts.slice(0, -1);
    truncated = true;
    block = render();
  }
  while (block.length > args.maxPromptChars && allowedResidueHints.length > 0) {
    allowedResidueHints = allowedResidueHints.slice(0, -1);
    truncated = true;
    block = render();
  }
  return { block, allowedScenePublicFacts, allowedActorScopedFacts, allowedResidueHints, truncated };
}

export function buildEpistemicPromptContext(
  filterResult: EpistemicFilterResult,
  actorId: string | null,
  lane: TurnLane,
  caps?: EpistemicPromptContextCaps
): EpistemicPromptContext {
  const c = mergeCaps(lane, caps);
  const normalizedActorId = actorId?.trim() || filterResult.telemetry.actorId || null;

  const allowedScenePublicFacts = filterResult.scenePublicFacts
    .slice(0, c.maxScenePublicFacts)
    .map((fact) => factToPromptFact(fact, c.maxFactChars))
    .filter((fact): fact is EpistemicPromptFact => Boolean(fact));
  const allowedActorScopedFacts = filterResult.actorScopedFacts
    .slice(0, c.maxActorScopedFacts)
    .map((fact) => factToPromptFact(fact, c.maxFactChars))
    .filter((fact): fact is EpistemicPromptFact => Boolean(fact));
  const allowedResidueHints = filterResult.residueFacts.slice(0, c.maxResidueHints).map(residueHintFor);
  const blockedDmOnlyFactIds = filterResult.dmOnlyFacts.map((fact) => fact.id).filter(Boolean);
  const blockedPlayerOnlyFactIds = filterResult.playerOnlyFacts.map((fact) => fact.id).filter(Boolean);

  const shrunk = shrinkToBudget({
    actorId: normalizedActorId,
    lane,
    compact: c.compact,
    maxPromptChars: c.maxPromptChars,
    allowedScenePublicFacts,
    allowedActorScopedFacts,
    allowedResidueHints,
    blockedDmOnlyFactIds,
    blockedPlayerOnlyFactIds,
    revealGatedCount: filterResult.telemetry.revealGatedCount,
  });

  return {
    allowedScenePublicFacts: shrunk.allowedScenePublicFacts,
    allowedActorScopedFacts: shrunk.allowedActorScopedFacts,
    allowedResidueHints: shrunk.allowedResidueHints,
    blockedDmOnlyFactIds,
    blockedPlayerOnlyFactIds,
    telemetry: {
      actorId: normalizedActorId,
      lane,
      compact: c.compact,
      allowedCounts: {
        scenePublic: shrunk.allowedScenePublicFacts.length,
        actorScoped: shrunk.allowedActorScopedFacts.length,
        residueHints: shrunk.allowedResidueHints.length,
      },
      blockedCounts: {
        dmOnly: blockedDmOnlyFactIds.length,
        playerOnly: blockedPlayerOnlyFactIds.length,
      },
      revealGatedCount: filterResult.telemetry.revealGatedCount,
      promptChars: shrunk.block.length,
      truncated: shrunk.truncated,
      failClosedReason: shrunk.truncated ? "char_budget" : "none",
    },
    promptBlock: shrunk.block,
  };
}
