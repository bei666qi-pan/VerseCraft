export type AnalyticsEventName =
  | "home_viewed"
  | "home_auth_clicked"
  | "home_start_new_clicked"
  | "home_continue_clicked"
  | "home_continue_resolved"
  | "world_selected"
  | "auth_modal_opened"
  | "auth_mode_switched"
  | "auth_submit_attempted"
  | "auth_submit_failed"
  | "history_center_viewed"
  | "history_writing_downloaded"
  | "settlement_viewed"
  | "settlement_export_clicked"
  | "settlement_revive_clicked"
  | "settlement_restart_clicked"
  | "survey_started"
  | "survey_step_viewed"
  | "survey_step_next"
  | "survey_step_prev"
  | "survey_submit_attempted"
  | "survey_submit_failed"
  | "survey_exit"
  | "feedback_submit_attempted"
  | "feedback_submit_failed"
  | "character_create_started"
  | "character_create_success"
  | "chat_action_started"
  | "chat_action_completed"
  | "chat_action_failed"
  | "chat_stream_first_token"
  | "chat_request_started"
  | "chat_request_finished"
  | "chat_client_perf"
  | "user_registered"
  | "user_login_success"
  | "create_character_success"
  | "enter_main_game"
  | "first_effective_action"
  | "third_effective_action"
  | "effective_action"
  | "save_created"
  | "save_sync"
  | "save_load"
  | "settlement_submitted"
  | "game_settlement"
  | "feedback_submitted"
  | "compliance_inquiry_submitted"
  | "onboarding_viewed"
  | "admin_login_success"
  | "session_heartbeat"
  | "kg_cache_hit"
  | "kg_cache_miss"
  | "kg_cache_write"
  | "kg_job_claimed"
  | "kg_job_succeeded"
  | "kg_job_failed"
  | "survey_entry_exposed"
  | "survey_entry_clicked"
  | "survey_modal_opened"
  | "survey_submitted"
  | "survey_external_link_opened"
  | "page_hidden_during_generation"
  | "world_engine_enqueued"
  | "turn_lane_decided"
  | "turn_commit_summary"
  | "narrative_validator_issue"
  | "narrative_safety_issue"
  | "narrative_safety_commit"
  | "entity_audit_issue"
  | "pacing_validator_issue"
  | "safety_fallback_used"
  | "unknown_entity_blocked"
  | "prompt_injection_blocked"
  | "narrative_protocol_leak"
  | "presence_flaky";

export type AnalyticsPlatform = "mobile" | "desktop" | "unknown";

export type AnalyticsEventInsertPayload = Record<string, unknown>;

export type AnalyticsEventInsertInput = {
  eventId: string;
  idempotencyKey: string;

  /** 统一 actor（阶段5）；可缺省，由 userId/guestId 推导 */
  actorId?: string | null;
  actorType?: "user" | "guest" | null;
  /** 与 useGameStore.guestId 对齐（游客长期身份锚点） */
  guestId?: string | null;
  userId: string | null;
  sessionId: string; // for non-session events, use "system"
  eventName: AnalyticsEventName;
  eventTime: Date;

  page: string | null;
  source: string | null;
  platform: AnalyticsPlatform;

  tokenCost: number;
  playDurationDeltaSec: number;
  onlineDurationDeltaSec?: number;
  activePlayDurationDeltaSec?: number;
  readDurationDeltaSec?: number;
  idleDurationDeltaSec?: number;

  payload: AnalyticsEventInsertPayload;
};

