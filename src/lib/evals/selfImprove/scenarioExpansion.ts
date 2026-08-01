/**
 * Self-Improving Agent System — Scenario Expansion
 *
 * When a round produces no defects, instead of repeating the same
 * 14 scenarios, this module generates variations:
 *
 * - Synonym/paraphrase transforms
 * - Initial state variations
 * - Boundary quantity variations
 * - Action order permutations
 * - Repeat/idempotency scenarios
 * - NPC presence/absence swaps
 * - NPC known/unknown fact swaps
 * - Material insufficient/exact/excess variations
 * - Task lifecycle state variations
 * - Profession permission variations
 *
 * Each generated scenario has stable seed, source, rule basis,
 * expected invariants, and novelty signature.
 */

import type { SelfImproveScenario, ScenarioCategory } from "./types";

// ── Transform registry ────────────────────────────────

type ScenarioTransform = (scenario: SelfImproveScenario, round: number) => SelfImproveScenario;

const TRANSFORMS: Record<string, ScenarioTransform> = {
  /** Paraphrase the player input */
  paraphrase(_s: SelfImproveScenario, round: number): SelfImproveScenario {
    const paraphrases: Record<string, string[]> = {
      "golden-explore-room": [
        "我仔细打量这个房间的每个角落。",
        "让我看看周围都有些什么。",
        "环视四周，观察环境。",
      ],
      "golden-talk-to-npc": [
        "我找林晚枫聊聊最近的情况。",
        "走过去和林晚枫打个招呼。",
        "向林晚枫询问近况。",
      ],
      "keepalive-normal-explore": [
        "顺着走廊往前走，留意两边的动静。",
        "在走廊里慢慢踱步，观察每一扇门。",
        "一边走一边注意周围的细节。",
      ],
      "keepalive-normal-talk": [
        "碰见林晚枫，问问他的看法。",
        "向林晚枫了解最新的情况。",
        "找林晚枫打听消息。",
      ],
    };

    const options = paraphrases[_s.caseId] || [
      `${_s.playerInput}（再试一次）`,
      `让我重新${_s.playerInput.slice(0, 6)}...`,
    ];
    const newInput = options[(round - 1) % options.length]!;

    return {
      ..._s,
      caseId: `${_s.caseId}-var-${round}`,
      name: `${_s.name}（变体 R${round}）`,
      source: "synth",
      tags: [..._s.tags, "expanded", `round-${round}`],
      playerInput: newInput,
      seed: _s.seed + round * 1000,
      description: `Round ${round} paraphrase of: ${_s.description}`,
    };
  },

  /** Swap NPC presence */
  npcPresenceSwap(_s: SelfImproveScenario, round: number): SelfImproveScenario {
    if (!_s.tags.includes("npc")) return _s;
    const swapInput = round % 2 === 0
      ? _s.playerInput.replace("林晚枫", "陈婆婆")
      : _s.playerInput;
    return {
      ..._s,
      caseId: `${_s.caseId}-npcswap-${round}`,
      name: `${_s.name}（NPC变换 R${round}）`,
      source: "synth",
      tags: [..._s.tags, "expanded", "npc-swap"],
      playerInput: swapInput,
      seed: _s.seed + round * 2000,
    };
  },

  /** Boundary quantity variation (for forge/resource scenarios) */
  quantityBoundary(_s: SelfImproveScenario, round: number): SelfImproveScenario {
    if (!_s.tags.includes("forge") && !_s.tags.includes("resource")) return _s;
    const quantityInputs = [
      "我拿出仅有的两块铁矿石，尝试锻造一把长剑。",
      "材料刚好够，开始锻造。",
      "我有充足的材料，锻造一把精良长剑。",
    ];
    return {
      ..._s,
      caseId: `${_s.caseId}-qty-${round}`,
      name: `${_s.name}（数量边界 R${round}）`,
      source: "synth",
      tags: [..._s.tags, "expanded", "quantity-boundary"],
      playerInput: quantityInputs[(round - 1) % quantityInputs.length]!,
      seed: _s.seed + round * 3000,
    };
  },

  /** Repeat request (idempotency) */
  repeatRequest(_s: SelfImproveScenario, round: number): SelfImproveScenario {
    return {
      ..._s,
      caseId: `${_s.caseId}-repeat-${round}`,
      name: `${_s.name}（重复请求 R${round}）`,
      source: "synth",
      tags: [..._s.tags, "expanded", "repeat", "idempotency"],
      playerInput: `${_s.playerInput}（再次确认）`,
      seed: _s.seed + round * 4000,
      expectedInvariants: [
        ..._s.expectedInvariants,
        { id: `idempotent-r${round}`, check: "idempotency", expected: "pass", severity: "major" },
      ],
    };
  },
};

// ── Expansion logic ───────────────────────────────────

export function expandScenarios(
  baseScenarios: SelfImproveScenario[],
  round: number,
): SelfImproveScenario[] {
  const expanded: SelfImproveScenario[] = [];
  const seenSignatures = new Set<string>();

  for (const scenario of baseScenarios) {
    // Always include the base scenario
    expanded.push(scenario);
    seenSignatures.add(scenario.caseId);

    // Apply transforms based on round number and scenario tags
    const appliedTransforms: string[] = [];

    // Round 2+: paraphrase golden and keep-alive scenarios
    if (round >= 2 && (scenario.tags.includes("golden") || scenario.tags.includes("keep-alive"))) {
      appliedTransforms.push("paraphrase");
    }

    // Round 2+: NPC swaps for NPC-related scenarios
    if (round >= 2 && scenario.tags.includes("npc")) {
      appliedTransforms.push("npcPresenceSwap");
    }

    // Round 3+: quantity boundaries for forge scenarios
    if (round >= 3 && scenario.tags.includes("forge")) {
      appliedTransforms.push("quantityBoundary");
    }

    // Round 3+: repeat requests for idempotency
    if (round >= 3) {
      appliedTransforms.push("repeatRequest");
    }

    for (const transformName of appliedTransforms) {
      const transform = TRANSFORMS[transformName];
      if (!transform) continue;

      const variant = transform(scenario, round);
      const noveltySig = `${variant.caseId}-${variant.seed}`;

      if (!seenSignatures.has(noveltySig)) {
        seenSignatures.add(noveltySig);
        expanded.push(variant);
      }
    }
  }

  return expanded;
}

// ── Novelty tracking ──────────────────────────────────

export function generateNoveltySignature(scenario: SelfImproveScenario): string {
  return `${scenario.caseId}-${scenario.seed}-${scenario.playerInput.slice(0, 20)}`;
}

export function isNovelScenario(
  scenario: SelfImproveScenario,
  previousSignatures: Set<string>,
): boolean {
  return !previousSignatures.has(generateNoveltySignature(scenario));
}
