import { sql } from "drizzle-orm";
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
