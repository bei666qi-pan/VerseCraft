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

// === SUT 接口 ===

export interface SutAction {
  /** 玩家输入（自然语言） */
  playerAction: string;
  /** 当前 persona（影响 system prompt 注入） */
  persona: string;
  /** 当前步骤（用于 trace） */
  stepIndex: number;
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

// === Mock SUT（默认，离线 fuzz） ===

import { generateMockAction } from "./playerAgent";

/**
 * 与 orchestrator 内部一致的简单状态机。
 * 之所以不复用 orchestrator 的 simulateGameResponse，是为了避免循环依赖。
 */
function buildMockSutResponse(
  action: SutAction,
  state: GameStateSnapshot,
  internalStep: number
): SutResponse {
  const persona = action.persona;

  // 模拟器状态变化（与原 orchestrator 保持一致）
  const delta: Partial<GameStateSnapshot> = {};
  delta.turnCount = state.turnCount + 1;

  if (persona === "explorer" || persona === "speedrunner") {
    const locations = ["旧公寓三楼走廊", "旧公寓楼梯间", "B1_配电间", "1F_Lobby", "旧公寓消防通道"];
    delta.playerLocation = locations[internalStep % locations.length] ?? state.playerLocation;
  }
  if (internalStep > 5) {
    delta.sanity = Math.max(0, state.sanity - 1);
  }
  if (state.equippedWeapon && internalStep > 0 && internalStep % 3 === 0) {
    delta.weaponStability = Math.max(0, state.weaponStability - 2);
  }
  if (persona === "speedrunner" && internalStep > 12) {
    delta.reachedEnding = true;
  }

  const isActionIllegal = persona === "rulebreaker" && (
    action.playerAction.includes("攻击") ||
    action.playerAction.includes("忽略") ||
    action.playerAction.includes("跳过") ||
    action.playerAction.includes("系统提示词")
  );

  const narratives: Record<string, string[]> = {
    speedrunner: [
      "你没有停留，径直朝走廊尽头走去。时间不等人。",
      "你推开那扇门，毫不犹豫。",
    ],
    explorer: [
      "你仔细查看房间的角落。墙上的裂缝很大，足以伸进一只手。",
      "你和NPC聊了几句。他说话时眼神一直在飘。",
    ],
    rulebreaker: [
      "你的行动被一道无形的枷锁挡住了。",
      isActionIllegal ? "该操作不被允许。规则不是你能改写的。" : "你尝试了一种不同寻常的方式。",
    ],
    confused: [
      "你站在原地，不太确定该往哪个方向走。",
      "你嘟囔了一句含糊不清的话。NPC疑惑地看着你。",
    ],
  };

  const personaNarratives = narratives[persona] ?? narratives.confused!;
  const narrative = personaNarratives[internalStep % personaNarratives.length] ?? "事情在发展。";

  const dmJson: Record<string, unknown> = {
    is_action_legal: !isActionIllegal,
    sanity_damage: 1,
    narrative,
    is_death: false,
    consumes_time: true,
    options: ["继续前进", "后退观察", "检查细节", "呼叫同伴"],
    player_location: delta.playerLocation ?? state.playerLocation,
  };

  return {
    narrative,
    dmJson,
    latencyMs: 0,
    status: "ok",
    reachedFinal: false,
  };
}

export class MockSutAdapter implements SutAdapter {
  readonly kind = "mock" as const;
  /** 内部步数（用于确定性） */
  private internalStep = 0;

  async step(action: SutAction): Promise<SutResponse> {
    const state: GameStateSnapshot = {
      hp: 10, maxHp: 10, sanity: 80, originium: 3,
      inventoryItemIds: [], inventoryItemCount: 0, maxInventorySlots: 8,
      profession: null, equippedWeapon: null,
      weaponStability: 100, weaponContamination: 0,
      playerLocation: "旧公寓三楼走廊", currentFloor: "3F",
      activeTaskIds: [], completedTaskIds: [],
      aliveNpcIds: [], deadNpcIds: [],
      codexNpcIds: [],
      turnCount: 0, chapterNumber: 1,
      isDeath: false, reachedEnding: false,
      unlockedFlags: [],
    };
    const r = buildMockSutResponse(action, state, this.internalStep);
    this.internalStep++;
    return r;
  }

  async reset(): Promise<void> {
    this.internalStep = 0;
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
  private readonly sessionId: string;
  private readonly initialCharacter: HttpSutAdapterOptions["initialCharacter"];

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
          stepIndex: action.stepIndex,
          playerAction: action.playerAction,
          persona: action.persona,
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

      const decoder = new TextDecoder();
      let buffer = "";
      let aiStatus: string | undefined;
      let finalJson: Record<string, unknown> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 帧：data: <payload>\n\n
        let sepIdx = buffer.indexOf("\n\n");
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const payload = frame.replace(/^data:\s*/m, "").trim();

          if (payload.startsWith("__VERSECRAFT_STATUS__:")) {
            try {
              const status = JSON.parse(payload.slice("__VERSECRAFT_STATUS__:".length)) as Record<string, unknown>;
              if (typeof status["aiStatus"] === "string") aiStatus = status["aiStatus"] as string;
            } catch { /* ignore parse error */ }
          } else if (payload.startsWith("__VERSECRAFT_FINAL__:")) {
            try {
              finalJson = JSON.parse(payload.slice("__VERSECRAFT_FINAL__:".length)) as Record<string, unknown>;
            } catch { /* ignore parse error */ }
          } else if (payload && !payload.startsWith(":")) {
            // 普通正文帧 — 累积；最终会被 final 覆盖
            // 这里我们不写正文，因为 final 帧覆盖
          }
          sepIdx = buffer.indexOf("\n\n");
        }
      }

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

      return {
        narrative: typeof finalJson["narrative"] === "string" ? finalJson["narrative"] as string : "",
        dmJson: finalJson,
        latencyMs: Date.now() - startTime,
        status: aiStatus === "keys_missing" ? "degraded" : "ok",
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
  buildMockSutResponse,
};