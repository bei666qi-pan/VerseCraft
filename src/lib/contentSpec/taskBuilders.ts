import type { TaskContentSpec } from "./types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { normalizeGameTaskDraft } from "@/lib/tasks/taskV2";

export function buildGameTaskV2FromTaskSpec(spec: TaskContentSpec): GameTaskV2 | null {
  if (!spec?.id) return null;
  const drafted = {
    id: spec.id,
    title: spec.core.title,
    desc: spec.core.desc,
    type: spec.core.type,
    floorTier: spec.core.floorTier,

    issuerId: spec.issuer.issuerId,
    issuerName: spec.issuer.issuerName,
    claimMode: spec.issuer.claimMode,
    npcProactiveGrant: spec.issuer.npcProactiveGrant ?? {
      enabled: false,
      npcId: "",
      minFavorability: 0,
      preferredLocations: [],
      cooldownHours: 0,
    },
    npcProactiveGrantLastIssuedHour: null,
    hiddenTriggerConditions: spec.hooks?.hiddenTriggerConditions ?? [],

    nextHint: spec.dramatic?.playerHook ?? spec.dramatic?.urgencyReason ?? "",

    dramaticType: spec.dramatic?.dramaticType,
    issuerIntent: spec.dramatic?.issuerIntent,
    playerHook: spec.dramatic?.playerHook,
    urgencyReason: spec.dramatic?.urgencyReason,
    riskNote: spec.dramatic?.riskNote,
    taboo: spec.dramatic?.taboo,
    hiddenMotive: spec.dramatic?.hiddenMotive,
    deadlineHint: spec.dramatic?.deadlineHint,
    residueOnComplete: spec.dramatic?.residueOnComplete,
    residueOnFail: spec.dramatic?.residueOnFail,
    relatedNpcIds: spec.dramatic?.relatedNpcIds,
    relatedLocationIds: spec.dramatic?.relatedLocationIds,
    relatedEscapeProgress: spec.dramatic?.relatedEscapeProgress,
    trustImpactHint: spec.dramatic?.trustImpactHint,
    canBackfire: spec.dramatic?.canBackfire,
    backfireConsequences: spec.dramatic?.backfireConsequences,
    followupSeedCodes: spec.dramatic?.followupSeedCodes,
    spokenDeliveryStyle: spec.dramatic?.spokenDeliveryStyle,

    worldConsequences: spec.hooks?.worldConsequences ?? [],
    reward: {
      originium: spec.hooks?.reward?.originium ?? 0,
      items: spec.hooks?.reward?.items ?? [],
      unlocks: spec.hooks?.reward?.unlocks ?? [],
    },
  };
  return normalizeGameTaskDraft(drafted);
}

