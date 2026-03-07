"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type { Item, StatType } from "@/lib/registry/types";
import { ITEMS } from "@/lib/registry/items";

export const PARCHMENT_ITEM: Item = {
  id: "I-PARCHMENT",
  name: "染血的羊皮纸",
  tier: "S",
  description:
    "三日之后，暗月降至；十日之后，一切终焉。本层徘徊着未知的诡异，不要相信任何轻易示好的住客。记住，暗月期间不要直视光源。",
  statBonus: {},
  tags: "lore,truth",
};

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

export interface GameTime {
  day: number;
  hour: number;
}

export interface CodexEntry {
  id: string;
  name: string;
  type: "npc" | "anomaly";
  favorability?: number;
  combatPower?: number;
  personality?: string;
  traits?: string;
  rules_discovered?: string;
}

interface GameState {
  currentSaveSlot: string;
  isHydrated: boolean;

  playerName: string;
  gender: string;
  height: number;
  personality: string;
  talent: EchoTalent | null;
  talentCooldowns: Record<EchoTalent, number>;

  /** Time tick: day 0-9+, hour 0-23. Advances 1h per successful action. */
  time: GameTime;

  stats: Record<StatType, number>;
  /** Max sanity ever reached; used by 生命汇源 talent */
  historicalMaxSanity: number;

  inventory: Item[];
  logs: { role: string; content: string; reasoning?: string }[];

  /** 图鉴：NPC/诡异情报，由 DM 通过 codex_updates 推送 */
  codex: Record<string, CodexEntry>;

  /** 新手引导：是否已阅读羊皮纸 */
  hasReadParchment: boolean;
  /** 新手引导：是否已查看图鉴 */
  hasCheckedCodex: boolean;
  /** 仓库：非道具展示品（纯展示） */
  warehouse: Array<{ id: string; name: string; description?: string }>;

  setHydrated: (state: boolean) => void;
  setHasReadParchment: (v: boolean) => void;
  setHasCheckedCodex: (v: boolean) => void;
  mergeCodex: (updates: CodexEntry[]) => void;
  pushLog: (entry: { role: string; content: string; reasoning?: string }) => void;
  popLastNLogs: (n: number) => void;
  advanceTime: () => void;
  rewindTime: () => void;
  setTime: (time: GameTime) => void;
  setStats: (stats: Partial<Record<StatType, number>>) => void;
  setInventory: (inventory: Item[]) => void;
  addToInventory: (item: Item) => void;
  addItems: (items: Item[]) => void;
  removeFromInventory: (itemId: string) => void;
  consumeItems: (itemNames: string[]) => void;

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
      time: { day: 0, hour: 0 },
      stats: { ...DEFAULT_STATS },
      historicalMaxSanity: 50,
      inventory: [],
      logs: [],
      codex: {},
      hasReadParchment: false,
      hasCheckedCodex: false,
      warehouse: [],

      setHydrated: (state) => set({ isHydrated: state }),
      setHasReadParchment: (v) => set({ hasReadParchment: v }),
      setHasCheckedCodex: (v) => set({ hasCheckedCodex: v }),

      mergeCodex: (updates) =>
        set((s) => {
          const next = { ...s.codex };
          for (const u of updates) {
            if (!u?.name && !u?.id) continue;
            const existingKey = Object.keys(next).find((k) => next[k]!.name === u.name || next[k]!.id === u.id);
            const key = existingKey ?? (u.id || u.name);
            const prev = next[key];
            next[key] = {
              ...(prev ?? {}),
              ...u,
              id: prev?.id ?? u.id ?? u.name ?? key,
              name: u.name ?? prev?.name ?? "",
              type: (u.type ?? prev?.type ?? "npc") as "npc" | "anomaly",
            } as CodexEntry;
          }
          return { codex: next };
        }),

      pushLog: (entry) =>
        set((s) => ({ logs: [...(s.logs ?? []), entry] })),

      popLastNLogs: (n) =>
        set((s) => ({ logs: (s.logs ?? []).slice(0, -n) })),

      rewindTime: () =>
        set((s) => {
          const { day, hour } = s.time ?? { day: 0, hour: 0 };
          if (hour <= 0) {
            if (day <= 0) return {};
            return { time: { day: day - 1, hour: 23 } };
          }
          return { time: { day, hour: hour - 1 } };
        }),

      advanceTime: () =>
        set((s) => {
          const { day, hour } = s.time ?? { day: 0, hour: 0 };
          const nextHour = hour + 1;
          if (nextHour >= 24) {
            return { time: { day: day + 1, hour: 0 } };
          }
          return { time: { day, hour: nextHour } };
        }),

      setTime: (time) => set({ time }),

      setStats: (stats) =>
        set((s) => {
          const next = { ...s.stats, ...stats };
          const newSanity = next.sanity;
          const hist = s.historicalMaxSanity ?? 50;
          const nextHist = typeof newSanity === "number" && newSanity > hist ? newSanity : hist;
          return { stats: next, historicalMaxSanity: nextHist };
        }),

      setInventory: (inventory) => set({ inventory }),

      addToInventory: (item) =>
        set((s) => ({
          inventory: s.inventory.some((i) => i.id === item.id)
            ? s.inventory
            : [...s.inventory, item],
        })),

      addItems: (items) =>
        set((s) => {
          const existingIds = new Set(s.inventory.map((i) => i.id));
          const toAdd = items.filter((it) => it?.id && it?.name && !existingIds.has(it.id));
          for (const it of toAdd) existingIds.add(it.id);
          return { inventory: [...s.inventory, ...toAdd] };
        }),

      removeFromInventory: (itemId) =>
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== itemId),
        })),

      consumeItems: (itemNames) =>
        set((s) => ({
          inventory: s.inventory.filter((i) => !itemNames.includes(i.name)),
        })),

      initCharacter: (profile, stats, talent) => {
        const background = stats.background ?? DEFAULT_STATS.background;
        const startingItem = pickStartingItemByBackground(background);
        const initialSanity = stats.sanity ?? DEFAULT_STATS.sanity;

        set({
          playerName: profile.name,
          gender: profile.gender,
          height: profile.height,
          personality: profile.personality,
          talent,
          talentCooldowns: { ...DEFAULT_TALENT_COOLDOWNS },
          time: { day: 0, hour: 0 },
          stats,
          historicalMaxSanity: initialSanity,
          inventory: [PARCHMENT_ITEM, startingItem],
          codex: {},
          hasReadParchment: false,
          hasCheckedCodex: false,
          warehouse: [],
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

        const time = s.time ?? { day: 0, hour: 0 };
        return (
          `玩家档案：姓名[${s.playerName || "未命名"}]，` +
          `性别[${s.gender || "未设定"}]，` +
          `身高[${s.height || 0}cm]，` +
          `性格[${s.personality || "未设定"}]。` +
          `游戏时间[第${time.day}日 ${time.hour}时]。` +
          `当前属性：${statsText}。` +
          `${talentText}。` +
          `物品清单：${inv || "空"}。` +
          `天赋冷却：${ECHO_TALENTS.map((t) => `${t}[剩余${s.talentCooldowns[t]}]`).join("，")}。` +
          (Object.keys(s.codex ?? {}).length > 0
            ? ` 图鉴已解锁：${Object.values(s.codex ?? {}).map((e) => `${e.name}[${e.type}|好感${e.favorability ?? 0}]`).join("，")}。`
            : "")
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
        time: s.time ?? { day: 0, hour: 0 },
        stats: s.stats,
        historicalMaxSanity: s.historicalMaxSanity ?? 50,
        inventory: s.inventory,
        logs: s.logs ?? [],
        codex: s.codex ?? {},
        hasReadParchment: s.hasReadParchment ?? false,
        hasCheckedCodex: s.hasCheckedCodex ?? false,
        warehouse: s.warehouse ?? [],
      }),
    }
  )
);
