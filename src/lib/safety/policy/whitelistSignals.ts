import type { ModerationScene, SafetyRuntimeContext, WhitelistSignals } from "@/lib/safety/policy/model";
import { matchWorldviewWhitelist } from "@/lib/safety/whitelist/worldviewWhitelist";
import { matchGameplayActionWhitelist } from "@/lib/safety/whitelist/actionWhitelist";
import { matchStyleToneHints } from "@/lib/safety/whitelist/styleWhitelist";

function contextConsistencyHeuristic(args: {
  scene: ModerationScene;
  runtimeContext?: SafetyRuntimeContext;
  worldviewTerms: string[];
  gameplayActions: string[];
}): boolean {
  // Heuristic: if in narrative scenes and runtime context indicates threats/tasks/NPCs, and we see worldview/action terms,
  // then it's likely context-consistent (reduces false positives).
  if (args.scene === "feedback" || args.scene === "report" || args.scene === "account_profile") return false;
  const hasLoreSignal = args.worldviewTerms.length > 0 || args.gameplayActions.length > 0;
  if (!hasLoreSignal) return false;

  const ctx = args.runtimeContext;
  const hasGameState =
    Boolean(ctx?.locationId) ||
    Boolean(ctx?.floorId) ||
    (ctx?.activeTasks?.length ?? 0) > 0 ||
    (ctx?.nearbyNpcIds?.length ?? 0) > 0 ||
    Boolean(ctx?.threat?.activeThreatId);

  return hasGameState;
}

export function computeWhitelistSignals(args: {
  text: string;
  scene: ModerationScene;
  runtimeContext?: SafetyRuntimeContext;
}): WhitelistSignals {
  const worldviewTerms = matchWorldviewWhitelist({
    text: args.text,
    scene: args.scene,
    runtimeContext: args.runtimeContext,
  });
  const gameplayActions = matchGameplayActionWhitelist({ text: args.text, scene: args.scene });
  const styleToneHints = matchStyleToneHints({ text: args.text, scene: args.scene });
  const contextConsistent = contextConsistencyHeuristic({
    scene: args.scene,
    runtimeContext: args.runtimeContext,
    worldviewTerms,
    gameplayActions,
  });

  return { worldviewTerms, gameplayActions, styleToneHints, contextConsistent };
}

