import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    tokensUsed: integer("tokens_used").notNull().default(0),
    todayTokensUsed: integer("today_tokens_used").notNull().default(0),
    playTime: integer("play_time").notNull().default(0),
    todayPlayTime: integer("today_play_time").notNull().default(0),
    lastDataReset: timestamp("last_data_reset").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActive: timestamp("last_active").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameUnique: uniqueIndex("users_name_unique").on(table.name),
  })
);

export const feedbacks = pgTable("feedbacks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 191 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** 合规联系 / 举报 / 数据权利请求等最小留痕（非完整工单系统）。 */
export const complianceInquiries = pgTable(
  "compliance_inquiries",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    topic: varchar("topic", { length: 32 }).notNull(),
    contactLine: varchar("contact_line", { length: 512 }),
    body: text("body").notNull(),
    userId: varchar("user_id", { length: 191 }).references(() => users.id, { onDelete: "set null" }),
    ipHash: varchar("ip_hash", { length: 64 }),
    clientMeta: jsonb("client_meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    createdIdx: index("compliance_inquiries_created_idx").on(table.createdAt),
    topicIdx: index("compliance_inquiries_topic_idx").on(table.topic),
    ipCreatedIdx: index("compliance_inquiries_ip_created_idx").on(table.ipHash, table.createdAt),
  })
);

export const gameRecords = pgTable("game_records", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 191 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  killedAnomalies: integer("killed_anomalies").notNull().default(0),
  maxFloorScore: integer("max_floor_score").notNull().default(0),
  survivalTimeSeconds: integer("survival_time_seconds").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const gameSessionMemory = pgTable("game_session_memory", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  plotSummary: text("plot_summary"),
  playerStatus: jsonb("player_status").$type<Record<string, unknown>>(),
  npcRelationships: jsonb("npc_relationships").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
});

export const userOnboarding = pgTable("user_onboarding", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  codexFirstViewDone: integer("codex_first_view_done")
    .notNull()
    .default(0),
  warehouseFirstViewDone: integer("warehouse_first_view_done")
    .notNull()
    .default(0),
  tasksFirstViewDone: integer("tasks_first_view_done")
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
});

export const usersQuota = pgTable("users_quota", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyTokens: integer("daily_tokens").notNull().default(0),
  dailyActions: integer("daily_actions").notNull().default(0),
  lastActionDate: date("last_action_date").notNull().default(sql`CURRENT_DATE`),
  isBanned: boolean("is_banned").notNull().default(false),
});

export const saveSlots = pgTable(
  "save_slots",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slotId: varchar("slot_id", { length: 64 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userSlotUnique: uniqueIndex("save_slots_user_slot_unique").on(table.userId, table.slotId),
  })
);

export const adminStatsSnapshots = pgTable("admin_stats_snapshots", {
  date: date("date").primaryKey(),
  totalUsers: integer("total_users").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  activeUsers: integer("active_users").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * ========= Analytics Data Foundation =========
 *
 * All analytics are event-driven.
 * - `analyticsEvents`: append-only event log (idempotent via idempotencyKey)
 * - `userSessions`: session rollup (best-effort, updated on chat completion events)
 * - `userDailyActivity`: DAU/retention foundation (exists if at least one active event occurred)
 * - `userDailyTokens`: daily spend/usage foundation
 * - `adminMetricsDaily`: admin dashboard daily aggregates (used by charts)
 *
 * Notes:
 * - We keep existing `users` cumulative fields for compatibility.
 * - Current stage only records chat completion + a few key actions (register/feedback/game/onboarding).
 * - Retention/cohort can be computed from userDailyActivity + user_registered events with exact date keys.
 */

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    eventId: varchar("event_id", { length: 191 }).primaryKey(),
    userId: varchar("user_id", { length: 191 })
      .references(() => users.id, { onDelete: "cascade" })
      ,
    sessionId: varchar("session_id", { length: 191 }).notNull(),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),

    page: text("page"),
    source: text("source"),
    platform: text("platform"),

    tokenCost: integer("token_cost").notNull().default(0),
    playDurationDeltaSec: integer("play_duration_delta_sec").notNull().default(0),

    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("analytics_events_idempotency_unique").on(table.idempotencyKey),
    userEventTimeIdx: index("analytics_events_user_event_time_idx").on(table.userId, table.eventTime),
    eventNameTimeIdx: index("analytics_events_event_name_time_idx").on(table.eventName, table.eventTime),
    sessionIdx: index("analytics_events_session_id_idx").on(table.sessionId),
    pageTimeIdx: index("analytics_events_page_time_idx").on(table.page, table.eventTime),
  })
);

export const userSessions = pgTable(
  "user_sessions",
  {
    sessionId: varchar("session_id", { length: 191 }).primaryKey(),
    userId: varchar("user_id", { length: 191 })
      .references(() => users.id, { onDelete: "cascade" })
      ,
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    lastPage: text("last_page"),

    totalTokenCost: integer("total_token_cost").notNull().default(0),
    totalPlayDurationSec: integer("total_play_duration_sec").notNull().default(0),
    chatActionCount: integer("chat_action_count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userLastSeenIdx: index("user_sessions_user_last_seen_idx").on(table.userId, table.lastSeenAt),
  })
);

export const userDailyActivity = pgTable(
  "user_daily_activity",
  {
    userId: varchar("user_id", { length: 191 })
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    dateKey: date("date_key").notNull(),
    firstActiveAt: timestamp("first_active_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    chatActionCount: integer("chat_action_count").notNull().default(0),
  },
  (table) => ({
    userDateUnique: uniqueIndex("user_daily_activity_user_date_unique").on(table.userId, table.dateKey),
    dateKeyIdx: index("user_daily_activity_date_key_idx").on(table.dateKey),
    userIdx: index("user_daily_activity_user_idx").on(table.userId),
  })
);

export const userDailyTokens = pgTable(
  "user_daily_tokens",
  {
    userId: varchar("user_id", { length: 191 })
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    dateKey: date("date_key").notNull(),
    dailyTokenCost: integer("daily_token_cost").notNull().default(0),
    dailyPlayDurationSec: integer("daily_play_duration_sec").notNull().default(0),
    chatActionCount: integer("chat_action_count").notNull().default(0),
  },
  (table) => ({
    userDateUnique: uniqueIndex("user_daily_tokens_user_date_unique").on(table.userId, table.dateKey),
    dateKeyIdx: index("user_daily_tokens_date_key_idx").on(table.dateKey),
    userIdx: index("user_daily_tokens_user_idx").on(table.userId),
  })
);

export const adminMetricsDaily = pgTable(
  "admin_metrics_daily",
  {
    dateKey: date("date_key").primaryKey(),
    dau: integer("dau").notNull().default(0),
    wau: integer("wau").notNull().default(0),
    mau: integer("mau").notNull().default(0),

    newUsers: integer("new_users").notNull().default(0),

    totalTokenCost: integer("total_token_cost").notNull().default(0),
    totalPlayDurationSec: integer("total_play_duration_sec").notNull().default(0),
    chatActions: integer("chat_actions").notNull().default(0),

    feedbackSubmittedCount: integer("feedback_submitted_count").notNull().default(0),
    gameCompletedCount: integer("game_completed_count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    dateKeyIdx: index("admin_metrics_daily_date_key_idx").on(table.dateKey),
  })
);

export const usersQuotaRelations = relations(usersQuota, ({ one }) => ({
  user: one(users, {
    fields: [usersQuota.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  feedbacks: many(feedbacks),
  gameRecords: many(gameRecords),
  saveSlots: many(saveSlots),
  onboarding: one(userOnboarding),
  sessionMemory: one(gameSessionMemory),
  quota: one(usersQuota),
}));

export const gameSessionMemoryRelations = relations(gameSessionMemory, ({ one }) => ({
  user: one(users, {
    fields: [gameSessionMemory.userId],
    references: [users.id],
  }),
}));

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  user: one(users, {
    fields: [feedbacks.userId],
    references: [users.id],
  }),
}));

export const gameRecordsRelations = relations(gameRecords, ({ one }) => ({
  user: one(users, {
    fields: [gameRecords.userId],
    references: [users.id],
  }),
}));

export const saveSlotsRelations = relations(saveSlots, ({ one }) => ({
  user: one(users, {
    fields: [saveSlots.userId],
    references: [users.id],
  }),
}));

export const userOnboardingRelations = relations(userOnboarding, ({ one }) => ({
  user: one(users, {
    fields: [userOnboarding.userId],
    references: [users.id],
  }),
}));

/**
 * ========= World Knowledge (world_* tables) =========
 *
 * 目标：
 * - DB 为事实源（后续给 RAG 检索注入）
 * - registry 作为 seed/fallback（不在运行时承担事实源职责）
 *
 * 注意：
 * - contentTsv / embeddingVector 在 schema.ts 中用 `text` 映射，以保证在缺少 pgvector/tsvector
 *   时仍可编译；运行时表类型由 `src/db/ensureSchema.ts` 建表兜底。
 */

export const worldEntities = pgTable(
  "world_entities",
  {
    id: serial("id").primaryKey(),

    entityType: varchar("entity_type", { length: 32 }).notNull(),
    code: varchar("code", { length: 128 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),

    summary: text("summary"),
    detail: text("detail"),

    scope: varchar("scope", { length: 16 }).notNull(),
    ownerUserId: varchar("owner_user_id", { length: 191 }).references(() => users.id, { onDelete: "cascade" }),

    status: varchar("status", { length: 32 }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceRef: text("source_ref"),

    importance: integer("importance").notNull().default(0),
    version: integer("version").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    entityTypeCodeUnique: uniqueIndex("world_entities_type_code_unique").on(table.entityType, table.code),
    codeIdx: index("world_entities_code_idx").on(table.code),
    canonicalNameIdx: index("world_entities_canonical_name_idx").on(table.canonicalName),
    scopeIdx: index("world_entities_scope_idx").on(table.scope),
    ownerScopeIdx: index("world_entities_owner_scope_idx").on(table.ownerUserId, table.scope),
    typeStatusImportanceIdx: index("world_entities_type_status_importance_idx").on(
      table.entityType,
      table.status,
      table.importance
    ),
  })
);

export const worldEntityTags = pgTable(
  "world_entity_tags",
  {
    entityId: integer("entity_id")
      .notNull()
      .references(() => worldEntities.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 128 }).notNull(),
  },
  (table) => ({
    entityTagUnique: uniqueIndex("world_entity_tags_entity_tag_unique").on(table.entityId, table.tag),
    tagIdx: index("world_entity_tags_tag_idx").on(table.tag),
  })
);

export const worldEntityEdges = pgTable(
  "world_entity_edges",
  {
    id: serial("id").primaryKey(),
    fromEntityId: integer("from_entity_id")
      .notNull()
      .references(() => worldEntities.id, { onDelete: "cascade" }),
    toEntityId: integer("to_entity_id")
      .notNull()
      .references(() => worldEntities.id, { onDelete: "cascade" }),

    relationType: varchar("relation_type", { length: 32 }).notNull(),
    relationLabel: text("relation_label").notNull(),
    strength: integer("strength").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    edgesUnique: uniqueIndex("world_entity_edges_from_to_type_label_unique").on(
      table.fromEntityId,
      table.toEntityId,
      table.relationType,
      table.relationLabel
    ),
    fromToIdx: index("world_entity_edges_from_to_idx").on(table.fromEntityId, table.toEntityId),
    relationTypeIdx: index("world_entity_edges_relation_type_idx").on(table.relationType),
  })
);

export const worldKnowledgeChunks = pgTable(
  "world_knowledge_chunks",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => worldEntities.id, { onDelete: "cascade" }),

    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),

    /**
     * 运行时由 ensureSchema 建表为 `tsvector`。
     * schema.ts 中用 `text` 映射：让现阶段仍可编译并允许插入/读取为字符串。
     */
    contentTsv: text("content_tsv").notNull(),

    tokenEstimate: integer("token_estimate").notNull().default(0),
    importance: integer("importance").notNull().default(0),

    visibilityScope: varchar("visibility_scope", { length: 16 }).notNull(),
    ownerUserId: varchar("owner_user_id", { length: 191 }).references(() => users.id, { onDelete: "cascade" }),

    retrievalKey: varchar("retrieval_key", { length: 256 }),

    embeddingModel: varchar("embedding_model", { length: 64 }),
    embeddingStatus: varchar("embedding_status", { length: 32 }).notNull().default("pending"),
    /**
     * 运行时由 ensureSchema 建表为 `vector(256)`（若 pgvector 可用）或 TEXT（降级预留）。
     * schema.ts 中统一用 `text` 映射，允许向量/非向量两种实现平滑过渡。
     */
    embeddingVector: text("embedding_vector"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    entityChunkUnique: uniqueIndex("world_knowledge_chunks_entity_chunk_unique").on(table.entityId, table.chunkIndex),
    entityIdx: index("world_knowledge_chunks_entity_idx").on(table.entityId),
    visibilityScopeIdx: index("world_knowledge_chunks_visibility_scope_idx").on(table.visibilityScope),
    ownerScopeIdx: index("world_knowledge_chunks_owner_scope_idx").on(table.ownerUserId, table.visibilityScope),
    retrievalKeyIdx: index("world_knowledge_chunks_retrieval_key_idx").on(table.retrievalKey),
    embeddingStatusIdx: index("world_knowledge_chunks_embedding_status_idx").on(table.embeddingStatus),
  })
);

export const worldPlayerFacts = pgTable(
  "world_player_facts",
  {
    id: serial("id").primaryKey(),

    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 191 }).notNull(),

    factType: varchar("fact_type", { length: 32 }).notNull(),

    entityId: integer("entity_id").references(() => worldEntities.id, { onDelete: "set null" }),

    normalizedFact: text("normalized_fact").notNull(),
    rawFact: text("raw_fact").notNull(),
    confidence: integer("confidence").notNull().default(0),

    conflictStatus: varchar("conflict_status", { length: 64 }),
    approvedToShared: boolean("approved_to_shared").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userSessionIdx: index("world_player_facts_user_session_idx").on(table.userId, table.sessionId),
    factTypeIdx: index("world_player_facts_fact_type_idx").on(table.factType),
    entityIdx: index("world_player_facts_entity_idx").on(table.entityId),
  })
);

export const worldRetrievalCacheSnapshots = pgTable(
  "world_retrieval_cache_snapshots",
  {
    cacheKey: varchar("cache_key", { length: 255 }).primaryKey(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    expiresAtIdx: index("world_retrieval_cache_snapshots_expires_at_idx").on(table.expiresAt),
  })
);

export const worldEngineRuns = pgTable(
  "world_engine_runs",
  {
    runId: serial("run_id").primaryKey(),
    dedupKey: varchar("dedup_key", { length: 128 }).notNull(),
    requestId: varchar("request_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 191 }).notNull(),
    triggerSignals: jsonb("trigger_signals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    modelTask: varchar("model_task", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    dedupUnique: uniqueIndex("world_engine_runs_dedup_unique").on(table.dedupKey),
    sessionCreatedIdx: index("world_engine_runs_session_created_idx").on(table.sessionId, table.createdAt),
    statusCreatedIdx: index("world_engine_runs_status_created_idx").on(table.status, table.createdAt),
  })
);

export const worldEngineEventQueue = pgTable(
  "world_engine_event_queue",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => worldEngineRuns.runId, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).references(() => users.id, { onDelete: "cascade" }),
    eventCode: varchar("event_code", { length: 128 }).notNull(),
    title: text("title").notNull(),
    dueInTurns: integer("due_in_turns").notNull().default(1),
    priority: varchar("priority", { length: 16 }).notNull().default("low"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionStatusDueIdx: index("world_engine_event_queue_session_status_due_idx").on(table.sessionId, table.status, table.dueInTurns),
    eventCodeIdx: index("world_engine_event_queue_event_code_idx").on(table.eventCode),
  })
);

export const worldEngineAgendaSnapshots = pgTable(
  "world_engine_agenda_snapshots",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => worldEngineRuns.runId, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).references(() => users.id, { onDelete: "cascade" }),
    agendaRevision: integer("agenda_revision").notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionRevisionUnique: uniqueIndex("world_engine_agenda_session_revision_unique").on(table.sessionId, table.agendaRevision),
    sessionCreatedIdx: index("world_engine_agenda_session_created_idx").on(table.sessionId, table.createdAt),
  })
);

export const aiAnalysisSnapshots = pgTable(
  "ai_analysis_snapshots",
  {
    id: serial("id").primaryKey(),
    task: varchar("task", { length: 64 }).notNull(),
    scopeKey: varchar("scope_key", { length: 191 }).notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    modelRole: varchar("model_role", { length: 32 }).notNull().default("none"),
    dataRevision: varchar("data_revision", { length: 128 }).notNull().default(""),
    staleAt: timestamp("stale_at", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskScopeUnique: uniqueIndex("ai_analysis_task_scope_unique").on(table.task, table.scopeKey),
    staleIdx: index("ai_analysis_stale_idx").on(table.staleAt),
  })
);
