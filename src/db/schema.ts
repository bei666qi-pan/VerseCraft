import { relations, sql } from "drizzle-orm";
import { boolean, date, int, json, mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    tokensUsed: int("tokens_used").notNull().default(0),
    todayTokensUsed: int("today_tokens_used").notNull().default(0),
    playTime: int("play_time").notNull().default(0),
    todayPlayTime: int("today_play_time").notNull().default(0),
    lastDataReset: timestamp("last_data_reset").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActive: timestamp("last_active").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameUnique: uniqueIndex("users_name_unique").on(table.name),
  })
);

export const feedbacks = mysqlTable("feedbacks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 191 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const gameRecords = mysqlTable("game_records", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 191 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  killedAnomalies: int("killed_anomalies").notNull().default(0),
  maxFloorScore: int("max_floor_score").notNull().default(0),
  survivalTimeSeconds: int("survival_time_seconds").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const gameSessionMemory = mysqlTable("game_session_memory", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  plotSummary: text("plot_summary"),
  playerStatus: json("player_status").$type<Record<string, unknown>>(),
  npcRelationships: json("npc_relationships").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const userOnboarding = mysqlTable("user_onboarding", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  codexFirstViewDone: int("codex_first_view_done", { unsigned: true })
    .notNull()
    .default(0),
  warehouseFirstViewDone: int("warehouse_first_view_done", { unsigned: true })
    .notNull()
    .default(0),
  tasksFirstViewDone: int("tasks_first_view_done", { unsigned: true })
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const usersQuota = mysqlTable("users_quota", {
  userId: varchar("user_id", { length: 191 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyTokens: int("daily_tokens", { unsigned: true }).notNull().default(0),
  dailyActions: int("daily_actions", { unsigned: true }).notNull().default(0),
  lastActionDate: date("last_action_date").notNull().default(sql`(CURDATE())`),
  isBanned: boolean("is_banned").notNull().default(false),
});

export const saveSlots = mysqlTable(
  "save_slots",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slotId: varchar("slot_id", { length: 64 }).notNull(),
    data: json("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow(),
  },
  (table) => ({
    userSlotUnique: uniqueIndex("save_slots_user_slot_unique").on(table.userId, table.slotId),
  })
);

export const adminStatsSnapshots = mysqlTable("admin_stats_snapshots", {
  date: date("date").primaryKey(),
  totalUsers: int("total_users").notNull().default(0),
  totalTokens: int("total_tokens").notNull().default(0),
  activeUsers: int("active_users").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

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
