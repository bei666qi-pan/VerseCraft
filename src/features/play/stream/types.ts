/** Play chat message roles sent to /api/chat (mirrors persisted log roles used here). */

export type ChatRole = "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

/** DM JSON shape returned in streaming completion (client parse only; do not rename keys). */
export type DMJson = {
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time?: boolean;
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
    favorability?: number;
    combatPower?: number;
    personality?: string;
    traits?: string;
    rules_discovered?: string;
    weakness?: string;
  }>;
  options?: string[];
  currency_change?: number;
  new_tasks?: Array<{ id: string; title: string; desc: string; issuer: string; reward: string }>;
  task_updates?: Array<{ id: string; status: "active" | "completed" | "failed" }>;
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
