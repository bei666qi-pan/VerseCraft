import { buildNpcHeartRuntimeView } from "@/lib/npcHeart/selectors";
import { buildNpcProactiveGrantStyleHints } from "@/lib/npcHeart/prompt";

export type GameTaskType = "main" | "floor" | "character" | "conspiracy";
export type GameTaskStatus =
  | "active"
  | "completed"
  | "failed"
  | "hidden"
  | "available";
export type GuidanceLevel = "none" | "light" | "standard" | "strong";
export type TaskDramaticType =
  | "survival"
  | "trust"
  | "leverage"
  | "betrayal"
  | "delivery"
  | "investigation"
  | "coverup"
  | "escape"
  | "debt_payment";
export type RelationshipDelta =
  | "trust_up"
  | "trust_down"
  | "romance_open"
  | "betrayal_flag"
  | "secret_revealed";

export interface GameTaskRewardV2 {
  originium: number;
  items: string[];
  warehouseItems: string[];
  unlocks: string[];
  relationshipChanges: Array<{ npcId: string; delta: RelationshipDelta; value?: number }>;
}

export interface GameTaskV2 {
  id: string;
  title: string;
  desc: string;
  type: GameTaskType;
  issuerId: string;
  issuerName: string;
  floorTier: string;
  guidanceLevel: GuidanceLevel;
  reward: GameTaskRewardV2;
  status: GameTaskStatus;
  expiresAt: string | null;
  betrayalPossible: boolean;
  hiddenOutcome: string;
  hiddenTriggerConditions: string[];
  claimMode: "auto" | "manual" | "npc_grant";
  npcProactiveGrant: {
    enabled: boolean;
    npcId: string;
    minFavorability: number;
    preferredLocations: string[];
    cooldownHours: number;
  };
  npcProactiveGrantLastIssuedHour: number | null;
  nextHint: string;
  worldConsequences: string[];
  highRiskHighReward: boolean;

  // Phase-3: 任务立体化（可选字段；保持向后兼容）
  dramaticType?: TaskDramaticType;
  issuerIntent?: string;
  playerHook?: string;
  urgencyReason?: string;
  riskNote?: string;
  taboo?: string;
  hiddenMotive?: string;
  deadlineHint?: string;
  residueOnComplete?: string;
  residueOnFail?: string;
  relatedNpcIds?: string[];
  relatedLocationIds?: string[];
  relatedEscapeProgress?: string;
  trustImpactHint?: string;
  canBackfire?: boolean;
  backfireConsequences?: string[];
  followupSeedCodes?: string[];
  spokenDeliveryStyle?: string;
}

export interface RelationshipStatePatch {
  npcId: string;
  favorability?: number;
  trust?: number;
  fear?: number;
  debt?: number;
  affection?: number;
  desire?: number;
  romanceEligible?: boolean;
  romanceStage?: "none" | "hint" | "bonded" | "committed";
  betrayalFlagAdd?: string;
}

export type GameTaskV2Draft = Partial<GameTaskV2> & {
  id?: unknown;
  title?: unknown;
  desc?: unknown;
  issuer?: unknown;
  reward?: unknown;
};

export type GameTaskUpdateDraft = Partial<GameTaskV2> & { id?: unknown };

const DEFAULT_REWARD: GameTaskRewardV2 = {
  originium: 0,
  items: [],
  warehouseItems: [],
  unlocks: [],
  relationshipChanges: [],
};

const FLOOR_REWARD_BAND: Record<string, string> = {
  B1: "功能引导奖励：偏线索、补给、服务解锁",
  "1": "功能引导奖励：偏线索、补给、服务解锁",
  "2": "成长奖励：属性/资源节奏提升",
  "3": "成长奖励：属性/资源节奏提升",
  "4": "结构奖励：系统能力与分支推进",
  "5": "结构奖励：系统能力与分支推进",
  "6": "世界级奖励：高风险高收益",
  "7": "世界级奖励：高风险高收益",
};

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function asBoolean(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNonNegativeInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
  return n < 0 ? 0 : n;
}

function normalizeGuidanceLevel(v: unknown): GuidanceLevel {
  return v === "none" || v === "light" || v === "standard" || v === "strong"
    ? v
    : "standard";
}

function normalizeDramaticType(v: unknown): TaskDramaticType | undefined {
  return v === "survival" ||
    v === "trust" ||
    v === "leverage" ||
    v === "betrayal" ||
    v === "delivery" ||
    v === "investigation" ||
    v === "coverup" ||
    v === "escape" ||
    v === "debt_payment"
    ? v
    : undefined;
}

function clampShortText(v: unknown, max = 120): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return undefined;
  return s.length <= max ? s : s.slice(0, max);
}

function clampShortCodes(v: unknown, max = 8): string[] | undefined {
  const arr = asStringArray(v).slice(0, max);
  return arr.length > 0 ? arr : undefined;
}

function normalizeTaskType(v: unknown, taskId: string): GameTaskType {
  if (v === "main" || v === "floor" || v === "character" || v === "conspiracy") return v;
  if (taskId.startsWith("main_")) return "main";
  if (taskId.startsWith("floor_")) return "floor";
  if (taskId.startsWith("char_")) return "character";
  if (taskId.startsWith("cons_")) return "conspiracy";
  return "floor";
}

function normalizeStatus(v: unknown): GameTaskStatus {
  return v === "active" || v === "completed" || v === "failed" || v === "hidden" || v === "available"
    ? v
    : "active";
}

function normalizeReward(raw: unknown): GameTaskRewardV2 {
  if (typeof raw === "string") {
    const txt = raw.trim();
    const m = txt.match(/(\d+)/);
    return {
      ...DEFAULT_REWARD,
      originium: m ? asNonNegativeInt(Number(m[1])) : 0,
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_REWARD };
  const r = raw as Record<string, unknown>;
  const relRaw = Array.isArray(r.relationshipChanges) ? r.relationshipChanges : [];
  return {
    originium: asNonNegativeInt(r.originium, 0),
    items: asStringArray(r.items),
    warehouseItems: asStringArray(r.warehouseItems),
    unlocks: asStringArray(r.unlocks),
    relationshipChanges: relRaw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
      .map((x) => {
        const delta = x.delta;
        const normalizedDelta: RelationshipDelta =
          delta === "trust_up" || delta === "trust_down" || delta === "romance_open" || delta === "betrayal_flag" || delta === "secret_revealed"
            ? delta
            : "trust_up";
        return {
          npcId: asString(x.npcId),
          delta: normalizedDelta,
          ...(typeof x.value === "number" && Number.isFinite(x.value) ? { value: Math.trunc(x.value) } : {}),
        };
      })
      .filter((x) => x.npcId.length > 0),
  };
}

function normalizeFloorTier(v: unknown, id: string): string {
  const floor = asString(v);
  if (floor) return floor;
  if (id.includes("B1")) return "B1";
  if (id.includes("7F") || id.startsWith("cons_")) return "7";
  return "1";
}

export function normalizeGameTaskDraft(draft: unknown): GameTaskV2 | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const d = draft as GameTaskV2Draft;
  const id = asString(d.id);
  const title = asString(d.title);
  if (!id || !title) return null;
  const issuerNameLegacy = asString(d.issuer);
  const reward = normalizeReward(d.reward);
  return {
    id,
    title,
    desc: asString(d.desc),
    type: normalizeTaskType(d.type, id),
    issuerId: asString(d.issuerId, "unknown_issuer"),
    issuerName: asString(d.issuerName, issuerNameLegacy || "未知委托人"),
    floorTier: normalizeFloorTier(d.floorTier, id),
    guidanceLevel: normalizeGuidanceLevel(d.guidanceLevel),
    reward,
    status: normalizeStatus(d.status),
    expiresAt: asString(d.expiresAt) || null,
    betrayalPossible: asBoolean(d.betrayalPossible, false),
    hiddenOutcome: asString(d.hiddenOutcome),
    hiddenTriggerConditions: asStringArray((d as { hiddenTriggerConditions?: unknown }).hiddenTriggerConditions),
    claimMode:
      (d as { claimMode?: unknown }).claimMode === "auto" ||
      (d as { claimMode?: unknown }).claimMode === "manual" ||
      (d as { claimMode?: unknown }).claimMode === "npc_grant"
        ? (d as { claimMode: "auto" | "manual" | "npc_grant" }).claimMode
        : "manual",
    npcProactiveGrant: (() => {
      const raw = (d as { npcProactiveGrant?: unknown }).npcProactiveGrant;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {
          enabled: false,
          npcId: "",
          minFavorability: 0,
          preferredLocations: [],
          cooldownHours: 0,
        };
      }
      const o = raw as Record<string, unknown>;
      return {
        enabled: asBoolean(o.enabled, false),
        npcId: asString(o.npcId),
        minFavorability: asNonNegativeInt(o.minFavorability, 0),
        preferredLocations: asStringArray(o.preferredLocations),
        cooldownHours: asNonNegativeInt(o.cooldownHours, 0),
      };
    })(),
    npcProactiveGrantLastIssuedHour:
      typeof (d as { npcProactiveGrantLastIssuedHour?: unknown }).npcProactiveGrantLastIssuedHour === "number"
        ? asNonNegativeInt((d as { npcProactiveGrantLastIssuedHour: number }).npcProactiveGrantLastIssuedHour, 0)
        : null,
    nextHint: asString(d.nextHint),
    worldConsequences: asStringArray(d.worldConsequences),
    highRiskHighReward: asBoolean(d.highRiskHighReward, false),

    dramaticType: normalizeDramaticType((d as any).dramaticType),
    issuerIntent: clampShortText((d as any).issuerIntent, 140),
    playerHook: clampShortText((d as any).playerHook, 120),
    urgencyReason: clampShortText((d as any).urgencyReason, 120),
    riskNote: clampShortText((d as any).riskNote, 140),
    taboo: clampShortText((d as any).taboo, 120),
    hiddenMotive: clampShortText((d as any).hiddenMotive, 140),
    deadlineHint: clampShortText((d as any).deadlineHint, 80),
    residueOnComplete: clampShortText((d as any).residueOnComplete, 140),
    residueOnFail: clampShortText((d as any).residueOnFail, 140),
    relatedNpcIds: clampShortCodes((d as any).relatedNpcIds, 8),
    relatedLocationIds: clampShortCodes((d as any).relatedLocationIds, 8),
    relatedEscapeProgress: clampShortText((d as any).relatedEscapeProgress, 80),
    trustImpactHint: clampShortText((d as any).trustImpactHint, 120),
    canBackfire: (d as any).canBackfire !== undefined ? asBoolean((d as any).canBackfire, false) : undefined,
    backfireConsequences: clampShortCodes((d as any).backfireConsequences, 6),
    followupSeedCodes: clampShortCodes((d as any).followupSeedCodes, 6),
    spokenDeliveryStyle: clampShortText((d as any).spokenDeliveryStyle, 120),
  };
}

export function normalizeTaskUpdateDraft(draft: unknown): (Partial<GameTaskV2> & { id: string }) | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const d = draft as GameTaskUpdateDraft;
  const id = asString(d.id);
  if (!id) return null;
  const out: Partial<GameTaskV2> & { id: string } = { id };
  if (d.status !== undefined) out.status = normalizeStatus(d.status);
  if (d.nextHint !== undefined) out.nextHint = asString(d.nextHint);
  if (d.hiddenOutcome !== undefined) out.hiddenOutcome = asString(d.hiddenOutcome);
  if (d.expiresAt !== undefined) out.expiresAt = asString(d.expiresAt) || null;
  if (d.worldConsequences !== undefined) out.worldConsequences = asStringArray(d.worldConsequences);
  if (d.guidanceLevel !== undefined) out.guidanceLevel = normalizeGuidanceLevel(d.guidanceLevel);
  if (d.reward !== undefined) out.reward = normalizeReward(d.reward);
  if (d.betrayalPossible !== undefined) out.betrayalPossible = asBoolean(d.betrayalPossible);
  if (d.highRiskHighReward !== undefined) out.highRiskHighReward = asBoolean(d.highRiskHighReward);
  if ((d as any).dramaticType !== undefined) out.dramaticType = normalizeDramaticType((d as any).dramaticType);
  if ((d as any).issuerIntent !== undefined) out.issuerIntent = clampShortText((d as any).issuerIntent, 140) ?? "";
  if ((d as any).playerHook !== undefined) out.playerHook = clampShortText((d as any).playerHook, 120) ?? "";
  if ((d as any).urgencyReason !== undefined) out.urgencyReason = clampShortText((d as any).urgencyReason, 120) ?? "";
  if ((d as any).riskNote !== undefined) out.riskNote = clampShortText((d as any).riskNote, 140) ?? "";
  if ((d as any).taboo !== undefined) out.taboo = clampShortText((d as any).taboo, 120) ?? "";
  if ((d as any).hiddenMotive !== undefined) out.hiddenMotive = clampShortText((d as any).hiddenMotive, 140) ?? "";
  if ((d as any).deadlineHint !== undefined) out.deadlineHint = clampShortText((d as any).deadlineHint, 80) ?? "";
  if ((d as any).residueOnComplete !== undefined) out.residueOnComplete = clampShortText((d as any).residueOnComplete, 140) ?? "";
  if ((d as any).residueOnFail !== undefined) out.residueOnFail = clampShortText((d as any).residueOnFail, 140) ?? "";
  if ((d as any).relatedNpcIds !== undefined) out.relatedNpcIds = asStringArray((d as any).relatedNpcIds).slice(0, 8);
  if ((d as any).relatedLocationIds !== undefined) out.relatedLocationIds = asStringArray((d as any).relatedLocationIds).slice(0, 8);
  if ((d as any).relatedEscapeProgress !== undefined) out.relatedEscapeProgress = clampShortText((d as any).relatedEscapeProgress, 80) ?? "";
  if ((d as any).trustImpactHint !== undefined) out.trustImpactHint = clampShortText((d as any).trustImpactHint, 120) ?? "";
  if ((d as any).canBackfire !== undefined) out.canBackfire = asBoolean((d as any).canBackfire);
  if ((d as any).backfireConsequences !== undefined) out.backfireConsequences = asStringArray((d as any).backfireConsequences).slice(0, 6);
  if ((d as any).followupSeedCodes !== undefined) out.followupSeedCodes = asStringArray((d as any).followupSeedCodes).slice(0, 6);
  if ((d as any).spokenDeliveryStyle !== undefined) out.spokenDeliveryStyle = clampShortText((d as any).spokenDeliveryStyle, 120) ?? "";
  if ((d as { hiddenTriggerConditions?: unknown }).hiddenTriggerConditions !== undefined) {
    out.hiddenTriggerConditions = asStringArray((d as { hiddenTriggerConditions?: unknown }).hiddenTriggerConditions);
  }
  if ((d as { claimMode?: unknown }).claimMode !== undefined) {
    const c = (d as { claimMode?: unknown }).claimMode;
    out.claimMode = c === "auto" || c === "manual" || c === "npc_grant" ? c : "manual";
  }
  if ((d as { npcProactiveGrant?: unknown }).npcProactiveGrant !== undefined) {
    const raw = (d as { npcProactiveGrant?: unknown }).npcProactiveGrant;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      out.npcProactiveGrant = {
        enabled: asBoolean(o.enabled, false),
        npcId: asString(o.npcId),
        minFavorability: asNonNegativeInt(o.minFavorability, 0),
        preferredLocations: asStringArray(o.preferredLocations),
        cooldownHours: asNonNegativeInt(o.cooldownHours, 0),
      };
    }
  }
  if ((d as { npcProactiveGrantLastIssuedHour?: unknown }).npcProactiveGrantLastIssuedHour !== undefined) {
    const raw = (d as { npcProactiveGrantLastIssuedHour?: unknown }).npcProactiveGrantLastIssuedHour;
    out.npcProactiveGrantLastIssuedHour =
      typeof raw === "number" && Number.isFinite(raw) ? asNonNegativeInt(raw, 0) : null;
  }
  return out;
}

export function applyTaskUpdateToTask(task: GameTaskV2, patch: Partial<GameTaskV2>): GameTaskV2 {
  return {
    ...task,
    ...patch,
    reward: patch.reward ? { ...task.reward, ...patch.reward } : task.reward,
    worldConsequences: Array.isArray(patch.worldConsequences) ? [...patch.worldConsequences] : task.worldConsequences,
  };
}

export function formatTaskRewardSummary(reward: GameTaskRewardV2): string {
  const parts: string[] = [];
  if (reward.originium > 0) parts.push(`原石+${reward.originium}`);
  if (reward.items.length > 0) parts.push(`道具${reward.items.length}件`);
  if (reward.warehouseItems.length > 0) parts.push(`仓库物品${reward.warehouseItems.length}件`);
  if (reward.unlocks.length > 0) parts.push(`解锁${reward.unlocks.length}项`);
  if (reward.relationshipChanges.length > 0) parts.push(`关系变化${reward.relationshipChanges.length}项`);
  return parts.length > 0 ? parts.join(" / ") : "阶段性线索";
}

export function getTaskStatusLabel(status: GameTaskStatus): string {
  if (status === "active") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  if (status === "hidden") return "隐藏中";
  return "可接取";
}

export function getRewardCurveHintByFloorTier(floorTier: string): string {
  return FLOOR_REWARD_BAND[floorTier] ?? "探索奖励：随风险与世界推进提升";
}

export function createStageOneStarterTasks(): GameTaskV2[] {
  return [
    // Phase-5（示范）：出口主线骨架任务（不改 UI 结构：仍走现有任务系统）
    normalizeGameTaskDraft({
      id: "main_escape_spine",
      title: "走出去（出口主线）",
      desc: "把“出口”从传闻变成可执行的路线：路线碎片、门槛条件、代价与假出口都要被确认。",
      type: "main",
      issuerId: "SYSTEM",
      issuerName: "规则",
      floorTier: "B1",
      guidanceLevel: "strong",
      status: "active",
      claimMode: "auto",
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先从可信 NPC 拿到路线碎片，再确认进入地下二层的门槛与代价。",
      dramaticType: "escape",
      issuerIntent: "让你把“活下去”从挣扎变成行动：出口不是楼层尽头，而是规则的缝。",
      playerHook: "你要的不是活久一点，而是离开这栋楼。",
      urgencyReason: "第十日的闸门不会等你。",
      riskNote: "别把第一个听来的“出口”当真；公寓喜欢喂假希望。",
      taboo: "别把‘走出去’当作免费通关；代价必然存在。",
      relatedEscapeProgress: "spine:escape_mainline",
      followupSeedCodes: ["escape.route.fragments", "escape.cost.trial"],
      worldConsequences: ["escape:spine_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "main_escape_route_fragments",
      title: "拼出出口路线碎片",
      desc: "收集至少两条可验证的路线碎片：来自任务线索、可信 NPC、或可验证的物证。",
      type: "main",
      issuerId: "N-008",
      issuerName: "电工老刘",
      floorTier: "B1",
      guidanceLevel: "strong",
      status: "available",
      claimMode: "npc_grant",
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: true, npcId: "N-008", minFavorability: 0, preferredLocations: ["B1_SafeZone", "B1_PowerRoom"], cooldownHours: 4 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "问清楚：谁见过‘地下二层’的门？谁能证明自己没撒谎？",
      dramaticType: "investigation",
      issuerIntent: "把你从‘听故事’推到‘拿证据’；他讨厌空话。",
      playerHook: "别把命押在传闻上，押在能验证的东西上。",
      urgencyReason: "B1 的灯随时会灭；灯一灭，路就会变。",
      residueOnComplete: "你获得了第一组可信路线碎片；出口不再只是传说。",
      relatedEscapeProgress: "cond:get_exit_route_map",
      relatedNpcIds: ["N-008", "N-010"],
      followupSeedCodes: ["escape.b2.access", "escape.key.item"],
      worldConsequences: ["escape:route_fragment_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "main_escape_b2_access",
      title: "拿到进入地下二层的权限",
      desc: "不靠蛮力进入地下二层：拿到许可、通行、或让某个守门人愿意放你过去。",
      type: "main",
      issuerId: "N-010",
      issuerName: "欣蓝",
      floorTier: "1",
      status: "hidden",
      claimMode: "npc_grant",
      hiddenTriggerConditions: ["escape.route.fragments>=2"],
      npcProactiveGrant: { enabled: true, npcId: "N-010", minFavorability: 0, preferredLocations: ["1F_PropertyOffice"], cooldownHours: 6 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "问她：‘我要去地下二层，你手里有没有“许可”的替代品？’",
      dramaticType: "leverage",
      issuerIntent: "用通行把你绑进她的账本：你每一步，都得拿信息换。",
      playerHook: "你想进 B2，就得先交出你的一部分自由。",
      urgencyReason: "路线窗口不会长期开放；等门缝闭合再求许可只会更贵。",
      residueOnComplete: "你拿到了进入地下二层的权限线索；门槛开始具象化。",
      relatedEscapeProgress: "cond:obtain_b2_access",
      canBackfire: true,
      backfireConsequences: ["rel:N-010:trust:-3"],
      worldConsequences: ["escape:b2_access_granted"],
      reward: { unlocks: ["b2_access_granted"] },
    }),
    normalizeGameTaskDraft({
      id: "main_escape_cost_trial",
      title: "支付出口代价（代价试炼）",
      desc: "出口不是免费的。完成一次代价试炼，证明你愿意‘失去’来换取离开。",
      type: "main",
      issuerId: "N-018",
      issuerName: "北夏",
      floorTier: "1",
      status: "hidden",
      claimMode: "npc_grant",
      hiddenTriggerConditions: ["escape.b2.access"],
      npcProactiveGrant: { enabled: true, npcId: "N-018", minFavorability: 0, preferredLocations: ["1F_Lobby", "6F_Stairwell"], cooldownHours: 8 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先问他：‘出口要付什么？我能付到哪一步？’",
      dramaticType: "debt_payment",
      issuerIntent: "他不相信白来的胜利；他要你用一次割肉证明决心。",
      playerHook: "你敢付代价，他就敢给你看门缝。",
      urgencyReason: "越接近门，越会被盯上。",
      taboo: "别试图用花言巧语绕过代价。",
      residueOnComplete: "你付过一次代价；出口不再把你当作观众。",
      residueOnFail: "你会被当作‘只想占便宜’的人，门槛会更硬。",
      relatedEscapeProgress: "cond:survive_cost_trial",
      canBackfire: true,
      backfireConsequences: ["rel:N-018:trust:-2", "rel:N-018:fear:+2"],
      followupSeedCodes: ["escape.final.window"],
      worldConsequences: ["escape:cost_trial_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "main_b1_orientation",
      title: "在B1建立生存节奏",
      desc: "与B1服务NPC完成首次对话，建立“承诺—回报—代价”的生存节奏。",
      type: "main",
      issuerId: "N-008",
      issuerName: "电工老刘",
      floorTier: "B1",
      guidanceLevel: "strong",
      status: "active",
      claimMode: "npc_grant",
      hiddenTriggerConditions: [],
      npcProactiveGrant: {
        enabled: true,
        npcId: "N-008",
        minFavorability: 0,
        preferredLocations: ["B1_SafeZone", "B1_Storage"],
        cooldownHours: 2,
      },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先去储物间问补给，再去配电间问维护。",
      dramaticType: "survival",
      issuerIntent: "把你留在B1的安全边界里活过第一天，同时让你欠下一点人情。",
      playerHook: "你想往上走，就得先学会在B1把命稳住。",
      urgencyReason: "停电与混乱会吞人；老刘不想再多一具尸体。",
      riskNote: "别乱碰开关；别在他工作时插话。",
      taboo: "别追问‘线从哪来’。",
      residueOnComplete: "你欠老刘一次；他会更愿意提醒你危险细节。",
      residueOnFail: "他会认为你不听劝，后续帮助会变成冷淡的‘按规矩来’。",
      relatedNpcIds: ["N-008", "N-014"],
      relatedLocationIds: ["B1_PowerRoom", "B1_Storage"],
      canBackfire: true,
      backfireConsequences: ["rel:N-008:trust:-4", "rel:N-008:fear:+2"],
      followupSeedCodes: ["b1.power.ledger", "b1.cat.tells"],
      spokenDeliveryStyle: "嘴硬心软，骂两句再给实用提醒。",
      reward: {
        originium: 2,
        unlocks: ["guide.b1.service_hub", "task.floor.1f.intro"],
      },
      worldConsequences: ["b1_guidance_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "floor_1f_probe",
      title: "一楼试探性探索",
      desc: "在1F完成一次试探性探索，带回‘可验证’的线索或物证。",
      type: "floor",
      issuerId: "N-008",
      issuerName: "电工老刘",
      floorTier: "1",
      status: "available",
      claimMode: "manual",
      // 该任务对玩家是“可接取”的显式委托：触发/隐藏条件不展示在 UI，避免出戏。
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先去1F门厅观察，再决定是否深入。",
      dramaticType: "investigation",
      issuerIntent: "用一条可验证线索换取你继续留在B1互助圈的资格。",
      playerHook: "你带回来的不是‘故事’，是能落地的证据。",
      urgencyReason: "上行路线的风险越来越高，B1需要早一点知道哪里开始‘不对’。",
      riskNote: "别把你最关键的保命资源暴露给陌生NPC。",
      residueOnComplete: "B1的人会更愿意把你当‘能合作的人’。",
      residueOnFail: "你会被当作‘冲动的新手’，别人会更谨慎地跟你交换信息。",
      relatedNpcIds: ["N-008", "N-010"],
      relatedLocationIds: ["1F_Lobby", "1F_PropertyOffice"],
      reward: {
        // 按需求：奖励只保留一种（道具 1 件）
        items: ["I-C12"],
      },
      worldConsequences: ["unlock_floor_2f_path"],
    }),
    normalizeGameTaskDraft({
      id: "char_1f_stamp_leverage",
      title: "借到一枚“通行印章”",
      desc: "从物业体系里拿到一次性的“许可”——不一定是明文的印章，也可以是口头放行。",
      type: "character",
      issuerId: "N-010",
      issuerName: "欣蓝",
      floorTier: "1",
      status: "available",
      claimMode: "manual",
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先说明你的目标，再问‘有没有更稳妥的通行方式’。",
      dramaticType: "leverage",
      issuerIntent: "用‘许可’把你绑定进她的路线账本里：你每前进一步，都要回报一次信息。",
      playerHook: "你想省一次命，就得先交一次信息。",
      urgencyReason: "有些门不是打不开，而是‘不该由你去开’。",
      taboo: "别让她替你做选择再推卸后果。",
      hiddenMotive: "她在筛选你是否值得进入更高层路线。",
      residueOnComplete: "你欠她一条能验证的线索；她会更直白地给你路线建议。",
      residueOnFail: "她会把你归类为‘不稳定变量’，建议会变得更保守。",
      relatedNpcIds: ["N-010"],
      relatedLocationIds: ["1F_PropertyOffice"],
      canBackfire: true,
      backfireConsequences: ["rel:N-010:trust:-3", "rel:N-010:fear:+4"],
      spokenDeliveryStyle: "温柔但强势：先确认你的目标，再给你一条能落地的路。",
      reward: { unlocks: ["permit.one_time"] },
      worldConsequences: ["route.permit.seeded"],
    }),
    normalizeGameTaskDraft({
      id: "char_mirror_patrol_debt",
      title: "在镜面旁留下巡逻记录",
      desc: "帮北夏把倒行者的痕迹记下来：地点、时间、反光面状态（多在镜面旁交接）。",
      type: "character",
      issuerId: "N-018",
      issuerName: "北夏",
      floorTier: "1",
      status: "available",
      claimMode: "manual",
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "找一个有镜子的角落；先问他‘你在巡什么’再接话。",
      dramaticType: "debt_payment",
      issuerIntent: "他不喜欢欠人情，但这次需要你的眼睛——欠下就会记得还。",
      playerHook: "你帮他稳住边界，他会在关键时刻帮你避开一刀。",
      urgencyReason: "倒行者靠近时，楼梯间的边界会变薄。",
      riskNote: "不要在无镜处和他对话；那会让你误判他的情绪。",
      residueOnComplete: "你与他之间形成一次可兑现的人情。",
      residueOnFail: "他会更冷淡、更程序化地拒绝你在无镜处的任何请求。",
      relatedNpcIds: ["N-018", "N-009"],
      relatedLocationIds: ["6F_Stairwell"],
      spokenDeliveryStyle: "会讲玩笑，但每句都留后路；关键提醒很短很硬。",
      reward: { originium: 1, unlocks: ["mirror.patrol.log"] },
      worldConsequences: ["hook:mirror_patrol_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "char_newcomer_coverup",
      title: "帮她把‘漏掉的规则’圆过去",
      desc: "当灵伤‘不小心’漏掉关键规则时，用不露痕迹的方式替她补上，避免她被泡层口径追责。",
      type: "character",
      issuerId: "N-020",
      issuerName: "灵伤",
      floorTier: "B1",
      status: "available",
      claimMode: "manual",
      hiddenTriggerConditions: [],
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "别直接纠正她；先顺着她的话补一句‘有人跟我提过…’。",
      dramaticType: "coverup",
      issuerIntent: "她要补给线绩效，也要你继续信她；让你先答应，再用规则催你兑现。",
      playerHook: "你帮她一次，她就会在某个细节上放你一马。",
      urgencyReason: "泡层审计会查漏；查到就会‘回收’她这条人性缓冲。",
      taboo: "别追问‘你是人吗’。",
      hiddenMotive: "她在执行泡层口径，同时害怕声纹程序错误。",
      residueOnComplete: "她会更愿意给你‘看起来无害’但关键的小提醒。",
      residueOnFail: "她会变得更甜、更假，也更危险；对你的话会开始记录。",
      relatedNpcIds: ["N-020", "N-010"],
      relatedLocationIds: ["1F_Lobby", "1F_PropertyOffice"],
      canBackfire: true,
      backfireConsequences: ["rel:N-020:trust:-4", "rel:N-010:trust:-2"],
      spokenDeliveryStyle: "句尾上扬、像在哄人；漏掉关键规则时会装作‘忘了’。",
      reward: { originium: 1 },
      worldConsequences: ["hook:newcomer_coverup_seeded"],
    }),
  ].filter((x): x is GameTaskV2 => !!x);
}

export function normalizeDmTaskPayload(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  const newTasksRaw = Array.isArray(record.new_tasks) ? record.new_tasks : [];
  const normalizedNew = newTasksRaw
    .map((t) => normalizeGameTaskDraft(t))
    .filter((t): t is GameTaskV2 => !!t);
  next.new_tasks = normalizedNew;

  const updatesRaw = Array.isArray(record.task_updates) ? record.task_updates : [];
  const normalizedUpdates = updatesRaw
    .map((u) => normalizeTaskUpdateDraft(u))
    .filter((u): u is { id: string } & Partial<GameTaskV2> => !!u);
  next.task_updates = normalizedUpdates;
  return next;
}

export function canClaimHiddenTask(task: GameTaskV2, unlockedFlags: string[]): boolean {
  if (task.status !== "hidden") return true;
  if (!Array.isArray(task.hiddenTriggerConditions) || task.hiddenTriggerConditions.length === 0) {
    return true;
  }
  const set = new Set(unlockedFlags);
  return task.hiddenTriggerConditions.every((c) => set.has(c));
}

export function collectUnlockedTaskFlags(tasks: GameTaskV2[]): string[] {
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.status === "completed") {
      for (const c of t.worldConsequences ?? []) out.add(c);
    }
  }
  return [...out];
}

export function activateClaimableHiddenTasks(tasks: GameTaskV2[]): GameTaskV2[] {
  const unlocked = collectUnlockedTaskFlags(tasks);
  return tasks.map((t) => {
    if (t.status !== "hidden") return t;
    return canClaimHiddenTask(t, unlocked)
      ? { ...t, status: t.claimMode === "auto" ? "active" : "available" }
      : t;
  });
}

function parseSignedInt(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Parse relationship patches from completed-task world consequences.
 * Format examples:
 * - rel:N-018:trust:+6
 * - rel:N-013:fear:+8
 * - rel:N-007:romanceEligible:true
 * - rel:N-007:romanceStage:hint
 * - rel:N-013:betrayal:flag_boy_trap
 */
export function extractRelationshipPatchesFromConsequences(tasks: GameTaskV2[]): RelationshipStatePatch[] {
  const byNpc = new Map<string, RelationshipStatePatch>();
  for (const t of tasks) {
    if (t.status !== "completed") continue;
    for (const raw of t.worldConsequences ?? []) {
      const s = String(raw ?? "").trim();
      if (!s.startsWith("rel:")) continue;
      const parts = s.split(":");
      if (parts.length < 4) continue;
      const npcId = parts[1] ?? "";
      const key = parts[2] ?? "";
      const value = parts.slice(3).join(":");
      if (!npcId) continue;
      const base = byNpc.get(npcId) ?? { npcId };
      if (key === "romanceEligible") {
        base.romanceEligible = value === "true";
      } else if (key === "romanceStage") {
        if (value === "none" || value === "hint" || value === "bonded" || value === "committed") {
          base.romanceStage = value;
        }
      } else if (key === "betrayal") {
        if (value) base.betrayalFlagAdd = value;
      } else {
        const delta = parseSignedInt(value);
        if (delta === null) continue;
        if (key === "favorability") base.favorability = (base.favorability ?? 0) + delta;
        if (key === "trust") base.trust = (base.trust ?? 0) + delta;
        if (key === "fear") base.fear = (base.fear ?? 0) + delta;
        if (key === "debt") base.debt = (base.debt ?? 0) + delta;
        if (key === "affection") base.affection = (base.affection ?? 0) + delta;
        if (key === "desire") base.desire = (base.desire ?? 0) + delta;
      }
      byNpc.set(npcId, base);
    }
  }
  return [...byNpc.values()];
}

export function buildNpcProactiveGrantNarrativeBlock(args: {
  playerContext: string;
  latestUserInput: string;
}): string {
  const ctx = args.playerContext ?? "";
  const lineMatch = ctx.match(/任务发放线索：([^\n。]+)[。\n]?/);
  const hintLine = lineMatch?.[1]?.trim();
  if (!hintLine) return "";
  const mentionText = args.latestUserInput ?? "";
  const wantsTalk = /聊|问|打听|对话|交谈|委托|任务/.test(mentionText);
  const tone = wantsTalk ? "高" : "中";
  const npcIdMatch = hintLine.match(/\[ID([^\|\]]+)\|/);
  const npcId = npcIdMatch?.[1]?.trim() ?? "";
  const view = npcId
    ? buildNpcHeartRuntimeView({
        npcId,
        relationPartial: { trust: 0, fear: 0, debt: 0, favorability: 0 },
        locationId: parseCurrentLocationFromContext(ctx) || "B1_SafeZone",
        activeTaskIds: [],
        hotThreatPresent: false,
      })
    : null;
  const styleHints = buildNpcProactiveGrantStyleHints(view);
  return [
    "## 【NPC主动发放叙事约束】",
    `发放候选（仅作剧情约束，不直接念给玩家）：${hintLine}`,
    `自然融入强度：${tone}。当满足条件时，用NPC的动作/语气/场景细节引出委托，避免系统提示口吻。`,
    styleHints ? `叙事语气模板：${styleHints}` : "",
    "禁止写法：'系统发放任务'、'你已接取任务'这类出戏文案。",
    "推荐写法：先写NPC观察与试探，再在对白里给出委托与风险交换条件。",
  ].filter(Boolean).join("\n");
}

function parseCurrentLocationFromContext(playerContext: string): string {
  const m = playerContext.match(/用户位置\[([^\]]+)\]/);
  return m?.[1]?.trim() ?? "";
}

function parseCurrentTimeFromContext(playerContext: string): { day: number; hour: number } {
  const m = playerContext.match(/游戏时间\[第(\d+)日\s+(\d+)时\]/);
  const day = m?.[1] ? Number(m[1]) : 0;
  const hour = m?.[2] ? Number(m[2]) : 0;
  return {
    day: Number.isFinite(day) ? day : 0,
    hour: Number.isFinite(hour) ? hour : 0,
  };
}

function parseFavorabilityByNameFromContext(playerContext: string): Record<string, number> {
  const out: Record<string, number> = {};
  const m = playerContext.match(/图鉴已解锁：(.+?)(?:。|$)/);
  if (!m?.[1]) return out;
  const chunks = m[1].split("，");
  for (const c of chunks) {
    const mm = c.match(/^(.+?)\[[^\]]*好感(-?\d+)\]/);
    if (!mm) continue;
    const name = mm[1]?.trim();
    const fav = Number(mm[2]);
    if (!name || !Number.isFinite(fav)) continue;
    out[name] = fav;
  }
  return out;
}

function parseProactiveLedgerFromContext(playerContext: string): Record<string, { hasOpenTask: boolean; lastIssuedHour: number | null }> {
  const out: Record<string, { hasOpenTask: boolean; lastIssuedHour: number | null }> = {};
  const m = playerContext.match(/任务发放线索：(.+?)(?:。|$)/);
  if (!m?.[1]) return out;
  const chunks = m[1].split("；");
  for (const c of chunks) {
    const mm = c.match(/^(.+?):.+?\[ID([^\|\]]+)\|.*?状态([a-z_]+)\|上次发放H(-?\d+|NA)\]/);
    if (!mm) continue;
    const npcId = (mm[2] ?? "").trim();
    const status = (mm[3] ?? "").trim();
    const hourRaw = (mm[4] ?? "").trim();
    if (!npcId) continue;
    const lastIssuedHour = hourRaw === "NA" ? null : Number.isFinite(Number(hourRaw)) ? Number(hourRaw) : null;
    out[npcId] = {
      hasOpenTask: status === "active" || status === "available",
      lastIssuedHour,
    };
  }
  return out;
}

function parseHoursIso(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 3600000);
}

export function applyNpcProactiveGrantGuard(args: {
  dmRecord: Record<string, unknown>;
  playerContext: string;
}): Record<string, unknown> {
  const next = { ...args.dmRecord };
  const normalized = normalizeDmTaskPayload(next);
  const currentLocation = parseCurrentLocationFromContext(args.playerContext);
  const time = parseCurrentTimeFromContext(args.playerContext);
  const favorabilityByName = parseFavorabilityByNameFromContext(args.playerContext);
  const ledger = parseProactiveLedgerFromContext(args.playerContext);
  const currentHourIndex = time.day * 24 + time.hour;
  const incoming = Array.isArray(normalized.new_tasks) ? normalized.new_tasks as GameTaskV2[] : [];
  const accepted: GameTaskV2[] = [];
  const issuedNpcIds = new Set<string>();
  const blockedReasons: string[] = [];

  for (const task of incoming) {
    if (task.claimMode !== "npc_grant" || !task.npcProactiveGrant.enabled) {
      accepted.push(task);
      continue;
    }

    const grantNpc = task.npcProactiveGrant.npcId || task.issuerId;
    if (!grantNpc) {
      blockedReasons.push(`${task.title}:缺少发放NPC`);
      continue;
    }
    if (issuedNpcIds.has(grantNpc)) {
      blockedReasons.push(`${task.title}:同NPC本回合已发放`);
      continue;
    }
    if (ledger[grantNpc]?.hasOpenTask) {
      blockedReasons.push(`${task.title}:该NPC仍有未关闭任务`);
      continue;
    }

    const fav = favorabilityByName[task.issuerName];
    if (Number.isFinite(fav) && fav < task.npcProactiveGrant.minFavorability) {
      blockedReasons.push(`${task.title}:好感不足(${fav}<${task.npcProactiveGrant.minFavorability})`);
      continue;
    }

    const lastIssued = ledger[grantNpc]?.lastIssuedHour ?? task.npcProactiveGrantLastIssuedHour;
    if (typeof lastIssued === "number" && Number.isFinite(lastIssued)) {
      const diff = currentHourIndex - lastIssued;
      if (diff >= 0 && diff < task.npcProactiveGrant.cooldownHours) {
        blockedReasons.push(`${task.title}:冷却中(${diff}/${task.npcProactiveGrant.cooldownHours}h)`);
        continue;
      }
    }

    const preferred = task.npcProactiveGrant.preferredLocations ?? [];
    if (preferred.length > 0 && currentLocation && !preferred.includes(currentLocation)) {
      blockedReasons.push(`${task.title}:地点不匹配(${currentLocation})`);
      continue;
    }

    if (task.expiresAt) {
      const expiresHour = parseHoursIso(task.expiresAt);
      if (expiresHour !== null && currentHourIndex < expiresHour) {
        blockedReasons.push(`${task.title}:未到触发时机`);
        continue;
      }
    }

    issuedNpcIds.add(grantNpc);
    accepted.push({
      ...task,
      npcProactiveGrantLastIssuedHour: currentHourIndex,
    });
  }

  normalized.new_tasks = accepted;
  (normalized as Record<string, unknown>).npc_task_grant_blocked_reasons = blockedReasons;
  return normalized;
}

export function buildNpcGrantFallbackNarrativeBlock(dmRecord: Record<string, unknown>): string {
  const reasons = Array.isArray(dmRecord.npc_task_grant_blocked_reasons)
    ? dmRecord.npc_task_grant_blocked_reasons.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  if (reasons.length === 0) return "";
  return [
    "NPC这回没有把委托说透，只留下一句含混提醒与交换条件暗示。",
    "请把这句过渡自然融进叙事段落，不要像系统提示。",
    `（参考拦截原因：${reasons.join("；")}）`,
  ].join("\n");
}
