/** Play chat message roles sent to /api/chat. Logs usually use user/assistant; helper prompts may use system. */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

/**
 * DM JSON 协议（线缆名）定义。
 * 注意：这里的 snake_case 字段属于 /api/chat 对外契约，不能为“代码整洁”直接改名。
 * 如需内部语义化，请在消费端做局部映射（wire -> internal）。
 */
export type DMJson = {
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time?: boolean;
  time_cost?: "free" | "light" | "standard" | "heavy" | "dangerous";
  /**
   * Phase-1 envelope semantic fields (optional on wire; server resolver fills defaults).
   * 前端解析必须容错：缺省时按旧行为工作。
   */
  turn_mode?: "narrative_only" | "decision_required" | "system_transition";
  narrative_goal?: string;
  narrative_density?: "low" | "medium" | "high";
  decision_required?: boolean;
  decision_options?: string[];
  decision_required_strict?: boolean;
  auto_continue_hint?: string | null;
  protagonist_anchor?: string;
  world_consistency_flags?: string[];
  anti_cheat_meta?: Record<string, unknown>;
  consumed_items?: string[];
  awarded_items?: Array<{
    id?: string;
    name?: string;
    tier?: string;
    description?: string;
    tags?: string;
    statBonus?: Record<string, number>;
  }>;
  awarded_warehouse_items?: Array<{ id?: string }>;
  codex_updates?: Array<{
    id: string;
    name: string;
    type: "npc" | "anomaly";
    /** 我目前掌握的、可展示的情报（由 DM 生成；不要求每次都有） */
    known_info?: string;
    favorability?: number;
    trust?: number;
    fear?: number;
    debt?: number;
    affection?: number;
    desire?: number;
    romanceEligible?: boolean;
    romanceStage?: "none" | "hint" | "bonded" | "committed";
    betrayalFlags?: string[];
    combatPower?: number;
    combatPowerDisplay?: string;
    personality?: string;
    traits?: string;
    rules_discovered?: string;
    weakness?: string;
  }>;
  relationship_updates?: Array<{
    npcId: string;
    favorability?: number;
    trust?: number;
    fear?: number;
    debt?: number;
    affection?: number;
    desire?: number;
    romanceEligible?: boolean;
    romanceStage?: "none" | "hint" | "bonded" | "committed";
    betrayalFlagAdd?: string;
  }>;
  main_threat_updates?: Array<{
    floorId?: string;
    threatId?: string;
    phase?: "idle" | "active" | "suppressed" | "breached";
    suppressionProgress?: number;
    lastResolvedAtHour?: number;
    counterHintsUsed?: string[];
  }>;
  weapon_updates?: Array<{
    weaponId?: string;
    stability?: number;
    calibratedThreatId?: string | null;
    currentMods?: string[];
    currentInfusions?: Array<{ threatTag?: string; turnsLeft?: number }>;
    contamination?: number;
    repairable?: boolean;
  }>;
  options?: string[];
  currency_change?: number;
  new_tasks?: Array<{
    id: string;
    title: string;
    desc?: string;
    issuer?: string;
    reward?: string | {
      originium?: number;
      items?: string[];
      warehouseItems?: string[];
      unlocks?: string[];
      relationshipChanges?: Array<{ npcId?: string; delta?: string; value?: number }>;
    };
    type?: "main" | "floor" | "character" | "conspiracy";
    issuerId?: string;
    issuerName?: string;
    floorTier?: string;
    guidanceLevel?: "none" | "light" | "standard" | "strong";
    status?: "active" | "completed" | "failed" | "hidden" | "available";
    expiresAt?: string | null;
    betrayalPossible?: boolean;
    hiddenOutcome?: string;
    hiddenTriggerConditions?: string[];
    claimMode?: "auto" | "manual" | "npc_grant";
    npcProactiveGrant?: {
      enabled?: boolean;
      npcId?: string;
      minFavorability?: number;
      preferredLocations?: string[];
      cooldownHours?: number;
    };
    nextHint?: string;
    worldConsequences?: string[];
    highRiskHighReward?: boolean;
    hiddenTriggerConditions?: string[];
    claimMode?: "auto" | "manual" | "npc_grant";
    npcProactiveGrant?: {
      enabled?: boolean;
      npcId?: string;
      minFavorability?: number;
      preferredLocations?: string[];
      cooldownHours?: number;
    };
  }>;
  task_updates?: Array<{
    id: string;
    status?: "active" | "completed" | "failed" | "hidden" | "available";
    nextHint?: string;
    hiddenOutcome?: string;
    expiresAt?: string | null;
    worldConsequences?: string[];
    guidanceLevel?: "none" | "light" | "standard" | "strong";
    reward?: {
      originium?: number;
      items?: string[];
      warehouseItems?: string[];
      unlocks?: string[];
      relationshipChanges?: Array<{ npcId?: string; delta?: string; value?: number }>;
    };
    betrayalPossible?: boolean;
    highRiskHighReward?: boolean;
  }>;
  player_location?: string;
  npc_location_updates?: Array<{ id: string; to_location: string }>;
  bgm_track?: string;
  security_meta?: {
    action?: "allow" | "review" | "degrade" | "terminate" | "block";
    stage?: "pre_input" | "post_model" | "final_output" | "risk_control";
    risk_level?: "normal" | "gray" | "black";
    request_id?: string;
    reason?: string;
  };
};

/**
 * One DM turn’s lifecycle (single /api/chat round-trip). Not synonymous with “bytes on wire” alone:
 * interaction locking follows this state machine; the on-screen typewriter is gated by `isStreamVisualActivePhase` only.
 *
 * - `idle` — No turn in flight; user may submit options/text and use talent; menu actions are allowed.
 * - `waiting_upstream` — Request issued; awaiting first SSE `data:` payload (no narrative tokens yet).
 * - `streaming_body` — SSE chunks arriving; raw JSON buffer grows; narrative ref updates; typewriter may run.
 * - `turn_committing` — Stream ended; parsing DM JSON and mutating inventory/options/logs before unlock.
 * - `tail_draining` — Commit done; typewriter must finish the final narrative before unlocking UI (no more SSE).
 * - `error` — Reserved; UI treats like `idle` for interaction lock (turn aborted, controls re-enabled).
 */
export type ChatStreamPhase =
  | "idle"
  | "waiting_upstream"
  | "streaming_body"
  | "turn_committing"
  | "tail_draining"
  | "error";
