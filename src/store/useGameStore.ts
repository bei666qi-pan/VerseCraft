"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type { Item, StatType } from "@/lib/registry/types";
import { ITEMS } from "@/lib/registry/items";

const DB_KEY = "versecraft-storage";

const idbStorage: import("zustand/middleware").StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await get(name);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch {
      /* ignore */
    }
  },
};

interface PerformCheckResult {
  success: boolean;
  narrative: string;
}

// 1. 扩充天赋类型
export type EchoTalent =
  | "时间回溯"
  | "命运馈赠"
  | "主角光环"
  | "生命汇源"
  | "洞察之眼"
  | "丧钟回响";

const ECHO_TALENTS: readonly EchoTalent[] = [
  "时间回溯",
  "命运馈赠",
  "主角光环",
  "生命汇源",
  "洞察之眼",
  "丧钟回响",
] as const;

const DEFAULT_TALENT_COOLDOWNS: Record<EchoTalent, number> = {
  时间回溯: 0,
  命运馈赠: 0,
  主角光环: 0,
  生命汇源: 0,
  洞察之眼: 0,
  丧钟回响: 0,
};

interface GameState {
  currentSaveSlot: string;
  isHydrated: boolean;

  // --- 新增角色档案 ---
  playerName: string;
  gender: string;
  height: number;
  personality: string;
  talent: EchoTalent | null;
  talentCooldowns: Record<EchoTalent, number>;
  chapter: number;

  // 基础属性 (理智, 敏捷, 幸运, 魅力, 出身)
  stats: Record<StatType, number>;

  inventory: Item[];
  logs: { role: string; content: string; reasoning?: string }[];

  setHydrated: (state: boolean) => void;
  pushLog: (entry: { role: string; content: string; reasoning?: string }) => void;
  setStats: (stats: Partial<Record<StatType, number>>) => void;
  setInventory: (inventory: Item[]) => void;
  addToInventory: (item: Item) => void;
  removeFromInventory: (itemId: string) => void;

  // 核心 Action
  initCharacter: (
    profile: { name: string; gender: string; height: number; personality: string },
    stats: Record<StatType, number>,
    talent: EchoTalent
  ) => void;

  // 终极逻辑闭环：为大模型生成系统提示词的上下文
  getPromptContext: () => string;

  performCheck: (
    baseStat: StatType,
    anomalyThreshold: number,
    anomalyWeaknessTags: string
  ) => PerformCheckResult;
}

const DEFAULT_STATS: Record<StatType, number> = {
  sanity: 3,
  agility: 3,
  luck: 3,
  charm: 3,
  background: 3,
};

function parseTags(tagsStr: string): string[] {
  return tagsStr
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function pickStartingItemByBackground(background: number): Item {
  const dItems = ITEMS.filter((i) => i.tier === "D");
  const bItems = ITEMS.filter((i) => i.tier === "B");
  const aItems = ITEMS.filter((i) => i.tier === "A");

  const safePick = (pool: Item[], fallback: Item): Item => {
    if (pool.length === 0) return fallback;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx] ?? fallback;
  };

  const fallback = dItems[0] ?? ITEMS[0]!;

  const highTierChance = clamp01((background || 0) * 0.1);
  const roll = Math.random();

  if (roll < highTierChance) {
    const aChance = clamp01((background - 6) / 20);
    const chooseA = Math.random() < aChance;
    return chooseA
      ? safePick(aItems, safePick(bItems, fallback))
      : safePick(bItems, safePick(aItems, fallback));
  }

  return safePick(dItems, fallback);
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      currentSaveSlot: "slot_1",
      isHydrated: false,
      playerName: "",
      gender: "",
      height: 170,
      personality: "",
      talent: null,
      talentCooldowns: { ...DEFAULT_TALENT_COOLDOWNS },
      chapter: 1,
      stats: { ...DEFAULT_STATS },
      inventory: [],
      logs: [],

      setHydrated: (state) => set({ isHydrated: state }),

      pushLog: (entry) =>
        set((s) => ({ logs: [...(s.logs ?? []), entry] })),

      setStats: (stats) =>
        set((s) => ({ stats: { ...s.stats, ...stats } })),

      setInventory: (inventory) => set({ inventory }),

      addToInventory: (item) =>
        set((s) => ({
          inventory: s.inventory.some((i) => i.id === item.id)
            ? s.inventory
            : [...s.inventory, item],
        })),

      removeFromInventory: (itemId) =>
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== itemId),
        })),

      initCharacter: (profile, stats, talent) => {
        const background = stats.background ?? DEFAULT_STATS.background;
        const startingItem = pickStartingItemByBackground(background);

        set({
          playerName: profile.name,
          gender: profile.gender,
          height: profile.height,
          personality: profile.personality,
          talent,
          talentCooldowns: { ...DEFAULT_TALENT_COOLDOWNS },
          chapter: 1,
          stats,
          inventory: [startingItem],
        });
      },

      getPromptContext: () => {
        const s = get();
        const inv = s.inventory
          .map((i) => `${i.name}[${i.id}|${i.tier}]`)
          .join("，");

        const statsText =
          `理智[${s.stats.sanity}]，` +
          `敏捷[${s.stats.agility}]，` +
          `幸运[${s.stats.luck}]，` +
          `魅力[${s.stats.charm}]，` +
          `出身[${s.stats.background}]`;

        const talentText = s.talent ? `回响天赋[${s.talent}]` : "回响天赋[未选择]";

        return (
          `玩家档案：姓名[${s.playerName || "未命名"}]，` +
          `性别[${s.gender || "未设定"}]，` +
          `身高[${s.height || 0}cm]，` +
          `性格[${s.personality || "未设定"}]。` +
          `章节[${s.chapter}]。` +
          `当前属性：${statsText}。` +
          `${talentText}。` +
          `物品清单：${inv || "空"}。` +
          `天赋冷却：${ECHO_TALENTS.map((t) => `${t}[${s.talentCooldowns[t]}章]`).join("，")}。`
        );
      },

      performCheck: (
        baseStat,
        anomalyThreshold,
        anomalyWeaknessTags
      ): PerformCheckResult => {
        const state = get();

        const weaknessTags = parseTags(anomalyWeaknessTags);

        const hasWeakness = state.inventory.some((item) => {
          const itemTags = parseTags(item.tags);
          return itemTags.some((tag) => weaknessTags.includes(tag));
        });

        if (hasWeakness) {
          return {
            success: true,
            narrative: "利用针对性物品成功破局。",
          };
        }

        const statValue = state.stats[baseStat] ?? 0;

        const itemBonus = state.inventory.reduce((sum, item) => {
          const bonus = item.statBonus?.[baseStat] ?? 0;
          return sum + bonus;
        }, 0);

        const rng = Math.floor(Math.random() * 10) + 1;

        const total = statValue + itemBonus + rng;

        if (total >= anomalyThreshold) {
          return {
            success: true,
            narrative: "凭借自身能力与运气险险生还。",
          };
        }

        return {
          success: false,
          narrative: "判定失败，陷入致命危机。",
        };
      },
    }),
    {
      name: DB_KEY,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => ({
        currentSaveSlot: s.currentSaveSlot,
        playerName: s.playerName,
        gender: s.gender,
        height: s.height,
        personality: s.personality,
        talent: s.talent,
        talentCooldowns: s.talentCooldowns,
        chapter: s.chapter,
        stats: s.stats,
        inventory: s.inventory,
        logs: s.logs ?? [],
      }),
    }
  )
);
