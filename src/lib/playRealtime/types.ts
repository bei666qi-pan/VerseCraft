// src/lib/playRealtime/types.ts

export type PlayerIntentKind =
  | "explore"
  | "combat"
  | "dialogue"
  | "use_item"
  | "investigate"
  | "meta"
  | "other";

export interface PlayerControlSlots {
  target?: string;
  item_hint?: string;
  location_hint?: string;
  notes?: string;
}

/**
 * 控制面结构化输出（逻辑角色 control，经 one-api 映射上游）。不得包含可玩剧情正文。
 */
export interface PlayerControlPlane {
  intent: PlayerIntentKind;
  confidence: number;
  extracted_slots: PlayerControlSlots;
  risk_tags: string[];
  risk_level: "low" | "medium" | "high";
  /** Short narrator-facing hints only (Chinese). */
  dm_hints: string;
  enhance_scene: boolean;
  enhance_npc_emotion: boolean;
  block_dm: boolean;
  block_reason: string;
}

/** Heuristic flags derived locally from client context (no extra model). */
export interface PlayerRuleSnapshot {
  in_combat_hint: boolean;
  in_dialogue_hint: boolean;
  location_changed_hint: boolean;
  high_value_scene: boolean;
}

export interface PlayerRealtimePipelineState {
  ruleSnapshot: PlayerRuleSnapshot;
  control: PlayerControlPlane | null;
  preflightOk: boolean;
  preflightModel?: string;
}
