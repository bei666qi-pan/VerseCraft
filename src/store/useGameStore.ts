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
import type { Item, StatType, WarehouseItem, Weapon } from "@/lib/registry/types";
import { ITEMS } from "@/lib/registry/items";
import { getWeaponById } from "@/lib/registry/weapons";
import { NPC_HOME_LOCATION_SEED } from "@/lib/registry/runtimeBoundary";
import {
  buildRunSnapshotV2,
  createRunId,
} from "@/lib/state/snapshot/builder";
import {
  createStageOneStarterTasks,
  normalizeGameTaskDraft,
  normalizeTaskUpdateDraft,
  applyTaskUpdateToTask,
  activateClaimableHiddenTasks,
  extractRelationshipPatchesFromConsequences,
  type GameTaskV2,
  type GameTaskStatus,
} from "@/lib/tasks/taskV2";
import {
  createDefaultWorldOverlay,
  normalizeRunSnapshotV2,
  projectSnapshotToLegacy,
} from "@/lib/state/snapshot/migration";
import {
  buildSnapshotSummary,
  canCreateManualBranch,
  createAutoSlotIdFor,
  createBranchSlotId,
  inferSaveSlotKind,
  normalizeSaveSlotMeta,
  type SaveSlotMeta,
} from "@/lib/state/snapshot/branch";
import type {
  RunSnapshotV2,
  SnapshotCodexEntry,
  SnapshotMainThreatState,
} from "@/lib/state/snapshot/types";
import { runReviveSyncPipeline, type ReviveOption } from "@/lib/revive/pipeline";
import { tickInfusions } from "@/lib/playRealtime/weaponInfusion";
import type { ProfessionId, ProfessionStateV1 } from "@/lib/profession/types";
import { createDefaultProfessionState, PROFESSION_IDS, PROFESSION_REGISTRY } from "@/lib/profession/registry";
import { certifyProfession, computeProfessionState } from "@/lib/profession/engine";
import { buildProfessionTrialTask, getProfessionTrialTaskId } from "@/lib/profession/trials";
import {
  buildProfessionImprintCodex,
  buildProfessionIssuerRelationshipDelta,
  getProfessionImprintFlag,
} from "@/lib/profession/imprint";
import {
  evaluateProfessionActiveReadiness,
  getProfessionActiveCooldownHours,
  getProfessionActiveCooldownKey,
  getProfessionActiveFlagKey,
  getProfessionActiveSummary,
  getProfessionPassiveSummary,
} from "@/lib/profession/benefits";

const DB_KEY = "versecraft-storage";
const PERSIST_VERSION = 1;

const idbStorage = createResilientIdbStorage();

/** 防御性迁移：当本地持久化数据版本不匹配时，直接丢弃旧数据，使用初始状态，避免旧 Schema 缺少 NPC/物品字段导致渲染崩溃 */
function migratePersistedState(
  persistedState: unknown,
  fromVersion: number
): Record<string, unknown> {
  void fromVersion;
  if (!persistedState || typeof persistedState !== "object" || Array.isArray(persistedState)) {
    return {};
  }
  const raw = persistedState as Record<string, unknown>;
  const saveSlotsRaw =
    raw.saveSlots && typeof raw.saveSlots === "object" && !Array.isArray(raw.saveSlots)
      ? (raw.saveSlots as Record<string, unknown>)
      : {};
  const migratedSlots: Record<string, unknown> = {};
  for (const [slotId, slotPayload] of Object.entries(saveSlotsRaw)) {
    if (!slotPayload || typeof slotPayload !== "object" || Array.isArray(slotPayload)) continue;
    const legacy = slotPayload as SaveSlotData;
    const snapshot = normalizeRunSnapshotV2(
      legacy.runSnapshotV2,
      legacy
    );
    const professionState = resolveProfessionStateFromSlot(legacy);
    const slotMeta = normalizeSaveSlotMeta(legacy.slotMeta, {
      slotId,
      label: slotId === "main_slot" ? "主线存档" : slotId,
      kind: inferSaveSlotKind(slotId),
      createdAt: snapshot.meta.startedAt,
      updatedAt: snapshot.meta.lastSavedAt,
      runId: snapshot.meta.runId,
      parentSlotId: snapshot.meta.branchMeta?.parentSlotId ?? null,
      branchFromDecisionId: snapshot.meta.branchMeta?.branchFromDecisionId ?? null,
      snapshotSummary: buildFallbackSummaryFromLegacy(legacy),
    });
    migratedSlots[slotId] = {
      ...legacy,
      professionState,
      slotMeta,
      runSnapshotV2: snapshot,
      ...projectSnapshotToLegacy(snapshot),
    };
  }
  return {
    ...raw,
    saveSlots: migratedSlots,
  };
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
  trust?: number;
  fear?: number;
  debt?: number;
  affection?: number;
  desire?: number;
  romanceEligible?: boolean;
  romanceStage?: "none" | "hint" | "bonded" | "committed";
  betrayalFlags?: string[];
  combatPower?: number;
  combatPowerDisplay?: string;
  personality?: string;
  traits?: string;
  rules_discovered?: string;
  weakness?: string;
}

export type GameTask = GameTaskV2;

export interface SaveSlotData {
  slotMeta?: SaveSlotMeta;
  runSnapshotV2?: RunSnapshotV2;
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
  tasks?: GameTask[];
  playerLocation?: string;
  dynamicNpcStates?: Record<string, { currentLocation: string; isAlive: boolean }>;
  mainThreatByFloor?: Record<string, SnapshotMainThreatState>;
  equippedWeapon?: Weapon | null;
  appliedRelationshipTaskIds?: string[];
  reviveContext?: {
    pending: boolean;
    deathLocation: string | null;
    deathCause: string | null;
    droppedLootLedger: string[];
    droppedLootOwnerLedger: Array<{ looterId: string; itemIds: string[] }>;
    lastReviveAnchorId?: string;
  };
  professionState?: ProfessionStateV1;
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
  /** 楼层主威胁状态（第二阶段） */
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  /** 第二阶段武器最小版：主手唯一槽位 */
  equippedWeapon: Weapon | null;
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
  reviveContext: SaveSlotData["reviveContext"];
  appliedRelationshipTaskIds: string[];
  professionState: ProfessionStateV1;
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
  recordDeathForRevive: (cause?: string, killerId?: string | null) => void;
  chooseReviveOption: (option: ReviveOption) => void;
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
  addTask: (task: Partial<GameTask> & { id: string; title: string }) => void;
  updateTaskStatus: (taskId: string, status: GameTaskStatus) => void;
  updateTask: (taskPatch: { id: string } & Partial<GameTask>) => void;
  setPlayerLocation: (loc: string) => void;
  updateNpcLocation: (npcId: string, location: string) => void;
  applyMainThreatUpdates: (updates: Array<Partial<SnapshotMainThreatState> & { floorId?: string }>) => void;
  applyWeaponUpdates: (updates: Array<{
    weaponId?: string;
    stability?: number;
    calibratedThreatId?: string | null;
    currentMods?: Weapon["currentMods"];
    currentInfusions?: Weapon["currentInfusions"];
    contamination?: number;
    repairable?: boolean;
  }>) => void;
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
  refreshProfessionState: () => void;
  certifyProfession: (profession: ProfessionId) => boolean;
  switchProfession: (profession: ProfessionId) => boolean;
  activateProfessionActive: () => { ok: boolean; reason?: string; tip?: string };
  consumeProfessionActiveForTurn: () => ProfessionId | null;
  createBranchSlot: (input?: { label?: string; branchFromDecisionId?: string | null }) => {
    ok: boolean;
    slotId?: string;
    reason?: string;
  };
  renameSaveSlot: (slotId: string, label: string) => boolean;
  deleteSaveSlot: (slotId: string) => boolean;
  setCurrentSaveSlot: (slotId: string) => void;
}

const DEFAULT_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

function clampRelation(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100, Math.min(100, Math.trunc(n)));
}

function applyTaskRelationshipConsequencesToCodex(
  codex: Record<string, CodexEntry>,
  tasks: GameTask[],
  appliedTaskIds: string[]
): { codex: Record<string, CodexEntry>; appliedTaskIds: string[] } {
  const newlyCompleted = tasks.filter((t) => t.status === "completed" && !appliedTaskIds.includes(t.id));
  if (newlyCompleted.length === 0) return { codex, appliedTaskIds };
  const patches = extractRelationshipPatchesFromConsequences(newlyCompleted);
  if (patches.length === 0) {
    return { codex, appliedTaskIds: [...appliedTaskIds, ...newlyCompleted.map((t) => t.id)] };
  }
  const next = { ...codex };
  for (const p of patches) {
    const prev = next[p.npcId] ?? { id: p.npcId, name: p.npcId, type: "npc" as const };
    const betrayalFlags = Array.isArray(prev.betrayalFlags) ? [...prev.betrayalFlags] : [];
    if (p.betrayalFlagAdd && !betrayalFlags.includes(p.betrayalFlagAdd)) betrayalFlags.push(p.betrayalFlagAdd);
    next[p.npcId] = {
      ...prev,
      favorability: clampRelation((prev.favorability ?? 0) + (p.favorability ?? 0)),
      trust: clampRelation((prev.trust ?? 0) + (p.trust ?? 0)),
      fear: clampRelation((prev.fear ?? 0) + (p.fear ?? 0)),
      debt: clampRelation((prev.debt ?? 0) + (p.debt ?? 0)),
      affection: clampRelation((prev.affection ?? 0) + (p.affection ?? 0)),
      desire: clampRelation((prev.desire ?? 0) + (p.desire ?? 0)),
      ...(typeof p.romanceEligible === "boolean" ? { romanceEligible: p.romanceEligible } : {}),
      ...(p.romanceStage ? { romanceStage: p.romanceStage } : {}),
      ...(betrayalFlags.length > 0 ? { betrayalFlags } : {}),
    };
  }
  return {
    codex: next,
    appliedTaskIds: [...appliedTaskIds, ...newlyCompleted.map((t) => t.id)],
  };
}

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

const DEFAULT_WORLD_OVERLAY = createDefaultWorldOverlay();

function buildFallbackSummaryFromLegacy(legacy: SaveSlotData): ReturnType<typeof buildSnapshotSummary> {
  return buildSnapshotSummary({
    day: legacy.time?.day ?? 0,
    hour: legacy.time?.hour ?? 0,
    playerLocation: legacy.playerLocation ?? "B1_SafeZone",
    activeTasksCount: (legacy.tasks ?? []).filter((t) => t.status === "active" || t.status === "available").length,
    mainThreatByFloor: legacy.mainThreatByFloor ?? DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
    dynamicNpcStates: legacy.dynamicNpcStates ?? {},
    reviveContext: legacy.reviveContext,
  });
}

function buildProfessionWorldFlags(base: Record<string, boolean>, profession: ProfessionStateV1): Record<string, boolean> {
  const next = { ...base };
  for (const id of PROFESSION_IDS) {
    if (profession.progressByProfession?.[id]?.certified) {
      next[getProfessionImprintFlag(id)] = true;
    }
  }
  if (profession.currentProfession) {
    next[`profession.current.${profession.currentProfession}`] = true;
  }
  return next;
}

function resolveProfessionStateFromSlot(data: SaveSlotData | undefined): ProfessionStateV1 {
  const fromSlot = data?.professionState;
  if (fromSlot && typeof fromSlot === "object" && !Array.isArray(fromSlot)) return fromSlot;
  const fromSnapshot = data?.runSnapshotV2?.profession;
  if (fromSnapshot && typeof fromSnapshot === "object" && !Array.isArray(fromSnapshot)) return fromSnapshot;
  return createDefaultProfessionState();
}

export const useGameStore = create<GameState>()(
  persist(
    checksumMiddleware((set, get) => ({
      currentSaveSlot: "main_slot",
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
      mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
      equippedWeapon: null,
      intrusionFlashUntil: 0,
      isGameStarted: false,
      currentBgm: "bgm_1_calm",
      volume: 50,
      activeMenu: null,
      securityFallback: { active: false, message: "", at: 0 },
      reviveContext: {
        pending: false,
        deathLocation: null,
        deathCause: null,
        droppedLootLedger: [],
        droppedLootOwnerLedger: [],
      },
      appliedRelationshipTaskIds: [],
      professionState: createDefaultProfessionState(),
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
          const w = s.equippedWeapon;
          const nextWeapon = w
            ? {
                ...w,
                currentInfusions: tickInfusions(w.currentInfusions),
              }
            : w;
          return { talentCooldowns: next, equippedWeapon: nextWeapon };
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
          currentSaveSlot: "main_slot",
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
          equippedWeapon: null,
          currentOptions: [],
          recentOptions: [],
          inputMode: "options" as const,
          originium: 0,
          tasks: [],
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          dynamicNpcStates: {},
          mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
          intrusionFlashUntil: 0,
          isGameStarted: false,
          currentBgm: "bgm_1_calm",
          activeMenu: null,
          appliedRelationshipTaskIds: [],
          professionState: createDefaultProfessionState(),
          reviveContext: {
            pending: false,
            deathLocation: null,
            deathCause: null,
            droppedLootLedger: [],
            droppedLootOwnerLedger: [],
          },
        }),

      markGameOver: () =>
        set((s) => {
          const autoSlot = createAutoSlotIdFor(s.currentSaveSlot || "main_slot");
          const next = { ...(s.saveSlots ?? {}) };
          delete next[autoSlot];
          return {
            isGameStarted: false,
            saveSlots: next,
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
          equippedWeapon: null,
          currentOptions: [],
          recentOptions: [],
          appliedRelationshipTaskIds: [],
          professionState: createDefaultProfessionState(),
        })),
      recordDeathForRevive: (cause, killerId) =>
        set((s) => {
          const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
          const safeStats = s.stats ?? DEFAULT_STATS;
          const pipeline = runReviveSyncPipeline({
            death: {
              deathLocation: s.playerLocation ?? "B1_SafeZone",
              deathCause: cause ?? "未知死因",
              inventory: s.inventory ?? [],
              hourIndex: nowHour,
            },
            anchorUnlocks:
              s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2?.world?.anchorUnlocks ??
              { B1: true, "1": true, "7": false },
            currentTime: { day: s.time?.day ?? 0, hour: s.time?.hour ?? 0 },
            tasks: s.tasks ?? [],
            dynamicNpcStates: s.dynamicNpcStates ?? {},
            killerId: killerId ?? null,
          });
          const patchedTasks = (s.tasks ?? []).map((t) => {
            const patch = pipeline.taskUpdates.find((u) => u.id === t.id);
            return patch ? { ...t, status: patch.status } : t;
          });
          return {
            time: pipeline.nextTime,
            playerLocation: pipeline.respawnAnchor.nodeId,
            inventory: [],
            stats: { ...safeStats, sanity: Math.max(1, safeStats.sanity) },
            tasks: patchedTasks,
            reviveContext: {
              pending: true,
              deathLocation: s.playerLocation ?? "B1_SafeZone",
              deathCause: cause ?? "未知死因",
              droppedLootLedger: [
                ...(pipeline.lostPool ?? []),
                ...pipeline.droppedLootOwnership.flatMap((x) => x.itemIds),
              ],
              droppedLootOwnerLedger: pipeline.droppedLootOwnership,
              lastReviveAnchorId: pipeline.respawnAnchor.id,
            },
          };
        }),
      chooseReviveOption: (option) =>
        set((s) => {
          if (option === "restart") {
            return {
              reviveContext: {
                pending: false,
                deathLocation: null,
                deathCause: null,
                droppedLootLedger: [],
                droppedLootOwnerLedger: [],
              },
            };
          }
          return {
            isGameStarted: true,
            reviveContext: {
              ...(s.reviveContext ?? {
                pending: true,
                deathLocation: s.playerLocation ?? "B1_SafeZone",
                deathCause: "未知死因",
                droppedLootLedger: [],
                droppedLootOwnerLedger: [],
              }),
              pending: false,
            },
          };
        }),

      clearSaveDataKeepLogs: () =>
        set(() => ({
          isGameStarted: false,
          saveSlots: {},
          inventory: [],
          warehouse: [],
          currentOptions: [],
          recentOptions: [],
          appliedRelationshipTaskIds: [],
          professionState: createDefaultProfessionState(),
        })),

      destroySaveData: () =>
        set({
          logs: [],
          inventory: [],
          warehouse: [],
          equippedWeapon: null,
          saveSlots: {},
          isGameStarted: false,
          currentOptions: [],
          recentOptions: [],
          historicalMaxFloorScore: 0,
          appliedRelationshipTaskIds: [],
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
        set((s) => {
          const normalized = normalizeGameTaskDraft(task);
          if (!normalized) return {};
          const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
          const withLedger =
            normalized.claimMode === "npc_grant" && normalized.npcProactiveGrant.enabled
              ? { ...normalized, npcProactiveGrantLastIssuedHour: nowHour }
              : normalized;
          const exists = (s.tasks ?? []).find((t) => t.id === normalized.id);
          if (exists) {
            const merged = (s.tasks ?? []).map((t) =>
              t.id === normalized.id ? applyTaskUpdateToTask(t, withLedger) : t
            );
            const activated = activateClaimableHiddenTasks(merged);
            const rel = applyTaskRelationshipConsequencesToCodex(
              s.codex ?? {},
              activated,
              s.appliedRelationshipTaskIds ?? []
            );
            const professionState = computeProfessionState({
              prev: s.professionState,
              stats: s.stats ?? DEFAULT_STATS,
              tasks: activated,
              historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
              mainThreatByFloor: s.mainThreatByFloor ?? {},
              codex: rel.codex ?? {},
              inventoryCount: (s.inventory ?? []).length,
              warehouseCount: (s.warehouse ?? []).length,
              equippedWeapon: s.equippedWeapon ?? null,
            });
            return {
              tasks: activated,
              codex: rel.codex,
              appliedRelationshipTaskIds: rel.appliedTaskIds,
              professionState,
            };
          }
          const activated = activateClaimableHiddenTasks([...(s.tasks ?? []), withLedger]);
          const rel = applyTaskRelationshipConsequencesToCodex(
            s.codex ?? {},
            activated,
            s.appliedRelationshipTaskIds ?? []
          );
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: activated,
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: rel.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return {
            tasks: activated,
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
          };
        }),
      updateTaskStatus: (taskId, status) =>
        set((s) => {
          const next = (s.tasks ?? []).map((t) =>
            t.id === taskId ? { ...t, status } : t
          );
          const activated = activateClaimableHiddenTasks(next);
          const rel = applyTaskRelationshipConsequencesToCodex(
            s.codex ?? {},
            activated,
            s.appliedRelationshipTaskIds ?? []
          );
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: activated,
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: rel.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return {
            tasks: activated,
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
          };
        }),
      updateTask: (taskPatch) =>
        set((s) => {
          const patch = normalizeTaskUpdateDraft(taskPatch);
          if (!patch) return {};
          const next = (s.tasks ?? []).map((t) =>
            t.id === patch.id ? applyTaskUpdateToTask(t, patch) : t
          );
          const activated = activateClaimableHiddenTasks(next);
          const rel = applyTaskRelationshipConsequencesToCodex(
            s.codex ?? {},
            activated,
            s.appliedRelationshipTaskIds ?? []
          );
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: activated,
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: rel.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return {
            tasks: activated,
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
          };
        }),
      setPlayerLocation: (loc) =>
        set((s) => {
          const nextScore = resolveFloorScore(loc);
          const prevMax = s.historicalMaxFloorScore ?? 0;
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: s.tasks ?? [],
            historicalMaxFloorScore: Math.max(prevMax, nextScore),
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: s.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return {
            playerLocation: loc,
            historicalMaxFloorScore: Math.max(prevMax, nextScore),
            professionState,
          };
        }),
      updateNpcLocation: (npcId, location) =>
        set((s) => ({
          dynamicNpcStates: {
            ...s.dynamicNpcStates,
            [npcId]: { ...(s.dynamicNpcStates[npcId] ?? { currentLocation: "", isAlive: true }), currentLocation: location },
          },
        })),
      applyMainThreatUpdates: (updates) =>
        set((s) => {
          const safe = Array.isArray(updates) ? updates : [];
          if (safe.length === 0) return {};
          const next = { ...(s.mainThreatByFloor ?? {}) };
          for (const row of safe) {
            const floorId = typeof row.floorId === "string" ? row.floorId : "";
            if (!floorId) continue;
            const prev = next[floorId] ?? {
              threatId: "",
              floorId,
              phase: "idle" as const,
              suppressionProgress: 0,
              lastResolvedAtHour: null,
              counterHintsUsed: [],
            };
            const phaseRaw = typeof row.phase === "string" ? row.phase : prev.phase;
            const phase =
              phaseRaw === "idle" || phaseRaw === "active" || phaseRaw === "suppressed" || phaseRaw === "breached"
                ? phaseRaw
                : prev.phase;
            next[floorId] = {
              ...prev,
              ...(typeof row.threatId === "string" ? { threatId: row.threatId } : {}),
              phase,
              ...(typeof row.suppressionProgress === "number"
                ? { suppressionProgress: Math.max(0, Math.min(100, Math.trunc(row.suppressionProgress))) }
                : {}),
              ...(typeof row.lastResolvedAtHour === "number" && Number.isFinite(row.lastResolvedAtHour)
                ? { lastResolvedAtHour: Math.trunc(row.lastResolvedAtHour) }
                : {}),
              ...(Array.isArray(row.counterHintsUsed)
                ? {
                    counterHintsUsed: row.counterHintsUsed.filter(
                      (x): x is string => typeof x === "string"
                    ),
                  }
                : {}),
            };
          }
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: s.tasks ?? [],
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: next,
            codex: s.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return { mainThreatByFloor: next, professionState };
        }),
      applyWeaponUpdates: (updates) =>
        set((s) => {
          const safe = Array.isArray(updates) ? updates : [];
          if (safe.length === 0) return {};
          let next = s.equippedWeapon ?? null;
          for (const row of safe) {
            if (row.weaponId) {
              const fromCatalog = getWeaponById(row.weaponId);
              if (fromCatalog) next = { ...fromCatalog };
            }
            if (!next) continue;
            if (typeof row.stability === "number" && Number.isFinite(row.stability)) {
              next.stability = Math.max(0, Math.min(100, Math.trunc(row.stability)));
            }
            if (row.calibratedThreatId === null || typeof row.calibratedThreatId === "string") {
              next.calibratedThreatId = row.calibratedThreatId;
            }
            if (Array.isArray(row.currentMods)) {
              next.currentMods = row.currentMods.filter((x): x is Weapon["currentMods"][number] => typeof x === "string");
            }
            if (Array.isArray(row.currentInfusions)) {
              next.currentInfusions = row.currentInfusions
                .filter((x): x is Weapon["currentInfusions"][number] => !!x && typeof x === "object")
                .map((x) => ({
                  threatTag: x.threatTag,
                  turnsLeft: Math.max(0, Math.trunc(Number(x.turnsLeft ?? 0))),
                }));
            }
            if (typeof row.contamination === "number" && Number.isFinite(row.contamination)) {
              next.contamination = Math.max(0, Math.min(100, Math.trunc(row.contamination)));
            }
            if (typeof row.repairable === "boolean") {
              next.repairable = row.repairable;
            }
          }
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: s.tasks ?? [],
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: s.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: next,
          });
          return { equippedWeapon: next, professionState };
        }),
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
              ...(typeof u.trust === "number" ? { trust: u.trust } : {}),
              ...(typeof u.fear === "number" ? { fear: u.fear } : {}),
              ...(typeof u.debt === "number" ? { debt: u.debt } : {}),
              ...(typeof u.affection === "number" ? { affection: u.affection } : {}),
              ...(typeof u.desire === "number" ? { desire: u.desire } : {}),
              ...(typeof u.romanceEligible === "boolean" ? { romanceEligible: u.romanceEligible } : {}),
              ...(u.romanceStage === "none" || u.romanceStage === "hint" || u.romanceStage === "bonded" || u.romanceStage === "committed"
                ? { romanceStage: u.romanceStage }
                : {}),
              ...(Array.isArray(u.betrayalFlags) ? { betrayalFlags: u.betrayalFlags.filter((x): x is string => typeof x === "string") } : {}),
              ...(typeof u.combatPower === "number" ? { combatPower: u.combatPower } : {}),
              ...(typeof u.combatPowerDisplay === "string" ? { combatPowerDisplay: u.combatPowerDisplay } : {}),
              ...(typeof u.personality === "string" ? { personality: u.personality } : {}),
              ...(typeof u.traits === "string" ? { traits: u.traits } : {}),
              ...(typeof u.rules_discovered === "string" ? { rules_discovered: u.rules_discovered } : {}),
              ...(typeof u.weakness === "string" ? { weakness: u.weakness } : {}),
            };
            next[key] = merged;
          }
          const professionState = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: s.tasks ?? [],
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: next,
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return { codex: next, professionState };
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
          tasks: createStageOneStarterTasks(),
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          dynamicNpcStates: Object.fromEntries(
            Object.entries(NPC_HOME_LOCATION_SEED).map(([id, homeLocation]) => [
              id,
              { currentLocation: homeLocation, isAlive: true },
            ])
          ),
          mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
          equippedWeapon: null,
          intrusionFlashUntil: 0,
          isGameStarted: true,
          professionState: createDefaultProfessionState(),
        });
      },

      getPromptContext: () => {
        const s = get();
        const activeSnapshot = s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2;
        const inv = (s.inventory ?? [])
          .map((i) => `${i.name}[${i.id}|${i.tier}]`)
          .join("，");

        const stats = s.stats ?? DEFAULT_STATS;
        const statsText =
          `精神[${stats.sanity}]，` +
          `敏捷[${stats.agility}]，` +
          `幸运[${stats.luck}]，` +
          `魅力[${stats.charm}]，` +
          `出身[${stats.background}]`;

        const talentText = s.talent ? `回响天赋[${s.talent}]` : "回响天赋[未选择]";
        const prof = computeProfessionState({
          prev: s.professionState,
          stats,
          tasks: s.tasks ?? [],
          historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          codex: s.codex ?? {},
          inventoryCount: (s.inventory ?? []).length,
          warehouseCount: (s.warehouse ?? []).length,
          equippedWeapon: s.equippedWeapon ?? null,
        });
        const readiness = evaluateProfessionActiveReadiness(prof.currentProfession, {
          location: s.playerLocation ?? "B1_SafeZone",
          hasHotThreat: Object.values(s.mainThreatByFloor ?? {}).some((x) => x.phase === "active" || x.phase === "suppressed" || x.phase === "breached"),
          activeTasksCount: (s.tasks ?? []).filter((t) => t.status === "active" || t.status === "available").length,
          relationshipUpdatable: Object.values(s.codex ?? {}).some((x) => x.type === "npc"),
          hasAnomalyCodex: Object.values(s.codex ?? {}).some((x) => x.type === "anomaly"),
        });

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
          `职业状态：当前[${prof.currentProfession ?? "无"}]，已认证[${prof.unlockedProfessions.join("/") || "无"}]，可认证[${
            PROFESSION_IDS.filter((id) => prof.eligibilityByProfession[id]).join("/") || "无"
          }]，被动[${prof.activePerks.join("/") || "无"}]。` +
          `职业收益：当前[${prof.currentProfession ?? "无"}]，被动摘要[${getProfessionPassiveSummary(prof.currentProfession)}]，主动摘要[${getProfessionActiveSummary(
            prof.currentProfession
          )}]，主动可用[${
            (() => {
              if (!prof.currentProfession) return "0";
              const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
              const cdKey = getProfessionActiveCooldownKey(prof.currentProfession);
              const cd = Number(prof.professionCooldowns?.[cdKey] ?? 0);
              return cd <= nowHour ? "1" : "0";
            })()
          }]，命中率[${readiness.hitRate}]，提示[${readiness.hint}]。` +
          `职业进度：${PROFESSION_IDS.map((id) => {
            const p = prof.progressByProfession[id] ?? {
              statQualified: false,
              behaviorEvidenceCount: 0,
              behaviorEvidenceTarget: 2,
              trialTaskCompleted: false,
              certified: false,
            };
            return `${id}[属性${p.statQualified ? "1" : "0"}|行为${p.behaviorEvidenceCount}/${p.behaviorEvidenceTarget}|试炼${p.trialTaskCompleted ? "1" : "0"}|认证${p.certified ? "1" : "0"}]`;
          }).join("，")}。` +
          `行囊道具：${inv || "空"}。` +
          (() => {
            const wh = s.warehouse ?? [];
            if (wh.length === 0) return "";
            return ` 仓库物品：${wh.map((w) => `${w.name}[${w.id}]`).join("，")}。`;
          })() +
          `天赋冷却：${ECHO_TALENTS.map((t) => `${t}[剩余${s.talentCooldowns[t]}]`).join("，")}。` +
          `原石[${s.originium}]。` +
          (s.tasks.filter((t) => t.status === "active" || t.status === "available").length > 0
            ? `任务追踪：${s.tasks
                .filter((t) => t.status === "active" || t.status === "available")
                .map((t) => `${t.title}[${t.type}|${t.status}|委托${t.issuerName}|层级${t.floorTier}|领取${t.claimMode}]`)
                .join("，")}。`
            : "") +
          (() => {
            const proactive = (s.tasks ?? [])
              .filter((t) => t.npcProactiveGrant.enabled && (t.status === "available" || t.status === "active" || t.status === "hidden"))
              .map(
                (t) =>
                  `${t.issuerName}:${t.title}[ID${t.npcProactiveGrant.npcId || t.issuerId}|好感>=${t.npcProactiveGrant.minFavorability}|地点${t.npcProactiveGrant.preferredLocations.join("/") || "任意"}|冷却${t.npcProactiveGrant.cooldownHours}h|状态${t.status}|上次发放H${typeof t.npcProactiveGrantLastIssuedHour === "number" ? t.npcProactiveGrantLastIssuedHour : "NA"}]`
              );
            return proactive.length > 0 ? `任务发放线索：${proactive.join("；")}。` : "";
          })() +
          (Object.keys(s.codex ?? {}).length > 0
            ? ` 图鉴已解锁：${Object.values(s.codex ?? {}).map((e) => `${e.name}[${e.type}|好感${e.favorability ?? 0}]`).join("，")}。`
            : "") +
          (activeSnapshot
            ? ` 世界标记：${Object.entries(activeSnapshot.world.worldFlags ?? {})
                .filter(([, v]) => v === true)
                .map(([k]) => k)
                .join("，") || "无"}。锚点解锁：B1[${activeSnapshot.world.anchorUnlocks.B1 ? "1" : "0"}]，1F[${activeSnapshot.world.anchorUnlocks["1"] ? "1" : "0"}]，7F[${activeSnapshot.world.anchorUnlocks["7"] ? "1" : "0"}]。`
            : "") +
          (() => {
            const threatMap = s.mainThreatByFloor ?? {};
            const chunks = Object.values(threatMap)
              .filter((x) => x && typeof x.floorId === "string")
              .map((x) => `${x.floorId}[${x.threatId}|${x.phase}|${x.suppressionProgress}]`);
            return chunks.length > 0 ? ` 主威胁状态：${chunks.join("，")}。` : "";
          })() +
          (() => {
            const w = s.equippedWeapon;
            if (!w) return " 主手武器[未装备]。";
            const tags = (w.counterTags ?? []).join("/");
            const mods = (w.currentMods ?? []).join("/");
            const infusions = (w.currentInfusions ?? []).map((x) => `${x.threatTag}:${x.turnsLeft}`).join("/");
            return ` 主手武器[${w.id}|稳定${w.stability}|反制${tags || "无"}|模组${mods || "无"}|灌注${infusions || "无"}|污染${w.contamination ?? 0}|可修复${w.repairable ? "1" : "0"}]。`;
          })() +
          (s.reviveContext?.deathLocation
            ? ` 最近复活：死亡地点[${s.reviveContext.deathLocation}]，死因[${s.reviveContext.deathCause ?? "未知"}]，掉落数量[${s.reviveContext.droppedLootLedger.length}]，最近锚点[${s.reviveContext.lastReviveAnchorId ?? "未知"}]。`
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
      refreshProfessionState: () =>
        set((s) => {
          const computed = computeProfessionState({
            prev: s.professionState,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: s.tasks ?? [],
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: s.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          let nextTasks = [...(s.tasks ?? [])];
          for (const id of PROFESSION_IDS) {
            const p = computed.progressByProfession[id];
            const taskId = p.trialTaskId ?? getProfessionTrialTaskId(id);
            const exists = nextTasks.some((t) => t.id === taskId);
            if (!exists && p.statQualified && p.behaviorQualified && !p.trialTaskCompleted) {
              nextTasks.push(buildProfessionTrialTask(id));
            }
          }
          const recomputed = computeProfessionState({
            prev: computed,
            stats: s.stats ?? DEFAULT_STATS,
            tasks: nextTasks,
            historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
            mainThreatByFloor: s.mainThreatByFloor ?? {},
            codex: s.codex ?? {},
            inventoryCount: (s.inventory ?? []).length,
            warehouseCount: (s.warehouse ?? []).length,
            equippedWeapon: s.equippedWeapon ?? null,
          });
          return { professionState: recomputed, tasks: nextTasks };
        }),
      certifyProfession: (profession) => {
        const s = get();
        const computed = computeProfessionState({
          prev: s.professionState,
          stats: s.stats ?? DEFAULT_STATS,
          tasks: s.tasks ?? [],
          historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          codex: s.codex ?? {},
          inventoryCount: (s.inventory ?? []).length,
          warehouseCount: (s.warehouse ?? []).length,
          equippedWeapon: s.equippedWeapon ?? null,
        });
        if (!computed.eligibilityByProfession[profession]) return false;
        const nextRaw = certifyProfession(computed, profession);
        const next: ProfessionStateV1 = {
          ...nextRaw,
          professionFlags: {
            ...(nextRaw.professionFlags ?? {}),
            [getProfessionImprintFlag(profession)]: true,
          },
        };
        const imprint = buildProfessionImprintCodex(profession);
        const rel = buildProfessionIssuerRelationshipDelta(profession);
        const codexPrev = s.codex ?? {};
        const relPrev = codexPrev[rel.npcId] ?? {
          id: rel.npcId,
          name: rel.npcName,
          type: "npc" as const,
        };
        const codex = {
          ...codexPrev,
          [imprint.id]: {
            ...(codexPrev[imprint.id] ?? {
              id: imprint.id,
              name: imprint.name,
              type: imprint.type,
            }),
            ...imprint,
          },
          [rel.npcId]: {
            ...relPrev,
            favorability: clampRelation((relPrev.favorability ?? 0) + rel.favorabilityDelta),
          },
        };
        set({ professionState: next, codex });
        return true;
      },
      switchProfession: (profession) => {
        const s = get();
        const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
        const curCd = Number(s.professionState?.professionCooldowns?.switchProfession ?? 0);
        if (Number.isFinite(curCd) && curCd > nowHour) return false;
        const state = s.professionState ?? createDefaultProfessionState();
        if (!state.unlockedProfessions.includes(profession)) return false;
        const next: ProfessionStateV1 = {
          ...state,
          currentProfession: profession,
          activePerks: [PROFESSION_REGISTRY[profession].passivePerkId],
          professionCooldowns: {
            ...(state.professionCooldowns ?? {}),
            switchProfession: nowHour + 24,
          },
        };
        set({ professionState: next });
        return true;
      },
      activateProfessionActive: () => {
        const s = get();
        const prof = s.professionState ?? createDefaultProfessionState();
        const current = prof.currentProfession;
        if (!current) return { ok: false, reason: "当前无职业，无法发动主动。" };
        const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
        const cdKey = getProfessionActiveCooldownKey(current);
        const flagKey = getProfessionActiveFlagKey(current);
        const cooldownTo = Number(prof.professionCooldowns?.[cdKey] ?? 0);
        if (cooldownTo > nowHour) return { ok: false, reason: `职业主动冷却中（剩余${cooldownTo - nowHour}小时）` };
        const location = s.playerLocation ?? "B1_SafeZone";
        const inSafeFloor = location.startsWith("B1_");
        const highThreatPresent = Object.values(s.mainThreatByFloor ?? {}).some(
          (x) => x.phase === "active" || x.phase === "suppressed" || x.phase === "breached"
        );
        const contextTip =
          current === "守灯人"
            ? (highThreatPresent ? "建议本回合执行压制/侦测动作，最大化减压收益。" : "当前威胁压力较低，建议在高压回合前再启用。")
            : current === "巡迹客"
              ? (inSafeFloor ? "建议在跨楼层移动或撤离前启用，收益更高。" : "建议本回合优先执行移动或撤离动作。")
              : current === "觅兆者"
                ? "建议本回合进行前兆识别/弱点验证，触发额外线索补记。"
                : current === "齐日角"
                  ? "建议本回合走交涉/关系更新动作，触发好感微增益。"
                  : "建议本回合推进调查或图鉴更新，触发溯源注记。";
        const next: ProfessionStateV1 = {
          ...prof,
          professionFlags: {
            ...(prof.professionFlags ?? {}),
            [flagKey]: true,
          },
          professionCooldowns: {
            ...(prof.professionCooldowns ?? {}),
            [cdKey]: nowHour + getProfessionActiveCooldownHours(current),
          },
        };
        set({ professionState: next });
        return { ok: true, tip: contextTip };
      },
      consumeProfessionActiveForTurn: () => {
        const s = get();
        const prof = s.professionState ?? createDefaultProfessionState();
        const current = prof.currentProfession;
        if (!current) return null;
        const flagKey = getProfessionActiveFlagKey(current);
        if (!prof.professionFlags?.[flagKey]) return null;
        const next: ProfessionStateV1 = {
          ...prof,
          professionFlags: {
            ...(prof.professionFlags ?? {}),
            [flagKey]: false,
          },
        };
        set({ professionState: next });
        return current;
      },

      setCurrentSaveSlot: (slotId) =>
        set((s) => {
          if (!slotId || !s.saveSlots?.[slotId]) return {};
          return { currentSaveSlot: slotId };
        }),
      renameSaveSlot: (slotId, label) => {
        const name = String(label ?? "").trim();
        if (!slotId || !name) return false;
        const s = get();
        const slot = s.saveSlots?.[slotId];
        if (!slot) return false;
        const nextMeta = normalizeSaveSlotMeta(slot.slotMeta, {
          slotId,
          label: name,
          kind: inferSaveSlotKind(slotId),
          createdAt: slot.runSnapshotV2?.meta?.startedAt ?? new Date().toISOString(),
          runId: slot.runSnapshotV2?.meta?.runId ?? createRunId(),
          parentSlotId: slot.runSnapshotV2?.meta?.branchMeta?.parentSlotId ?? null,
          branchFromDecisionId: slot.runSnapshotV2?.meta?.branchMeta?.branchFromDecisionId ?? null,
          snapshotSummary: buildFallbackSummaryFromLegacy(slot),
        });
        set((prev) => ({
          saveSlots: {
            ...prev.saveSlots,
            [slotId]: {
              ...slot,
              slotMeta: { ...nextMeta, label: name, updatedAt: new Date().toISOString() },
            },
          },
        }));
        return true;
      },
      deleteSaveSlot: (slotId) => {
        const s = get();
        if (!slotId || !s.saveSlots?.[slotId]) return false;
        const ids = Object.keys(s.saveSlots ?? {}).filter((id) => !id.startsWith("auto_"));
        if (ids.length <= 1) return false;
        if (slotId === s.currentSaveSlot) return false;
        const next = { ...s.saveSlots };
        delete next[slotId];
        const autoPair = createAutoSlotIdFor(slotId);
        if (autoPair !== slotId) delete next[autoPair];
        set({ saveSlots: next });
        return true;
      },
      createBranchSlot: (input) => {
        const s = get();
        const location = s.playerLocation ?? "B1_SafeZone";
        const floorId = location.startsWith("B1_")
          ? "B1"
          : location.startsWith("B2_")
            ? "B2"
            : location.match(/^(\d)F_/)?.[1] ?? "";
        const currentThreat = floorId ? (s.mainThreatByFloor?.[floorId] ?? null) : null;
        const anchorUnlocks =
          s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2?.world?.anchorUnlocks ??
          { B1: true, "1": true, "7": false };
        const guard = canCreateManualBranch({
          playerLocation: location,
          revivePending: Boolean(s.reviveContext?.pending),
          isAlive: (s.stats?.sanity ?? 0) > 0,
          anchorUnlocks,
          currentFloorThreat: currentThreat,
        });
        if (!guard.ok) return { ok: false, reason: guard.reason ?? "当前状态不可创建分支" };
        const existing = Object.keys(s.saveSlots ?? {});
        const slotId = createBranchSlotId(existing);
        const nowIso = new Date().toISOString();
        const branchLabel = String(input?.label ?? "").trim() || `分支 ${slotId.replace("branch_", "")}`;
        const parentSlotId = s.currentSaveSlot || "main_slot";
        set((prev) => ({ currentSaveSlot: slotId, saveSlots: { ...prev.saveSlots } }));
        get().saveGame(slotId);
        set((prev) => {
          const slot = prev.saveSlots?.[slotId];
          if (!slot) return {};
          const normalized = normalizeSaveSlotMeta(slot.slotMeta, {
            slotId,
            label: branchLabel,
            kind: inferSaveSlotKind(slotId),
            createdAt: nowIso,
            updatedAt: nowIso,
            runId: slot.runSnapshotV2?.meta?.runId ?? createRunId(),
            parentSlotId,
            branchFromDecisionId: input?.branchFromDecisionId ?? null,
            snapshotSummary: buildFallbackSummaryFromLegacy(slot),
          });
          return {
            saveSlots: {
              ...prev.saveSlots,
              [slotId]: {
                ...slot,
                slotMeta: normalized,
              },
            },
          };
        });
        return { ok: true, slotId };
      },

      saveGame: (slotId) => {
        const s = get();
        const effectiveSlotId = slotId || s.currentSaveSlot || "main_slot";
        const safeStats = s.stats ?? DEFAULT_STATS;
        const computedProfession = computeProfessionState({
          prev: s.professionState,
          stats: safeStats,
          tasks: s.tasks ?? [],
          historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          codex: s.codex ?? {},
          inventoryCount: (s.inventory ?? []).length,
          warehouseCount: (s.warehouse ?? []).length,
          equippedWeapon: s.equippedWeapon ?? null,
        });
        const overlay = createDefaultWorldOverlay();
        const summary = buildSnapshotSummary({
          day: s.time?.day ?? 0,
          hour: s.time?.hour ?? 0,
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          activeTasksCount: (s.tasks ?? []).filter((t) => t.status === "active" || t.status === "available").length,
          mainThreatByFloor: s.mainThreatByFloor ?? overlay.mainThreatByFloor,
          dynamicNpcStates: s.dynamicNpcStates ?? {},
          reviveContext: s.reviveContext,
        });
        const prevMeta = s.saveSlots?.[effectiveSlotId]?.slotMeta;
        const baseMeta = normalizeSaveSlotMeta(prevMeta, {
          slotId: effectiveSlotId,
          label:
            prevMeta?.label ??
            (effectiveSlotId === "main_slot"
              ? "主线存档"
              : effectiveSlotId.startsWith("branch_")
                ? `分支 ${effectiveSlotId.replace("branch_", "")}`
                : effectiveSlotId),
          kind: inferSaveSlotKind(effectiveSlotId),
          createdAt: prevMeta?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runId:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.meta?.runId ??
            createRunId(),
          parentSlotId: prevMeta?.parentSlotId ?? null,
          branchFromDecisionId: prevMeta?.branchFromDecisionId ?? null,
          snapshotSummary: summary,
        });
        const snapshot = buildRunSnapshotV2({
          slotMeta: baseMeta,
          runId:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.meta?.runId ??
            createRunId(),
          startedAt: s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.meta?.startedAt,
          player: {
            name: s.playerName ?? "",
            gender: s.gender ?? "",
            height: s.height ?? 170,
            personality: s.personality ?? "",
          },
          stats: safeStats,
          originium: s.originium ?? 0,
          inventory: s.inventory ?? [],
          warehouse: s.warehouse ?? [],
          codex: (s.codex ?? {}) as Record<string, SnapshotCodexEntry>,
          currentLocation: s.playerLocation ?? "B1_SafeZone",
          alive: (safeStats.sanity ?? 0) > 0,
          equippedWeapon: s.equippedWeapon ?? null,
          deathCount:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.player?.deathCount ?? 0,
          day: s.time?.day ?? 0,
          hour: s.time?.hour ?? 0,
          worldFlags: {
            ...buildProfessionWorldFlags(overlay.worldFlags, computedProfession),
            ...buildProfessionWorldFlags(
              s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.worldFlags ?? {},
              computedProfession
            ),
            darkMoonActive: (s.time?.day ?? 0) >= 3,
          },
          discoveredSecrets:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.discoveredSecrets ?? [],
          anchorUnlocks:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.anchorUnlocks ??
            overlay.anchorUnlocks,
          pendingEvents:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.pendingEvents ?? [],
          floorThreatTier:
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.floorThreatTier ??
            overlay.floorThreatTier,
          mainThreatByFloor:
            s.mainThreatByFloor ??
            overlay.mainThreatByFloor,
          dynamicNpcStates: s.dynamicNpcStates ?? {},
          homeSeed: NPC_HOME_LOCATION_SEED,
          tasks: (s.tasks ?? []).map((t) => ({
            ...t,
            status: t.status ?? "active",
          })),
          profession: computedProfession,
        });
        const legacyProjection = projectSnapshotToLegacy(snapshot);
        const data: SaveSlotData = {
          slotMeta: {
            ...baseMeta,
            runId: snapshot.meta.runId,
            updatedAt: snapshot.meta.lastSavedAt,
            snapshotSummary: summary,
          },
          runSnapshotV2: snapshot,
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
          tasks: JSON.parse(JSON.stringify(s.tasks ?? [])),
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          dynamicNpcStates: JSON.parse(JSON.stringify(s.dynamicNpcStates ?? {})),
          mainThreatByFloor: JSON.parse(
            JSON.stringify(s.mainThreatByFloor ?? overlay.mainThreatByFloor)
          ),
          equippedWeapon: JSON.parse(JSON.stringify(s.equippedWeapon ?? null)),
          reviveContext: JSON.parse(
            JSON.stringify(
              s.reviveContext ?? {
                pending: false,
                deathLocation: null,
                deathCause: null,
                droppedLootLedger: [],
                droppedLootOwnerLedger: [],
              }
            )
          ),
          appliedRelationshipTaskIds: JSON.parse(
            JSON.stringify(s.appliedRelationshipTaskIds ?? [])
          ),
          professionState: JSON.parse(JSON.stringify(computedProfession)),
          ...legacyProjection,
        };
        const summaryWithProfession = {
          ...summary,
          activeProfession: computedProfession.currentProfession ?? null,
        };
        data.slotMeta = {
          ...(data.slotMeta ?? baseMeta),
          snapshotSummary: summaryWithProfession,
        };
        set((prev) => ({ saveSlots: { ...prev.saveSlots, [effectiveSlotId]: data } }));
        const autoSlotId = createAutoSlotIdFor(effectiveSlotId);
        if (autoSlotId !== effectiveSlotId) {
          const autoMeta: SaveSlotMeta = {
            ...data.slotMeta!,
            slotId: autoSlotId,
            kind: "auto_branch",
            label: `${data.slotMeta?.label ?? "自动分支"}（自动）`,
            updatedAt: snapshot.meta.lastSavedAt,
          };
          set((prev) => ({
            saveSlots: {
              ...prev.saveSlots,
              [autoSlotId]: { ...data, slotMeta: autoMeta },
            },
          }));
        }
        void import("@/app/actions/save")
          .then(({ syncSaveToCloud }) =>
            Promise.all([
              syncSaveToCloud(effectiveSlotId, data),
              autoSlotId !== effectiveSlotId
                ? syncSaveToCloud(autoSlotId, {
                    ...data,
                    slotMeta: {
                      ...data.slotMeta!,
                      slotId: autoSlotId,
                      kind: "auto_branch",
                      label: `${data.slotMeta?.label ?? "自动分支"}（自动）`,
                    },
                  })
                : Promise.resolve({ ok: true }),
            ])
          )
          .catch(() => undefined);
      },

      loadGame: (slotId) => {
        const data = get().saveSlots[slotId];
        if (!data) return;
        const normalizedSnapshot = normalizeRunSnapshotV2(
          data.runSnapshotV2,
          data
        );
        const projected = projectSnapshotToLegacy(normalizedSnapshot);
        const professionStateRaw = resolveProfessionStateFromSlot(data);
        const professionState = computeProfessionState({
          prev: professionStateRaw,
          stats: (projected.stats ?? data.stats ?? DEFAULT_STATS),
          tasks: (projected.tasks ?? data.tasks ?? []),
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          mainThreatByFloor: normalizedSnapshot.world.mainThreatByFloor ?? {},
          codex: (projected.codex ?? data.codex ?? {}),
          inventoryCount: (projected.inventory ?? data.inventory ?? []).length,
          warehouseCount: (projected.warehouse ?? data.warehouse ?? []).length,
          equippedWeapon: normalizedSnapshot.player.equippedWeapon ?? data.equippedWeapon ?? null,
        });
        const talentCooldowns =
          data.talentCooldowns && typeof data.talentCooldowns === "object"
            ? { ...DEFAULT_TALENT_COOLDOWNS, ...data.talentCooldowns }
            : DEFAULT_TALENT_COOLDOWNS;
        const safeStats = projected.stats ?? data.stats ?? DEFAULT_STATS;
        const slotMeta = normalizeSaveSlotMeta(data.slotMeta, {
          slotId,
          label: slotId === "main_slot" ? "主线存档" : slotId,
          kind: inferSaveSlotKind(slotId),
          createdAt: normalizedSnapshot.meta.branchMeta?.createdAt ?? normalizedSnapshot.meta.startedAt,
          updatedAt: normalizedSnapshot.meta.lastSavedAt,
          runId: normalizedSnapshot.meta.runId,
          parentSlotId: normalizedSnapshot.meta.branchMeta?.parentSlotId ?? null,
          branchFromDecisionId: normalizedSnapshot.meta.branchMeta?.branchFromDecisionId ?? null,
          snapshotSummary: buildFallbackSummaryFromLegacy(data),
        });
        set({
          currentSaveSlot: slotId,
          saveSlots: {
            ...get().saveSlots,
            [slotId]: {
              ...data,
              slotMeta,
              runSnapshotV2: normalizedSnapshot,
              ...projected,
            },
          },
          stats: JSON.parse(JSON.stringify(safeStats)),
          inventory: JSON.parse(JSON.stringify(projected.inventory ?? data.inventory)),
          warehouse: Array.isArray(projected.warehouse ?? data.warehouse)
            ? JSON.parse(JSON.stringify(projected.warehouse ?? data.warehouse))
            : [],
          logs: JSON.parse(JSON.stringify(data.logs)),
          time: JSON.parse(JSON.stringify(projected.time ?? data.time)),
          codex: JSON.parse(JSON.stringify(projected.codex ?? data.codex)),
          historicalMaxSanity: data.historicalMaxSanity,
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          talent: data.talent ?? null,
          talentCooldowns,
          hasCheckedCodex: data.hasCheckedCodex ?? false,
          originium:
            projected.originium ?? data.originium ?? get().originium ?? 0,
          currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
          currentOptions: Array.isArray(data.currentOptions) ? JSON.parse(JSON.stringify(data.currentOptions)) : [],
          tasks: JSON.parse(JSON.stringify(projected.tasks ?? data.tasks ?? [])),
          playerLocation:
            projected.playerLocation ?? data.playerLocation ?? "B1_SafeZone",
          dynamicNpcStates: JSON.parse(
            JSON.stringify(
              projected.dynamicNpcStates ??
                data.dynamicNpcStates ??
                {}
            )
          ),
          mainThreatByFloor: JSON.parse(
            JSON.stringify(
              normalizedSnapshot.world.mainThreatByFloor ??
                data.mainThreatByFloor ??
                DEFAULT_WORLD_OVERLAY.mainThreatByFloor
            )
          ),
          equippedWeapon: JSON.parse(
            JSON.stringify(
              normalizedSnapshot.player.equippedWeapon ??
                data.equippedWeapon ??
                null
            )
          ),
          reviveContext: JSON.parse(
            JSON.stringify(
              data.reviveContext ?? {
                pending: false,
                deathLocation: null,
                deathCause: null,
                droppedLootLedger: [],
                droppedLootOwnerLedger: [],
              }
            )
          ),
          appliedRelationshipTaskIds: JSON.parse(
            JSON.stringify(data.appliedRelationshipTaskIds ?? [])
          ),
          professionState: JSON.parse(JSON.stringify(professionState)),
          playerName: projected.playerName ?? get().playerName,
          gender: projected.gender ?? get().gender,
          height: projected.height ?? get().height,
          personality: projected.personality ?? get().personality,
        });
      },
      hydrateFromCloud: (slotId, data) => {
        if (!data) return;
        const normalizedSnapshot = normalizeRunSnapshotV2(
          data.runSnapshotV2,
          data
        );
        const projected = projectSnapshotToLegacy(normalizedSnapshot);
        const professionStateRaw = resolveProfessionStateFromSlot(data);
        const professionState = computeProfessionState({
          prev: professionStateRaw,
          stats: (projected.stats ?? data.stats ?? DEFAULT_STATS),
          tasks: (projected.tasks ?? data.tasks ?? []),
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          mainThreatByFloor: normalizedSnapshot.world.mainThreatByFloor ?? {},
          codex: (projected.codex ?? data.codex ?? {}),
          inventoryCount: (projected.inventory ?? data.inventory ?? []).length,
          warehouseCount: (projected.warehouse ?? data.warehouse ?? []).length,
          equippedWeapon: normalizedSnapshot.player.equippedWeapon ?? data.equippedWeapon ?? null,
        });
        const talentCooldowns =
          data.talentCooldowns && typeof data.talentCooldowns === "object"
            ? { ...DEFAULT_TALENT_COOLDOWNS, ...data.talentCooldowns }
            : DEFAULT_TALENT_COOLDOWNS;
        const safeStats = projected.stats ?? data.stats ?? DEFAULT_STATS;
        const slotMeta = normalizeSaveSlotMeta(data.slotMeta, {
          slotId,
          label: slotId === "main_slot" ? "主线存档" : slotId,
          kind: inferSaveSlotKind(slotId),
          createdAt: normalizedSnapshot.meta.branchMeta?.createdAt ?? normalizedSnapshot.meta.startedAt,
          updatedAt: normalizedSnapshot.meta.lastSavedAt,
          runId: normalizedSnapshot.meta.runId,
          parentSlotId: normalizedSnapshot.meta.branchMeta?.parentSlotId ?? null,
          branchFromDecisionId: normalizedSnapshot.meta.branchMeta?.branchFromDecisionId ?? null,
          snapshotSummary: buildFallbackSummaryFromLegacy(data),
        });
        set((s) => {
          const loadedLogs = data.logs ?? [];
          const hasProgress = Array.isArray(loadedLogs) && loadedLogs.length > 0;
          void hasProgress;
          return {
            currentSaveSlot: slotId,
            saveSlots: {
              ...s.saveSlots,
              [slotId]: {
                ...data,
                slotMeta,
                runSnapshotV2: normalizedSnapshot,
                ...projected,
              },
            },
            stats: JSON.parse(JSON.stringify(safeStats)),
            inventory: JSON.parse(JSON.stringify(projected.inventory ?? data.inventory)),
            warehouse: Array.isArray(projected.warehouse ?? data.warehouse)
              ? JSON.parse(JSON.stringify(projected.warehouse ?? data.warehouse))
              : [],
            logs: JSON.parse(JSON.stringify(data.logs ?? [])),
            time: JSON.parse(JSON.stringify(projected.time ?? data.time ?? { day: 0, hour: 0 })),
            codex: JSON.parse(JSON.stringify(projected.codex ?? data.codex ?? {})),
            historicalMaxSanity: data.historicalMaxSanity ?? 50,
            historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
            talent: data.talent ?? s.talent ?? null,
            talentCooldowns,
            hasCheckedCodex: data.hasCheckedCodex ?? false,
            originium: projected.originium ?? data.originium ?? s.originium ?? 0,
            currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
            currentOptions: Array.isArray(data.currentOptions) ? JSON.parse(JSON.stringify(data.currentOptions)) : [],
            tasks: JSON.parse(
              JSON.stringify(projected.tasks ?? data.tasks ?? s.tasks ?? [])
            ),
            playerLocation:
              projected.playerLocation ??
              data.playerLocation ??
              s.playerLocation ??
              "B1_SafeZone",
            dynamicNpcStates: JSON.parse(
              JSON.stringify(
                projected.dynamicNpcStates ??
                  data.dynamicNpcStates ??
                  s.dynamicNpcStates ??
                  {}
              )
            ),
            mainThreatByFloor: JSON.parse(
              JSON.stringify(
                normalizedSnapshot.world.mainThreatByFloor ??
                  data.mainThreatByFloor ??
                  s.mainThreatByFloor ??
                  DEFAULT_WORLD_OVERLAY.mainThreatByFloor
              )
            ),
            equippedWeapon: JSON.parse(
              JSON.stringify(
                normalizedSnapshot.player.equippedWeapon ??
                  data.equippedWeapon ??
                  s.equippedWeapon ??
                  null
              )
            ),
            reviveContext: JSON.parse(
              JSON.stringify(
                data.reviveContext ??
                  s.reviveContext ?? {
                    pending: false,
                    deathLocation: null,
                    deathCause: null,
                    droppedLootLedger: [],
                    droppedLootOwnerLedger: [],
                  }
              )
            ),
            appliedRelationshipTaskIds: JSON.parse(
              JSON.stringify(data.appliedRelationshipTaskIds ?? s.appliedRelationshipTaskIds ?? [])
            ),
            professionState: JSON.parse(JSON.stringify(professionState)),
            playerName: projected.playerName ?? s.playerName,
            gender: projected.gender ?? s.gender,
            height: projected.height ?? s.height,
            personality: projected.personality ?? s.personality,
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
        mainThreatByFloor: s.mainThreatByFloor ?? DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
        equippedWeapon: s.equippedWeapon ?? null,
        reviveContext: s.reviveContext ?? {
          pending: false,
          deathLocation: null,
          deathCause: null,
          droppedLootLedger: [],
          droppedLootOwnerLedger: [],
        },
        appliedRelationshipTaskIds: s.appliedRelationshipTaskIds ?? [],
        professionState: s.professionState ?? createDefaultProfessionState(),
        isGameStarted: s.isGameStarted ?? false,
        volume: clampVolume(s.volume ?? 50),
      }),
    }
  )
);
