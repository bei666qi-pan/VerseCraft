import type { NpcProfileV2, NpcRelationStateV2, NpcSocialProfile } from "@/lib/registry/types";

export type TruthfulnessBand = "low" | "medium" | "high";
export type NpcTaskStyle = "direct" | "transactional" | "manipulative" | "avoidant" | "protective";
export type ManipulationMode = "none" | "test_then_offer" | "reward_withheld" | "guilt" | "fear";

export type NpcHeartProfile = {
  npcId: string;
  displayName: string;

  surfaceMask: string;
  coreDrive: string;
  coreFear: string;
  dependencyNeed: string;
  softSpot: string;
  tabooBoundary: string;

  ruptureThreshold: { trustBelow: number; fearAbove: number; debtAbove: number };

  taskStyle: NpcTaskStyle;
  speechContract: string;
  manipulationMode: ManipulationMode;
  truthfulnessBand: TruthfulnessBand;
  emotionalDebtPattern: string;
  betrayalStyle: string;
  rescueStyle: string;

  whatNpcWillNeverAskOpenly: string;
};

export type NpcHeartRuntimeView = {
  profile: NpcHeartProfile;
  relation: NpcRelationStateV2;
  context: {
    locationId: string;
    floorId: string;
    hotThreatPresent: boolean;
    activeTaskIds: string[];
  };

  attitudeLabel: "warm" | "neutral" | "guarded" | "hostile";
  whatNpcWantsFromPlayerNow: string;
  canIssueTasksNow: boolean;
  suggestedTaskDramaticTypes: string[];

  /** Phase-5: 出口主线角色位（仅供 prompt/规则；不做 UI 面板） */
  escapeRole?: "route_holder" | "gatekeeper" | "liar" | "ally" | "sacrificer" | "blocker";
};

export type NpcHeartDeps = {
  profileV2?: NpcProfileV2 | null;
  social?: NpcSocialProfile | null;
};

