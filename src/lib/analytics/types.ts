export type AnalyticsEventName =
  | "chat_action_completed"
  | "user_registered"
  | "feedback_submitted"
  | "game_record_submitted"
  | "onboarding_viewed";

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

