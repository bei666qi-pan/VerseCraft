import { sql } from "drizzle-orm";
import { int, json, mysqlTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    tokensUsed: int("tokens_used").notNull().default(0),
    playTime: int("play_time").notNull().default(0),
    lastActive: timestamp("last_active").notNull().defaultNow(),
  },
  (table) => ({
    nameUnique: uniqueIndex("users_name_unique").on(table.name),
  })
);

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
