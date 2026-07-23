/**
 * SUT Adapter — System Under Test 适配器
 *
 * 把 VerseCraft 的真实游戏接口（/api/chat SSE）封装成 harness 可调用的形态。
 * Playthrough 模拟器只需要「输入玩家动作 → 拿到 DM JSON 响应」的能力。
 *
 * 设计：
 * - SutAdapter 是接口；提供两个实现：
 *   - HttpSutAdapter：调用真实的 /api/chat SSE
 *   - MockSutAdapter：使用规则模拟器（不依赖 AI gateway / 网络）
 * - 默认 mock — 长程 fuzz 必须可离线运行
 * - Live 模式通过环境变量或配置启用
 *
 * 复用：
 * - SSE 解析复用 src/features/play/stream/sseFrame.ts 的帧格式
 * - DM JSON 规范化复用 src/lib/playRealtime/normalizePlayerDmJson.ts
 */

import type { GameStateSnapshot } from "./types";
import { createInitialStateSnapshot } from "./invariants";
import { applyDmJsonToState } from "./stateApply";
import { IncrementalVerseCraftSseDecoder } from "../harness/sseFaultModel";

// === SUT 接口 ===

export interface SutAction {
  /** 玩家输入（自然语言） */
  playerAction: string;
  /** 当前 persona（影响 system prompt 注入） */
  persona: string;
  /** 当前步骤（用于 trace） */
  stepIndex: number;
  /** Client-first state and history equivalents supplied by the playthrough harness. */
  playerContext?: string;
  clientState?: Record<string, unknown>;
}

export interface SutResponse {
  narrative: string;
  dmJson: Record<string, unknown>;
  /** 当前帧耗时（live 模式有值） */
  latencyMs: number;
  /** SSE 控制帧解码出的状态 */
  status: "ok" | "degraded" | "error";
  /** 是否达到 final 帧 */
  reachedFinal: boolean;
  /** AI 网关降级状态码（如 keys_missing） */
  aiStatus?: string;
  /** 错误信息（如有） */
  error?: string;
}

export interface SutAdapter {
  /**
   * 一步调用：玩家输入 → 游戏响应。
   * 在内部应当：发请求 / 解析 SSE / 提取 final 帧 / 规范化为 DM JSON。
   */
  step(action: SutAction): Promise<SutResponse>;
  /**
   * 重置会话（用于跑下一局）。
   * mock 模式一般不需要；live 模式需要新 session id。
   */
  reset?(): Promise<void>;
  /**
   * 关闭连接 / 释放资源。
   */
  close?(): Promise<void>;
  /**
   * 标识：mock / live
   */
  readonly kind: "mock" | "http";
}

const DEGRADED_NARRATIVE_PATTERNS = [
  "网站暂时无法完成本次生成",
  "AI 服务暂时不可用",
  "暂时无法生成",
] as const;

const RETRYABLE_DEGRADED_PATTERNS = [
  "网站暂时无法完成本次生成",
  "AI 服务暂时不可用",
  "暂时无法生成",
  "服务暂不可用",
  "服务异常",
  "暂时拥塞",
] as const;

export function isDegradedSutResult(aiStatus: string | undefined, finalJson: Record<string, unknown>): boolean {
  if (aiStatus && aiStatus !== "ok" && aiStatus !== "ready") return true;
  const narrative = typeof finalJson["narrative"] === "string" ? finalJson["narrative"] : "";
  const internalMeta = finalJson["internal_meta"];
  if (internalMeta && typeof internalMeta === "object" && !Array.isArray(internalMeta)) {
    const action = (internalMeta as Record<string, unknown>)["action"];
    if (typeof action === "string" && /fallback|site_unavailable/i.test(action)) return true;
  }
  if (narrative.trim().length === 0) return true;
  return DEGRADED_NARRATIVE_PATTERNS.some((pattern) => narrative.includes(pattern));
}

export function isRetryableSutDegradation(
  aiStatus: string | undefined,
  response: SutResponse,
): boolean {
  if (response.error) {
    if (/(?:ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|timeout)/i.test(response.error)) {
      return true;
    }
    if (response.error.includes("429") || response.error.includes("503") || response.error.includes("502") || response.error.includes("504")) {
      return true;
    }
  }
  if (aiStatus === "keys_missing") return false;

  const narrative = typeof response.dmJson["narrative"] === "string" ? String(response.dmJson["narrative"]) : "";
  const internalMeta = response.dmJson["internal_meta"];
  const action = internalMeta && typeof internalMeta === "object" && !Array.isArray(internalMeta)
    ? String((internalMeta as Record<string, unknown>)["action"] ?? "")
    : "";
  if (/site_unavailable|fallback|internal_no_visible_fallback/i.test(action)) return true;

  return RETRYABLE_DEGRADED_PATTERNS.some((pattern) => narrative.includes(pattern));
}

// === Mock SUT（默认，离线 fuzz） ===

import { generateMockAction } from "./playerAgent";

// ─── 确定性 Mock DM 引擎 ───

interface DmMilestone {
  step: number;
  /** 这个 milestone 提供的 dmJson 字段（合并到最终输出） */
  dmJson: Record<string, unknown>;
}

interface LocationStep {
  step: number;
  location: string;
  floor: string;
}

/** 跨 persona 的位置推进 */
const LOCATION_PROGRESSION: LocationStep[] = [
  { step: 0, location: "旧公寓三楼走廊", floor: "3F" },
  { step: 3, location: "旧公寓楼梯间", floor: "3F" },
  { step: 6, location: "B1_配电间", floor: "B1" },
  { step: 10, location: "1F_Lobby", floor: "1F" },
  { step: 15, location: "旧公寓消防通道", floor: "1F" },
  { step: 20, location: "B2_地下室", floor: "B2" },
  { step: 30, location: "废墟广场", floor: "1F" },
  { step: 45, location: "暗月神殿外围", floor: "1F" },
  { step: 60, location: "神殿前厅", floor: "1F" },
  { step: 80, location: "暗月祭坛", floor: "B1" },
];

/** NPC 遭遇 */
const NPC_ENCOUNTERS: Array<{ step: number; npcId: string }> = [
  { step: 4, npcId: "npc-LiaoAn" },
  { step: 7, npcId: "npc-Lucy" },
  { step: 12, npcId: "npc-SuMi" },
  { step: 25, npcId: "npc-WangYuan" },
  { step: 35, npcId: "npc-HeiShi" },
  { step: 50, npcId: "npc-YouLing" },
];

/** 物品拾取（collector 高频触发，其他人低频） */
const ITEM_PICKUPS: Array<{ step: number; itemId: string }> = [
  { step: 3, itemId: "item_flashlight" },
  { step: 8, itemId: "item_medkit" },
  { step: 13, itemId: "item_rations" },
  { step: 18, itemId: "item_key_b1" },
  { step: 23, itemId: "item_map" },
  { step: 28, itemId: "item_ammo" },
  { step: 33, itemId: "item_herbs" },
  { step: 38, itemId: "item_battery" },
  { step: 48, itemId: "item_diary_fragment" },
  { step: 55, itemId: "item_artifact_shard" },
  { step: 63, itemId: "item_dark_crystal" },
  { step: 75, itemId: "item_ancient_key" },
];

/** 经济事件 */
const ECONOMY_EVENTS: Array<{ step: number; originiumDelta: number }> = [
  { step: 10, originiumDelta: 5 },
  { step: 20, originiumDelta: -2 },
  { step: 30, originiumDelta: 10 },
  { step: 45, originiumDelta: -5 },
  { step: 60, originiumDelta: 15 },
  { step: 85, originiumDelta: -8 },
];

/** 武器获得 */
const WEAPON_GAIN: Array<{ step: number; weapon: string }> = [
  { step: 10, weapon: "短刀" },
  { step: 25, weapon: "战术军刀" },
  { step: 50, weapon: "暗月短弓" },
];

/** 武器损耗事件 */
const WEAPON_WEAR: Array<{ step: number; stabilityDelta: number; contaminationDelta: number }> = [
  { step: 15, stabilityDelta: -15, contaminationDelta: 5 },
  { step: 28, stabilityDelta: -10, contaminationDelta: 3 },
  { step: 35, stabilityDelta: -25, contaminationDelta: 10 },
  { step: 55, stabilityDelta: -20, contaminationDelta: 8 },
  { step: 65, stabilityDelta: -30, contaminationDelta: 12 },
];

/** 任务里程碑（全局） */
const TASK_MILESTONES: DmMilestone[] = [
  { step: 5, dmJson: { new_tasks: [{ task_id: "task-find-supplies", title: "寻找补给", description: "在公寓内寻找可用的补给物资" }] } },
  { step: 8, dmJson: { task_updates: [{ task_id: "task-find-supplies", status: "active" }] } },
  { step: 16, dmJson: { task_updates: [{ task_id: "task-find-supplies", status: "completed" }] } },
  { step: 18, dmJson: { new_tasks: [{ task_id: "task-escape-building", title: "逃离公寓", description: "找到安全的出口离开这栋建筑" }] } },
  { step: 20, dmJson: { task_updates: [{ task_id: "task-escape-building", status: "active" }] } },
  { step: 40, dmJson: { task_updates: [{ task_id: "task-escape-building", status: "completed" }] } },
  { step: 45, dmJson: { new_tasks: [{ task_id: "task-defeat-darkmoon", title: "对抗暗月势力", description: "前往暗月神殿，阻止暗月势力" }] } },
  { step: 48, dmJson: { task_updates: [{ task_id: "task-defeat-darkmoon", status: "active" }] } },
  { step: 70, dmJson: { task_updates: [{ task_id: "task-defeat-darkmoon", status: "completed" }] } },
  { step: 80, dmJson: { new_tasks: [{ task_id: "task-final-stand", title: "最终决战", description: "在暗月祭坛面对最终威胁" }] } },
  { step: 82, dmJson: { task_updates: [{ task_id: "task-final-stand", status: "active" }] } },
];

/** 职业里程碑（step -> profession） */
const PROFESSION_MILESTONES: Array<{ step: number; profession: string }> = [
  { step: 8, profession: "守灯人" },
  { step: 35, profession: "猎影者" },
];

/** 战斗伤害事件 */
const COMBAT_DAMAGE: Array<{ step: number; hpDelta: number; narrative: string }> = [
  { step: 12, hpDelta: -3, narrative: "一只潜伏的畸变体突然从暗处扑向你，你勉强闪避，但手臂被划伤。" },
  { step: 22, hpDelta: -5, narrative: "配电间的门后冲出两个黑影！你被迫应战，身上多了几道伤口。" },
  { step: 37, hpDelta: -2, narrative: "废墟中传来诡异的声音，你感到一阵晕眩。" },
  { step: 55, hpDelta: -8, narrative: "暗月神殿的守卫发现了你！激烈的战斗后你终于击退了它们，但伤势不轻。" },
  { step: 72, hpDelta: -4, narrative: "深入神殿内部，暗月能量侵蚀着你的身体。" },
];

/** 治疗事件 */
const HEAL_EVENTS: Array<{ step: number; hpDelta: number; narrative: string }> = [
  { step: 14, hpDelta: 3, narrative: "你找到了一些急救物资，简单包扎了伤口。" },
  { step: 30, hpDelta: 5, narrative: "你找到一个相对安全的角落休息，恢复了体力。" },
  { step: 48, hpDelta: 4, narrative: "NPC Lucy 给了你一些药草，伤口开始愈合。" },
  { step: 68, hpDelta: 6, narrative: "你使用原石恢复了部分生命值。" },
];

/**
 * 合并所有 <= step 的 milestone，后面的覆盖前面。
 */
function mergeMilestones(milestones: DmMilestone[], step: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const m of milestones) {
    if (step >= m.step) {
      Object.assign(result, m.dmJson);
    }
  }
  return result;
}

/**
 * 构建渐进式 Mock DM 响应。
 *
 * 核心思想：不同 persona 共享同一套世界事件时间线，但按 persona 类型
 * 以不同概率/节奏触发。collector 多拾取，speedrunner 多推进，
 * explorer 广探索，confused 慢但仍有进展，rulebreaker 有非法尝试。
 */
function buildMockSutResponseV2(
  action: SutAction,
  state: GameStateSnapshot,
  internalStep: number
): SutResponse {
  const persona = action.persona;
  const step = internalStep;
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    consumes_time: true,
    is_death: false,
    reached_ending: false,
    options: ["继续前进", "后退观察", "检查细节", "呼叫同伴"],
  };

  // ── 1. 理智损伤（所有人都随时间增加） ──
  dm.sanity_damage = step > 5 ? (step > 40 ? 2 : 1) : 0;

  // ── 2. 位置推进（跨 persona 统一） ──
  let currentLoc: string | null = null;
  for (const lp of LOCATION_PROGRESSION) {
    if (step >= lp.step) currentLoc = lp.location;
  }
  if (currentLoc) dm.player_location = currentLoc;

  // ── 3. NPC 遭遇 ──
  const metNpcs: string[] = [];
  const encounteredNpcs: Array<{ entry_id: string }> = [];
  for (const enc of NPC_ENCOUNTERS) {
    if (step >= enc.step) {
      metNpcs.push(enc.npcId);
      encounteredNpcs.push({ entry_id: enc.npcId });
    }
  }
  // 根据 persona 决定 codex 更新频率
  const codexInterval = persona === "explorer" ? 2 : persona === "confused" ? 6 : 3;
  const codexNpcs = encounteredNpcs.filter((_, i) => i % codexInterval < 2);
  if (codexNpcs.length > 0) {
    dm.codex_updates = codexNpcs;
  }
  if (metNpcs.length > 0) {
    dm.aliveNpcIds = metNpcs;
  }

  // ── 4. 任务系统 ──
  Object.assign(dm, mergeMilestones(TASK_MILESTONES, step));

  // ── 5. 职业系统 ──
  for (const pm of PROFESSION_MILESTONES) {
    if (step >= pm.step) {
      dm.profession = pm.profession;
    }
  }

  // ── 6. 武器系统 ──
  let currentWeapon: string | null = null;
  for (const wg of WEAPON_GAIN) {
    if (step >= wg.step) currentWeapon = wg.weapon;
  }
  if (currentWeapon) {
    dm.equippedWeapon = currentWeapon;
    // 计算当前武器属性
    let stability = 100;
    let contamination = 0;
    for (const ww of WEAPON_WEAR) {
      if (step >= ww.step) {
        stability = Math.max(0, stability + ww.stabilityDelta);
        contamination = Math.min(100, Math.max(0, contamination + ww.contaminationDelta));
      }
    }
    // 新武器换上时重置
    for (const wg of WEAPON_GAIN) {
      if (step >= wg.step && step < wg.step + 3) {
        stability = 100;
        contamination = 0;
      }
    }
    dm.weapon_updates = { stability, contamination };
  }

  // ── 7. 物品系统（按 persona 调节频率） ──
  const pickupFrequency: Record<string, number> = {
    collector: 1,    // 每步都捡
    explorer: 3,     // 第 3 个才捡
    speedrunner: 4,
    rulebreaker: 5,
    confused: 6,
  };
  const freq = pickupFrequency[persona] ?? 3;
  const pickedItems: Array<{ item_id: string }> = [];
  for (const p of ITEM_PICKUPS) {
    if (step >= p.step && (p.step % freq === 0 || persona === "collector")) {
      pickedItems.push({ item_id: p.itemId });
    }
  }
  if (pickedItems.length > 0) {
    dm.awarded_items = pickedItems;
  }

  // ── 8. 经济系统 ──
  let totalOriginium = state.originium;
  for (const eco of ECONOMY_EVENTS) {
    if (step >= eco.step) {
      totalOriginium = Math.max(0, totalOriginium + eco.originiumDelta);
    }
  }
  // 只在有变化时输出
  if (totalOriginium !== state.originium) {
    dm.currency_change = { originium: totalOriginium - state.originium };
  }

  // ── 9. 战斗伤害（trigger 条件：有武器且 step 匹配） ──
  for (const cd of COMBAT_DAMAGE) {
    if (step === cd.step) {
      dm.hp = Math.max(0, state.hp + cd.hpDelta);
    }
  }

  // ── 10. 治疗（trigger 条件：step 匹配且没有同时战斗伤害） ──
  for (const he of HEAL_EVENTS) {
    if (step === he.step) {
      dm.hp = Math.min(state.maxHp, (dm.hp as number ?? state.hp) + he.hpDelta);
    }
  }

  // ── 11. Persona 特定行为 ──
  if (persona === "rulebreaker" && (step === 6 || step === 15 || step === 30)) {
    dm.is_action_legal = false;
    dm.sanity_damage = (dm.sanity_damage as number) + 3;
  }
  if (persona === "speedrunner" && step > 60 && step % 10 === 0) {
    dm.reached_ending = true;
  }
  if (persona === "explorer" && step > 3 && step % 5 === 0) {
    // explorer 多一组选项
    dm.options = ["继续前进", "后退观察", "检查细节", "呼叫同伴", "四处搜索", "与NPC交谈"];
  }

  // ── 12. 叙事文本 ──
  const narrative = getPersonaNarrative(persona, step);

  return {
    narrative,
    dmJson: dm,
    latencyMs: 0,
    status: "ok",
    reachedFinal: false,
  };
}

/**
 * Persona 感知的叙事生成。
 * 战斗/治疗事件有专属叙事；其余按 persona 风格。
 */
function getPersonaNarrative(persona: string, step: number): string {
  // 战斗叙事优先
  for (const cd of COMBAT_DAMAGE) {
    if (step === cd.step) return cd.narrative;
  }
  for (const he of HEAL_EVENTS) {
    if (step === he.step) return he.narrative;
  }

  const narratives: Record<string, string[]> = {
    speedrunner: [
      "你没有停留，径直朝走廊尽头走去。时间不等人。",
      "你推开那扇门，毫不犹豫。",
      "主线方向的直觉告诉你应该继续前进。",
      "你扫了一眼周围的环境，脚下步伐丝毫没有放慢。",
    ],
    explorer: [
      "你仔细查看房间的角落。墙上的裂缝很大，足以伸进一只手。",
      "你和NPC聊了几句。他说话时眼神一直在飘。",
      "你在旁边发现了一条隐蔽的小路。",
      "你蹲下身检查地面上的脚印。",
    ],
    rulebreaker: [
      "你尝试了一种不同寻常的方式。",
      "规则的存在就是为了被打破，你心里这样想。",
      "你试探性地挑战了一下系统的边界。",
      "你做了件出格的事，看对方怎么反应。",
    ],
    confused: [
      "你站在原地，不太确定该往哪个方向走。",
      "你嘟囔了一句含糊不清的话。NPC疑惑地看着你。",
      "你挠了挠头——好像明白了，又好像没有。",
      "你漫无目的地走了几步。",
    ],
    collector: [
      "这个看起来有用——你立刻收起来。",
      "你扫视地面，确认没有漏掉任何东西。",
      "你把找到的物品小心翼翼地包好。",
      "你的包里又多了几样东西，心里踏实了些。",
    ],
  };

  const personaNarratives = narratives[persona] ?? narratives.confused!;
  return personaNarratives[step % personaNarratives.length] ?? "事情在发展。";
}

/**
 * 有状态的 Mock SUT Adapter。
 *
 * 在 orchestrator 维护的 currentState 之外，MockSutAdapter 也维护
 * 自己的内部状态，确保 buildMockSutResponseV2 能看到前一步的结果，
 * 从而做出连贯的进度决策。
 */
export class MockSutAdapter implements SutAdapter {
  readonly kind = "mock" as const;
  /** 内部步数（用于确定性） */
  private internalStep = 0;
  /** 持久化的游戏状态（mock 内部的，独立于 orchestrator 的 state） */
  private mockState: GameStateSnapshot;

  constructor(initialState?: Partial<GameStateSnapshot>) {
    this.mockState = createInitialStateSnapshot(initialState);
  }

  async step(action: SutAction): Promise<SutResponse> {
    const response = buildMockSutResponseV2(action, this.mockState, this.internalStep);
    // 用共享的 apply 更新内部状态，与 orchestrator 保持一致
    this.mockState = applyDmJsonToState(this.mockState, response.dmJson, response.narrative);
    this.internalStep++;
    return response;
  }

  async reset(): Promise<void> {
    this.internalStep = 0;
    this.mockState = createInitialStateSnapshot();
  }
}

// === HTTP SUT（live 模式，调用真实 /api/chat） ===

export interface HttpSutAdapterOptions {
  baseUrl: string;
  /** SSE 帧超时（默认 25s） */
  frameTimeoutMs?: number;
  /** 玩家 session id（每个 playthrough 一个） */
  sessionId?: string;
  /** 起始角色信息（可选） */
  initialCharacter?: {
    profession?: string | null;
    equippedWeapon?: string | null;
  };
}

/**
 * Live 模式：调用 /api/chat SSE。
 *
 * 注意：使用 ReadableStream 解析 SSE — 复用 src/features/play/stream/sseFrame.ts 的帧格式：
 *   - 控制帧: __VERSECRAFT_STATUS__:{...}
 *   - 终帧: __VERSECRAFT_FINAL__:<json>
 */
export class HttpSutAdapter implements SutAdapter {
  readonly kind = "http" as const;
  private readonly baseUrl: string;
  private readonly frameTimeoutMs: number;
  private sessionId: string;
  private readonly initialCharacter: HttpSutAdapterOptions["initialCharacter"];
  private readonly history: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor(opts: HttpSutAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.frameTimeoutMs = opts.frameTimeoutMs ?? 25000;
    this.sessionId = opts.sessionId ?? `playthrough-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.initialCharacter = opts.initialCharacter;
  }

  async step(action: SutAction): Promise<SutResponse> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.frameTimeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          messages: [...this.history, { role: "user", content: action.playerAction }],
          latestUserInput: action.playerAction,
          playerContext: action.playerContext,
          clientState: action.clientState,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          narrative: "",
          dmJson: {},
          latencyMs: Date.now() - startTime,
          status: "error",
          reachedFinal: false,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const reader = res.body?.getReader();
      if (!reader) {
        return {
          narrative: "",
          dmJson: {},
          latencyMs: Date.now() - startTime,
          status: "error",
          reachedFinal: false,
          error: "No readable body",
        };
      }

      const sseDecoder = new IncrementalVerseCraftSseDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseDecoder.push(value);
      }

      const decoded = sseDecoder.finish();
      const { aiStatus, finalJson } = decoded;

      if (!finalJson) {
        return {
          narrative: "",
          dmJson: {},
          latencyMs: Date.now() - startTime,
          status: aiStatus === "keys_missing" ? "degraded" : "error",
          reachedFinal: false,
          aiStatus,
          error: "未收到 __VERSECRAFT_FINAL__ 帧",
        };
      }

      const degraded = isDegradedSutResult(aiStatus, finalJson);
      const narrative = typeof finalJson["narrative"] === "string" ? finalJson["narrative"] as string : "";
      if (!degraded) {
        this.history.push({ role: "user", content: action.playerAction }, { role: "assistant", content: narrative });
      }
      return {
        narrative,
        dmJson: finalJson,
        latencyMs: Date.now() - startTime,
        status: degraded ? "degraded" : "ok",
        reachedFinal: true,
        aiStatus,
      };
    } catch (err) {
      return {
        narrative: "",
        dmJson: {},
        latencyMs: Date.now() - startTime,
        status: "error",
        reachedFinal: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    // fetch 不需要显式 close
  }

  async reset(): Promise<void> {
    this.history.splice(0, this.history.length);
    this.sessionId = `playthrough-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// === 工厂：按 config 选 mock / http ===

export function createSutAdapter(opts: {
  mock: boolean;
  baseUrl?: string;
  frameTimeoutMs?: number;
  sessionId?: string;
  initialCharacter?: HttpSutAdapterOptions["initialCharacter"];
}): SutAdapter {
  if (opts.mock) {
    return new MockSutAdapter();
  }
  if (!opts.baseUrl) {
    throw new Error("Live mode requires baseUrl");
  }
  return new HttpSutAdapter({
    baseUrl: opts.baseUrl,
    frameTimeoutMs: opts.frameTimeoutMs,
    sessionId: opts.sessionId,
    initialCharacter: opts.initialCharacter,
  });
}

/**
 * 安全导出内部函数以便测试使用
 * @internal
 */
export const _internal = {
  generateMockAction,
  buildMockSutResponseV2,
};
