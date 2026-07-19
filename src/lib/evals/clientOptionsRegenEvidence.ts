import { normalizeRegeneratedOptions } from "@/features/play/turnCommit/phaseRegressionGuards";
import { parseOptionsFromSsePayload } from "@/app/play/optionsRegenParsing";
import { VERSECRAFT_CHAT_PURPOSE_HEADER, VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY } from "@/lib/chatPurpose";
import { buildClientOptionsRegenContext } from "@/lib/play/optionsRegenContext";
import { evaluateOptionsSemanticQuality } from "@/lib/play/optionsSemanticGuards";
import { buildVisibleOptionsSceneAnchors } from "@/lib/play/optionsSceneAnchors";
import { mapOptionRejectReasonToCodes } from "@/lib/play/optionsRegenObservability";
import { getClientOptionsRegenRepairPassEnabled } from "@/lib/rollout/versecraftClientRollout";
import { isCompleteRegeneratedOptions, isPlayableRegeneratedOptions } from "@/lib/play/optionsRegenPlayability";
import { buildClientStructuredSnapshot } from "./playthrough/orchestrator";
import type { GameStateSnapshot } from "./playthrough/types";

export type ClientOptionsRegenEvidence = {
  source: "api_chat_options_regen_only";
  attempted: true;
  applied: boolean;
  complete: boolean;
  options: string[];
  attempts: number;
  httpStatus: number | null;
  requestId: string | null;
  failureReason: string | null;
  rejectCodes: string[];
  extractedOptionsCount: number;
  normalizedOptionsCount: number;
  acceptedOptionsCount: number;
  candidateOptions: string[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RequestClientOptionsRegenEvidenceInput = {
  baseUrl: string;
  sessionId: string;
  playerAction: string;
  narrative: string;
  state: GameStateSnapshot;
  currentOptions?: string[];
  recentOptions?: string[];
  fetcher?: FetchLike;
};

/** The UI aims for four actions and asks the model to repair only a short list. */
export function shouldRequestClientOptionsRegen(options: readonly unknown[]): boolean {
  return options.filter((option) => typeof option === "string" && option.trim().length > 0).length < 4;
}

function buildPlayerContext(state: GameStateSnapshot): string {
  return [
    `位置:${state.playerLocation}`,
    `HP:${state.hp}/${state.maxHp}`,
    `理智:${state.sanity}`,
    `职业:${state.profession ?? "无"}`,
    `武器:${state.equippedWeapon ?? "无"}`,
    `任务:${state.activeTaskIds.join(",") || "无"}`,
    `回合:${state.turnCount}`,
  ].join("；");
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

export async function requestClientOptionsRegenEvidence(input: RequestClientOptionsRegenEvidenceInput): Promise<ClientOptionsRegenEvidence> {
  const fetcher = input.fetcher ?? fetch;
  const currentOptions = strings(input.currentOptions);
  const recentOptions = strings(input.recentOptions);
  const clientState = buildClientStructuredSnapshot(input.state);
  const sceneAnchors = buildVisibleOptionsSceneAnchors({
    playerLocation: clientState.playerLocation,
    presentNpcIds: clientState.presentNpcIds,
    equippedWeapon: clientState.equippedWeapon,
    inventoryHints: input.state.inventoryItemIds,
    latestNarrative: input.narrative,
  });
  const context = buildClientOptionsRegenContext({
    latestPlayerAction: input.playerAction,
    latestNarrativeExcerpt: input.narrative,
    currentOptions,
    recentOptions,
    inventoryHints: input.state.inventoryItemIds,
    tasks: input.state.activeTaskIds.map((title) => ({ title, status: "active" })),
  });
  const accepted: string[] = [];
  const rejectCodes = new Set<string>();
  let requestId: string | null = null;
  let status: number | null = null;
  let failureReason: string | null = null;
  let attempts = 0;
  let extractedOptionsCount = 0;
  let normalizedOptionsCount = 0;
  let acceptedOptionsCount = 0;
  let rawCandidateOptions: string[] = [];

  const requestOnce = async (repairLockedOptions: string[]): Promise<string[]> => {
    attempts += 1;
    const repairContext = repairLockedOptions.length > 0
      ? buildClientOptionsRegenContext({
          latestPlayerAction: input.playerAction,
          latestNarrativeExcerpt: input.narrative,
          currentOptions,
          recentOptions,
          inventoryHints: input.state.inventoryItemIds,
          tasks: input.state.activeTaskIds.map((title) => ({ title, status: "active" })),
          repairNeedCount: Math.max(0, 4 - repairLockedOptions.length),
          repairLockedOptions,
        })
      : context;
    let response: Response;
    try {
      response = await fetcher(`${input.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-versecraft-output-language": "zh-CN",
          [VERSECRAFT_CHAT_PURPOSE_HEADER]: VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
        },
        body: JSON.stringify({
          messages: [
            { role: "assistant", content: input.narrative },
            { role: "user", content: input.playerAction },
          ],
          playerContext: buildPlayerContext(input.state),
          clientState,
          language: "zh-CN",
          sessionId: input.sessionId,
          openingOptionsOnlyRound: false,
          clientPurpose: "options_regen_only",
          clientReason: "【为何需要整理选项】主回合 narrative 正常但 options 缺失",
          optionsRegenContext: repairContext,
          clientTurnModeHint: "decision_required",
        }),
      });
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
      return [];
    }
    status = response.status;
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      failureReason = `http_${response.status}`;
      return [];
    }
    const parsed = parseOptionsFromSsePayload(raw, {
      normalizeOptions: (rawOptions) => normalizeRegeneratedOptions(rawOptions, recentOptions, [...currentOptions, ...repairLockedOptions]),
      runSemanticQualityGate: (candidateOptions, extraBlocked = []) => {
        rawCandidateOptions = candidateOptions.slice(0, 4);
        const quality = evaluateOptionsSemanticQuality({
          options: candidateOptions,
          currentOptions: [...currentOptions, ...extraBlocked],
          recentOptions,
          latestNarrative: input.narrative,
          playerLocation: input.state.playerLocation,
          sceneAnchors,
        });
        return { accepted: quality.accepted, rejectCodes: mapOptionRejectReasonToCodes(quality.rejected.map((rejection) => rejection.reason)) };
      },
    });
    requestId = parsed.requestId ?? requestId;
    extractedOptionsCount = Math.max(extractedOptionsCount, parsed.extractedOptionsCount);
    normalizedOptionsCount = Math.max(normalizedOptionsCount, parsed.normalizedOptionsCount);
    acceptedOptionsCount = Math.max(acceptedOptionsCount, parsed.options.length);
    for (const code of parsed.rejectCodes) rejectCodes.add(code);
    if (parsed.parseFailed) failureReason = parsed.failure?.reason ?? "parse_failed";
    return parsed.options;
  };

  const firstPass = await requestOnce([]);
  accepted.push(...firstPass);
  if (accepted.length < 4 && getClientOptionsRegenRepairPassEnabled()) {
    const repair = await requestOnce(accepted);
    accepted.splice(0, accepted.length, ...normalizeRegeneratedOptions([...accepted, ...repair], recentOptions, currentOptions));
  }
  const options = accepted.slice(0, 4);
  const applied = isPlayableRegeneratedOptions(options);
  const complete = isCompleteRegeneratedOptions(options);
  if (!applied && (!failureReason || failureReason === "unknown")) failureReason = "insufficient_options_after_repair";
  return {
    source: "api_chat_options_regen_only",
    attempted: true,
    applied,
    complete,
    options: applied ? options : [],
    attempts,
    httpStatus: status,
    requestId,
    failureReason: applied ? null : failureReason,
    rejectCodes: Array.from(rejectCodes),
    extractedOptionsCount,
    normalizedOptionsCount,
    acceptedOptionsCount,
    candidateOptions: rawCandidateOptions,
  };
}
