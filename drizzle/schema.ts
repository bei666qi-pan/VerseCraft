import { pgTable, uniqueIndex, index, foreignKey, varchar, date, integer, timestamp, text, bigserial, boolean, jsonb, serial, unique, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const actorDailyTokens = pgTable("actor_daily_tokens", {
	actorId: varchar("actor_id", { length: 191 }).notNull(),
	actorType: varchar("actor_type", { length: 16 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	dateKey: date("date_key").notNull(),
	dailyTokenCost: integer("daily_token_cost").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
	activePlaySec: integer("active_play_sec").default(0).notNull(),
}, (table) => [
	uniqueIndex("actor_daily_tokens_actor_date_unique").using("btree", table.actorId.asc().nullsLast().op("text_ops"), table.dateKey.asc().nullsLast().op("text_ops")),
	index("actor_daily_tokens_actor_idx").using("btree", table.actorId.asc().nullsLast().op("text_ops")),
	index("actor_daily_tokens_date_idx").using("btree", table.dateKey.asc().nullsLast().op("date_ops")),
	index("actor_daily_tokens_guest_idx").using("btree", table.guestId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "actor_daily_tokens_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const actorSessions = pgTable("actor_sessions", {
	sessionId: varchar("session_id", { length: 191 }).primaryKey().notNull(),
	actorId: varchar("actor_id", { length: 191 }).notNull(),
	actorType: varchar("actor_type", { length: 16 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastPage: text("last_page"),
	totalTokenCost: integer("total_token_cost").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
	onlineSec: integer("online_sec").default(0).notNull(),
	activePlaySec: integer("active_play_sec").default(0).notNull(),
	readSec: integer("read_sec").default(0).notNull(),
	idleSec: integer("idle_sec").default(0).notNull(),
	lastPresenceOkAt: timestamp("last_presence_ok_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("actor_sessions_actor_last_seen_idx").using("btree", table.actorId.asc().nullsLast().op("text_ops"), table.lastSeenAt.asc().nullsLast().op("timestamptz_ops")),
	index("actor_sessions_guest_last_seen_idx").using("btree", table.guestId.asc().nullsLast().op("timestamptz_ops"), table.lastSeenAt.asc().nullsLast().op("text_ops")),
	index("actor_sessions_user_last_seen_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.lastSeenAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "actor_sessions_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const analyticsActors = pgTable("analytics_actors", {
	actorId: varchar("actor_id", { length: 191 }).primaryKey().notNull(),
	actorType: varchar("actor_type", { length: 16 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("analytics_actors_actor_type_idx").using("btree", table.actorType.asc().nullsLast().op("text_ops")),
	index("analytics_actors_guest_id_idx").using("btree", table.guestId.asc().nullsLast().op("text_ops")),
	index("analytics_actors_last_seen_idx").using("btree", table.lastSeenAt.asc().nullsLast().op("timestamptz_ops")),
	index("analytics_actors_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "analytics_actors_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	action: varchar({ length: 96 }).notNull(),
	actor: varchar({ length: 96 }).notNull(),
	success: boolean().default(false).notNull(),
	reason: varchar({ length: 191 }),
	ipHash: varchar("ip_hash", { length: 64 }),
	userAgentHash: varchar("user_agent_hash", { length: 64 }),
	targetType: varchar("target_type", { length: 64 }),
	targetId: varchar("target_id", { length: 191 }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("admin_audit_logs_action_created_idx").using("btree", table.action.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("admin_audit_logs_actor_created_idx").using("btree", table.actor.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("admin_audit_logs_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const adminMetricsDaily = pgTable("admin_metrics_daily", {
	dateKey: date("date_key").primaryKey().notNull(),
	dau: integer().default(0).notNull(),
	wau: integer().default(0).notNull(),
	mau: integer().default(0).notNull(),
	newUsers: integer("new_users").default(0).notNull(),
	totalTokenCost: integer("total_token_cost").default(0).notNull(),
	totalPlayDurationSec: integer("total_play_duration_sec").default(0).notNull(),
	chatActions: integer("chat_actions").default(0).notNull(),
	feedbackSubmittedCount: integer("feedback_submitted_count").default(0).notNull(),
	gameCompletedCount: integer("game_completed_count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("admin_metrics_daily_date_key_idx").using("btree", table.dateKey.asc().nullsLast().op("date_ops")),
]);

export const adminStatsSnapshots = pgTable("admin_stats_snapshots", {
	date: date().primaryKey().notNull(),
	totalUsers: integer("total_users").default(0).notNull(),
	totalTokens: integer("total_tokens").default(0).notNull(),
	activeUsers: integer("active_users").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const aiAnalysisSnapshots = pgTable("ai_analysis_snapshots", {
	id: serial().primaryKey().notNull(),
	task: varchar({ length: 64 }).notNull(),
	scopeKey: varchar("scope_key", { length: 191 }).notNull(),
	inputJson: jsonb("input_json").default({}).notNull(),
	outputJson: jsonb("output_json").default({}).notNull(),
	modelRole: varchar("model_role", { length: 32 }).default('none').notNull(),
	dataRevision: varchar("data_revision", { length: 128 }).default("").notNull(),
	staleAt: timestamp("stale_at", { withTimezone: true, mode: 'string' }).notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("ai_analysis_stale_idx").using("btree", table.staleAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("ai_analysis_task_scope_unique").using("btree", table.task.asc().nullsLast().op("text_ops"), table.scopeKey.asc().nullsLast().op("text_ops")),
]);

export const analyticsEvents = pgTable("analytics_events", {
	eventId: varchar("event_id", { length: 191 }).primaryKey().notNull(),
	actorId: varchar("actor_id", { length: 191 }),
	actorType: varchar("actor_type", { length: 16 }),
	guestId: varchar("guest_id", { length: 128 }),
	userId: varchar("user_id", { length: 191 }),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	eventName: varchar("event_name", { length: 64 }).notNull(),
	eventTime: timestamp("event_time", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	page: text(),
	source: text(),
	platform: text(),
	environment: varchar({ length: 16 }).default('production').notNull(),
	tokenCost: integer("token_cost").default(0).notNull(),
	playDurationDeltaSec: integer("play_duration_delta_sec").default(0).notNull(),
	onlineDurationDeltaSec: integer("online_duration_delta_sec").default(0).notNull(),
	activePlayDurationDeltaSec: integer("active_play_duration_delta_sec").default(0).notNull(),
	readDurationDeltaSec: integer("read_duration_delta_sec").default(0).notNull(),
	idleDurationDeltaSec: integer("idle_duration_delta_sec").default(0).notNull(),
	payload: jsonb().default({}).notNull(),
	idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("analytics_events_actor_event_time_idx").using("btree", table.actorId.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("text_ops")),
	index("analytics_events_event_name_time_idx").using("btree", table.eventName.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("timestamptz_ops")),
	index("analytics_events_guest_event_time_idx").using("btree", table.guestId.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("analytics_events_idempotency_unique").using("btree", table.idempotencyKey.asc().nullsLast().op("text_ops")),
	index("analytics_events_page_time_idx").using("btree", table.page.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("text_ops")),
	index("analytics_events_session_event_time_idx").using("btree", table.sessionId.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("timestamptz_ops")),
	index("analytics_events_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("analytics_events_user_event_time_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.eventTime.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "analytics_events_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const complianceInquiries = pgTable("compliance_inquiries", {
	id: serial().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	topic: varchar({ length: 32 }).notNull(),
	contactLine: varchar("contact_line", { length: 512 }),
	body: text().notNull(),
	userId: varchar("user_id", { length: 191 }),
	ipHash: varchar("ip_hash", { length: 64 }),
	clientMeta: jsonb("client_meta").default({}).notNull(),
}, (table) => [
	index("compliance_inquiries_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("compliance_inquiries_ip_created_idx").using("btree", table.ipHash.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("compliance_inquiries_topic_idx").using("btree", table.topic.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "compliance_inquiries_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const feedbacks = pgTable("feedbacks", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	content: text().notNull(),
	kind: varchar({ length: 24 }).default('open').notNull(),
	clientMeta: jsonb("client_meta").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("feedbacks_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("feedbacks_guest_id_idx").using("btree", table.guestId.asc().nullsLast().op("text_ops")),
	index("feedbacks_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "feedbacks_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const actorDailyActivity = pgTable("actor_daily_activity", {
	actorId: varchar("actor_id", { length: 191 }).notNull(),
	actorType: varchar("actor_type", { length: 16 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	dateKey: date("date_key").notNull(),
	firstActiveAt: timestamp("first_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	sessionCount: integer("session_count").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
	onlineSec: integer("online_sec").default(0).notNull(),
	activePlaySec: integer("active_play_sec").default(0).notNull(),
	readSec: integer("read_sec").default(0).notNull(),
	idleSec: integer("idle_sec").default(0).notNull(),
}, (table) => [
	uniqueIndex("actor_daily_activity_actor_date_unique").using("btree", table.actorId.asc().nullsLast().op("text_ops"), table.dateKey.asc().nullsLast().op("text_ops")),
	index("actor_daily_activity_actor_idx").using("btree", table.actorId.asc().nullsLast().op("text_ops")),
	index("actor_daily_activity_date_idx").using("btree", table.dateKey.asc().nullsLast().op("date_ops")),
	index("actor_daily_activity_guest_idx").using("btree", table.guestId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "actor_daily_activity_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const guestAliases = pgTable("guest_aliases", {
	guestId: varchar("guest_id", { length: 128 }).primaryKey().notNull(),
	guestNo: bigserial("guest_no", { mode: "bigint" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	unique("guest_aliases_guest_no_unique").on(table.guestNo),
]);

export const guestDailyActivity = pgTable("guest_daily_activity", {
	guestId: varchar("guest_id", { length: 128 }).notNull(),
	dateKey: date("date_key").notNull(),
	firstActiveAt: timestamp("first_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
});

export const guestDailyTokens = pgTable("guest_daily_tokens", {
	guestId: varchar("guest_id", { length: 128 }).notNull(),
	dateKey: date("date_key").notNull(),
	dailyTokenCost: integer("daily_token_cost").default(0).notNull(),
	dailyPlayDurationSec: integer("daily_play_duration_sec").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
});

export const guestRegistry = pgTable("guest_registry", {
	guestId: varchar("guest_id", { length: 128 }).primaryKey().notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	totalPlayDurationSec: integer("total_play_duration_sec").default(0).notNull(),
	ua: text(),
	ipHash: varchar("ip_hash", { length: 64 }),
	platform: varchar({ length: 32 }).default('unknown').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const narrativeForeshadowLedger = pgTable("narrative_foreshadow_ledger", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	seedText: text("seed_text").notNull(),
	source: varchar({ length: 24 }).notNull(),
	plantedTurn: integer("planted_turn").notNull(),
	status: varchar({ length: 24 }).default('planted').notNull(),
	deadlineTurn: integer("deadline_turn"),
	importance: integer().default(0).notNull(),
	payoffTurn: integer("payoff_turn"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "narrative_foreshadow_ledger_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const npcAgentState = pgTable("npc_agent_state", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	npcId: varchar("npc_id", { length: 128 }).notNull(),
	stateJson: jsonb("state_json").default({}).notNull(),
	status: varchar({ length: 24 }).default('idle').notNull(),
	lastActiveTurn: integer("last_active_turn").default(0).notNull(),
	nextEligibleTurn: integer("next_eligible_turn").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "npc_agent_state_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const npcMemoryEntries = pgTable("npc_memory_entries", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	npcId: varchar("npc_id", { length: 128 }).notNull(),
	sessionId: varchar("session_id", { length: 191 }),
	userId: varchar("user_id", { length: 191 }),
	scope: varchar({ length: 32 }).notNull(),
	kind: varchar({ length: 32 }).notNull(),
	summary: text().notNull(),
	factIds: jsonb("fact_ids").default([]).notNull(),
	relatedEventIds: jsonb("related_event_ids").default([]).notNull(),
	salience: integer().default(50).notNull(),
	confidence: integer().default(80).notNull(),
	emotion: jsonb().default({}).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "npc_memory_entries_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const npcRelationEdges = pgTable("npc_relation_edges", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	fromNpcId: varchar("from_npc_id", { length: 128 }).notNull(),
	toNpcId: varchar("to_npc_id", { length: 128 }).notNull(),
	edgeJson: jsonb("edge_json").default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "npc_relation_edges_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const playerEchoCanon = pgTable("player_echo_canon", {
	userId: varchar("user_id", { length: 191 }).primaryKey().notNull(),
	totalRuns: integer("total_runs").default(0).notNull(),
	totalDeaths: integer("total_deaths").default(0).notNull(),
	endingsSeen: jsonb("endings_seen").default([]).notNull(),
	highestFloorScore: integer("highest_floor_score").default(0).notNull(),
	repeatedDeathCauses: jsonb("repeated_death_causes").default([]).notNull(),
	recurringNpcBonds: jsonb("recurring_npc_bonds").default({}).notNull(),
	unresolvedRegrets: jsonb("unresolved_regrets").default([]).notNull(),
	strongestChoices: jsonb("strongest_choices").default([]).notNull(),
	stableEchoSummary: text("stable_echo_summary").default("").notNull(),
	lastRunSummary: text("last_run_summary").default("").notNull(),
	echoIntensity: integer("echo_intensity").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "player_echo_canon_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const playerEchoEvents = pgTable("player_echo_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }),
	runId: varchar("run_id", { length: 191 }),
	eventType: varchar("event_type", { length: 64 }),
	targetType: varchar("target_type", { length: 32 }),
	targetId: varchar("target_id", { length: 128 }),
	summary: text().notNull(),
	emotionalWeight: integer("emotional_weight").default(50).notNull(),
	safetyLevel: integer("safety_level").default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "player_echo_events_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const narrativePacingLedger = pgTable("narrative_pacing_ledger", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	turnIndex: integer("turn_index").notNull(),
	register: varchar({ length: 24 }),
	beat: varchar({ length: 24 }),
	hookType: varchar("hook_type", { length: 24 }),
	imageryKeys: jsonb("imagery_keys").default([]).notNull(),
	isPayoff: boolean("is_payoff").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "narrative_pacing_ledger_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const narrativeRuns = pgTable("narrative_runs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	requestId: varchar("request_id", { length: 191 }).notNull(),
	sessionId: varchar("session_id", { length: 191 }),
	userId: varchar("user_id", { length: 191 }),
	turnIndex: integer("turn_index").default(0).notNull(),
	ttftMs: integer("ttft_ms"),
	totalLatencyMs: integer("total_latency_ms"),
	loreHitCount: integer("lore_hit_count").default(0).notNull(),
	validatorIssueCount: integer("validator_issue_count").default(0).notNull(),
	degradeReason: varchar("degrade_reason", { length: 128 }),
	commitFlags: jsonb("commit_flags").default([]).notNull(),
	meta: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "narrative_runs_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const safetyAuditEvents = pgTable("safety_audit_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	traceId: varchar("trace_id", { length: 191 }).notNull(),
	scene: varchar({ length: 64 }).notNull(),
	stage: varchar({ length: 16 }).notNull(),
	decision: varchar({ length: 16 }).notNull(),
	riskLevel: varchar("risk_level", { length: 16 }).notNull(),
	reasonCode: varchar("reason_code", { length: 128 }).notNull(),
	contentFingerprint: varchar("content_fingerprint", { length: 64 }).notNull(),
	actor: jsonb().default({}).notNull(),
	providerSummary: jsonb("provider_summary").default({}).notNull(),
	whitelist: jsonb().default({}).notNull(),
	meta: jsonb().default({}).notNull(),
});

export const settlementHistories = pgTable("settlement_histories", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	grade: varchar({ length: 2 }).notNull(),
	survivalTimeSeconds: integer("survival_time_seconds").notNull(),
	survivalDay: integer("survival_day").default(0).notNull(),
	survivalHour: integer("survival_hour").default(0).notNull(),
	killedAnomalies: integer("killed_anomalies").default(0).notNull(),
	maxFloorScore: integer("max_floor_score").default(0).notNull(),
	maxFloorLabel: varchar("max_floor_label", { length: 64 }).default("").notNull(),
	profession: varchar({ length: 64 }),
	recapSummary: text("recap_summary").notNull(),
	aiRecapSummary: text("ai_recap_summary"),
	isDead: boolean("is_dead").notNull(),
	hasEscaped: boolean("has_escaped").default(false).notNull(),
	outcome: varchar({ length: 16 }).notNull(),
	writingMarkdown: text("writing_markdown"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "settlement_histories_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const socialEventLedger = pgTable("social_event_ledger", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	eventId: varchar("event_id", { length: 128 }).notNull(),
	eventType: varchar("event_type", { length: 32 }).notNull(),
	actorKey: varchar("actor_key", { length: 512 }).notNull(),
	targetKey: varchar("target_key", { length: 512 }).notNull(),
	dedupKey: varchar("dedup_key", { length: 191 }).notNull(),
	turnIndex: integer("turn_index").default(0).notNull(),
	dueTurnIndex: integer("due_turn_index").default(0).notNull(),
	expiresTurnIndex: integer("expires_turn_index"),
	visibility: varchar({ length: 32 }).notNull(),
	playerRelevance: varchar("player_relevance", { length: 16 }).notNull(),
	escapeRelevance: varchar("escape_relevance", { length: 24 }).default('none').notNull(),
	knowledgeScope: varchar("knowledge_scope", { length: 32 }).notNull(),
	status: varchar({ length: 32 }).default('candidate').notNull(),
	eventJson: jsonb("event_json").default({}).notNull(),
	projectedAt: timestamp("projected_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "social_event_ledger_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const storyEvents = pgTable("story_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	requestId: varchar("request_id", { length: 191 }).notNull(),
	sessionId: varchar("session_id", { length: 191 }),
	userId: varchar("user_id", { length: 191 }),
	turnIndex: integer("turn_index").default(0).notNull(),
	worldId: varchar("world_id", { length: 64 }).default('base_apartment').notNull(),
	chapterId: varchar("chapter_id", { length: 64 }),
	sceneId: varchar("scene_id", { length: 128 }),
	actorType: varchar("actor_type", { length: 24 }).notNull(),
	actorId: varchar("actor_id", { length: 128 }),
	eventType: varchar("event_type", { length: 64 }).notNull(),
	summary: text().notNull(),
	payload: jsonb().default({}).notNull(),
	committed: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "story_events_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const saveSlots = pgTable("save_slots", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }).notNull(),
	slotId: varchar("slot_id", { length: 64 }).notNull(),
	data: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "save_slots_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const usersQuota = pgTable("users_quota", {
	userId: varchar("user_id", { length: 191 }).primaryKey().notNull(),
	dailyTokens: integer("daily_tokens").default(0).notNull(),
	dailyActions: integer("daily_actions").default(0).notNull(),
	lastActionDate: date("last_action_date").default(sql`CURRENT_DATE`).notNull(),
	isBanned: boolean("is_banned").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "users_quota_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userSessions = pgTable("user_sessions", {
	sessionId: varchar("session_id", { length: 191 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastPage: text("last_page"),
	totalTokenCost: integer("total_token_cost").default(0).notNull(),
	totalPlayDurationSec: integer("total_play_duration_sec").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
	lastPresenceOkAt: timestamp("last_presence_ok_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: varchar({ length: 191 }).primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	password: varchar({ length: 255 }).notNull(),
	tokensUsed: integer("tokens_used").default(0).notNull(),
	todayTokensUsed: integer("today_tokens_used").default(0).notNull(),
	playTime: integer("play_time").default(0).notNull(),
	todayPlayTime: integer("today_play_time").default(0).notNull(),
	lastDataReset: timestamp("last_data_reset", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastActive: timestamp("last_active", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const worldEngineAgendaSnapshots = pgTable("world_engine_agenda_snapshots", {
	id: serial().primaryKey().notNull(),
	runId: integer("run_id").notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	agendaRevision: integer("agenda_revision").notNull(),
	snapshotJson: jsonb("snapshot_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "world_engine_agenda_snapshots_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [worldEngineRuns.runId],
			name: "world_engine_agenda_snapshots_run_id_world_engine_runs_run_id_f"
		}).onDelete("cascade"),
]);

export const worldEntities = pgTable("world_entities", {
	id: serial().primaryKey().notNull(),
	entityType: varchar("entity_type", { length: 32 }).notNull(),
	code: varchar({ length: 128 }).notNull(),
	canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
	title: varchar({ length: 255 }),
	summary: text(),
	detail: text(),
	scope: varchar({ length: 16 }).notNull(),
	ownerUserId: varchar("owner_user_id", { length: 191 }),
	status: varchar({ length: 32 }).notNull(),
	sourceType: varchar("source_type", { length: 32 }).notNull(),
	sourceRef: text("source_ref"),
	importance: integer().default(0).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: "world_entities_owner_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const worldEngineDirectorState = pgTable("world_engine_director_state", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	turnIndex: integer("turn_index").default(0).notNull(),
	phase: varchar({ length: 24 }).default('quiet').notNull(),
	pacingJson: jsonb("pacing_json").default({}).notNull(),
	recentDirectorIntent: text("recent_director_intent"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	worldRevision: bigint("world_revision", { mode: "number" }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "world_engine_director_state_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const worldEntityEdges = pgTable("world_entity_edges", {
	id: serial().primaryKey().notNull(),
	fromEntityId: integer("from_entity_id").notNull(),
	toEntityId: integer("to_entity_id").notNull(),
	relationType: varchar("relation_type", { length: 32 }).notNull(),
	relationLabel: text("relation_label").notNull(),
	strength: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.fromEntityId],
			foreignColumns: [worldEntities.id],
			name: "world_entity_edges_from_entity_id_world_entities_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toEntityId],
			foreignColumns: [worldEntities.id],
			name: "world_entity_edges_to_entity_id_world_entities_id_fk"
		}).onDelete("cascade"),
]);

export const worldEntityTags = pgTable("world_entity_tags", {
	entityId: integer("entity_id").notNull(),
	tag: varchar({ length: 128 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [worldEntities.id],
			name: "world_entity_tags_entity_id_world_entities_id_fk"
		}).onDelete("cascade"),
]);

export const worldPlayerFacts = pgTable("world_player_facts", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }).notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	factType: varchar("fact_type", { length: 32 }).notNull(),
	entityId: integer("entity_id"),
	normalizedFact: text("normalized_fact").notNull(),
	rawFact: text("raw_fact").notNull(),
	confidence: integer().default(0).notNull(),
	conflictStatus: varchar("conflict_status", { length: 64 }),
	approvedToShared: boolean("approved_to_shared").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "world_player_facts_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [worldEntities.id],
			name: "world_player_facts_entity_id_world_entities_id_fk"
		}).onDelete("set null"),
]);

export const worldRetrievalCacheSnapshots = pgTable("world_retrieval_cache_snapshots", {
	cacheKey: varchar("cache_key", { length: 255 }).primaryKey().notNull(),
	payload: jsonb().default({}).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
});

export const gameSessionMemory = pgTable("game_session_memory", {
	userId: varchar("user_id", { length: 191 }).primaryKey().notNull(),
	plotSummary: text("plot_summary"),
	playerStatus: jsonb("player_status"),
	npcRelationships: jsonb("npc_relationships"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "game_session_memory_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const surveyResponses = pgTable("survey_responses", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 191 }),
	guestId: varchar("guest_id", { length: 128 }),
	surveyKey: varchar("survey_key", { length: 64 }).notNull(),
	surveyVersion: varchar("survey_version", { length: 32 }).notNull(),
	source: varchar({ length: 64 }).default('home_modal').notNull(),
	answers: jsonb().notNull(),
	freeText: text("free_text"),
	overallRating: integer("overall_rating"),
	recommendScore: integer("recommend_score"),
	contactIntent: boolean("contact_intent").default(false).notNull(),
	userAgreement: boolean("user_agreement").default(false).notNull(),
	privacyPolicy: boolean("privacy_policy").default(false).notNull(),
	clientMeta: jsonb("client_meta").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "survey_responses_user_id_users_id_fk"
		}).onDelete("set null"),
]);

export const userDailyActivity = pgTable("user_daily_activity", {
	userId: varchar("user_id", { length: 191 }).notNull(),
	dateKey: date("date_key").notNull(),
	firstActiveAt: timestamp("first_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_daily_activity_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userDailyTokens = pgTable("user_daily_tokens", {
	userId: varchar("user_id", { length: 191 }).notNull(),
	dateKey: date("date_key").notNull(),
	dailyTokenCost: integer("daily_token_cost").default(0).notNull(),
	dailyPlayDurationSec: integer("daily_play_duration_sec").default(0).notNull(),
	chatActionCount: integer("chat_action_count").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_daily_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userOnboarding = pgTable("user_onboarding", {
	userId: varchar("user_id", { length: 191 }).primaryKey().notNull(),
	codexFirstViewDone: integer("codex_first_view_done").default(0).notNull(),
	warehouseFirstViewDone: integer("warehouse_first_view_done").default(0).notNull(),
	tasksFirstViewDone: integer("tasks_first_view_done").default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_onboarding_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const worldEngineRuns = pgTable("world_engine_runs", {
	runId: serial("run_id").primaryKey().notNull(),
	dedupKey: varchar("dedup_key", { length: 128 }).notNull(),
	requestId: varchar("request_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	triggerSignals: jsonb("trigger_signals").default([]).notNull(),
	modelTask: varchar("model_task", { length: 64 }).notNull(),
	status: varchar({ length: 32 }).notNull(),
	outputJson: jsonb("output_json"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "world_engine_runs_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const worldEngineEventQueue = pgTable("world_engine_event_queue", {
	id: serial().primaryKey().notNull(),
	runId: integer("run_id").notNull(),
	sessionId: varchar("session_id", { length: 191 }).notNull(),
	userId: varchar("user_id", { length: 191 }),
	eventCode: varchar("event_code", { length: 128 }).notNull(),
	title: text().notNull(),
	dueInTurns: integer("due_in_turns").default(1).notNull(),
	priority: varchar({ length: 16 }).default('low').notNull(),
	payload: jsonb().default({}).notNull(),
	status: varchar({ length: 32 }).default('pending').notNull(),
	dueTurnIndex: integer("due_turn_index"),
	ttlTurns: integer("ttl_turns"),
	expiresTurnIndex: integer("expires_turn_index"),
	injectedTurnIndex: integer("injected_turn_index"),
	resolvedTurnIndex: integer("resolved_turn_index"),
	salience: integer().default(0).notNull(),
	agencyRisk: varchar("agency_risk", { length: 16 }),
	continuityRisk: varchar("continuity_risk", { length: 16 }),
	spoilerRisk: varchar("spoiler_risk", { length: 16 }),
	revealPolicy: varchar("reveal_policy", { length: 24 }),
	injectionHint: text("injection_hint"),
	agencyConstraints: jsonb("agency_constraints").default([]).notNull(),
	forbiddenOutcomes: jsonb("forbidden_outcomes").default([]).notNull(),
	dedupKey: varchar("dedup_key", { length: 191 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [worldEngineRuns.runId],
			name: "world_engine_event_queue_run_id_world_engine_runs_run_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "world_engine_event_queue_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const worldKnowledgeChunks = pgTable("world_knowledge_chunks", {
	id: serial().primaryKey().notNull(),
	entityId: integer("entity_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	contentTsv: text("content_tsv").notNull(),
	tokenEstimate: integer("token_estimate").default(0).notNull(),
	importance: integer().default(0).notNull(),
	visibilityScope: varchar("visibility_scope", { length: 16 }).notNull(),
	ownerUserId: varchar("owner_user_id", { length: 191 }),
	retrievalKey: varchar("retrieval_key", { length: 256 }),
	embeddingModel: varchar("embedding_model", { length: 64 }),
	embeddingStatus: varchar("embedding_status", { length: 32 }).default('pending').notNull(),
	embeddingVector: text("embedding_vector"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [worldEntities.id],
			name: "world_knowledge_chunks_entity_id_world_entities_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: "world_knowledge_chunks_owner_user_id_users_id_fk"
		}).onDelete("cascade"),
]);
