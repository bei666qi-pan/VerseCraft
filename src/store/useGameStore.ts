"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/idbDebouncedStorage";
import { createResilientIdbStorage } from "@/lib/resilientStorage";
import {
  checksumMiddleware,
  createStateChecksum,
  type IntegrityMetaState,
} from "@/store/middleware/checksumMiddleware";
import type { Item, StatType, WarehouseItem } from "@/lib/registry/types";
import { ITEMS } from "@/lib/registry/items";
import { NPC_HOME_LOCATION_SEED } from "@/lib/registry/runtimeBoundary";

const DB_KEY = "versecraft-storage";
const PERSIST_VERSION = 1;

const idbStorage = createResilientIdbStorage();

/** 防御性迁移：当本地持久化数据版本不匹配时，直接丢弃旧数据，使用初始状态，避免旧 Schema 缺少 NPC/物品字段导致渲染崩溃 */
function migratePersistedState(
  persistedState: unknown,
  fromVersion: number
): Record<string, unknown> {
  void persistedState;
  void fromVersion;
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
  hasCheckedCodex?: boolean;
  originium?: number;
  currentBgm?: string;
  currentOptions?: string[];
}

export interface AuthUser {
  name: string;
}

/** Unified modal / panel: null = all closed. Pure UI; not bundled into save slots. */
export type ActiveMenu = "settings" | "backpack" | "codex" | "warehouse" | "tasks" | "achievements" | null;

/**
 * Cooldown rounds after activating a talent (must stay in sync with play-page talent UX).
 * Expressed in turns advanced by successful legal actions.
 */
const TALENT_ACTION_COOLDOWNS: Record<EchoTalent, number> = {
  时间回溯: 6,
  命运馈赠: 10,
  主角光环: 8,
  生命汇源: 10,
  洞察之眼: 8,
  丧钟回响: 30,
};

interface GameState extends IntegrityMetaState {
  currentSaveSlot: string;
  /** 最多 3 个存档位 */
  saveSlots: Record<string, SaveSlotData>;
  isHydrated: boolean;
  user: AuthUser | null;
  guestId: string | null;
  isGuest: boolean;

  /** 游客累计游玩时长（秒） */
  playTimeSeconds: number;
  /** 打开游戏次数（前端加载次数统计） */
  visitCount: number;
  /** 是否已经展示过游客软引导提示，防止重复打扰 */
  hasShownGuestSoftNudge: boolean;

  /** 游客体验对话次数（玩家有效行动轮次） */
  dialogueCount: number;

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

  /** 新手引导：是否已查看图鉴（羊皮纸引导已移除） */
  hasCheckedCodex: boolean;
  /** 仓库：物品（非道具），仅存仓库。无属性要求，有正向作用与对应副作用。 */
  warehouse: WarehouseItem[];
  /** AI 动态选项：由大模型在每次回复中生成的 4 个行动选项 */
  currentOptions: string[];
  /** 过去 2 轮生成的选项历史，上限 8 个，用于反死循环 */
  recentOptions: string[];
  /** 输入模式：options 显示选项卡片，text 显示手动输入框 */
  inputMode: "options" | "text";
  /** 原石货币：初始值 = 10 + 出身，每小时有 10% + (出身-20)*2% 概率获得 1 原石 */
  originium: number;
  /** 任务追踪系统 */
  tasks: GameTask[];
  /** 用户当前位置 */
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
  /** Master BGM volume 0–100 for audio engine binding. */
  volume: number;
  /** Unified in-game menu surface (pure UI). */
  activeMenu: ActiveMenu;
  /** 安全降级：当上游安全拦截/流破损导致解析失败时，强制覆盖叙事并扣理智 */
  securityFallback: { active: boolean; message: string; at: number; reason?: string };
  _integrity_dirty: boolean;
  verifyStateIntegrity: () => Promise<boolean>;
  triggerSecurityFallback: (reason?: string) => void;
  setHydrated: (state: boolean) => void;
  setVolume: (volume: number) => void;
  setActiveMenu: (menu: ActiveMenu) => void;
  /** Activate talent for current round: applies cooldown; returns false if still on cooldown. */
  useTalent: (talent: EchoTalent) => boolean;
  /** Decrement all talent cooldowns by 1 after a successful advancing turn. */
  decrementCooldowns: () => void;
  setBgm: (track: string) => void;
  setUser: (user: AuthUser | null) => void;
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

  /** 游客模式辅助：增加游玩时长与访问次数 */
  addPlayTimeSeconds: (deltaSeconds: number) => void;
  bumpVisitCount: () => void;
  markGuestSoftNudgeShown: () => void;

  /** 游客体验对话计数自增 */
  incrementDialogueCount: () => void;

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
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
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

function createGuestId(): string {
  return `guest_${Math.random().toString(36).slice(2, 10)}`;
}

function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const useGameStore = create<GameState>()(
  persist(
    checksumMiddleware((set, get) => ({
      currentSaveSlot: "slot_1",
      saveSlots: {},
      isHydrated: false,
      user: null,
      guestId: createGuestId(),
      isGuest: true,
      playTimeSeconds: 0,
      visitCount: 0,
      hasShownGuestSoftNudge: false,
      dialogueCount: 0,
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
      volume: 50,
      activeMenu: null,
      securityFallback: { active: false, message: "", at: 0 },
      _checksum_fingerprint: "",
      _integrity_dirty: false,
      verifyStateIntegrity: async () => {
        const state = get();
        const expected = state._checksum_fingerprint;
        const actual = createStateChecksum(state);
        const isValid = expected === actual;
        if (isValid) return true;

        set({ _integrity_dirty: true });
        const eventPayload = {
          eventType: "client_state_integrity_violation",
          occurredAt: new Date().toISOString(),
          path: typeof window !== "undefined" ? window.location.pathname : "/",
          expectedFingerprint: expected,
          actualFingerprint: actual,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        };

        if (typeof window !== "undefined") {
          const body = JSON.stringify(eventPayload);
          try {
            const blob = new Blob([body], { type: "application/json" });
            if (!navigator.sendBeacon("/api/security/state-integrity", blob)) {
              void fetch("/api/security/state-integrity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                keepalive: true,
                cache: "no-store",
              }).catch(() => undefined);
            }
          } catch {
            void fetch("/api/security/state-integrity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive: true,
              cache: "no-store",
            }).catch(() => undefined);
          }
        }

        console.warn("[security][client_integrity] dirty_state_detected", eventPayload);
        return false;
      },

      setHydrated: (state) => set({ isHydrated: state }),
      setBgm: (track) => set({ currentBgm: track }),
      setVolume: (vol) => set({ volume: clampVolume(vol) }),
      setActiveMenu: (menu) => set({ activeMenu: menu }),
      useTalent: (talent) => {
        const s = get();
        const cds = s.talentCooldowns ?? DEFAULT_TALENT_COOLDOWNS;
        const cdNow = Number(cds[talent]);
        const safeCd = Number.isFinite(cdNow) ? cdNow : 0;
        if (safeCd > 0) return false;
        const nextCd = TALENT_ACTION_COOLDOWNS[talent] ?? 0;
        set({
          talentCooldowns: { ...cds, [talent]: nextCd },
        });
        return true;
      },
      decrementCooldowns: () =>
        set((s) => {
          const prev = s.talentCooldowns ?? DEFAULT_TALENT_COOLDOWNS;
          const next = { ...prev } as Record<EchoTalent, number>;
          for (const k of ECHO_TALENTS) {
            const v = Number(next[k]);
            const safe = Number.isFinite(v) ? v : 0;
            next[k] = safe > 0 ? safe - 1 : 0;
          }
          return { talentCooldowns: next };
        }),
      triggerSecurityFallback: (reason) =>
        set((s) => {
          const curSanity = s.stats?.sanity ?? 0;
          const nextSanity = Math.max(0, curSanity - 1);
          return {
            securityFallback: {
              active: true,
              message: "{{BLOOD}}禁止输出非法词语！！！{{/BLOOD}}",
              at: Date.now(),
              reason,
            },
            stats: { ...(s.stats ?? DEFAULT_STATS), sanity: nextSanity },
          };
        }),
      setUser: (user) =>
        set((s) => ({
          user,
          isGuest: !user,
          guestId: user ? s.guestId : s.guestId ?? createGuestId(),
        })),
      logout: () =>
        set(() => ({
          user: null,
          isGuest: true,
          guestId: createGuestId(),
        })),
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
          historicalMaxSanity: DEFAULT_STATS.sanity,
          inventory: [],
          logs: [],
          codex: {},
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
          activeMenu: null,
        }),

      markGameOver: () =>
        set((s) => {
          const { auto_save: _autoSave, ...rest } = s.saveSlots ?? {};
          void _autoSave;
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
        set(() => ({
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
        const stats = s.stats ?? DEFAULT_STATS;
        const cur = stats[attr] ?? 0;
        if (cur >= 50) return false;
        const totalPoints =
          (stats.sanity ?? 0) + (stats.agility ?? 0) + (stats.luck ?? 0) +
          (stats.charm ?? 0) + (stats.background ?? 0);
        const cost = totalPoints < 20 ? 2 : 3;
        if (s.originium <= 0 || s.originium < cost) return false;
        const nextVal = cur + 1;
        const updates: Partial<ReturnType<typeof get>> = {
          originium: s.originium - cost,
          stats: { ...stats, [attr]: nextVal },
        };
        if (attr === "sanity") {
          const histMax = s.historicalMaxSanity ?? 50;
          updates.historicalMaxSanity = histMax + 1;
        }
        set(updates);
        return true;
      },
      restoreSanity: () => {
        const s = get();
        const stats = s.stats ?? DEFAULT_STATS;
        const cur = stats.sanity ?? 0;
        const histMax = s.historicalMaxSanity ?? 50;
        if (cur >= histMax || s.originium < 1) return false;
        set({
          originium: s.originium - 1,
          stats: { ...stats, sanity: cur + 1 },
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
      setHasCheckedCodex: (v) => set({ hasCheckedCodex: v }),

      mergeCodex: (updates) =>
        set((s) => {
          const base = s.codex ?? {};
          const next = (typeof base === "object" && base !== null ? { ...base } : {}) as Record<
            string,
            CodexEntry
          >;
          const safeUpdates = Array.isArray(updates) ? updates : [];
          for (const u of safeUpdates) {
            if (!u || (typeof u !== "object")) continue;
            const name = typeof (u as { name?: unknown }).name === "string" ? (u as { name: string }).name : null;
            const id = typeof (u as { id?: unknown }).id === "string" ? (u as { id: string }).id : null;
            if (!name && !id) continue;
            const existingKey = Object.keys(next).find((k) => next[k]?.name === name || next[k]?.id === id);
            const key = existingKey ?? id ?? name ?? "unknown";
            const prev = next[key];
            const merged: CodexEntry = {
              id: prev?.id ?? id ?? name ?? key,
              name: name ?? prev?.name ?? "",
              type: (u.type === "npc" || u.type === "anomaly" ? u.type : prev?.type ?? "npc") as "npc" | "anomaly",
              ...(typeof u.favorability === "number" ? { favorability: u.favorability } : {}),
              ...(typeof u.combatPower === "number" ? { combatPower: u.combatPower } : {}),
              ...(typeof u.personality === "string" ? { personality: u.personality } : {}),
              ...(typeof u.traits === "string" ? { traits: u.traits } : {}),
              ...(typeof u.rules_discovered === "string" ? { rules_discovered: u.rules_discovered } : {}),
              ...(typeof u.weakness === "string" ? { weakness: u.weakness } : {}),
            };
            next[key] = merged;
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
          const nextTime = nextHour >= 24
            ? { day: day + 1, hour: 0 }
            : { day, hour: nextHour };
          const bg = (s.stats ?? DEFAULT_STATS).background ?? 0;
          const prob = 0.1 + Math.max(0, bg - 20) * 0.02;
          const roll = Math.random();
          const gain = roll < prob ? 1 : 0;
          const nextOriginium = gain > 0 ? (s.originium ?? 0) + gain : s.originium ?? 0;
          return {
            time: nextTime,
            ...(gain > 0 ? { originium: nextOriginium } : {}),
          };
        }),

      setTime: (time) => set({ time }),

      setStats: (stats) =>
        set((s) => {
          const base = s.stats ?? DEFAULT_STATS;
          const next = { ...base, ...stats };
          const newSanity = next.sanity;
          const hist = s.historicalMaxSanity ?? 50;
          const nextHist = typeof newSanity === "number" && newSanity > hist ? newSanity : hist;
          return { stats: next, historicalMaxSanity: nextHist };
        }),

      setInventory: (inventory) => set({ inventory }),

      addToInventory: (item) =>
        set((s) => {
          const inv = s.inventory ?? [];
          return {
            inventory: inv.some((i) => i.id === item.id) ? inv : [...inv, item],
          };
        }),

      addItems: (items) =>
        set((s) => {
          const inv = (s.inventory ?? []).filter((i): i is NonNullable<typeof i> => !!i);
          const existingIds = new Set(inv.map((i) => i.id).filter(Boolean));
          const safeItems = Array.isArray(items) ? items : [];
          const toAdd = safeItems.filter((it) => it && it.id && it.name && !existingIds.has(it.id));
          for (const it of toAdd) existingIds.add(it.id);
          return { inventory: [...inv, ...toAdd] };
        }),

      removeFromInventory: (itemId: string) =>
        set((s) => ({
          inventory: (s.inventory ?? []).filter((i) => i?.id !== itemId),
        })),

      consumeItems: (itemNames) =>
        set((s) => {
          const inv = s.inventory ?? [];
          const keys = Array.isArray(itemNames)
            ? itemNames.filter((x) => typeof x === "string" && x.length > 0).map((x) => String(x).trim())
            : [];
          if (keys.length === 0) return {};
          return {
            inventory: inv.filter(
              (i) =>
                i &&
                typeof i.name === "string" &&
                !keys.some((k) => k === i.name || k === i.id)
            ),
          };
        }),

      addWarehouseItems: (items) =>
        set((s) => {
          const existingIds = new Set((s.warehouse ?? []).map((w) => w.id));
          const toAdd = items.filter((w) => w?.id && w?.name && !existingIds.has(w.id));
          return { warehouse: [...(s.warehouse ?? []), ...toAdd] };
        }),

      addPlayTimeSeconds: (deltaSeconds) =>
        set((s) => {
          if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return {};
          const next = (s.playTimeSeconds ?? 0) + deltaSeconds;
          return { playTimeSeconds: next };
        }),
      bumpVisitCount: () =>
        set((s) => ({
          visitCount: (s.visitCount ?? 0) + 1,
        })),
      markGuestSoftNudgeShown: () => set({ hasShownGuestSoftNudge: true }),
      incrementDialogueCount: () =>
        set((s) => ({
          dialogueCount: (s.dialogueCount ?? 0) + 1,
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
          inventory: [startingItem],
          codex: {},
          hasCheckedCodex: false,
          warehouse: [],
          currentOptions: [],
          recentOptions: [],
          inputMode: "options" as const,
          originium: 10 + background,
          tasks: [],
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          dynamicNpcStates: Object.fromEntries(
            Object.entries(NPC_HOME_LOCATION_SEED).map(([id, homeLocation]) => [
              id,
              { currentLocation: homeLocation, isAlive: true },
            ])
          ),
          intrusionFlashUntil: 0,
          isGameStarted: true,
        });
      },

      getPromptContext: () => {
        const s = get();
        const inv = (s.inventory ?? [])
          .map((i) => `${i.name}[${i.id}|${i.tier}]`)
          .join("，");

        const stats = s.stats ?? DEFAULT_STATS;
        const statsText =
          `理智[${stats.sanity}]，` +
          `敏捷[${stats.agility}]，` +
          `幸运[${stats.luck}]，` +
          `魅力[${stats.charm}]，` +
          `出身[${stats.background}]`;

        const talentText = s.talent ? `回响天赋[${s.talent}]` : "回响天赋[未选择]";

        const time = s.time ?? { day: 0, hour: 0 };
        const npcStates = s.dynamicNpcStates ?? {};
        const npcPositions = typeof npcStates === "object" && npcStates !== null
          ? Object.entries(npcStates)
              .filter(([, v]) => v && typeof v === "object" && v.isAlive)
              .map(([id, v]) => `${id}@${(v as { currentLocation?: string }).currentLocation ?? "?"}`)
              .join("，")
          : "";

        return (
          `用户档案：姓名[${s.playerName || "未命名"}]，` +
          `性别[${s.gender || "未设定"}]，` +
          `身高[${s.height || 0}cm]，` +
          `性格[${s.personality || "未设定"}]。` +
          `游戏时间[第${time.day}日 ${time.hour}时]。` +
          `用户位置[${s.playerLocation}]。` +
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
        const stats = state.stats ?? DEFAULT_STATS;
        const inventory = state.inventory ?? [];

        const weaknessTags = parseTags(anomalyWeaknessTags);

        const hasWeakness = inventory.some((item) => {
          const itemTags = parseTags(item.tags);
          return itemTags.some((tag) => weaknessTags.includes(tag));
        });

        if (hasWeakness) {
          return {
            success: true,
            narrative: "利用针对性物品成功破局。",
          };
        }

        const statValue = stats[baseStat] ?? 0;

        const itemBonus = inventory.reduce((sum, item) => {
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
          narrative: "一切陷入黑暗，致命的危机正在向你逼近。",
        };
      },

      saveGame: (slotId) => {
        const s = get();
        const safeStats = s.stats ?? DEFAULT_STATS;
        const data: SaveSlotData = {
          stats: JSON.parse(JSON.stringify(safeStats)),
          inventory: JSON.parse(JSON.stringify(s.inventory)),
          warehouse: JSON.parse(JSON.stringify(s.warehouse ?? [])),
          logs: JSON.parse(JSON.stringify(s.logs ?? [])),
          time: JSON.parse(JSON.stringify(s.time ?? { day: 0, hour: 0 })),
          codex: JSON.parse(JSON.stringify(s.codex ?? {})),
          historicalMaxSanity: s.historicalMaxSanity ?? 50,
          historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
          talent: s.talent,
          talentCooldowns: JSON.parse(JSON.stringify(s.talentCooldowns ?? {})),
          hasCheckedCodex: s.hasCheckedCodex ?? false,
          originium: s.originium ?? 0,
          currentBgm: s.currentBgm ?? "bgm_1_calm",
          currentOptions: Array.isArray(s.currentOptions) ? JSON.parse(JSON.stringify(s.currentOptions)) : [],
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
        const safeStats = data.stats ?? DEFAULT_STATS;
        set({
          stats: JSON.parse(JSON.stringify(safeStats)),
          inventory: JSON.parse(JSON.stringify(data.inventory)),
          warehouse: Array.isArray(data.warehouse) ? JSON.parse(JSON.stringify(data.warehouse)) : [],
          logs: JSON.parse(JSON.stringify(data.logs)),
          time: JSON.parse(JSON.stringify(data.time)),
          codex: JSON.parse(JSON.stringify(data.codex)),
          historicalMaxSanity: data.historicalMaxSanity,
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          talent: data.talent ?? null,
          talentCooldowns,
          hasCheckedCodex: data.hasCheckedCodex ?? false,
          originium: data.originium ?? get().originium ?? 0,
          currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
          currentOptions: Array.isArray(data.currentOptions) ? JSON.parse(JSON.stringify(data.currentOptions)) : [],
        });
      },
      hydrateFromCloud: (slotId, data) => {
        if (!data) return;
        const talentCooldowns =
          data.talentCooldowns && typeof data.talentCooldowns === "object"
            ? { ...DEFAULT_TALENT_COOLDOWNS, ...data.talentCooldowns }
            : DEFAULT_TALENT_COOLDOWNS;
        const safeStats = data.stats ?? DEFAULT_STATS;
        set((s) => {
          const loadedLogs = data.logs ?? [];
          const hasProgress = Array.isArray(loadedLogs) && loadedLogs.length > 0;
          void hasProgress;
          return {
            currentSaveSlot: slotId,
            saveSlots: { ...s.saveSlots, [slotId]: data },
            stats: JSON.parse(JSON.stringify(safeStats)),
            inventory: JSON.parse(JSON.stringify(data.inventory)),
            warehouse: Array.isArray(data.warehouse) ? JSON.parse(JSON.stringify(data.warehouse)) : [],
            logs: JSON.parse(JSON.stringify(data.logs ?? [])),
            time: JSON.parse(JSON.stringify(data.time ?? { day: 0, hour: 0 })),
            codex: JSON.parse(JSON.stringify(data.codex ?? {})),
            historicalMaxSanity: data.historicalMaxSanity ?? 50,
            historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
            talent: data.talent ?? s.talent ?? null,
            talentCooldowns,
            hasCheckedCodex: data.hasCheckedCodex ?? false,
            originium: data.originium ?? s.originium ?? 0,
            currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
            currentOptions: Array.isArray(data.currentOptions) ? JSON.parse(JSON.stringify(data.currentOptions)) : [],
            isGameStarted: true,
          };
        });
      },
    })),
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
        guestId: s.guestId ?? null,
        isGuest: s.isGuest ?? true,
        playTimeSeconds: s.playTimeSeconds ?? 0,
        visitCount: s.visitCount ?? 0,
        hasShownGuestSoftNudge: s.hasShownGuestSoftNudge ?? false,
        dialogueCount: s.dialogueCount ?? 0,
        playerName: s.playerName,
        gender: s.gender,
        height: s.height,
        personality: s.personality,
        talent: s.talent,
        talentCooldowns: s.talentCooldowns,
        time: s.time ?? { day: 0, hour: 0 },
        stats: s.stats ?? DEFAULT_STATS,
        historicalMaxSanity: s.historicalMaxSanity ?? 50,
        inventory: s.inventory,
        logs: s.logs ?? [],
        codex: s.codex ?? {},
        hasCheckedCodex: s.hasCheckedCodex ?? false,
        warehouse: s.warehouse ?? [],
        originium: s.originium ?? 0,
        tasks: s.tasks ?? [],
        playerLocation: s.playerLocation ?? "B1_SafeZone",
        historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
        dynamicNpcStates: s.dynamicNpcStates ?? {},
        isGameStarted: s.isGameStarted ?? false,
        volume: clampVolume(s.volume ?? 50),
      }),
    }
  )
);
