import type { AnalyticsEventName } from "@/lib/analytics/types";

export type AnalyticsEventCategory =
  | "acquisition"
  | "auth"
  | "onboarding"
  | "gameplay"
  | "ai"
  | "save"
  | "survey"
  | "feedback"
  | "content_quality"
  | "admin"
  | "health";

export type AnalyticsIdentityKey = "actorId" | "userId" | "guestId" | "sessionId";

export type AnalyticsEventContract = {
  eventName: AnalyticsEventName;
  category: AnalyticsEventCategory;
  description: string;
  requiredIdentity: AnalyticsIdentityKey[];
  requiredPayloadKeys: string[];
  optionalPayloadKeys: string[];
  version: number;
  owner: string;
};

export type AnalyticsEventContractValidationInput = {
  eventName: AnalyticsEventName | string;
  actorId?: string | null;
  userId?: string | null;
  guestId?: string | null;
  sessionId?: string | null;
  payload?: Record<string, unknown> | null;
};

export type AnalyticsEventContractValidationResult = {
  ok: boolean;
  eventName: string;
  degraded: boolean;
  reason: "ok" | "unknown_event" | "missing_identity" | "missing_payload_keys" | "sensitive_payload_keys";
  missingIdentity: AnalyticsIdentityKey[];
  missingPayloadKeys: string[];
  sensitivePayloadKeys: string[];
  contract: AnalyticsEventContract | null;
};

function c(
  eventName: AnalyticsEventName,
  category: AnalyticsEventCategory,
  description: string,
  requiredIdentity: AnalyticsIdentityKey[],
  requiredPayloadKeys: string[],
  optionalPayloadKeys: string[],
  owner: string
): AnalyticsEventContract {
  return {
    eventName,
    category,
    description,
    requiredIdentity,
    requiredPayloadKeys,
    optionalPayloadKeys,
    version: 1,
    owner,
  };
}

const sessionIdentity: AnalyticsIdentityKey[] = ["sessionId"];
const systemIdentity: AnalyticsIdentityKey[] = ["sessionId"];
const userIdentity: AnalyticsIdentityKey[] = ["userId", "sessionId"];
const surveyRequiredPayload = ["surveyKey", "surveyVersion", "stepIndex", "questionId", "actorType", "guestId"];
const surveyOptionalPayload = ["version", "stepTotal", "placement", "mode", "surveyCompletion", "progressPct", "fromStepIndex", "toStepIndex", "reason", "message", "answeredCount", "responseId", "source", "completedStepCount", "hasUrl", "urlHost"];

export const ANALYTICS_EVENT_TAXONOMY = {
  home_viewed: c("home_viewed", "acquisition", "Home page impression and entry state.", sessionIdentity, ["entryState"], ["loggedIn", "hasLocalProgress", "hasCloud"], "growth"),
  home_auth_clicked: c("home_auth_clicked", "acquisition", "Home auth CTA clicked.", sessionIdentity, ["entryState"], ["mode", "placement"], "growth"),
  home_start_new_clicked: c("home_start_new_clicked", "acquisition", "Home start-new CTA clicked.", sessionIdentity, ["entryState"], ["loggedIn", "hasLocalProgress"], "growth"),
  home_continue_clicked: c("home_continue_clicked", "acquisition", "Home continue CTA clicked.", sessionIdentity, ["entryState"], ["slotId", "tag", "hasCloud"], "growth"),
  home_continue_resolved: c("home_continue_resolved", "acquisition", "Home continue target resolved.", sessionIdentity, ["resolution"], ["slotId", "tag", "source"], "growth"),
  world_selected: c("world_selected", "onboarding", "World selection completed.", sessionIdentity, ["worldId"], ["worldName", "source"], "growth"),

  auth_modal_opened: c("auth_modal_opened", "auth", "Auth modal opened.", sessionIdentity, ["mode"], ["entryState", "source"], "auth"),
  auth_mode_switched: c("auth_mode_switched", "auth", "Auth modal mode switched.", sessionIdentity, ["fromMode", "toMode"], ["source"], "auth"),
  auth_submit_attempted: c("auth_submit_attempted", "auth", "Auth form submitted.", sessionIdentity, ["mode"], ["source"], "auth"),
  auth_submit_failed: c("auth_submit_failed", "auth", "Auth form failed before success.", sessionIdentity, ["mode", "reason"], ["source"], "auth"),
  user_registered: c("user_registered", "auth", "Server-side registration success.", userIdentity, [], ["source"], "auth"),
  user_login_success: c("user_login_success", "auth", "Server-side login success.", userIdentity, [], ["source"], "auth"),

  history_center_viewed: c("history_center_viewed", "save", "History center viewed.", sessionIdentity, [], ["entryPoint"], "save"),
  history_writing_downloaded: c("history_writing_downloaded", "save", "History writing export downloaded.", sessionIdentity, ["format"], ["slotId", "runId"], "save"),

  settlement_viewed: c("settlement_viewed", "gameplay", "Settlement page viewed.", sessionIdentity, ["source"], ["runId", "outcome"], "gameplay"),
  settlement_export_clicked: c("settlement_export_clicked", "gameplay", "Settlement export clicked.", sessionIdentity, ["format"], ["runId", "outcome"], "gameplay"),
  settlement_revive_clicked: c("settlement_revive_clicked", "gameplay", "Settlement revive action clicked.", sessionIdentity, ["outcome"], ["runId"], "gameplay"),
  settlement_restart_clicked: c("settlement_restart_clicked", "gameplay", "Settlement restart action clicked.", sessionIdentity, ["outcome"], ["runId"], "gameplay"),
  settlement_submitted: c("settlement_submitted", "gameplay", "Legacy settlement submit marker.", sessionIdentity, ["outcome"], ["runId", "source"], "gameplay"),
  game_settlement: c("game_settlement", "gameplay", "Server-side game settlement record created.", sessionIdentity, ["settlementId"], ["outcome", "runId"], "gameplay"),

  ending_eligible_detected: c("ending_eligible_detected", "gameplay", "Ending eligibility detected in play.", sessionIdentity, ["runId", "endingPhase"], ["outcome", "reasons", "blockers"], "gameplay"),
  ending_final_choice_shown: c("ending_final_choice_shown", "gameplay", "Final ending choice UI shown.", sessionIdentity, ["runId", "endingPhase"], ["outcome", "source"], "gameplay"),
  ending_final_choice_selected: c("ending_final_choice_selected", "gameplay", "Player selected final ending choice.", sessionIdentity, ["runId", "outcome"], ["endingPhase", "source"], "gameplay"),
  ending_final_narrative_committed: c("ending_final_narrative_committed", "gameplay", "Final ending narrative committed.", sessionIdentity, ["runId", "outcome"], ["endingPhase", "settlementId"], "gameplay"),
  ending_settlement_snapshot_created: c("ending_settlement_snapshot_created", "gameplay", "Ending settlement snapshot created.", sessionIdentity, ["runId", "settlementId"], ["outcome", "survivalHours"], "gameplay"),
  ending_redirected_to_settlement: c("ending_redirected_to_settlement", "gameplay", "Player redirected to settlement.", sessionIdentity, ["runId", "settlementId"], ["outcome"], "gameplay"),
  ending_settlement_viewed: c("ending_settlement_viewed", "gameplay", "Ending settlement surface viewed.", sessionIdentity, ["runId"], ["outcome", "settlementId"], "gameplay"),
  ending_settlement_history_submitted: c("ending_settlement_history_submitted", "gameplay", "Ending settlement submitted to history.", sessionIdentity, ["runId", "settlementId"], ["outcome"], "gameplay"),
  ending_blocked: c("ending_blocked", "gameplay", "Ending flow blocked by validation or missing state.", sessionIdentity, ["runId", "blockers"], ["outcome", "source"], "gameplay"),

  survey_entry_exposed: c("survey_entry_exposed", "survey", "Survey entry was exposed.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_entry_clicked: c("survey_entry_clicked", "survey", "Survey entry was clicked.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_modal_opened: c("survey_modal_opened", "survey", "Survey modal opened.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_started: c("survey_started", "survey", "Embedded survey started.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_step_viewed: c("survey_step_viewed", "survey", "Survey step viewed.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_step_next: c("survey_step_next", "survey", "Survey next-step clicked.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_step_prev: c("survey_step_prev", "survey", "Survey previous-step clicked.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_submit_attempted: c("survey_submit_attempted", "survey", "Survey submit attempted.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_submit_failed: c("survey_submit_failed", "survey", "Survey submit failed.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_exit: c("survey_exit", "survey", "Survey modal exited.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_submitted: c("survey_submitted", "survey", "Survey successfully submitted.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),
  survey_external_link_opened: c("survey_external_link_opened", "survey", "External survey link opened.", sessionIdentity, surveyRequiredPayload, surveyOptionalPayload, "research"),

  feedback_submit_attempted: c("feedback_submit_attempted", "feedback", "Open-text feedback submit attempted.", sessionIdentity, ["source"], ["contentLength"], "research"),
  feedback_submit_failed: c("feedback_submit_failed", "feedback", "Open-text feedback submit failed.", sessionIdentity, ["source", "reason"], ["contentLength"], "research"),
  feedback_submitted: c("feedback_submitted", "feedback", "Open-text feedback successfully submitted.", sessionIdentity, ["source"], ["feedbackId", "contentLength"], "research"),
  compliance_inquiry_submitted: c("compliance_inquiry_submitted", "feedback", "Compliance inquiry submitted.", sessionIdentity, ["topic"], ["contactProvided"], "ops"),

  character_create_started: c("character_create_started", "onboarding", "Character creation flow started.", sessionIdentity, ["source"], ["worldId"], "growth"),
  character_create_success: c("character_create_success", "onboarding", "Legacy character creation success marker.", sessionIdentity, ["source"], ["gender", "profession"], "growth"),
  create_character_success: c("create_character_success", "onboarding", "Character creation success on current create page.", sessionIdentity, ["name", "gender", "height"], ["talent", "stats"], "growth"),
  onboarding_viewed: c("onboarding_viewed", "onboarding", "Onboarding page or step viewed.", sessionIdentity, ["step"], ["source"], "growth"),
  enter_main_game: c("enter_main_game", "onboarding", "Player entered /play.", sessionIdentity, ["source"], ["day", "location"], "growth"),

  chat_action_started: c("chat_action_started", "gameplay", "Player action submission started.", sessionIdentity, ["requestId"], ["inputMode", "source"], "gameplay"),
  chat_action_completed: c("chat_action_completed", "gameplay", "Player action committed and rolled up.", sessionIdentity, ["requestId"], ["isFirstAction", "riskLane", "narrativeChars"], "gameplay"),
  chat_action_failed: c("chat_action_failed", "gameplay", "Player action failed before commit.", sessionIdentity, ["requestId", "reason"], ["riskLane"], "gameplay"),
  chat_stream_first_token: c("chat_stream_first_token", "ai", "First visible stream token observed.", sessionIdentity, ["requestId", "firstTokenMs"], ["riskLane"], "ai-platform"),
  chat_request_started: c("chat_request_started", "ai", "Server-side chat request started.", sessionIdentity, ["requestId"], ["riskLane", "isFirstAction"], "ai-platform"),
  chat_request_finished: c("chat_request_finished", "ai", "Server-side chat request finished.", sessionIdentity, ["requestId", "success", "totalLatencyMs"], ["firstChunkLatencyMs", "model", "riskLane", "promptTokens", "completionTokens", "fallbackUsed", "rateLimited", "httpStatus", "upstreamStatus", "quotaReason", "quotaActorType"], "ai-platform"),
  chat_client_perf: c("chat_client_perf", "ai", "Client-side chat streaming performance beacon.", sessionIdentity, ["requestId"], ["firstVisibleTextMs", "finalMs", "statusFrameCount"], "ai-platform"),
  page_hidden_during_generation: c("page_hidden_during_generation", "ai", "Page was hidden while a generation was active.", sessionIdentity, ["requestId"], ["elapsedMs"], "ai-platform"),

  first_effective_action: c("first_effective_action", "gameplay", "First effective player action.", sessionIdentity, ["actionCount"], ["location", "day"], "growth"),
  third_effective_action: c("third_effective_action", "gameplay", "Third effective player action.", sessionIdentity, ["actionCount"], ["location", "day"], "growth"),
  effective_action: c("effective_action", "gameplay", "Any effective player action.", sessionIdentity, ["actionCount"], ["location", "day", "source"], "growth"),
  chapter_entered: c("chapter_entered", "content_quality", "Player entered a narrative chapter.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  chapter_completed: c("chapter_completed", "content_quality", "Player completed a narrative chapter.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  chapter_abandoned: c("chapter_abandoned", "content_quality", "Player left or stopped progressing in a chapter.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  npc_interaction_started: c("npc_interaction_started", "content_quality", "NPC interaction was started.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  npc_interaction_completed: c("npc_interaction_completed", "content_quality", "NPC interaction was completed.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  npc_interaction_failed: c("npc_interaction_failed", "content_quality", "NPC interaction failed or was blocked.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  regen_clicked: c("regen_clicked", "content_quality", "Player requested regeneration.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  retry_clicked: c("retry_clicked", "content_quality", "Player retried a failed or undesired action.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "source"], "content"),
  narrative_eval_sampled: c("narrative_eval_sampled", "content_quality", "Narrative sample was selected for offline evaluation.", sessionIdentity, ["worldId", "chapterId"], ["npcId", "reason", "runId", "traceId", "sampleId"], "content"),

  save_created: c("save_created", "save", "A new save slot was created.", sessionIdentity, ["slotId"], ["source"], "save"),
  save_sync: c("save_sync", "save", "A save slot synced to cloud.", sessionIdentity, ["slotId"], ["source", "result"], "save"),
  save_load: c("save_load", "save", "A save slot was loaded.", sessionIdentity, ["slotId"], ["source"], "save"),

  admin_login_success: c("admin_login_success", "admin", "Admin shadow login succeeded.", systemIdentity, [], ["ipHash", "userAgentHash"], "admin"),

  session_heartbeat: c("session_heartbeat", "health", "Client/session heartbeat for presence and playtime.", sessionIdentity, [], ["kind", "visibility", "onlineSec", "activePlaySec", "readSec", "idleSec"], "analytics"),
  presence_flaky: c("presence_flaky", "health", "Presence degraded or flaky.", sessionIdentity, ["reason"], ["backend"], "analytics"),

  kg_cache_hit: c("kg_cache_hit", "health", "Knowledge cache hit.", systemIdentity, ["cacheKey"], ["source"], "kg"),
  kg_cache_miss: c("kg_cache_miss", "health", "Knowledge cache miss.", systemIdentity, ["cacheKey"], ["source"], "kg"),
  kg_cache_write: c("kg_cache_write", "health", "Knowledge cache write.", systemIdentity, ["cacheKey"], ["source", "bytes"], "kg"),
  kg_job_claimed: c("kg_job_claimed", "health", "KG worker claimed a job.", systemIdentity, ["jobId", "jobType", "attempts"], ["workerId"], "kg"),
  kg_job_succeeded: c("kg_job_succeeded", "health", "KG worker completed a job.", systemIdentity, ["jobId", "jobType", "attempts"], ["durationMs"], "kg"),
  kg_job_failed: c("kg_job_failed", "health", "KG worker failed a job.", systemIdentity, ["jobId", "jobType", "attempts"], ["durationMs", "errorKind"], "kg"),

  world_engine_enqueued: c("world_engine_enqueued", "content_quality", "Background world engine tick was enqueued.", sessionIdentity, ["requestId", "jobId"], ["triggerCodes"], "world-engine"),
  world_engine_reasoner_failed: c("world_engine_reasoner_failed", "content_quality", "World engine reasoner API call failed.", sessionIdentity, ["requestId"], ["code", "triggerSignals"], "world-engine"),
  world_engine_parse_failed: c("world_engine_parse_failed", "content_quality", "World engine reasoner JSON parse failed.", sessionIdentity, ["requestId"], ["triggerSignals"], "world-engine"),
  world_engine_validation_failed: c("world_engine_validation_failed", "content_quality", "World engine deterministic validation rejected all events.", sessionIdentity, ["requestId"], ["triggerSignals", "rejectedEventCodes"], "world-engine"),
  social_world_hint_projected: c("social_world_hint_projected", "content_quality", "Social world hints were projected into runtime.", sessionIdentity, ["requestId", "projectedCount"], ["socialWorldMode"], "world-engine"),
  turn_lane_decided: c("turn_lane_decided", "gameplay", "Turn lane routing decision.", sessionIdentity, ["requestId", "lane", "reasons"], ["confidence", "riskLane"], "turn-engine"),
  lane_side_effect_applied: c("lane_side_effect_applied", "gameplay", "Turn lane side-effect policy applied.", sessionIdentity, ["requestId", "lane"], ["riskLane", "sideEffectPlan"], "turn-engine"),
  director_agenda_injected: c("director_agenda_injected", "content_quality", "Director agenda items were injected into the turn.", sessionIdentity, ["requestId", "agendaCount"], ["agendaIds", "directorMode"], "world-engine"),
  turn_commit_summary: c("turn_commit_summary", "content_quality", "Turn commit summary emitted after validation.", sessionIdentity, ["requestId"], ["deltaSummary", "commitFlags", "blockedCommitFields"], "turn-engine"),
  narrative_validator_issue: c("narrative_validator_issue", "content_quality", "Post-generation narrative validator issue.", sessionIdentity, ["requestId", "issueCodes"], ["byCode", "severity"], "content-safety"),
  narrative_protocol_leak: c("narrative_protocol_leak", "content_quality", "Narrative protocol leak detected.", sessionIdentity, ["requestId", "issueCode"], ["snippetHash"], "content-safety"),

  narrative_safety_issue: c("narrative_safety_issue", "content_quality", "Narrative safety issue detected.", sessionIdentity, ["requestId", "issueCodes"], ["byCode", "bySeverity"], "content-safety"),
  narrative_safety_commit: c("narrative_safety_commit", "content_quality", "Narrative safety decision committed.", sessionIdentity, ["requestId", "decision"], ["mode", "fallbackApplied"], "content-safety"),
  entity_audit_issue: c("entity_audit_issue", "content_quality", "Entity audit issue detected.", sessionIdentity, ["requestId", "issueCodes"], ["byCode"], "content-safety"),
  pacing_validator_issue: c("pacing_validator_issue", "content_quality", "Pacing validator issue detected.", sessionIdentity, ["requestId", "issueCodes"], ["byCode"], "content-safety"),
  safety_fallback_used: c("safety_fallback_used", "content_quality", "Safety fallback was applied.", sessionIdentity, ["requestId", "decision"], ["fallbackApplied"], "content-safety"),
  unknown_entity_blocked: c("unknown_entity_blocked", "content_quality", "Unknown entity write or claim was blocked.", sessionIdentity, ["requestId", "issueCodes"], ["blockedCommitFields"], "content-safety"),
  prompt_injection_blocked: c("prompt_injection_blocked", "content_quality", "Prompt-injection attempt was blocked.", sessionIdentity, ["requestId", "issueCodes"], ["mode"], "content-safety"),
} as const satisfies Record<AnalyticsEventName, AnalyticsEventContract>;

export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENT_TAXONOMY) as AnalyticsEventName[];

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function collectSensitivePayloadKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSensitivePayloadKeys(item, `${prefix}[${index}]`));
  }
  const hits: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/(^|[_-])(password|session[_-]?cookie|database[_-]?url|ai[_-]?key|api[_-]?key|authorization|auth[_-]?token|secret)$/i.test(key)) {
      hits.push(path);
    }
    hits.push(...collectSensitivePayloadKeys(nested, path));
  }
  return hits;
}

export function getAnalyticsEventContract(eventName: AnalyticsEventName | string): AnalyticsEventContract | null {
  return (ANALYTICS_EVENT_TAXONOMY as Record<string, AnalyticsEventContract | undefined>)[eventName] ?? null;
}

export function validateAnalyticsEventContract(
  input: AnalyticsEventContractValidationInput
): AnalyticsEventContractValidationResult {
  const eventName = String(input.eventName ?? "");
  const contract = getAnalyticsEventContract(eventName);
  if (!contract) {
    return {
      ok: false,
      eventName,
      degraded: true,
      reason: "unknown_event",
      missingIdentity: [],
      missingPayloadKeys: [],
      sensitivePayloadKeys: [],
      contract: null,
    };
  }

  const identity: Record<AnalyticsIdentityKey, unknown> = {
    actorId: input.actorId,
    userId: input.userId,
    guestId: input.guestId,
    sessionId: input.sessionId,
  };
  const payload = input.payload ?? {};
  const missingIdentity = contract.requiredIdentity.filter((key) => !hasValue(identity[key]));
  const missingPayloadKeys = contract.requiredPayloadKeys.filter((key) => !hasValue(payload[key]));
  const sensitivePayloadKeys = collectSensitivePayloadKeys(payload);
  const reason =
    missingIdentity.length > 0
      ? "missing_identity"
      : missingPayloadKeys.length > 0
        ? "missing_payload_keys"
        : sensitivePayloadKeys.length > 0
          ? "sensitive_payload_keys"
          : "ok";

  return {
    ok: reason === "ok",
    eventName,
    degraded: reason !== "ok",
    reason,
    missingIdentity,
    missingPayloadKeys,
    sensitivePayloadKeys,
    contract,
  };
}
