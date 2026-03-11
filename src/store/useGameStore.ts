"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/idbDebouncedStorage";
import { createResilientIdbStorage } from "@/lib/resilientStorage";
import type { Item, StatType, WarehouseItem } from "@/lib/registry/types";
import { ITEMS } from "@/lib/registry/items";
import { NPC_SOCIAL_GRAPH } from "@/lib/registry/world";

/** Tutorial item — no stat requirements. Owner: N-011 (manager planted it for new tenants). */
export const PARCHMENT_ITEM: Item = {
  id: "I-PARCHMENT",
  name: "染血的羊皮纸",
  tier: "S",
  description:
    "三日之后，暗月降至；十日之后，一切终焉。本层徘徊着未知的诡异，不要相信任何轻易示好的住客。记住，暗月期间不要直视光源。",
  statBonus: {},
  tags: "lore,truth",
  ownerId: "N-011",
};

const DB_KEY = "versecraft-storage";
const PERSIST_VERSION = 1;

const idbStorage = createResilientIdbStorage();

/** 防御性迁移：当本地持久化数据版本不匹配时，直接丢弃旧数据，使用初始状态，避免旧 Schema 缺少 NPC/物品字段导致渲染崩溃 */
function migratePersistedState(
  _persistedState: unknown,
  _fromVersion: number
): Record<string, unknown> {
  return {};
}

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
  weakness?: string;
}

export interface GameTask {
  id: string;
  title: string;
  desc: string;
  issuer: string;
  reward: string;
  status: "active" | "completed" | "failed";
}

export interface SaveSlotData {
  stats: Record<StatType, number>;
  inventory: Item[];
  warehouse?: WarehouseItem[];
  logs: { role: string; content: string; reasoning?: string }[];
  time: GameTime;
  codex: Record<string, CodexEntry>;
  historicalMaxSanity: number;
  historicalMaxFloorScore?: number;
  talent?: EchoTalent | null;
  talentCooldowns?: Record<EchoTalent, number>;
  hasReadParchment?: boolean;
  hasCheckedCodex?: boolean;
  originium?: number;
  currentBgm?: string;
}

export interface AuthUser {
  name: string;
}

interface GameState {
  currentSaveSlot: string;
  /** 最多 3 个存档位 */
  saveSlots: Record<string, SaveSlotData>;
  isHydrated: boolean;
  user: AuthUser | null;

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
  /** 仓库：物品（非道具），仅存仓库。无属性要求，有正向作用与对应副作用。 */
  warehouse: WarehouseItem[];
  /** AI 动态选项：由大模型在每次回复中生成的 4 个行动选项 */
  currentOptions: string[];
  /** 过去 2 轮生成的选项历史，上限 8 个，用于反死循环 */
  recentOptions: string[];
  /** 输入模式：options 显示选项卡片，text 显示手动输入框 */
  inputMode: "options" | "text";
  /** 原石货币：初始值 = 出身属性点数 */
  originium: number;
  /** 任务追踪系统 */
  tasks: GameTask[];
  /** 玩家当前位置 */
  playerLocation: string;
  /** 历史最高抵达楼层分数（B1=0, 1F=1, ..., B2=99），用于结算与排行榜 */
  historicalMaxFloorScore: number;
  /** NPC 动态状态（位置 + 存活） */
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  /** 非法闯入警戒闪烁计时 */
  intrusionFlashUntil: number;
  /** 是否已开始游戏（角色初始化完成后为 true） */
  isGameStarted: boolean;
  /** BGM track key (bgm_1_calm by default). Not persisted to avoid write amplification; restored from save on load. */
  currentBgm: string;
  setHydrated: (state: boolean) => void;
  setBgm: (track: string) => void;
  setUser: (user: AuthUser | null) => void;
  mockLogin: () => void;
  logout: () => void;
  /** 深度重置：将所有状态恢复为初始默认值（新游戏前调用） */
  resetForNewGame: () => void;
  /** 标记游戏结束（死亡）：清空存档，隐藏继续冒险 */
  markGameOver: () => void;
  /** 死亡专用：强制 isGameStarted=false，清空进度数据，保留日志/时间/位置用于结算展示 */
  clearSaveForDeath: () => void;
  /** 结算页用：清空存档与物品，仅保留日志/时间/位置用于展示 */
  clearSaveDataKeepLogs: () => void;
  /** 物理级销毁存档：清空 logs、inventory、saveSlots，强制 isGameStarted=false。离开结算页时调用。 */
  destroySaveData: () => void;
  setCurrentOptions: (options: string[]) => void;
  toggleInputMode: () => void;
  setOriginium: (v: number) => void;
  addOriginium: (delta: number) => void;
  upgradeAttribute: (attr: StatType) => boolean;
  /** 用原石恢复理智：当理智低于历史最高时，1原石=1理智 */
  restoreSanity: () => boolean;
  addTask: (task: Omit<GameTask, "status"> & { status?: GameTask["status"] }) => void;
  updateTaskStatus: (taskId: string, status: GameTask["status"]) => void;
  setPlayerLocation: (loc: string) => void;
  updateNpcLocation: (npcId: string, location: string) => void;
  killNpc: (npcId: string) => void;
  triggerIntrusionFlash: () => void;
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
  addWarehouseItems: (items: WarehouseItem[]) => void;

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

  saveGame: (slotId: string) => void;
  loadGame: (slotId: string) => void;
  hydrateFromCloud: (slotId: string, data: SaveSlotData) => void;
}

const DEFAULT_STATS: Record<StatType, number> = {
  sanity: 3,
  agility: 3,
  luck: 3,
  charm: 3,
  background: 3,
};

function resolveFloorScore(loc: string): number {
  if (!loc) return 0;
  if (loc.startsWith("B2_")) return 99;
  if (loc.startsWith("B1_")) return 0;
  const m = loc.match(/^(\d)F_/);
  return m ? Number(m[1] ?? 0) : 0;
}

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
      saveSlots: {},
      isHydrated: false,
      user: null,
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
      currentOptions: [],
      recentOptions: [],
      inputMode: "options" as const,
      originium: 0,
      tasks: [],
      playerLocation: "B1_SafeZone",
      historicalMaxFloorScore: 0,
      dynamicNpcStates: {},
      intrusionFlashUntil: 0,
      isGameStarted: false,
      currentBgm: "bgm_1_calm",

      setHydrated: (state) => set({ isHydrated: state }),
      setBgm: (track) => set({ currentBgm: track }),
      setUser: (user) => set({ user }),
      mockLogin: () => set({ user: { name: "觉醒者_007" } }),
      logout: () => set({ user: null }),
      resetForNewGame: () =>
        set({
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
          currentOptions: [],
          recentOptions: [],
          inputMode: "options" as const,
          originium: 0,
          tasks: [],
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          dynamicNpcStates: {},
          intrusionFlashUntil: 0,
          isGameStarted: false,
          currentBgm: "bgm_1_calm",
        }),

      markGameOver: () =>
        set((s) => {
          const { auto_save, ...rest } = s.saveSlots ?? {};
          return {
            isGameStarted: false,
            saveSlots: rest,
          };
        }),

      clearSaveForDeath: () =>
        set((s) => ({
          ...s,
          isGameStarted: false,
          saveSlots: {},
          inventory: [],
          tasks: [],
          warehouse: [],
          currentOptions: [],
          recentOptions: [],
        })),

      clearSaveDataKeepLogs: () =>
        set((s) => ({
          isGameStarted: false,
          saveSlots: {},
          inventory: [],
          warehouse: [],
          currentOptions: [],
          recentOptions: [],
        })),

      destroySaveData: () =>
        set({
          logs: [],
          inventory: [],
          warehouse: [],
          saveSlots: {},
          isGameStarted: false,
          currentOptions: [],
          recentOptions: [],
          historicalMaxFloorScore: 0,
        }),

      setCurrentOptions: (options) =>
        set((s) => {
          const appended = [...(s.recentOptions ?? []), ...options];
          const trimmed = appended.slice(-8);
          return { currentOptions: options, recentOptions: trimmed };
        }),
      toggleInputMode: () => set((s) => ({ inputMode: s.inputMode === "options" ? "text" : "options" })),
      setOriginium: (v) => set({ originium: Math.max(0, v) }),
      addOriginium: (delta) =>
        set((s) => {
          if (delta < 0 && s.originium <= 0) return {};
          return { originium: Math.max(0, s.originium + delta) };
        }),
      upgradeAttribute: (attr) => {
        const s = get();
        const cur = s.stats[attr] ?? 0;
        if (cur >= 50) return false;
        const totalPoints =
          (s.stats.sanity ?? 0) + (s.stats.agility ?? 0) + (s.stats.luck ?? 0) +
          (s.stats.charm ?? 0) + (s.stats.background ?? 0);
        const cost = totalPoints < 20 ? 2 : 3;
        if (s.originium <= 0 || s.originium < cost) return false;
        set({
          originium: s.originium - cost,
          stats: { ...s.stats, [attr]: cur + 1 },
        });
        return true;
      },
      restoreSanity: () => {
        const s = get();
        const cur = s.stats.sanity ?? 0;
        const histMax = s.historicalMaxSanity ?? 50;
        if (cur >= histMax || s.originium < 1) return false;
        set({
          originium: s.originium - 1,
          stats: { ...s.stats, sanity: cur + 1 },
        });
        return true;
      },
      addTask: (task) =>
        set((s) => ({
          tasks: [...s.tasks, { ...task, status: task.status ?? "active" }],
        })),
      updateTaskStatus: (taskId, status) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
        })),
      setPlayerLocation: (loc) =>
        set((s) => {
          const nextScore = resolveFloorScore(loc);
          const prevMax = s.historicalMaxFloorScore ?? 0;
          return {
            playerLocation: loc,
            historicalMaxFloorScore: Math.max(prevMax, nextScore),
          };
        }),
      updateNpcLocation: (npcId, location) =>
        set((s) => ({
          dynamicNpcStates: {
            ...s.dynamicNpcStates,
            [npcId]: { ...(s.dynamicNpcStates[npcId] ?? { currentLocation: "", isAlive: true }), currentLocation: location },
          },
        })),
      killNpc: (npcId) =>
        set((s) => ({
          dynamicNpcStates: {
            ...s.dynamicNpcStates,
            [npcId]: { ...(s.dynamicNpcStates[npcId] ?? { currentLocation: "" }), isAlive: false },
          },
        })),
      triggerIntrusionFlash: () => set({ intrusionFlashUntil: Date.now() + 2000 }),
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

      addWarehouseItems: (items) =>
        set((s) => {
          const existingIds = new Set((s.warehouse ?? []).map((w) => w.id));
          const toAdd = items.filter((w) => w?.id && w?.name && !existingIds.has(w.id));
          return { warehouse: [...(s.warehouse ?? []), ...toAdd] };
        }),

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
          currentOptions: [],
          recentOptions: [],
          inputMode: "options" as const,
          originium: background,
          tasks: [],
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          dynamicNpcStates: Object.fromEntries(
            Object.entries(NPC_SOCIAL_GRAPH).map(([id, p]) => [id, { currentLocation: p.homeLocation, isAlive: true }])
          ),
          intrusionFlashUntil: 0,
          isGameStarted: true,
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
        const npcPositions = Object.entries(s.dynamicNpcStates)
          .filter(([, v]) => v.isAlive)
          .map(([id, v]) => `${id}@${v.currentLocation}`)
          .join("，");

        return (
          `玩家档案：姓名[${s.playerName || "未命名"}]，` +
          `性别[${s.gender || "未设定"}]，` +
          `身高[${s.height || 0}cm]，` +
          `性格[${s.personality || "未设定"}]。` +
          `游戏时间[第${time.day}日 ${time.hour}时]。` +
          `玩家位置[${s.playerLocation}]。` +
          `当前属性：${statsText}。` +
          `${talentText}。` +
          `行囊道具：${inv || "空"}。` +
          (() => {
            const wh = s.warehouse ?? [];
            if (wh.length === 0) return "";
            return ` 仓库物品：${wh.map((w) => `${w.name}[${w.id}]`).join("，")}。`;
          })() +
          `天赋冷却：${ECHO_TALENTS.map((t) => `${t}[剩余${s.talentCooldowns[t]}]`).join("，")}。` +
          `原石[${s.originium}]。` +
          (s.tasks.filter((t) => t.status === "active").length > 0
            ? `进行中的任务：${s.tasks.filter((t) => t.status === "active").map((t) => `${t.title}[来自${t.issuer}]`).join("，")}。`
            : "") +
          (Object.keys(s.codex ?? {}).length > 0
            ? ` 图鉴已解锁：${Object.values(s.codex ?? {}).map((e) => `${e.name}[${e.type}|好感${e.favorability ?? 0}]`).join("，")}。`
            : "") +
          (npcPositions ? ` NPC当前位置：${npcPositions}。` : "") +
          (s.recentOptions?.length
            ? ` 【最近生成的选项历史】：${s.recentOptions.join("；")}。`
            : " 【最近生成的选项历史】：（无）。")
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

      saveGame: (slotId) => {
        const s = get();
        const data: SaveSlotData = {
          stats: JSON.parse(JSON.stringify(s.stats)),
          inventory: JSON.parse(JSON.stringify(s.inventory)),
          warehouse: JSON.parse(JSON.stringify(s.warehouse ?? [])),
          logs: JSON.parse(JSON.stringify(s.logs ?? [])),
          time: JSON.parse(JSON.stringify(s.time ?? { day: 0, hour: 0 })),
          codex: JSON.parse(JSON.stringify(s.codex ?? {})),
          historicalMaxSanity: s.historicalMaxSanity ?? 50,
          historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
          talent: s.talent,
          talentCooldowns: JSON.parse(JSON.stringify(s.talentCooldowns ?? {})),
          hasReadParchment: s.hasReadParchment ?? false,
          hasCheckedCodex: s.hasCheckedCodex ?? false,
          originium: s.originium ?? 0,
          currentBgm: s.currentBgm ?? "bgm_1_calm",
        };
        set((prev) => ({ saveSlots: { ...prev.saveSlots, [slotId]: data } }));
        void import("@/app/actions/save")
          .then(({ syncSaveToCloud }) => syncSaveToCloud(slotId, data))
          .catch(() => undefined);
      },

      loadGame: (slotId) => {
        const data = get().saveSlots[slotId];
        if (!data) return;
        const talentCooldowns =
          data.talentCooldowns && typeof data.talentCooldowns === "object"
            ? { ...DEFAULT_TALENT_COOLDOWNS, ...data.talentCooldowns }
            : DEFAULT_TALENT_COOLDOWNS;
        set({
          stats: JSON.parse(JSON.stringify(data.stats)),
          inventory: JSON.parse(JSON.stringify(data.inventory)),
          warehouse: Array.isArray(data.warehouse) ? JSON.parse(JSON.stringify(data.warehouse)) : [],
          logs: JSON.parse(JSON.stringify(data.logs)),
          time: JSON.parse(JSON.stringify(data.time)),
          codex: JSON.parse(JSON.stringify(data.codex)),
          historicalMaxSanity: data.historicalMaxSanity,
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          talent: data.talent ?? null,
          talentCooldowns,
          hasReadParchment: data.hasReadParchment ?? (Array.isArray(data.logs) && data.logs.length > 0),
          hasCheckedCodex: data.hasCheckedCodex ?? false,
          originium: data.originium ?? get().originium ?? 0,
          currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
        });
      },
      hydrateFromCloud: (slotId, data) => {
        if (!data) return;
        const talentCooldowns =
          data.talentCooldowns && typeof data.talentCooldowns === "object"
            ? { ...DEFAULT_TALENT_COOLDOWNS, ...data.talentCooldowns }
            : DEFAULT_TALENT_COOLDOWNS;
        set((s) => {
          const loadedLogs = data.logs ?? [];
          const hasProgress = Array.isArray(loadedLogs) && loadedLogs.length > 0;
          return {
            currentSaveSlot: slotId,
            saveSlots: { ...s.saveSlots, [slotId]: data },
            stats: JSON.parse(JSON.stringify(data.stats)),
            inventory: JSON.parse(JSON.stringify(data.inventory)),
            warehouse: Array.isArray(data.warehouse) ? JSON.parse(JSON.stringify(data.warehouse)) : [],
            logs: JSON.parse(JSON.stringify(data.logs ?? [])),
            time: JSON.parse(JSON.stringify(data.time ?? { day: 0, hour: 0 })),
            codex: JSON.parse(JSON.stringify(data.codex ?? {})),
            historicalMaxSanity: data.historicalMaxSanity ?? 50,
            historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
            talent: data.talent ?? s.talent ?? null,
            talentCooldowns,
            hasReadParchment: data.hasReadParchment ?? hasProgress,
            hasCheckedCodex: data.hasCheckedCodex ?? false,
            originium: data.originium ?? s.originium ?? 0,
            currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
            isGameStarted: true,
          };
        });
      },
    }),
    {
      name: DB_KEY,
      version: PERSIST_VERSION,
      migrate: migratePersistedState,
      storage: createJSONStorage(() => createDebouncedStorage(idbStorage, 1000)),
      skipHydration: true,
      /** 捕获反序列化/持久化过程中的静默错误，确保生命周期闭环，避免永远 pending */
      onRehydrateStorage: () => (state, error) => {
        if (error != null) {
          console.warn("[useGameStore] Rehydration error, falling back to initial state:", error);
        }
        useGameStore.getState().setHydrated(true);
      },
      // Excludes transient UI: isHydrated, currentOptions, recentOptions, inputMode, intrusionFlashUntil
      partialize: (s) => ({
        currentSaveSlot: s.currentSaveSlot,
        saveSlots: s.saveSlots ?? {},
        user: s.user ?? null,
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
        originium: s.originium ?? 0,
        tasks: s.tasks ?? [],
        playerLocation: s.playerLocation ?? "B1_SafeZone",
        historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
        dynamicNpcStates: s.dynamicNpcStates ?? {},
        isGameStarted: s.isGameStarted ?? false,
      }),
    }
  )
);
