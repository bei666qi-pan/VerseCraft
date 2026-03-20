import { relations, sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
