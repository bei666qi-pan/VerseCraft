import type { NpcRuntimeStateV1 } from "@/lib/npcHeart/runtimeState";
import type { LoreEvidenceBundleEntryV1 } from "@/lib/worldKnowledge/canon/types";

export interface NarrativeClaimV1 {
  claimId: string;
  text: string;
  claimType:
    | "canon_fact"
    | "npc_identity"
    | "relationship"
    | "task_state"
    | "location_state"
    | "memory_reference"
    | "foreshadow"
    | "other";
  riskLevel: "low" | "medium" | "high";
  mentionedNpcIds?: string[];
  mentionedFactIds?: string[];
}

export interface VerificationResult {
  claimCount: number;
  unsupportedClaims: NarrativeClaimV1[];
  contradictedClaims: NarrativeClaimV1[];
  revealViolations: NarrativeClaimV1[];
  audienceViolations: NarrativeClaimV1[];
  confidence: number;
  recommendedAction: "allow" | "warn" | "rewrite_candidate" | "block_candidate";
  shadowOnly: true;
}

export interface ProvenanceTelemetrySummary {
  shadowOnly: true;
  claimCount: number;
  unsupportedCount: number;
  contradictedCount: number;
  revealViolationCount: number;
  audienceViolationCount: number;
  confidence: number;
  recommendedAction: VerificationResult["recommendedAction"];
  highRiskClaimIds: string[];
}

const HIGH_RISK_REVEAL_TERMS = [
  "耶里",
  "学生会",
  "辅锚",
  "七人",
  "校源徘徊者",
  "deep_reveal_payload",
  "dm_only",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalize(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function splitClaims(text: string): string[] {
  return normalize(text)
    .split(/[。！？!?；;\n]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8)
    .slice(0, 24);
}

function mentionedNpcIds(text: string): string[] {
  return [...new Set(text.match(/N-\d{3}/g) ?? [])];
}

function mentionedFactIds(text: string): string[] {
  return [...new Set(text.match(/[a-zA-Z]+:[a-zA-Z0-9_.:-]+/g) ?? [])].slice(0, 8);
}

function classifyClaim(text: string): NarrativeClaimV1["claimType"] {
  if (/N-\d{3}|身份|本名|学生会|校源|辅锚|七人/.test(text)) return "npc_identity";
  if (/信任|怀疑|债|关系|熟悉|见过/.test(text)) return "relationship";
  if (/任务|委托|进度|完成|失败/.test(text)) return "task_state";
  if (/位置|地点|楼|房间|走廊|门厅/.test(text)) return "location_state";
  if (/记得|曾经|昨晚|之前|回忆|记忆/.test(text)) return "memory_reference";
  if (/征兆|暗示|预兆|残响/.test(text)) return "foreshadow";
  return "other";
}

function riskLevel(text: string, claimType: NarrativeClaimV1["claimType"]): NarrativeClaimV1["riskLevel"] {
  if (HIGH_RISK_REVEAL_TERMS.some((term) => text.includes(term))) return "high";
  if (claimType === "npc_identity" || claimType === "memory_reference") return "medium";
  return "low";
}

export function extractNarrativeClaims(outputJson: unknown): NarrativeClaimV1[] {
  const root = asRecord(outputJson);
  const narrative = typeof root?.narrative === "string" ? root.narrative : "";
  const claims: NarrativeClaimV1[] = [];
  let index = 0;
  for (const text of splitClaims(narrative)) {
    const claimType = classifyClaim(text);
    claims.push({
      claimId: `claim_${index}`,
      text,
      claimType,
      riskLevel: riskLevel(text, claimType),
      mentionedNpcIds: mentionedNpcIds(text),
      mentionedFactIds: mentionedFactIds(text),
    });
    index += 1;
  }
  return claims;
}

function overlapsEvidence(claim: NarrativeClaimV1, evidence: LoreEvidenceBundleEntryV1): boolean {
  if (claim.mentionedFactIds?.includes(evidence.factId)) return true;
  if (claim.mentionedNpcIds?.some((id) => evidence.specificNpcIds?.includes(id) || evidence.factId.includes(id))) return true;
  const claimText = claim.text.toLowerCase();
  const evidenceText = `${evidence.factId} ${evidence.canonicalText} ${(evidence.tags ?? []).join(" ")}`.toLowerCase();
  const strongTerms = [
    ...HIGH_RISK_REVEAL_TERMS,
    ...claim.text.split(/[\s，。！？、,.!?;；:：]+/g).filter((part) => part.length >= 3),
  ];
  return strongTerms.some((term) => evidenceText.includes(term.toLowerCase()) && claimText.includes(term.toLowerCase()));
}

function isAudienceViolation(claim: NarrativeClaimV1, npcRuntimeState: NpcRuntimeStateV1 | null | undefined): boolean {
  if (!npcRuntimeState) return false;
  if (claim.riskLevel !== "high" && claim.claimType !== "npc_identity" && claim.claimType !== "memory_reference") return false;
  const boundary = npcRuntimeState.knowledgeBoundary;
  if (boundary.allowedTruthClasses.includes("dm_only")) return false;
  return HIGH_RISK_REVEAL_TERMS.some((term) => claim.text.includes(term)) && boundary.maxRevealRank < 2;
}

export function verifyClaimsAgainstEvidence(
  claims: NarrativeClaimV1[],
  evidenceBundle: LoreEvidenceBundleEntryV1[] | null | undefined,
  npcRuntimeState?: NpcRuntimeStateV1 | null
): VerificationResult {
  const evidence = evidenceBundle ?? [];
  const included = evidence.filter((entry) => entry.gateDecision === "included" || entry.gateDecision === "fallback");
  const blocked = evidence.filter((entry) => entry.gateDecision === "blocked" || entry.gateDecision === "downgraded");
  const unsupportedClaims: NarrativeClaimV1[] = [];
  const contradictedClaims: NarrativeClaimV1[] = [];
  const revealViolations: NarrativeClaimV1[] = [];
  const audienceViolations: NarrativeClaimV1[] = [];

  for (const claim of claims) {
    const overlapsIncluded = included.some((entry) => overlapsEvidence(claim, entry));
    const overlapsBlocked = blocked.some((entry) => overlapsEvidence(claim, entry));
    if (overlapsBlocked || (claim.riskLevel === "high" && HIGH_RISK_REVEAL_TERMS.some((term) => claim.text.includes(term)))) {
      revealViolations.push(claim);
    }
    if (isAudienceViolation(claim, npcRuntimeState)) {
      audienceViolations.push(claim);
    }
    if ((claim.riskLevel === "high" || claim.claimType === "npc_identity" || claim.claimType === "memory_reference") && !overlapsIncluded) {
      unsupportedClaims.push(claim);
    }
    if (overlapsIncluded && overlapsBlocked) {
      contradictedClaims.push(claim);
    }
  }

  const highRiskCount = unsupportedClaims.length + contradictedClaims.length + revealViolations.length + audienceViolations.length;
  const recommendedAction =
    revealViolations.length > 0 || audienceViolations.length > 0
      ? "rewrite_candidate"
      : unsupportedClaims.length > 0
        ? "warn"
        : "allow";
  return {
    claimCount: claims.length,
    unsupportedClaims,
    contradictedClaims,
    revealViolations,
    audienceViolations,
    confidence: claims.length > 0 ? Math.max(0.2, 1 - highRiskCount / Math.max(1, claims.length * 2)) : 1,
    recommendedAction,
    shadowOnly: true,
  };
}

export function summarizeVerificationForTelemetry(result: VerificationResult): ProvenanceTelemetrySummary {
  const highRiskClaimIds = [
    ...result.unsupportedClaims,
    ...result.contradictedClaims,
    ...result.revealViolations,
    ...result.audienceViolations,
  ]
    .filter((claim, index, arr) => arr.findIndex((item) => item.claimId === claim.claimId) === index)
    .map((claim) => claim.claimId)
    .slice(0, 12);
  return {
    shadowOnly: true,
    claimCount: result.claimCount,
    unsupportedCount: result.unsupportedClaims.length,
    contradictedCount: result.contradictedClaims.length,
    revealViolationCount: result.revealViolations.length,
    audienceViolationCount: result.audienceViolations.length,
    confidence: result.confidence,
    recommendedAction: result.recommendedAction,
    highRiskClaimIds,
  };
}

export function applyHighRiskWarningsShadowMode(result: VerificationResult): void {
  if (
    result.revealViolations.length === 0 &&
    result.audienceViolations.length === 0 &&
    result.unsupportedClaims.length === 0
  ) {
    return;
  }
  console.warn("[provenance-verifier] shadow warning", summarizeVerificationForTelemetry(result));
}
