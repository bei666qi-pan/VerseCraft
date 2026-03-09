import { relations, sql } from "drizzle-orm";
import { int, json, mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

export const usersRelations = relations(users, ({ many }) => ({
  feedbacks: many(feedbacks),
  gameRecords: many(gameRecords),
  saveSlots: many(saveSlots),
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
