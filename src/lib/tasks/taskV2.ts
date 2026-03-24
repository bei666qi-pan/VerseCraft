export type GameTaskType = "main" | "floor" | "character" | "conspiracy";
export type GameTaskStatus =
  | "active"
  | "completed"
  | "failed"
  | "hidden"
  | "available";
export type GuidanceLevel = "none" | "light" | "standard" | "strong";
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
    normalizeGameTaskDraft({
      id: "main_b1_orientation",
      title: "在B1建立生存节奏",
      desc: "与B1服务NPC完成首次对话，了解商店、锻造与锚点复活规则。",
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
      reward: {
        originium: 2,
        unlocks: ["guide.b1.service_hub", "task.floor.1f.intro"],
      },
      worldConsequences: ["b1_guidance_seeded"],
    }),
    normalizeGameTaskDraft({
      id: "floor_1f_probe",
      title: "一楼试探性探索",
      desc: "在1F完成一次安全探索并带回可验证线索。",
      type: "floor",
      issuerId: "N-008",
      issuerName: "电工老刘",
      floorTier: "1",
      guidanceLevel: "standard",
      status: "available",
      claimMode: "manual",
      hiddenTriggerConditions: ["visited:1F_Lobby", "talked_to:N-008"],
      npcProactiveGrant: {
        enabled: true,
        npcId: "N-008",
        minFavorability: 5,
        preferredLocations: ["B1_SafeZone", "1F_Lobby"],
        cooldownHours: 4,
      },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "先去1F门厅观察，再决定是否深入。",
      reward: {
        originium: 3,
        items: ["I-D01"],
      },
      worldConsequences: ["unlock_floor_2f_path"],
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
  const styleHints = [
    "N-008:语气务实、带一点老油条式提醒，用生活细节抛出委托。",
    "N-009:语气温和但绕弯子，先闲聊再提出交换。",
    "N-011:语气克制权威，以秩序与代价框定任务。",
  ].join(" ");
  return [
    "## 【NPC主动发放叙事约束】",
    `发放候选（仅作剧情约束，不直接念给玩家）：${hintLine}`,
    `自然融入强度：${tone}。当满足条件时，用NPC的动作/语气/场景细节引出委托，避免系统提示口吻。`,
    `叙事语气模板：${styleHints}`,
    "禁止写法：'系统发放任务'、'你已接取任务'这类出戏文案。",
    "推荐写法：先写NPC观察与试探，再在对白里给出委托与风险交换条件。",
  ].join("\n");
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
