export type AnalyticsEventName =
  | "home_viewed"
  | "home_auth_clicked"
  | "home_start_new_clicked"
  | "home_continue_clicked"
  | "home_continue_resolved"
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
  | "chat_action_completed"
  | "chat_request_started"
  | "chat_request_finished"
  | "user_registered"
  | "user_login_success"
  | "create_character_success"
  | "enter_main_game"
  | "first_effective_action"
  | "effective_action"
  | "save_sync"
  | "save_load"
  | "game_settlement"
  | "feedback_submitted"
  | "compliance_inquiry_submitted"
  | "game_record_submitted"
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
  | "survey_external_link_opened";

export type AnalyticsPlatform = "mobile" | "desktop" | "unknown";

export type AnalyticsEventInsertPayload = Record<string, unknown>;

export type AnalyticsEventInsertInput = {
  eventId: string;
  idempotencyKey: string;

  userId: string | null;
  sessionId: string; // for non-session events, use "system"
  eventName: AnalyticsEventName;
  eventTime: Date;

  page: string | null;
  source: string | null;
  platform: AnalyticsPlatform;

  tokenCost: number;
  playDurationDeltaSec: number;

  payload: AnalyticsEventInsertPayload;
};

