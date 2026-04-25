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
import { inferEffectiveNarrativeLayer } from "@/lib/tasks/taskRoleModel";
import type { ConflictFeedbackViewModel } from "@/lib/play/conflictFeedbackPresentation";
import { enableTaskModeLayer } from "@/lib/playRealtime/npcNarrativeRolloutFlags";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import {
  createDefaultWorldOverlay,
  normalizeRunSnapshotV2,
  projectSnapshotToLegacy,
} from "@/lib/state/snapshot/migration";
import type { MemorySpineState } from "@/lib/memorySpine/types";
import { createEmptyMemorySpine } from "@/lib/memorySpine/types";
import { extractMemoryCandidates } from "@/lib/memorySpine/extract";
import { reduceMemoryCandidates } from "@/lib/memorySpine/reducer";
import type { MemoryCandidateDraft } from "@/lib/memorySpine/reducer";
import { pruneMemorySpine } from "@/lib/memorySpine/prune";
import { buildRecallContext, selectMemoryRecallPacket } from "@/lib/memorySpine/selectors";
import { buildMemoryRecallBlock } from "@/lib/memorySpine/prompt";
import { selectPromotionFactTexts } from "@/lib/memorySpine/promote";
import { buildTaskDramaPacket } from "@/lib/tasks/drama";
import { buildNpcHeartPromptBlock } from "@/lib/npcHeart/prompt";
import { buildNpcHeartRuntimeView, selectRelevantNpcHearts } from "@/lib/npcHeart/selectors";
import { buildCombatNarrativeStyleBlock } from "@/lib/combat/combatNarrativeStyleBlock";
import { buildCombatPromptBlockV1 } from "@/lib/combat/combatPromptBlock";
import type { IncidentQueueState, StoryDirectorState } from "@/lib/storyDirector/types";
import { createEmptyDirectorState, createEmptyIncidentQueue } from "@/lib/storyDirector/types";
import { postTurnStoryDirectorUpdate } from "@/lib/storyDirector/postTurn";
import { buildDirectorDigestForServer, buildDirectorPromptBlock } from "@/lib/storyDirector/prompt";
import { buildIncidentDigest, normalizeIncidentQueue } from "@/lib/storyDirector/queue";
import type { EscapeMainlineState } from "@/lib/escapeMainline/types";
import { createDefaultEscapeMainlineTemplate } from "@/lib/escapeMainline/template";
import { normalizeEscapeMainline } from "@/lib/escapeMainline/reducer";
import { advanceEscapeMainlineFromResolvedTurn } from "@/lib/escapeMainline/integration";
import { buildEscapePromptBlock } from "@/lib/escapeMainline/prompt";
import { getEscapeObjectiveSummary } from "@/lib/escapeMainline/selectors";
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
import { buildItemGameplayPromptBlock } from "@/lib/play/itemGameplay";
import type { ProfessionId, ProfessionStateV1 } from "@/lib/profession/types";
import { createDefaultProfessionState, PROFESSION_IDS, PROFESSION_REGISTRY } from "@/lib/profession/registry";
import { certifyProfession, computeProfessionState } from "@/lib/profession/engine";
import { buildProfessionTrialTask, getProfessionTrialTaskId } from "@/lib/profession/trials";
import { buildProfessionIdentityDigest, buildProfessionApproachSnapshots } from "@/lib/profession/progressionUi";
import { computeProfessionVisibility } from "@/lib/profession/professionVisibilityPolicy";
import { extractProfessionNarrativeCues } from "@/lib/profession/professionNarrativeHooks";
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
  getProfessionActiveSkillName,
  getProfessionActiveSummary,
  getProfessionPassiveSummary,
} from "@/lib/profession/benefits";
import {
  clearResumeShadowSnapshot,
  readResumeShadowSnapshot,
  writeResumeShadowFromState,
} from "@/lib/state/resumeShadow";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import { createEmptyJournalState, JOURNAL_STATE_VERSION } from "@/lib/domain/narrativeDomain";
import { mergeCluesWithDedupe } from "@/lib/domain/clueMerge";
import { repairNarrativeCrossRefs } from "@/lib/domain/narrativeIntegrity";
import type { NarrativeIntegrityReport } from "@/lib/domain/narrativeIntegrity";
import { narrativeDebugEnabled } from "@/lib/domain/narrativeDebug";
import { buildNarrativeLinkagePromptBlock } from "@/lib/domain/narrativeLinkagePrompt";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import { normalizeActionTimeCostKind } from "@/lib/time/actionCost";
import { resolveHourProgressDelta, splitProgress } from "@/lib/time/timeBudget";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import {
  CHAPTER_DEFINITIONS,
  createInitialChapterState,
  enterNextChapter,
  getChapterDefinition,
  normalizeChapterState,
  recordChapterTurnInState,
  returnToActiveChapter,
  reviewCompletedChapter,
  type ChapterId,
  type ChapterState,
  type ChapterTurnSignals,
} from "@/lib/chapters";

const DB_KEY = "versecraft-storage";
const PERSIST_VERSION = 1;

function normalizeStoredOptions(options: unknown, maxCount = 4): string[] {
  if (!Array.isArray(options)) return [];
  return filterNarrativeActionOptions(
    options.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()),
    maxCount
  );
}

/** 读档/云拉取后：修剪非法物证门槛、清理失效的 clue→objective 指针，并写回 journal。 */
function applyNarrativeIntegrityOnBundle(args: {
  normalizedSnapshot: RunSnapshotV2;
  projectedTasks: GameTaskV2[];
  inventory: Array<{ id?: string }>;
  warehouse: Array<{ id?: string }>;
}): {
  normalizedSnapshot: RunSnapshotV2;
  tasks: GameTaskV2[];
  report: NarrativeIntegrityReport;
} {
  const clues = args.normalizedSnapshot.journal?.clues ?? [];
  const { tasks, clues: cluesOut, report } = repairNarrativeCrossRefs({
    tasks: args.projectedTasks,
    clues,
    inventoryItemIds: args.inventory.map((i) => String(i?.id ?? "").trim()).filter(Boolean),
    warehouseItemIds: args.warehouse.map((w) => String(w?.id ?? "").trim()).filter(Boolean),
  });
  const baseJournal = args.normalizedSnapshot.journal ?? createEmptyJournalState();
  return {
    normalizedSnapshot: {
      ...args.normalizedSnapshot,
      journal: {
        ...baseJournal,
        version: baseJournal.version ?? JOURNAL_STATE_VERSION,
        clues: cluesOut,
      },
    },
    tasks,
    report,
  };
}

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
      chapterState: normalizeChapterState(legacy.chapterState ?? snapshot.chapterState),
      slotMeta,
      runSnapshotV2: snapshot,
      ...projectSnapshotToLegacy(snapshot),
    };
  }
  return {
    ...raw,
    chapterState: normalizeChapterState(raw.chapterState),
    deathCount: typeof raw.deathCount === "number" && Number.isFinite(raw.deathCount) ? raw.deathCount : 0,
    saveSlots: migratedSlots,
    pendingHourProgress:
      typeof raw.pendingHourProgress === "number" && Number.isFinite(raw.pendingHourProgress)
        ? Math.max(0, Math.min(0.999999, raw.pendingHourProgress))
        : 0,
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

function applyWholeGameHourTicks(args: {
  time: GameTime;
  originium: number;
  background: number;
  talentCooldowns: Record<EchoTalent, number>;
  equippedWeapon: Weapon | null;
  hourTicks: number;
}): {
  time: GameTime;
  originium: number;
  talentCooldowns: Record<EchoTalent, number>;
  equippedWeapon: Weapon | null;
} {
  let { time, originium, talentCooldowns, equippedWeapon } = args;
  const prob = 0.1 + Math.max(0, args.background - 20) * 0.02;
  for (let i = 0; i < args.hourTicks; i++) {
    if (Math.random() < prob) originium += 1;
    const nh = time.hour + 1;
    time = nh >= 24 ? { day: time.day + 1, hour: 0 } : { day: time.day, hour: nh };
    const nextCd = { ...talentCooldowns } as Record<EchoTalent, number>;
    for (const k of ECHO_TALENTS) {
      const v = Number(nextCd[k]);
      nextCd[k] = Number.isFinite(v) && v > 0 ? v - 1 : 0;
    }
    talentCooldowns = nextCd;
    equippedWeapon = equippedWeapon
      ? { ...equippedWeapon, currentInfusions: tickInfusions(equippedWeapon.currentInfusions) }
      : null;
  }
  return { time, originium, talentCooldowns, equippedWeapon };
}

export interface CodexEntry {
  id: string;
  name: string;
  type: "npc" | "anomaly";
  /** 我目前掌握的、可展示的情报（由 DM 生成并通过 codex_updates 下发；为空则视为暂无） */
  known_info?: string;
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
  /** 武器背包：未装备武器列表（装备系统 V3） */
  weaponBag?: Weapon[];
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
  chapterState?: ChapterState;
}

export interface AuthUser {
  name: string;
}

/** Unified modal / panel: null = all closed. Pure UI; not bundled into save slots. */
export type ActiveMenu =
  | "character"
  | "settings"
  | "backpack"
  | "codex"
  | "warehouse"
  | "achievements"
  | null;

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

export interface GameState extends IntegrityMetaState {
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

  /** Time tick: day 0-9+, hour 0-23.整点推进仍由「满 1 小时分数」触发。 */
  time: GameTime;
  /**
   * 当前游戏小时内的余量 [0,1)。与 `applyGameTimeFromResolvedTurn` 累计；不对玩家改 UI。
   */
  pendingHourProgress: number;

  stats: Record<StatType, number>;
  /** Max sanity ever reached; used by 生命汇源 talent */
  historicalMaxSanity: number;

  inventory: Item[];
  logs: { role: string; content: string; reasoning?: string }[];

  /** 图鉴：NPC/诡异情报，由 DM 通过 codex_updates 推送 */
  codex: Record<string, CodexEntry>;
  /**
   * 场景级外貌描写去重账本（key=player_location，value=该场景内已写过外貌的 npcId 列表）。
   * 只用于提示词去重，不参与世界观真相与判定。
   */
  sceneNpcAppearanceLedger?: Record<string, string[]>;

  /** Phase-2: run-local hot memory spine（热记忆脊柱） */
  memorySpine: MemorySpineState;

  /** Phase-4: 轻量剧情导演层 */
  storyDirector: StoryDirectorState;
  /** Phase-4: 轻量突发事件队列 */
  incidentQueue: IncidentQueueState;

  /** Phase-5: 出口主线骨架（Escape Mainline） */
  escapeMainline: EscapeMainlineState;

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
  /** 手记/线索簿（与 runSnapshotV2.journal 同步） */
  journalClues: ClueEntry[];
  /** 用户当前位置 */
  playerLocation: string;
  /** 历史最高抵达楼层分数（B1=0, 1F=1, ..., B2=99），用于结算与排行榜 */
  historicalMaxFloorScore: number;
  /** 累计死亡次数：供 prompt / 揭露门闸；与存档 snapshot.player.deathCount 同步 */
  deathCount: number;
  /** NPC 动态状态（位置 + 存活） */
  dynamicNpcStates: Record<string, { currentLocation: string; isAlive: boolean }>;
  /** 楼层主威胁状态（第二阶段） */
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  /** 第二阶段武器最小版：主手唯一槽位 */
  equippedWeapon: Weapon | null;
  /**
   * 武器背包（未装备武器列表）。
   * - 背包里的武器不生效，只能作为“待装备物品”。
   * - 装备/卸下/更换都应通过服务端裁决回写落地，前端不得瞬间切换绕过回合成本。
   */
  weaponBag: Weapon[];
  /** 非法闯入警戒闪烁计时 */
  intrusionFlashUntil: number;
  /** 是否已开始游戏（角色初始化完成后为 true） */
  isGameStarted: boolean;
  /** 固定开场白是否钉在顶部（本局永久展示）。不改 UI 结构，仅控制是否渲染 `FIXED_OPENING_NARRATIVE`。 */
  openingNarrativePinned: boolean;
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
  chapterState: ChapterState;
  /** Phase-2：职业叙事提示（仅运行时消费；不入存档）。 */
  professionNarrativeCues?: Array<{ code: string; title: string; line: string; profession: ProfessionId; npcId: string }>;
  /** Phase-3.5：可选 combat_summary 回写（仅用于验证“冲突后局势怎么变”；不改变既有主链路结算）。 */
  combatSummariesV1?: Array<{
    v: 1;
    atTurn: number;
    atHour: number;
    locationId: string;
    npcIds: string[];
    kind?: string;
    outcomeTier?: string;
    text: string;
  }>;
  /** Phase-3：前台快捷行动（仅 UI 辅助；不入存档）。 */
  pendingClientAction?: { text: string; autoSend: boolean; source: "weapon" | "system" };
  /** 是否已在叙事中遇到 1F 认证 NPC（路线引导大姐姐 N-010） */
  hasMetProfessionCertifier: boolean;
  _integrity_dirty: boolean;
  verifyStateIntegrity: () => Promise<boolean>;
  markMetProfessionCertifier: () => void;
  pushCombatSummaryV1: (x: {
    atTurn: number;
    atHour: number;
    locationId: string;
    npcIds?: string[];
    kind?: string;
    outcomeTier?: string;
    text: string;
  }) => void;
  /** 关键冲突回合余音（不入存档；新回合无冲突时清空） */
  conflictTurnFeedback: ConflictFeedbackViewModel | null;
  setConflictTurnFeedback: (v: ConflictFeedbackViewModel | null) => void;
  queueClientAction: (text: string, autoSend?: boolean, source?: "weapon" | "system") => void;
  consumeClientAction: () => { text: string; autoSend: boolean; source: "weapon" | "system" } | null;
  triggerSecurityFallback: (reason?: string) => void;
  setHydrated: (state: boolean) => void;
  setVolume: (volume: number) => void;
  setActiveMenu: (menu: ActiveMenu) => void;
  recordChapterTurn: (signals: ChapterTurnSignals) => ChapterState;
  enterNextChapter: () => void;
  reviewChapter: (chapterId: ChapterId) => void;
  returnToActiveChapter: () => void;
  dismissChapterEnd: () => void;
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
    weapon?: Weapon | null;
    unequip?: boolean;
    stability?: number;
    calibratedThreatId?: string | null;
    currentMods?: Weapon["currentMods"];
    currentInfusions?: Weapon["currentInfusions"];
    contamination?: number;
    repairable?: boolean;
  }>) => void;
  applyWeaponBagUpdates: (updates: Array<
    | { removeWeaponId: string }
    | { addWeapon: Weapon }
    | { addEquippedWeaponId: string }
  >) => void;
  killNpc: (npcId: string) => void;
  triggerIntrusionFlash: () => void;
  setHasCheckedCodex: (v: boolean) => void;
  mergeCodex: (updates: CodexEntry[]) => void;
  /**
   * DM `clue_updates` 经 resolveDmTurn 规范化后的合并入口：按 id 去重、状态晋升、上限裁剪。
   */
  mergeJournalClueUpdates: (incoming: ClueEntry[]) => void;
  markSceneNpcAppearanceWritten: (playerLocation: string, npcIds: string[]) => void;
  pushLog: (entry: { role: string; content: string; reasoning?: string }) => void;
  popLastNLogs: (n: number) => void;
  advanceTime: () => void;
  /**
   * 按 DM `consumes_time` + 可选 `time_cost` 计入小时分数，满 1 推进整点（含冷却/灌注/原石掷骰）。
   * @returns 本回合实际推进的整小时数（供 UI 事件如「第三日」检测）
   */
  applyGameTimeFromResolvedTurn: (args: { consumes_time: boolean; time_cost?: string }) => {
    hoursAdvanced: number;
    deltaApplied: number;
  };
  rewindTime: () => void;
  setTime: (time: GameTime) => void;
  setStats: (stats: Partial<Record<StatType, number>>) => void;
  setInventory: (inventory: Item[]) => void;
  addToInventory: (item: Item) => void;
  addItems: (items: Item[]) => void;
  removeFromInventory: (itemId: string) => void;
  consumeItems: (itemNames: string[]) => void;
  addWarehouseItems: (items: WarehouseItem[]) => void;
  removeWarehouseItems: (itemKeys: string[]) => void;

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

  /**
   * 发往 `/api/chat` 的结构化上下文（用于服务端裁决输入，降低 `playerContext` 文本自报作弊面）。
   * 兼容策略：`playerContext` 仍会发送给模型看，但服务端 guard 将优先使用该结构化字段。
   */
  getStructuredClientStateForServer: () => {
    v: 1;
    turnIndex: number;
    playerLocation: string;
    time: { day: number; hour: number };
    /** 当前游戏小时内已累积进度 0..1（未进位前的小时碎片） */
    pendingHourFraction?: number;
    stats: Record<StatType, number>;
    originium: number;
    inventoryItemIds: string[];
    warehouseItemIds: string[];
    equippedWeapon: Weapon | null;
    weaponBag: Weapon[];
    currentProfession: ProfessionId | null;
    worldFlags: string[];
    presentNpcIds: string[];
    /** Phase-2: 极短记忆摘要（不上传完整记忆数组） */
    memoryDigest?: string;
    /** Phase-2: 可选投影到 facts 的少量短文本（best-effort / budgeted） */
    memoryPromotions?: string[];
    /** Phase-2: 本回合 recall 的轻量 tag（用于未来 hooks 对齐） */
    memoryHintCodes?: string[];
    /** 手记线索条数（shown），供服务端守卫与 prompt 预算 */
    journalClueCount?: number;
    /** 少量线索 id，供对齐检定（非全文） */
    journalClueIds?: string[];
    /** Phase-4: 极简导演摘要（不上传完整队列/长文本） */
    directorDigest?: {
      tension: number;
      stallCount: number;
      beatModeHint: string;
      pressureFlags: string[];
      pendingIncidentCodes: string[];
      mustRecallHookCodes: string[];
      digest: string;
    };
  };

  /** Phase-2: 提交回合后写入记忆脊柱（基于结构化回写，避免 narrative 抽取成为主路径） */
  appendResolvedTurnMemories: (args: {
    resolvedTurn: any;
    before: {
      playerLocation: string;
      activeTaskIds: string[];
      presentNpcIds: string[];
      mainThreatByFloor: Record<string, { floorId: string; phase: string }>;
    };
  }) => void;

  /** Phase-2: 构建 prompt 用的短 recall block（300~600 中文字符级） */
  buildMemoryRecallBlock: () => { text: string; digest: string; hintCodes: string[]; promotions: string[] };

  /** Phase-3: 允许任务/NPC 后果链补写少量结构化记忆候选（不走 narrative） */
  applyMemoryCandidates: (candidates: import("@/lib/memorySpine/reducer").MemoryCandidateDraft[], nowHourOverride?: number) => void;

  /** Phase-4: 回合 commit 后推进导演与事件队列（确定性） */
  postTurnStoryDirectorUpdate: (args: {
    resolvedTurn: any;
    pre: {
      playerLocation: string;
      tasks: import("@/lib/tasks/taskV2").GameTaskV2[];
      mainThreatByFloor: Record<string, { phase?: string }>;
      memoryEntries: import("@/lib/memorySpine/types").MemorySpineEntry[];
    };
    preTurnIndex?: number;
  }) => void;

  /** Phase-5: 回合 commit 后推进出口主线（确定性） */
  advanceEscapeMainlineFromResolvedTurn: (args: {
    resolvedTurn: any;
    nowTurnOverride?: number;
    nowHourOverride?: number;
  }) => void;
  buildEscapePromptBlock: () => string;
  getEscapeObjectiveSummary: () => { stage: string; nextObjective: string; blockers: string[] };

  performCheck: (
    baseStat: StatType,
    anomalyThreshold: number,
    anomalyWeaknessTags: string
  ) => PerformCheckResult;

  saveGame: (slotId: string) => void;
  loadGame: (slotId: string) => void;
  hydrateFromCloud: (slotId: string, data: SaveSlotData) => void;
  /** 同步写入崩溃恢复 shadow，避免仅靠 IDB 防抖刷盘导致“突然退出后无继续执笔”。 */
  writeResumeShadow: () => void;
  /** 从本地 shadow 直接恢复可继续状态（兜底入口，不覆盖云端）。 */
  hydrateFromResumeShadow: () => boolean;
  /** 清理本地 shadow（例如开新局/死亡清档后）。 */
  clearResumeShadow: () => void;
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

function ensureProfessionTrialTasks(tasks: GameTask[], professionState: ProfessionStateV1): GameTask[] {
  const base = Array.isArray(tasks) ? tasks : [];
  const rollout = getVerseCraftRolloutFlags();
  if (!rollout.enableProfessionTrialNarrativeGrant) return base;
  if (professionState?.currentProfession) return base;
  const existing = new Set(base.map((t) => t.id));
  const next = [...base];
  for (const id of PROFESSION_IDS) {
    const prog = professionState.progressByProfession?.[id];
    if (!prog?.trialOffered || !prog.trialTaskId) continue;
    if (existing.has(prog.trialTaskId)) continue;
    // 叙事授予：以口头约定的形式进入“承诺/风险带”（由 taskV2 narrative layer/ grantState 承载）
    next.push(buildProfessionTrialTask(id));
    existing.add(prog.trialTaskId);
  }
  return next;
}

function attachProfessionNarrativeCues(prev: ProfessionStateV1 | null | undefined, next: ProfessionStateV1): Array<{ code: string; title: string; line: string; profession: ProfessionId; npcId: string }> {
  try {
    return extractProfessionNarrativeCues({ prev, next });
  } catch {
    return [];
  }
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
      pendingHourProgress: 0,
      stats: { ...DEFAULT_STATS },
      historicalMaxSanity: 50,
      inventory: [],
      logs: [],
      codex: {},
      memorySpine: createEmptyMemorySpine(),
      hasCheckedCodex: false,
      warehouse: [],
      currentOptions: [],
      recentOptions: [],
      inputMode: "options" as const,
      originium: 0,
      tasks: [],
      journalClues: [],
      playerLocation: "B1_SafeZone",
      historicalMaxFloorScore: 0,
      deathCount: 0,
      dynamicNpcStates: {},
      mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
      equippedWeapon: null,
      weaponBag: [],
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
      chapterState: createInitialChapterState(),
      hasMetProfessionCertifier: false,
      professionNarrativeCues: [],
      combatSummariesV1: [],
      conflictTurnFeedback: null,
      pendingClientAction: null,
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
      recordChapterTurn: (signals) => {
        const state = get();
        const chapterState = normalizeChapterState(state.chapterState);
        const definition = getChapterDefinition(chapterState.activeChapterId);
        if (!definition) return chapterState;
        const nextState = recordChapterTurnInState({
          state: chapterState,
          definition,
          signals,
          runtime: { suppressCompletion: signals.isDeath === true },
        });
        set({ chapterState: nextState });
        return nextState;
      },
      enterNextChapter: () =>
        set((s) => ({
          chapterState: enterNextChapter(normalizeChapterState(s.chapterState), CHAPTER_DEFINITIONS),
        })),
      reviewChapter: (chapterId) =>
        set((s) => ({
          chapterState: reviewCompletedChapter(normalizeChapterState(s.chapterState), chapterId),
        })),
      returnToActiveChapter: () =>
        set((s) => ({
          chapterState: returnToActiveChapter(normalizeChapterState(s.chapterState)),
        })),
      dismissChapterEnd: () =>
        set((s) => ({
          chapterState: { ...normalizeChapterState(s.chapterState), pendingChapterEndId: null },
        })),
      queueClientAction: (text, autoSend = false, source = "system") =>
        set(() => {
          const trimmed = String(text ?? "").trim();
          if (!trimmed) return {};
          return { pendingClientAction: { text: trimmed, autoSend: Boolean(autoSend), source } };
        }),
      consumeClientAction: () => {
        const cur = get().pendingClientAction ?? null;
        if (!cur) return null;
        set({ pendingClientAction: null });
        return cur;
      },
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
      resetForNewGame: () => {
        clearResumeShadowSnapshot();
        set({
          currentSaveSlot: "main_slot",
          playerName: "",
          gender: "",
          height: 170,
          personality: "",
          talent: null,
          talentCooldowns: { ...DEFAULT_TALENT_COOLDOWNS },
          time: { day: 0, hour: 0 },
          pendingHourProgress: 0,
          stats: { ...DEFAULT_STATS },
          historicalMaxSanity: DEFAULT_STATS.sanity,
          inventory: [],
          logs: [],
          codex: {},
          hasCheckedCodex: false,
          warehouse: [],
          equippedWeapon: null,
          weaponBag: [],
          currentOptions: [],
          recentOptions: [],
          inputMode: "options" as const,
          originium: 0,
          tasks: [],
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          deathCount: 0,
          dynamicNpcStates: {},
          mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
          intrusionFlashUntil: 0,
          isGameStarted: false,
          openingNarrativePinned: false,
          currentBgm: "bgm_1_calm",
          activeMenu: null,
          appliedRelationshipTaskIds: [],
          professionState: createDefaultProfessionState(),
          chapterState: createInitialChapterState(),
          hasMetProfessionCertifier: false,
          journalClues: [],
          conflictTurnFeedback: null,
          reviveContext: {
            pending: false,
            deathLocation: null,
            deathCause: null,
            droppedLootLedger: [],
            droppedLootOwnerLedger: [],
          },
        });
      },

      markGameOver: () => {
        clearResumeShadowSnapshot();
        set((s) => {
          const autoSlot = createAutoSlotIdFor(s.currentSaveSlot || "main_slot");
          const next = { ...(s.saveSlots ?? {}) };
          delete next[autoSlot];
          return {
            isGameStarted: false,
            saveSlots: next,
          };
        });
      },

      clearSaveForDeath: () => {
        clearResumeShadowSnapshot();
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
          chapterState: createInitialChapterState(),
          hasMetProfessionCertifier: false,
        }));
      },
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
            deathCount: (s.deathCount ?? 0) + 1,
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

      clearSaveDataKeepLogs: () => {
        clearResumeShadowSnapshot();
        set(() => ({
          isGameStarted: false,
          saveSlots: {},
          inventory: [],
          warehouse: [],
          currentOptions: [],
          recentOptions: [],
          appliedRelationshipTaskIds: [],
          professionState: createDefaultProfessionState(),
          chapterState: createInitialChapterState(),
          hasMetProfessionCertifier: false,
        }));
      },

      destroySaveData: () => {
        clearResumeShadowSnapshot();
        set({
          logs: [],
          inventory: [],
          warehouse: [],
          equippedWeapon: null,
          weaponBag: [],
          saveSlots: {},
          isGameStarted: false,
          currentOptions: [],
          recentOptions: [],
          historicalMaxFloorScore: 0,
          deathCount: 0,
          appliedRelationshipTaskIds: [],
          chapterState: createInitialChapterState(),
          hasMetProfessionCertifier: false,
        });
      },

      setCurrentOptions: (options) =>
        set((s) => {
          const safeOptions = normalizeStoredOptions(options, 4);
          const appended = [...(s.recentOptions ?? []), ...safeOptions];
          const trimmed = appended.slice(-8);
          return { currentOptions: safeOptions, recentOptions: trimmed };
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
            const prevProfession = s.professionState;
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
              tasks: ensureProfessionTrialTasks(activated, professionState),
              codex: rel.codex,
              appliedRelationshipTaskIds: rel.appliedTaskIds,
              professionState,
              professionNarrativeCues: attachProfessionNarrativeCues(prevProfession, professionState),
            };
          }
          const activated = activateClaimableHiddenTasks([...(s.tasks ?? []), withLedger]);
          const rel = applyTaskRelationshipConsequencesToCodex(
            s.codex ?? {},
            activated,
            s.appliedRelationshipTaskIds ?? []
          );
          const prevProfession = s.professionState;
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
            tasks: ensureProfessionTrialTasks(activated, professionState),
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
            professionNarrativeCues: attachProfessionNarrativeCues(prevProfession, professionState),
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
          const prevProfession = s.professionState;
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
            tasks: ensureProfessionTrialTasks(activated, professionState),
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
            professionNarrativeCues: attachProfessionNarrativeCues(prevProfession, professionState),
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
          const prevProfession = s.professionState;
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
            tasks: ensureProfessionTrialTasks(activated, professionState),
            codex: rel.codex,
            appliedRelationshipTaskIds: rel.appliedTaskIds,
            professionState,
            professionNarrativeCues: attachProfessionNarrativeCues(prevProfession, professionState),
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
            if (row.unequip) {
              next = null;
              continue;
            }
            if (Object.prototype.hasOwnProperty.call(row, "weapon")) {
              const w = (row as { weapon?: Weapon | null }).weapon;
              if (w && typeof w === "object" && !Array.isArray(w)) {
                next = JSON.parse(JSON.stringify(w)) as Weapon;
              } else if (w === null) {
                next = null;
              }
            }
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
      applyWeaponBagUpdates: (updates) =>
        set((s) => {
          const safe = Array.isArray(updates) ? updates : [];
          if (safe.length === 0) return {};
          const bag = Array.isArray(s.weaponBag) ? [...s.weaponBag] : [];
          for (const u of safe as Array<any>) {
            if (!u || typeof u !== "object") continue;
            if (typeof u.removeWeaponId === "string" && u.removeWeaponId) {
              const id = u.removeWeaponId;
              for (let i = bag.length - 1; i >= 0; i--) {
                if (bag[i]?.id === id) bag.splice(i, 1);
              }
              continue;
            }
            if (u.addWeapon && typeof u.addWeapon === "object" && !Array.isArray(u.addWeapon)) {
              const w = u.addWeapon as Weapon;
              if (w.id && !bag.some((x) => x.id === w.id)) {
                bag.push(JSON.parse(JSON.stringify(w)) as Weapon);
              }
              continue;
            }
            if (typeof u.addEquippedWeaponId === "string" && u.addEquippedWeaponId) {
              const id = u.addEquippedWeaponId;
              const eq = s.equippedWeapon;
              if (eq && eq.id === id && !bag.some((x) => x.id === id)) {
                bag.push(JSON.parse(JSON.stringify(eq)) as Weapon);
              }
              continue;
            }
          }
          return { weaponBag: bag.slice(0, 24) };
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
      markSceneNpcAppearanceWritten: (playerLocation, npcIds) =>
        set((s) => {
          const loc = String(playerLocation ?? "").trim();
          if (!loc) return {};
          const ids = Array.isArray(npcIds)
            ? npcIds
                .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                .map((x) => x.trim())
                .slice(0, 12)
            : [];
          if (ids.length === 0) return {};
          const base = s.sceneNpcAppearanceLedger ?? {};
          const prev = Array.isArray(base[loc]) ? base[loc] : [];
          const setIds = new Set(prev);
          for (const id of ids) setIds.add(id);
          const next = Array.from(setIds).slice(0, 24);
          return { sceneNpcAppearanceLedger: { ...base, [loc]: next } };
        }),

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
              ...(typeof (u as { known_info?: unknown }).known_info === "string"
                ? { known_info: ((u as { known_info: string }).known_info ?? "").trim().slice(0, 800) }
                : {}),
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
          const prevProfession = s.professionState;
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
          const tasks = ensureProfessionTrialTasks(s.tasks ?? [], professionState);
          const cues = attachProfessionNarrativeCues(prevProfession, professionState);
          return { codex: next, professionState, tasks, professionNarrativeCues: cues };
        }),

      mergeJournalClueUpdates: (incoming) =>
        set((s) => {
          const safe = Array.isArray(incoming) ? incoming : [];
          if (safe.length === 0) return {};
          const prev = s.journalClues ?? [];
          return { journalClues: mergeCluesWithDedupe(prev, safe, 200) };
        }),

      pushLog: (entry) =>
        set((s) => ({ logs: [...(s.logs ?? []), entry] })),

      popLastNLogs: (n) =>
        set((s) => ({ logs: (s.logs ?? []).slice(0, -n) })),

      rewindTime: () =>
        // 单线时间线：不允许回溯
        set(() => ({})),

      applyGameTimeFromResolvedTurn: (args) => {
        const cost = normalizeActionTimeCostKind(args.time_cost);
        const consumes = args.consumes_time !== false;
        const delta = resolveHourProgressDelta(consumes, cost);
        const snap = get();
        const pending = Number(snap.pendingHourProgress ?? 0);
        const { wholeHours, newPending } = splitProgress(pending, delta);
        if (wholeHours <= 0) {
          set({ pendingHourProgress: newPending });
          return { hoursAdvanced: 0, deltaApplied: delta };
        }
        const bg = (snap.stats ?? DEFAULT_STATS).background ?? 0;
        const ticked = applyWholeGameHourTicks({
          time: snap.time ?? { day: 0, hour: 0 },
          originium: snap.originium ?? 0,
          background: bg,
          talentCooldowns: { ...(snap.talentCooldowns ?? DEFAULT_TALENT_COOLDOWNS) },
          equippedWeapon: snap.equippedWeapon ?? null,
          hourTicks: wholeHours,
        });
        set({
          pendingHourProgress: newPending,
          time: ticked.time,
          originium: ticked.originium,
          talentCooldowns: ticked.talentCooldowns,
          equippedWeapon: ticked.equippedWeapon,
        });
        return { hoursAdvanced: wholeHours, deltaApplied: delta };
      },

      advanceTime: () => {
        get().applyGameTimeFromResolvedTurn({ consumes_time: true });
      },

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
          const safeItems = (Array.isArray(items) ? items : []).filter(
            (it): it is Item => !!it && typeof it.id === "string" && !!it.id && typeof it.name === "string" && !!it.name
          );
          if (safeItems.length === 0) return {};
          const byId = new Map(inv.map((i) => [i.id, i]));
          for (const it of safeItems) {
            const prev = byId.get(it.id);
            // 同 id 视为同一条目更新（而非吞掉）：保证 DM 回写增强字段时能落到状态层。
            byId.set(it.id, prev ? { ...prev, ...it } : it);
          }
          return { inventory: Array.from(byId.values()) };
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
          const current = s.warehouse ?? [];
          const safeItems = (Array.isArray(items) ? items : []).filter(
            (w): w is WarehouseItem => !!w && typeof w.id === "string" && !!w.id && typeof w.name === "string" && !!w.name
          );
          if (safeItems.length === 0) return {};
          const byId = new Map(current.map((w) => [w.id, w]));
          for (const w of safeItems) {
            const prev = byId.get(w.id);
            // 仓库同理：同 id 走覆盖合并，避免“已存在 id 导致新字段回写丢失”。
            byId.set(w.id, prev ? { ...prev, ...w } : w);
          }
          return { warehouse: Array.from(byId.values()) };
        }),

      removeWarehouseItems: (itemKeys) =>
        set((s) => {
          const keys = Array.isArray(itemKeys)
            ? itemKeys.filter((x) => typeof x === "string" && x.length > 0).map((x) => String(x).trim())
            : [];
          if (keys.length === 0) return {};
          return {
            warehouse: (s.warehouse ?? []).filter(
              (w) =>
                w &&
                typeof w.name === "string" &&
                !keys.some((k) => k === w.name || k === w.id)
            ),
          };
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
          tasks: activateClaimableHiddenTasks(createStageOneStarterTasks()),
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: 0,
          deathCount: 0,
          dynamicNpcStates: Object.fromEntries(
            Object.entries(NPC_HOME_LOCATION_SEED).map(([id, homeLocation]) => [
              id,
              { currentLocation: homeLocation, isAlive: true },
            ])
          ),
          mainThreatByFloor: DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
          equippedWeapon: null,
          weaponBag: [],
          intrusionFlashUntil: 0,
          isGameStarted: true,
          openingNarrativePinned: true,
          professionState: createDefaultProfessionState(),
          hasMetProfessionCertifier: false,
          sceneNpcAppearanceLedger: {},
          memorySpine: createEmptyMemorySpine(),
          storyDirector: createEmptyDirectorState(0),
          incidentQueue: createEmptyIncidentQueue(),
          escapeMainline: createDefaultEscapeMainlineTemplate(0),
          journalClues: [],
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
        const nowHour = (time.day ?? 0) * 24 + (time.hour ?? 0);
        const memoryPacket = (() => {
          try {
            const activeSnapshot = s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2;
            const worldFlags = activeSnapshot
              ? Object.entries(activeSnapshot.world.worldFlags ?? {})
                  .filter(([, v]) => v === true)
                  .map(([k]) => k)
                  .slice(0, 128)
              : [];
            const location = s.playerLocation ?? "B1_SafeZone";
            const presentNpcIds = Object.entries(s.dynamicNpcStates ?? {})
              .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === location)
              .map(([id]) => id)
              .slice(0, 32);
            const activeTaskIds = (s.tasks ?? [])
              .filter((t) => t.status === "active" || t.status === "available")
              .map((t) => t.id)
              .filter((x) => typeof x === "string" && x.trim().length > 0)
              .slice(0, 32);
            const ctx = buildRecallContext({
              nowHour,
              playerLocation: location,
              presentNpcIds,
              activeTaskIds,
              mainThreatByFloor: s.mainThreatByFloor ?? {},
              worldFlags,
              professionId: (s.professionState?.currentProfession ?? null) as any,
            });
            const recalled = selectMemoryRecallPacket(s.memorySpine ?? createEmptyMemorySpine(), ctx, { maxItems: 8 });
            return buildMemoryRecallBlock({ recalled, maxChars: 520 });
          } catch {
            return { text: "", digest: "", usedIds: [] as string[] };
          }
        })();
        const npcStates = s.dynamicNpcStates ?? {};
        const npcPositions = typeof npcStates === "object" && npcStates !== null
          ? Object.entries(npcStates)
              .filter(([, v]) => v && typeof v === "object" && v.isAlive)
              .map(([id, v]) => `${id}@${(v as { currentLocation?: string }).currentLocation ?? "?"}`)
              .join("，")
          : "";

        const taskDramaBlock = (() => {
          try {
            return buildTaskDramaPacket({
              tasks: s.tasks ?? [],
              maxTasks: 2,
              maxChars: 360,
            });
          } catch {
            return "";
          }
        })();

        const escapeBlock = (() => {
          try {
            const escape = normalizeEscapeMainline((s as any).escapeMainline, nowHour);
            return buildEscapePromptBlock({ state: escape, maxChars: 260 });
          } catch {
            return "";
          }
        })();

        const directorBlock = (() => {
          try {
            const director = (s as any).storyDirector ?? createEmptyDirectorState((s.logs ?? []).length);
            const incidentQueue = normalizeIncidentQueue((s as any).incidentQueue ?? createEmptyIncidentQueue());
            const nowTurn = Math.max(0, (s.logs ?? []).length);
            const fired = (incidentQueue.items ?? [])
              .filter((x) => x.status === "fired" && x.dueTurn <= nowTurn)
              .sort((a, b) => (b.dueTurn ?? 0) - (a.dueTurn ?? 0))[0] ?? null;
            const preview = buildIncidentDigest(incidentQueue, nowTurn);
            const plan = {
              beatMode: ((director as any).lastBeatMode as any) || (director.tension >= 65 ? "pressure" : director.stallCount >= 2 ? "pressure" : "quiet"),
              mustAdvance: (director.stallCount ?? 0) >= 2,
              mustRecallHookCodes: Array.isArray((director as any).lastRecallHooks) ? (director as any).lastRecallHooks : [],
              preferredIncidentCode: (director as any).lastFiredIncidentCode ?? null,
              softPressureHint: null,
              hardConstraint: null,
              suppressions: [],
              pressureFlags: Array.isArray((director as any).lastPressureFlags) ? (director as any).lastPressureFlags : [],
            } as any;
            return buildDirectorPromptBlock({
              plan,
              armedIncident: fired,
              incidentPreviewCodes: [...(preview.armedCodes ?? []), ...(preview.pendingCodes ?? [])],
              maxChars: 360,
            });
          } catch {
            return "";
          }
        })();

        let npcHeartViewsCache: Array<ReturnType<typeof buildNpcHeartRuntimeView>> = [];
        const npcHeartBlock = (() => {
          try {
            const location = s.playerLocation ?? "B1_SafeZone";
            const mainThreatSynth = (() => {
              const threatMap = s.mainThreatByFloor ?? {};
              const chunks = Object.values(threatMap)
                .filter((x) => x && typeof (x as { floorId?: string }).floorId === "string")
                .map(
                  (x) =>
                    `${(x as { floorId: string }).floorId}[${(x as { threatId?: string }).threatId ?? ""}|${(x as { phase?: string }).phase ?? "idle"}|${(x as { suppressionProgress?: number }).suppressionProgress ?? 0}]`
                );
              return chunks.length > 0 ? `主威胁状态：${chunks.join("，")}。` : "";
            })();
            const codexSynth =
              Object.keys(s.codex ?? {}).length > 0
                ? `图鉴已解锁：${Object.values(s.codex ?? {})
                    .map((e) => `${e.name}[${e.type}|好感${e.favorability ?? 0}]`)
                    .join("，")}。`
                : "";
            const maxRevealRankHeart = computeMaxRevealRankFromSignals(
              parsePlayerWorldSignals(
                `游戏时间[第${time.day}日 ${time.hour}时]。用户位置[${location}]。进度[最高层分${s.historicalMaxFloorScore ?? 0}]。死亡累计[${s.deathCount ?? 0}]。原石[${s.originium}]。` +
                  (activeSnapshot
                    ? `世界标记：${Object.entries(activeSnapshot.world.worldFlags ?? {})
                        .filter(([, v]) => v === true)
                        .map(([k]) => k)
                        .join("，") || "无"}。锚点解锁：B1[${activeSnapshot.world.anchorUnlocks.B1 ? "1" : "0"}]，1F[${activeSnapshot.world.anchorUnlocks["1"] ? "1" : "0"}]，7F[${activeSnapshot.world.anchorUnlocks["7"] ? "1" : "0"}]。`
                    : "") +
                  mainThreatSynth +
                  codexSynth +
                  `职业状态：当前[${prof.currentProfession ?? "无"}]，已认证[${prof.unlockedProfessions.join("/") || "无"}]。`,
                location
              )
            );
            const presentNpcIds = Object.entries(s.dynamicNpcStates ?? {})
              .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === location)
              .map(([id]) => id)
              .slice(0, 32);
            const issuerNpcIds = (s.tasks ?? [])
              .filter((t) => t.status === "active" || t.status === "available")
              .map((t) => t.issuerId)
              .filter((x) => typeof x === "string" && x.trim().length > 0)
              .slice(0, 16);
            const volatileNpcIds = (memoryPacket.usedIds ?? []).filter((x) => typeof x === "string");
            const ids = selectRelevantNpcHearts({
              locationId: location,
              presentNpcIds,
              issuerNpcIds,
              volatileNpcIds,
              maxNpc: 3,
            });
            const views = ids
              .map((npcId) =>
                buildNpcHeartRuntimeView({
                  npcId,
                  relationPartial: (s.codex as any)?.[npcId] ?? null,
                  locationId: location,
                  activeTaskIds: (s.tasks ?? []).filter((t) => t.status === "active").map((t) => t.id).slice(0, 16),
                  hotThreatPresent: Object.values(s.mainThreatByFloor ?? {}).some((x) => x.phase === "active" || x.phase === "suppressed" || x.phase === "breached"),
                  maxRevealRank: maxRevealRankHeart,
                  presentNpcIds,
                })
              )
              .filter((x): x is NonNullable<typeof x> => !!x);
            npcHeartViewsCache = views;
            return buildNpcHeartPromptBlock({ views, maxChars: 460 });
          } catch {
            npcHeartViewsCache = [];
            return "";
          }
        })();

        const combatPromptBlock = (() => {
          try {
            const rollout = getVerseCraftRolloutFlags();
            if (!rollout.enableCombatPromptBlockV1) return "";
            if (!rollout.enableHiddenCombatAdjudicationV1) return "";
            const lastUser =
              (s.logs ?? [])
                .slice()
                .reverse()
                .find((l) => l && l.role === "user")?.content ?? "";
            return buildCombatPromptBlockV1({
              lastUserInput: String(lastUser ?? ""),
              locationId: s.playerLocation ?? "B1_SafeZone",
              time: s.time ?? { day: 0, hour: 0 },
              mainThreatByFloor: s.mainThreatByFloor ?? {},
              tasks: s.tasks ?? [],
              stats: s.stats ?? DEFAULT_STATS,
              equippedWeapon: s.equippedWeapon ?? null,
              codex: s.codex ?? {},
              npcHeartViews: (npcHeartViewsCache as any) ?? [],
              maxChars: 420,
            });
          } catch {
            return "";
          }
        })();

        const combatStyleBlock = (() => {
          try {
            const rollout = getVerseCraftRolloutFlags();
            if (!rollout.enableNpcCombatStyleRegistryV1) return "";
            // 只在“像冲突回合”的情况下附加风格块，避免每回合 prompt 膨胀。
            if (!combatPromptBlock) return "";
            const location = s.playerLocation ?? "B1_SafeZone";
            return buildCombatNarrativeStyleBlock({
              locationId: location,
              time: s.time ?? { day: 0, hour: 0 },
              mainThreatByFloor: s.mainThreatByFloor ?? {},
              codex: s.codex ?? {},
              equippedWeapon: s.equippedWeapon ?? null,
              npcHeartViews: (npcHeartViewsCache as any) ?? [],
              maxChars: 520,
            });
          } catch {
            return "";
          }
        })();

        return (
          `用户档案：姓名[${s.playerName || "未命名"}]，` +
          `性别[${s.gender || "未设定"}]，` +
          `身高[${s.height || 0}cm]，` +
          `性格[${s.personality || "未设定"}]。` +
          `游戏时间[第${time.day}日 ${time.hour}时]。` +
          ((s.pendingHourProgress ?? 0) > 1e-6 ? `【小时余量】${(s.pendingHourProgress ?? 0).toFixed(3)}。` : "") +
          `用户位置[${s.playerLocation}]。` +
          `当前属性：${statsText}。` +
          `${talentText}。` +
          (() => {
            const rollout = getVerseCraftRolloutFlags();
            if (!rollout.enableProfessionIdentityLoop) {
              const eligible = PROFESSION_IDS.filter((id) => prof.eligibilityByProfession[id]).join("/") || "无";
              return `职业状态：当前[${prof.currentProfession ?? "无"}]，已认证[${prof.unlockedProfessions.join("/") || "无"}]，可认证[${eligible}]，被动[${prof.activePerks.join("/") || "无"}]。`;
            }
            const visibility = computeProfessionVisibility(prof);
            const digest = buildProfessionIdentityDigest(prof);
            const approaches = buildProfessionApproachSnapshots(prof);
            const shown = approaches.filter((x) => visibility.visibleProfessions.includes(x.profession)).slice(0, 2);
            const approachLine = shown.length > 0
              ? `职业倾向：${shown.map((x) => {
                  const stage =
                    x.stage === "certified" ? "已认证" :
                      x.stage === "eligible" ? "可认证" :
                        x.stage === "trial" ? "证明中" :
                          x.stage === "observed" ? "被看见" : "倾向";
                  const next = x.next.slice(0, 2).join("；");
                  return `${x.profession}[${stage}${next ? `|还差:${next}` : ""}]`;
                }).join("，")}。`
              : "";
            const eligible = PROFESSION_IDS.filter((id) => prof.eligibilityByProfession[id]).join("/") || "无";
            return `${digest}。${approachLine}` +
              `职业状态：当前[${prof.currentProfession ?? "无"}]，已认证[${prof.unlockedProfessions.join("/") || "无"}]，可认证[${eligible}]。`;
          })() +
          (() => {
            const rollout = getVerseCraftRolloutFlags();
            if (!rollout.enableProfessionPromptDietV1) {
              return (
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
                  const stage = p.certified
                    ? "认证"
                    : p.trialTaskCompleted
                      ? "可认证"
                      : p.trialAccepted
                        ? "证明中"
                        : p.trialOffered
                          ? "已授予"
                          : p.observedByCertifier
                            ? "被看见"
                            : p.inclinationVisible
                              ? "倾向"
                              : "无";
                  return `${id}[${stage}|属性${p.statQualified ? "1" : "0"}|行为${p.behaviorEvidenceCount}/${p.behaviorEvidenceTarget}|试炼${p.trialTaskCompleted ? "1" : "0"}]`;
                }).join("，")}。`
              );
            }
            // 降噪：不常驻“命中率/收益长摘要/逐职业进度表”，避免模型把职业当第二主线
            if (!prof.currentProfession) return "";
            return `职业主动：${getProfessionActiveSkillName(prof.currentProfession)}（可用=${(() => {
              const nowHour = (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0);
              const cdKey = getProfessionActiveCooldownKey(prof.currentProfession);
              const cd = Number(prof.professionCooldowns?.[cdKey] ?? 0);
              return cd <= nowHour ? "1" : "0";
            })()}）`;
          })() +
          `行囊道具：${inv || "空"}。` +
          (() => {
            const wh = s.warehouse ?? [];
            if (wh.length === 0) return "";
            return ` 仓库物品：${wh.map((w) => `${w.name}[${w.id}]`).join("，")}。`;
          })() +
          (combatStyleBlock ? `\n${combatStyleBlock}\n` : "") +
          (combatPromptBlock ? `\n${combatPromptBlock}\n` : "") +
          (() => {
            try {
              const threatMap = s.mainThreatByFloor ?? {};
              const chunks = Object.values(threatMap)
                .filter((x) => x && typeof x.floorId === "string")
                .map((x) => `${x.floorId}[${x.phase}]`);
              const block = buildItemGameplayPromptBlock({
                inventoryItems: s.inventory ?? [],
                warehouseItems: s.warehouse ?? [],
                playerLocation: s.playerLocation ?? "B1_SafeZone",
                nowHour,
                presentNpcIds: Object.entries(s.dynamicNpcStates ?? {})
                  .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === (s.playerLocation ?? "B1_SafeZone"))
                  .map(([id]) => id)
                  .slice(0, 32),
                threatChunks: chunks.slice(0, 6),
              });
              return block ? ` ${block}` : "";
            } catch {
              return "";
            }
          })() +
          `天赋冷却：${ECHO_TALENTS.map((t) => `${t}[剩余${s.talentCooldowns[t]}]`).join("，")}。` +
          `原石[${s.originium}]。` +
          `进度[最高层分${s.historicalMaxFloorScore ?? 0}]。` +
          `死亡累计[${s.deathCount ?? 0}]。` +
          (s.tasks.filter((t) => t.status === "active" || t.status === "available").length > 0
            ? `任务追踪：${s.tasks
                .filter((t) => t.status === "active" || t.status === "available")
                // 仅保留“玩家友好”的任务摘要，避免暴露内部字段（如隐藏触发/引导强度等）。
                .map((t) => {
                  const layer = inferEffectiveNarrativeLayer(t);
                  const layerTag =
                    layer === "conversation_promise" ? "人情约定" : layer === "soft_lead" ? "暗示" : "正式";
                  return `${t.title}[${t.status === "available" ? "可接取" : "进行中"}|${layerTag}|${t.issuerName}|${t.floorTier}]`;
                })
                .join("，")}。${
                enableTaskModeLayer()
                  ? `【rt_task_layers】${s.tasks
                      .filter((t) => t.status === "active" || t.status === "available")
                      .slice(0, 14)
                      .map((t) => `${encodeURIComponent(t.id)}=${inferEffectiveNarrativeLayer(t)}`)
                      .join(",")}。`
                  : ""
              }`
            : "") +
          (() => {
            const proactive = (s.tasks ?? [])
              .filter(
                (t) =>
                  t.npcProactiveGrant.enabled &&
                  (t.status === "available" || t.status === "active")
              )
              .map(
                (t) =>
                  // 这段仅作为 DM 的“自然引出委托”参考线索，不展示触发码；保持简短。
                  `${t.issuerName}:${t.title}[ID${t.npcProactiveGrant.npcId || t.issuerId}|地点${t.npcProactiveGrant.preferredLocations.join("/") || "任意"}|状态${t.status === "available" ? "available" : "active"}|上次发放H${t.npcProactiveGrantLastIssuedHour ?? "NA"}]`
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
          (escapeBlock ? ` ${escapeBlock}` : "") +
          (directorBlock ? ` ${directorBlock}` : "") +
          (npcHeartBlock ? ` ${npcHeartBlock}` : "") +
          (taskDramaBlock ? ` ${taskDramaBlock}` : "") +
          (memoryPacket.text ? ` ${memoryPacket.text}` : "") +
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
          (() => {
            const bag = s.weaponBag ?? [];
            if (!Array.isArray(bag) || bag.length === 0) return " 武器背包：无。";
            const text = bag
              .slice(0, 8)
              .map((w) => `${w.id}[${w.tier ?? "?"}]`)
              .join("，");
            return ` 武器背包：${text}。`;
          })() +
          (s.reviveContext?.deathLocation
            ? ` 最近复活：死亡地点[${s.reviveContext.deathLocation}]，死因[${s.reviveContext.deathCause ?? "未知"}]，掉落数量[${s.reviveContext.droppedLootLedger.length}]，最近锚点[${s.reviveContext.lastReviveAnchorId ?? "未知"}]。`
            : "") +
          (npcPositions ? ` NPC当前位置：${npcPositions}。` : "") +
          (() => {
            const loc = s.playerLocation ?? "B1_SafeZone";
            const ledger = s.sceneNpcAppearanceLedger ?? {};
            const ids = Array.isArray(ledger[loc]) ? ledger[loc] : [];
            return ` 场景外貌已描写：${ids.length > 0 ? ids.slice(0, 12).join("/") : "无"}。`;
          })() +
          (() => {
            try {
              const link = buildNarrativeLinkagePromptBlock({
                tasks: s.tasks ?? [],
                clues: s.journalClues ?? [],
                inventoryItemIds: (s.inventory ?? []).map((i) => i.id),
                warehouseItemIds: (s.warehouse ?? []).map((w) => w.id),
              });
              return link ? ` ${link}` : "";
            } catch {
              return "";
            }
          })() +
          (s.recentOptions?.length
            ? ` 【最近生成的选项历史】：${s.recentOptions.join("；")}。`
            : " 【最近生成的选项历史】：（无）。")
        );
      },

      getStructuredClientStateForServer: () => {
        const s = get();
        const activeSnapshot = s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2;
        const time = s.time ?? { day: 0, hour: 0 };
        const nowHour = (time.day ?? 0) * 24 + (time.hour ?? 0);
        const location = s.playerLocation ?? "B1_SafeZone";
        const stats = s.stats ?? DEFAULT_STATS;
        const inventoryIds = (s.inventory ?? [])
          .map((i) => String(i?.id ?? "").trim())
          .filter((x) => x.length > 0)
          .slice(0, 96);
        const warehouseIds = (s.warehouse ?? [])
          .map((w) => String(w?.id ?? "").trim())
          .filter((x) => x.length > 0)
          .slice(0, 96);
        const worldFlags = activeSnapshot
          ? Object.entries(activeSnapshot.world.worldFlags ?? {})
              .filter(([, v]) => v === true)
              .map(([k]) => k)
              .slice(0, 128)
          : [];
        const presentNpcIds = Object.entries(s.dynamicNpcStates ?? {})
          .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === location)
          .map(([id]) => id)
          .slice(0, 32);
        const activeTaskIds = (s.tasks ?? [])
          .filter((t) => t.status === "active" || t.status === "available")
          .map((t) => t.id)
          .filter((x) => typeof x === "string" && x.trim().length > 0)
          .slice(0, 32);
        const completedTaskIds = (s.tasks ?? [])
          .filter((t) => t.status === "completed")
          .map((t) => t.id)
          .filter((x) => typeof x === "string" && x.trim().length > 0)
          .slice(0, 32);
        const ctx = buildRecallContext({
          nowHour,
          playerLocation: location,
          presentNpcIds,
          activeTaskIds,
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          worldFlags,
          professionId: (s.professionState?.currentProfession ?? null) as any,
        });
        const recalled = selectMemoryRecallPacket(s.memorySpine ?? createEmptyMemorySpine(), ctx, { maxItems: 6 });
        const recallBlock = buildMemoryRecallBlock({ recalled, maxChars: 360 });
        const hintCodes = recalled.flatMap((r) => (r.entry.recallTags ?? [])).slice(0, 12);
        const promotions = selectPromotionFactTexts(s.memorySpine?.entries ?? []);

        // Phase-4: director / incident digests (strictly small; no full queue upload)
        const director = (s as any).storyDirector ?? createEmptyDirectorState((s.logs ?? []).length);
        const incidentQueue = normalizeIncidentQueue((s as any).incidentQueue ?? createEmptyIncidentQueue());
        const incDigest = buildIncidentDigest(incidentQueue, (s.logs ?? []).length);
        const directorDigest = buildDirectorDigestForServer({
          tension: director.tension ?? 0,
          stallCount: director.stallCount ?? 0,
          beatModeHint: ((director as any).lastBeatMode as string) || "quiet",
          pressureFlags: Array.isArray((director as any).lastPressureFlags) ? (director as any).lastPressureFlags : [],
          pendingIncidentCodes: [...(incDigest.armedCodes ?? []), ...(incDigest.pendingCodes ?? [])],
          mustRecallHookCodes: Array.isArray((director as any).lastRecallHooks) ? (director as any).lastRecallHooks : [],
        });
        return {
          v: 1 as const,
          guestId: s.guestId ?? null,
          isGuest: Boolean(s.isGuest ?? !s.user),
          turnIndex: (s.logs ?? []).length,
          playerLocation: location,
          time: { day: time.day ?? 0, hour: time.hour ?? 0 },
          ...((s.pendingHourProgress ?? 0) > 1e-6
            ? { pendingHourFraction: Number((s.pendingHourProgress ?? 0).toFixed(4)) }
            : {}),
          stats: {
            sanity: Number(stats.sanity ?? 0) || 0,
            agility: Number(stats.agility ?? 0) || 0,
            luck: Number(stats.luck ?? 0) || 0,
            charm: Number(stats.charm ?? 0) || 0,
            background: Number(stats.background ?? 0) || 0,
          },
          originium: Math.max(0, Math.trunc(Number(s.originium ?? 0) || 0)),
          inventoryItemIds: inventoryIds,
          warehouseItemIds: warehouseIds,
          equippedWeapon: s.equippedWeapon ?? null,
          weaponBag: Array.isArray(s.weaponBag) ? s.weaponBag.slice(0, 24) : [],
          currentProfession: (s.professionState?.currentProfession ?? null) as ProfessionId | null,
          worldFlags,
          presentNpcIds,
          ...(activeTaskIds.length ? { activeTaskIds } : {}),
          ...(completedTaskIds.length ? { completedTaskIds } : {}),
          ...(recallBlock.digest ? { memoryDigest: recallBlock.digest } : {}),
          ...(hintCodes.length ? { memoryHintCodes: hintCodes } : {}),
          ...(promotions.length ? { memoryPromotions: promotions } : {}),
          ...(directorDigest.digest ? { directorDigest } : {}),
          ...(() => {
            const clues = s.journalClues ?? [];
            const shown = clues.filter((c) => c.visibility !== "hidden");
            const ids = shown
              .map((c) => String(c.id ?? "").trim())
              .filter(Boolean)
              .slice(0, 24);
            return {
              journalClueCount: shown.length,
              ...(ids.length ? { journalClueIds: ids } : {}),
            };
          })(),
          ...(() => {
            try {
              const t = buildNarrativeLinkagePromptBlock({
                tasks: s.tasks ?? [],
                clues: s.journalClues ?? [],
                inventoryItemIds: inventoryIds,
                warehouseItemIds: warehouseIds,
                maxChars: 220,
              });
              return t ? { narrativeLinkageDigest: t } : {};
            } catch {
              return {};
            }
          })(),
        };
      },

      appendResolvedTurnMemories: (args) => {
        const s = get();
        const time = s.time ?? { day: 0, hour: 0 };
        const nowHour = (time.day ?? 0) * 24 + (time.hour ?? 0);
        const before = args.before;
        const after = {
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          tasks: s.tasks ?? [],
          codex: s.codex ?? {},
          mainThreatByFloor: s.mainThreatByFloor ?? {},
        };
        const candidates = extractMemoryCandidates({
          nowHour,
          resolvedTurn: args.resolvedTurn,
          before,
          after,
          enableNarrativeMicroPatterns: false,
        });
        const next = reduceMemoryCandidates({
          prev: s.memorySpine ?? createEmptyMemorySpine(),
          candidates,
          nowHour,
          maxEntries: 64,
          perTurnInsertCap: 10,
        });
        set({ memorySpine: pruneMemorySpine(next, nowHour, { maxEntries: 64 }) });
      },

      applyMemoryCandidates: (candidates: MemoryCandidateDraft[], nowHourOverride?: number) => {
        const s = get();
        const time = s.time ?? { day: 0, hour: 0 };
        const nowHour = typeof nowHourOverride === "number" && Number.isFinite(nowHourOverride)
          ? Math.trunc(nowHourOverride)
          : (time.day ?? 0) * 24 + (time.hour ?? 0);
        const next = reduceMemoryCandidates({
          prev: s.memorySpine ?? createEmptyMemorySpine(),
          candidates: Array.isArray(candidates) ? candidates : [],
          nowHour,
          maxEntries: 64,
          perTurnInsertCap: 10,
        });
        set({ memorySpine: pruneMemorySpine(next, nowHour, { maxEntries: 64 }) });
      },

      postTurnStoryDirectorUpdate: (args) => {
        const s = get();
        const nowTurn = typeof args.preTurnIndex === "number" && Number.isFinite(args.preTurnIndex)
          ? Math.max(0, Math.trunc(args.preTurnIndex) + 1)
          : Math.max(0, (s.logs ?? []).length);
        const pre = args.pre;
        const post = {
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          tasks: s.tasks ?? [],
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          memoryEntries: s.memorySpine?.entries ?? [],
        };
        const updated = postTurnStoryDirectorUpdate({
          directorRaw: (s as any).storyDirector ?? createEmptyDirectorState(nowTurn),
          incidentQueueRaw: (s as any).incidentQueue ?? createEmptyIncidentQueue(),
          nowTurn,
          pre,
          post,
          resolvedTurn: args.resolvedTurn,
        });
        set({
          storyDirector: {
            ...updated.director,
            // cache tiny hints for digests (do not persist huge text)
            lastBeatMode: updated.plan.beatMode,
            lastPressureFlags: updated.plan.pressureFlags,
            lastRecallHooks: updated.plan.mustRecallHookCodes,
            lastFiredIncidentCode: updated.armedIncident?.incidentCode ?? null,
          } as any,
          incidentQueue: updated.incidentQueue,
        });
      },

      advanceEscapeMainlineFromResolvedTurn: (args) => {
        const s = get();
        const time = s.time ?? { day: 0, hour: 0 };
        const nowHour = typeof args.nowHourOverride === "number" && Number.isFinite(args.nowHourOverride)
          ? Math.max(0, Math.trunc(args.nowHourOverride))
          : (time.day ?? 0) * 24 + (time.hour ?? 0);
        const nowTurn = typeof args.nowTurnOverride === "number" && Number.isFinite(args.nowTurnOverride)
          ? Math.max(0, Math.trunc(args.nowTurnOverride))
          : Math.max(0, (s.logs ?? []).length);
        const activeSnapshot = s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2;
        const worldFlags = activeSnapshot
          ? Object.entries(activeSnapshot.world.worldFlags ?? {})
              .filter(([, v]) => v === true)
              .map(([k]) => k)
              .slice(0, 128)
          : [];
        const invIds = (s.inventory ?? []).map((i) => String((i as any)?.id ?? "").trim()).filter((x) => x.length > 0).slice(0, 96);
        const next = advanceEscapeMainlineFromResolvedTurn({
          prevEscapeRaw: (s as any).escapeMainline ?? activeSnapshot?.escape ?? createDefaultEscapeMainlineTemplate(nowHour),
          nowHour,
          nowTurn,
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          tasks: (s.tasks ?? []) as any,
          codex: s.codex ?? {},
          inventoryItemIds: invIds,
          worldFlags,
          memoryEntries: s.memorySpine?.entries ?? [],
          resolvedTurn: args.resolvedTurn,
          changedBy: "resolved_turn",
        });
        set({ escapeMainline: next as any });
      },

      buildEscapePromptBlock: () => {
        const s = get();
        const state = normalizeEscapeMainline((s as any).escapeMainline, (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0));
        return buildEscapePromptBlock({ state, maxChars: 260 });
      },

      getEscapeObjectiveSummary: () => {
        const s = get();
        const state = normalizeEscapeMainline((s as any).escapeMainline, (s.time?.day ?? 0) * 24 + (s.time?.hour ?? 0));
        return getEscapeObjectiveSummary(state);
      },

      buildMemoryRecallBlock: () => {
        const s = get();
        const time = s.time ?? { day: 0, hour: 0 };
        const nowHour = (time.day ?? 0) * 24 + (time.hour ?? 0);
        const activeSnapshot = s.saveSlots?.[s.currentSaveSlot]?.runSnapshotV2;
        const worldFlags = activeSnapshot
          ? Object.entries(activeSnapshot.world.worldFlags ?? {})
              .filter(([, v]) => v === true)
              .map(([k]) => k)
              .slice(0, 128)
          : [];
        const location = s.playerLocation ?? "B1_SafeZone";
        const presentNpcIds = Object.entries(s.dynamicNpcStates ?? {})
          .filter(([, v]) => v && typeof v === "object" && (v as any).isAlive && String((v as any).currentLocation ?? "") === location)
          .map(([id]) => id)
          .slice(0, 32);
        const activeTaskIds = (s.tasks ?? [])
          .filter((t) => t.status === "active" || t.status === "available")
          .map((t) => t.id)
          .filter((x) => typeof x === "string" && x.trim().length > 0)
          .slice(0, 32);
        const ctx = buildRecallContext({
          nowHour,
          playerLocation: location,
          presentNpcIds,
          activeTaskIds,
          mainThreatByFloor: s.mainThreatByFloor ?? {},
          worldFlags,
          professionId: (s.professionState?.currentProfession ?? null) as any,
        });
        const recalled = selectMemoryRecallPacket(s.memorySpine ?? createEmptyMemorySpine(), ctx, { maxItems: 8 });
        const block = buildMemoryRecallBlock({ recalled, maxChars: 520 });
        const hintCodes = recalled.flatMap((r) => (r.entry.recallTags ?? [])).slice(0, 12);
        const promotions = selectPromotionFactTexts(s.memorySpine?.entries ?? []);
        return { text: block.text, digest: block.digest, hintCodes, promotions };
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
          const prevProfession = s.professionState;
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
          // Phase-2：试炼回归产品层，但以叙事授予方式进入（不抢主任务板中心）。
          const nextTasks = ensureProfessionTrialTasks(s.tasks ?? [], computed);
          const cues = attachProfessionNarrativeCues(prevProfession, computed);
          return { professionState: computed, tasks: nextTasks, professionNarrativeCues: cues };
        }),
      certifyProfession: (profession) => {
        const s = get();
        // 单职业：一局只能认证一次，认证后不可再认证/转职
        if (s.professionState?.currentProfession) return false;
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
        void profession;
        // 单职业：禁止转职（UI 与状态层双重兜底）
        return false;
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
      markMetProfessionCertifier: () => set({ hasMetProfessionCertifier: true }),
      pushCombatSummaryV1: (x) =>
        set((s) => {
          const cap = 12;
          const prev = Array.isArray(s.combatSummariesV1) ? s.combatSummariesV1 : [];
          const safeText = String(x?.text ?? "").trim().slice(0, 900);
          if (!safeText) return {};
          const row = {
            v: 1 as const,
            atTurn: Math.max(0, Math.trunc(x.atTurn ?? 0)),
            atHour: Math.max(0, Math.trunc(x.atHour ?? 0)),
            locationId: String(x.locationId ?? "").trim() || (s.playerLocation ?? "unknown"),
            npcIds: (x.npcIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean).slice(0, 6),
            kind: x.kind ? String(x.kind).slice(0, 32) : undefined,
            outcomeTier: x.outcomeTier ? String(x.outcomeTier).slice(0, 32) : undefined,
            text: safeText,
          };
          return { combatSummariesV1: [...prev, row].slice(-cap) };
        }),
      setConflictTurnFeedback: (v) => set({ conflictTurnFeedback: v }),

      setCurrentSaveSlot: (slotId) =>
        set((s) => {
          // 单线时间线：仅允许 main_slot
          if (slotId !== "main_slot") return {};
          if (!s.saveSlots?.[slotId]) return {};
          return { currentSaveSlot: "main_slot" };
        }),
      renameSaveSlot: (slotId, label) => {
        // 单线时间线：不允许改名（避免用户将其误认为是多存档）
        void slotId;
        void label;
        return false;
      },
      deleteSaveSlot: (slotId) => {
        // 单线时间线：不允许删除存档槽（避免误操作丢进度）
        void slotId;
        return false;
      },
      createBranchSlot: (input) => {
        void input;
        return { ok: false, reason: "已禁用分支存档" };
      },

      // ---- legacy multi-slot actions (disabled) ----
      // 下面的旧实现保留在 git 历史中；当前版本强制单线推进。
      /*
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
      */

      saveGame: (slotId) => {
        const s = get();
        // 单线时间线：只写 main_slot
        void slotId;
        const effectiveSlotId = "main_slot";
        const safeStats = s.stats ?? DEFAULT_STATS;
        const chapterState = normalizeChapterState(s.chapterState);
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
            "主线存档",
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
          weaponBag: s.weaponBag ?? [],
          deathCount: s.deathCount ?? 0,
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
          storyDirector:
            (s as any).storyDirector ??
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.storyDirector ??
            createEmptyDirectorState(0),
          incidentQueue:
            (s as any).incidentQueue ??
            s.saveSlots?.[effectiveSlotId]?.runSnapshotV2?.world?.incidentQueue ??
            createEmptyIncidentQueue(),
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
          memorySpine: s.memorySpine ?? createEmptyMemorySpine(),
          chapterState,
          journal: {
            version: JOURNAL_STATE_VERSION,
            clues: mergeCluesWithDedupe([], s.journalClues ?? [], 200),
          },
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
          currentOptions: normalizeStoredOptions(s.currentOptions, 4),
          tasks: JSON.parse(JSON.stringify(s.tasks ?? [])),
          playerLocation: s.playerLocation ?? "B1_SafeZone",
          dynamicNpcStates: JSON.parse(JSON.stringify(s.dynamicNpcStates ?? {})),
          mainThreatByFloor: JSON.parse(
            JSON.stringify(s.mainThreatByFloor ?? overlay.mainThreatByFloor)
          ),
          equippedWeapon: JSON.parse(JSON.stringify(s.equippedWeapon ?? null)),
          weaponBag: JSON.parse(JSON.stringify(s.weaponBag ?? [])),
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
          chapterState: JSON.parse(JSON.stringify(chapterState)),
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
        // 正式存档写入成功后，同步写一份本地 shadow（不走防抖），用于崩溃恢复兜底。
        writeResumeShadowFromState(get() as unknown as Record<string, unknown>);
      },

      loadGame: (slotId) => {
        // 单线时间线：禁止读取其它分支/槽位，避免时间线回退
        if (slotId !== "main_slot") return;
        const data = get().saveSlots[slotId];
        if (!data) return;
        let normalizedSnapshot = normalizeRunSnapshotV2(
          data.runSnapshotV2,
          data
        );
        let projected = projectSnapshotToLegacy(normalizedSnapshot);
        const integ = applyNarrativeIntegrityOnBundle({
          normalizedSnapshot,
          projectedTasks: (projected.tasks ?? data.tasks ?? []) as GameTaskV2[],
          inventory: (projected.inventory ?? data.inventory ?? []) as Array<{ id?: string }>,
          warehouse: (projected.warehouse ?? data.warehouse ?? []) as Array<{ id?: string }>,
        });
        if (narrativeDebugEnabled() && integ.report.repairsApplied.length > 0) {
          console.info("[versecraft/narrative_integrity] loadGame", integ.report);
        }
        normalizedSnapshot = integ.normalizedSnapshot;
        projected = { ...projected, tasks: integ.tasks };
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
        const chapterState = normalizeChapterState(
          data.chapterState ?? projected.chapterState ?? normalizedSnapshot.chapterState
        );
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
              chapterState,
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
          memorySpine: JSON.parse(JSON.stringify(normalizedSnapshot.memory?.spine ?? createEmptyMemorySpine())),
          storyDirector: JSON.parse(JSON.stringify((normalizedSnapshot.world as any).storyDirector ?? createEmptyDirectorState(0))),
          incidentQueue: JSON.parse(JSON.stringify((normalizedSnapshot.world as any).incidentQueue ?? createEmptyIncidentQueue())),
          escapeMainline: JSON.parse(JSON.stringify((normalizedSnapshot as any).escape ?? createDefaultEscapeMainlineTemplate(0))),
          journalClues: JSON.parse(
            JSON.stringify(normalizedSnapshot.journal?.clues ?? [])
          ),
          historicalMaxSanity: data.historicalMaxSanity,
          historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
          deathCount: normalizedSnapshot.player.deathCount ?? 0,
          talent: data.talent ?? null,
          talentCooldowns,
          hasCheckedCodex: data.hasCheckedCodex ?? false,
          originium:
            projected.originium ?? data.originium ?? get().originium ?? 0,
          currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
          currentOptions: normalizeStoredOptions(data.currentOptions, 4),
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
          weaponBag: JSON.parse(
            JSON.stringify(
              normalizedSnapshot.player.weaponBag ??
                data.weaponBag ??
                []
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
          chapterState: JSON.parse(JSON.stringify(chapterState)),
          playerName: projected.playerName ?? get().playerName,
          gender: projected.gender ?? get().gender,
          height: projected.height ?? get().height,
          personality: projected.personality ?? get().personality,
        });
      },
      hydrateFromCloud: (slotId, data) => {
        if (!data) return;
        let normalizedSnapshot = normalizeRunSnapshotV2(
          data.runSnapshotV2,
          data
        );
        let projected = projectSnapshotToLegacy(normalizedSnapshot);
        const integ = applyNarrativeIntegrityOnBundle({
          normalizedSnapshot,
          projectedTasks: (projected.tasks ?? data.tasks ?? []) as GameTaskV2[],
          inventory: (projected.inventory ?? data.inventory ?? []) as Array<{ id?: string }>,
          warehouse: (projected.warehouse ?? data.warehouse ?? []) as Array<{ id?: string }>,
        });
        if (narrativeDebugEnabled() && integ.report.repairsApplied.length > 0) {
          console.info("[versecraft/narrative_integrity] hydrateFromCloud", integ.report);
        }
        normalizedSnapshot = integ.normalizedSnapshot;
        projected = { ...projected, tasks: integ.tasks };
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
        const chapterState = normalizeChapterState(
          data.chapterState ?? projected.chapterState ?? normalizedSnapshot.chapterState
        );
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
                chapterState,
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
            memorySpine: JSON.parse(JSON.stringify(normalizedSnapshot.memory?.spine ?? createEmptyMemorySpine())),
            storyDirector: JSON.parse(JSON.stringify((normalizedSnapshot.world as any).storyDirector ?? createEmptyDirectorState(0))),
            incidentQueue: JSON.parse(JSON.stringify((normalizedSnapshot.world as any).incidentQueue ?? createEmptyIncidentQueue())),
            escapeMainline: JSON.parse(JSON.stringify((normalizedSnapshot as any).escape ?? createDefaultEscapeMainlineTemplate(0))),
            journalClues: JSON.parse(
              JSON.stringify(normalizedSnapshot.journal?.clues ?? [])
            ),
            historicalMaxSanity: data.historicalMaxSanity ?? 50,
            historicalMaxFloorScore: data.historicalMaxFloorScore ?? 0,
            deathCount: normalizedSnapshot.player.deathCount ?? 0,
            talent: data.talent ?? s.talent ?? null,
            talentCooldowns,
            hasCheckedCodex: data.hasCheckedCodex ?? false,
            originium: projected.originium ?? data.originium ?? s.originium ?? 0,
            currentBgm: typeof data.currentBgm === "string" ? data.currentBgm : "bgm_1_calm",
            currentOptions: normalizeStoredOptions(data.currentOptions, 4),
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
            weaponBag: JSON.parse(
              JSON.stringify(
                normalizedSnapshot.player.weaponBag ??
                  data.weaponBag ??
                  s.weaponBag ??
                  []
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
            chapterState: JSON.parse(JSON.stringify(chapterState)),
            playerName: projected.playerName ?? s.playerName,
            gender: projected.gender ?? s.gender,
            height: projected.height ?? s.height,
            personality: projected.personality ?? s.personality,
            isGameStarted: true,
          };
        });
      },
      writeResumeShadow: () => {
        const s = get() as unknown as Record<string, unknown>;
        writeResumeShadowFromState(s);
      },
      hydrateFromResumeShadow: () => {
        const shadow = readResumeShadowSnapshot();
        if (!shadow || shadow.isGameStarted !== true) return false;
        set((s) => ({
          currentSaveSlot: shadow.currentSaveSlot || "main_slot",
          isGameStarted: true,
          playerLocation: shadow.playerLocation ?? "B1_SafeZone",
          time: { day: shadow.time?.day ?? 0, hour: shadow.time?.hour ?? 0 },
          logs: Array.isArray(shadow.logs) ? JSON.parse(JSON.stringify(shadow.logs)) : [],
          inventory: Array.isArray(shadow.inventory) ? JSON.parse(JSON.stringify(shadow.inventory)) : [],
          warehouse: Array.isArray(shadow.warehouse) ? JSON.parse(JSON.stringify(shadow.warehouse)) : [],
          tasks: Array.isArray(shadow.tasks) ? JSON.parse(JSON.stringify(shadow.tasks)) : [],
          codex:
            shadow.codex && typeof shadow.codex === "object" && !Array.isArray(shadow.codex)
              ? JSON.parse(JSON.stringify(shadow.codex))
              : {},
          memorySpine:
            (shadow as any).memorySpine && typeof (shadow as any).memorySpine === "object" && !Array.isArray((shadow as any).memorySpine)
              ? JSON.parse(JSON.stringify((shadow as any).memorySpine))
              : s.memorySpine ?? createEmptyMemorySpine(),
          storyDirector:
            (shadow as any).storyDirector && typeof (shadow as any).storyDirector === "object" && !Array.isArray((shadow as any).storyDirector)
              ? JSON.parse(JSON.stringify((shadow as any).storyDirector))
              : (s as any).storyDirector ?? createEmptyDirectorState(0),
          incidentQueue:
            (shadow as any).incidentQueue && typeof (shadow as any).incidentQueue === "object" && !Array.isArray((shadow as any).incidentQueue)
              ? JSON.parse(JSON.stringify((shadow as any).incidentQueue))
              : (s as any).incidentQueue ?? createEmptyIncidentQueue(),
          escapeMainline:
            (shadow as any).escapeMainline && typeof (shadow as any).escapeMainline === "object" && !Array.isArray((shadow as any).escapeMainline)
              ? JSON.parse(JSON.stringify((shadow as any).escapeMainline))
              : (s as any).escapeMainline ?? createDefaultEscapeMainlineTemplate(0),
          currentOptions: normalizeStoredOptions(shadow.currentOptions, 4),
          inputMode: shadow.inputMode === "text" ? "text" : "options",
          currentBgm: typeof shadow.currentBgm === "string" ? shadow.currentBgm : "bgm_1_calm",
          stats: shadow.stats && typeof shadow.stats === "object" ? JSON.parse(JSON.stringify(shadow.stats)) : s.stats,
          originium: typeof shadow.originium === "number" ? shadow.originium : s.originium,
          professionState:
            shadow.professionState && typeof shadow.professionState === "object" && !Array.isArray(shadow.professionState)
              ? JSON.parse(JSON.stringify(shadow.professionState))
              : s.professionState,
          chapterState: normalizeChapterState((shadow as { chapterState?: unknown }).chapterState ?? s.chapterState),
          openingNarrativePinned:
            typeof (shadow as any).openingNarrativePinned === "boolean"
              ? (shadow as any).openingNarrativePinned
              : (s as any).openingNarrativePinned ?? true,
        }));
        // 恢复后立刻落一次正式 main_slot，让首页/云同步后续都回到正式真相源。
        get().saveGame("main_slot");
        return true;
      },
      clearResumeShadow: () => {
        clearResumeShadowSnapshot();
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
        pendingHourProgress: s.pendingHourProgress ?? 0,
        stats: s.stats ?? DEFAULT_STATS,
        historicalMaxSanity: s.historicalMaxSanity ?? 50,
        inventory: s.inventory,
        logs: s.logs ?? [],
        codex: s.codex ?? {},
        memorySpine: s.memorySpine ?? createEmptyMemorySpine(),
        storyDirector: (s as any).storyDirector ?? createEmptyDirectorState(0),
        incidentQueue: (s as any).incidentQueue ?? createEmptyIncidentQueue(),
        escapeMainline: (s as any).escapeMainline ?? createDefaultEscapeMainlineTemplate(0),
        hasCheckedCodex: s.hasCheckedCodex ?? false,
        warehouse: s.warehouse ?? [],
        originium: s.originium ?? 0,
        tasks: s.tasks ?? [],
        journalClues: s.journalClues ?? [],
        playerLocation: s.playerLocation ?? "B1_SafeZone",
        historicalMaxFloorScore: s.historicalMaxFloorScore ?? 0,
        deathCount: s.deathCount ?? 0,
        dynamicNpcStates: s.dynamicNpcStates ?? {},
        mainThreatByFloor: s.mainThreatByFloor ?? DEFAULT_WORLD_OVERLAY.mainThreatByFloor,
        equippedWeapon: s.equippedWeapon ?? null,
        weaponBag: s.weaponBag ?? [],
        reviveContext: s.reviveContext ?? {
          pending: false,
          deathLocation: null,
          deathCause: null,
          droppedLootLedger: [],
          droppedLootOwnerLedger: [],
        },
        appliedRelationshipTaskIds: s.appliedRelationshipTaskIds ?? [],
        professionState: s.professionState ?? createDefaultProfessionState(),
        chapterState: normalizeChapterState(s.chapterState),
        isGameStarted: s.isGameStarted ?? false,
        openingNarrativePinned: (s as any).openingNarrativePinned ?? false,
        volume: clampVolume(s.volume ?? 50),
      }),
    }
  )
);

/** 首页继续冒险：存档来源标签（本地 / 云端 / 两端一致 / 需用户选择） */
export type HomeContinueSourceTag = "local" | "cloud" | "synced" | "conflict";

export type HomeContinueSummary = {
  label: string;
  updatedAtIso: string | null;
  day: number;
  hour: number;
  locationId: string;
  activeTasksCount: number;
  professionLabel: string | null;
};

/** 从槽位 JSON（本地 SaveSlotData 或云端 data）抽取首页展示用摘要；不改变 hydrate/load 行为 */
export function extractHomeContinueSummaryFromPayload(data: unknown): HomeContinueSummary | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const slotMeta =
    d.slotMeta && typeof d.slotMeta === "object" && !Array.isArray(d.slotMeta)
      ? (d.slotMeta as Record<string, unknown>)
      : null;
  const label =
    slotMeta && typeof slotMeta.label === "string" && slotMeta.label.trim()
      ? slotMeta.label.trim()
      : "记录";
  const updatedAtIso =
    slotMeta && typeof slotMeta.updatedAt === "string" ? slotMeta.updatedAt : null;

  let day = 0;
  let hour = 0;
  let locationId = "B1_SafeZone";
  let activeTasksCount = 0;

  const snap =
    slotMeta?.snapshotSummary && typeof slotMeta.snapshotSummary === "object" && !Array.isArray(slotMeta.snapshotSummary)
      ? (slotMeta.snapshotSummary as Record<string, unknown>)
      : null;
  if (snap) {
    if (typeof snap.day === "number" && Number.isFinite(snap.day)) day = Math.trunc(snap.day);
    if (typeof snap.hour === "number" && Number.isFinite(snap.hour)) hour = Math.trunc(snap.hour);
    if (typeof snap.playerLocation === "string" && snap.playerLocation) locationId = snap.playerLocation;
    if (typeof snap.activeTasksCount === "number" && Number.isFinite(snap.activeTasksCount)) {
      activeTasksCount = Math.max(0, Math.trunc(snap.activeTasksCount));
    }
  }

  const time = d.time && typeof d.time === "object" && !Array.isArray(d.time) ? (d.time as Record<string, unknown>) : null;
  if (time) {
    if (typeof time.day === "number" && Number.isFinite(time.day)) day = Math.trunc(time.day);
    if (typeof time.hour === "number" && Number.isFinite(time.hour)) hour = Math.trunc(time.hour);
  }
  if (typeof d.playerLocation === "string" && d.playerLocation.trim()) locationId = d.playerLocation;

  const tasks = Array.isArray(d.tasks) ? d.tasks : [];
  if (activeTasksCount === 0 && tasks.length > 0) {
    activeTasksCount = tasks.filter(
      (t): t is { status?: string } => !!t && typeof t === "object" && !Array.isArray(t)
    ).filter((t) => t.status === "active" || t.status === "available").length;
  }

  let professionLabel: string | null = null;
  const ps =
    d.professionState && typeof d.professionState === "object" && !Array.isArray(d.professionState)
      ? (d.professionState as { currentProfession?: string | null })
      : null;
  if (ps?.currentProfession && typeof ps.currentProfession === "string") professionLabel = ps.currentProfession;
  if (!professionLabel && d.runSnapshotV2 && typeof d.runSnapshotV2 === "object" && !Array.isArray(d.runSnapshotV2)) {
    const rs = d.runSnapshotV2 as { profession?: { currentProfession?: string | null } };
    const cp = rs.profession?.currentProfession;
    if (typeof cp === "string" && cp) professionLabel = cp;
  }

  return {
    label,
    updatedAtIso,
    day,
    hour,
    locationId,
    activeTasksCount,
    professionLabel,
  };
}
