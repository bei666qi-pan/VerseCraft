import type { StatType } from "@/lib/registry/types";

export type ProfessionId = "守灯人" | "巡迹客" | "觅兆者" | "齐日角" | "溯源师";

export interface ProfessionProgress {
  statQualified: boolean;
  behaviorQualified: boolean;
  behaviorEvidenceCount: number;
  behaviorEvidenceTarget: number;
  trialTaskId: string | null;
  trialTaskCompleted: boolean;
  certified: boolean;
}

export interface ProfessionStateV1 {
  currentProfession: ProfessionId | null;
  unlockedProfessions: ProfessionId[];
  eligibilityByProfession: Record<ProfessionId, boolean>;
  progressByProfession: Record<ProfessionId, ProfessionProgress>;
  activePerks: string[];
  professionFlags: Record<string, boolean>;
  professionCooldowns: Record<string, number>;
}

export interface ProfessionDefinition {
  id: ProfessionId;
  primaryStat: StatType;
  passivePerkId: string;
  activeSkillId: string | null;
  summary: string;
}

