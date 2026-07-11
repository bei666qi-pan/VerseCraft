/**
 * Phase-2.3: 回合节奏账本写入模块。
 *
 * 提供 fire-and-forget 写入 narrative_pacing_ledger 表。
 * 必须 fail-open：表缺失或 DB 不可用时不能影响主线回合。
 *
 * 写入模式仿照 scheduleBackgroundWorldTick（Promise 异步 + catch 吞错）。
 *
 * @module pacingLedger
 */

import { narrativePacingLedger } from "@/db/schema";
import { classifyNarrativeRegister } from "@/lib/narrativeStyle/registerClassifier";

// ============================================================
// 钩子分类（与 styleValidator.ts classifyHookType 保持同步）
// ============================================================

export type HookType = "question" | "threat" | "dilemma" | "bond" | "reveal" | "none";

/**
 * 对叙事文本进行钩子分类（基于正则匹配尾部两句话）。
 * 与 styleValidator 中的 classifyHookType 逻辑一致。
 */
export function classifyNarrativeHookType(narrative: string): HookType {
  if (!narrative || typeof narrative !== "string") return "none";

  // 简单分句
  const sentences = narrative
    .replace(/[“”"『』「」]/g, "")
    .split(/(?<=[。！？!?；;…])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return "none";
  const tail = sentences.slice(-2).join("");
  const tailShort = sentences.slice(-1).join("");

  if (/[？?]/.test(tailShort) && /(谁|什么|怎么|为什么|哪|吗|呢|会不会|是不是|有没有)/.test(tailShort)) return "question";
  if (/[？?]/.test(tailShort) && /(倒计时|只剩|只有|最后|尽头|秒|小时|分钟|天)/.test(tailShort)) return "threat";
  if (/(刮擦|脚步|逼近|靠近|门后|黑影|黑暗|灯灭了|危险|退路|追|逃)/.test(tailShort)) return "threat";
  if (/(还是|选择|代价|报酬|名字|换|放弃|保留)/.test(tail) && /[？?]/.test(tail)) return "dilemma";
  if (/(必须|决定|面对|门槛|站在|岔路|两难)/.test(tail) && /(还是|或)/.test(tail)) return "dilemma";
  if (/(伞|塞|掌心|暖|温|笑|扶|拉|牵|抱|护|信|等)/.test(tail)) return "bond";
  if (/(名字|签名|登记|印|写|缺口|裂缝|另一半)/.test(tail)) return "reveal";
  if (/(真相|线头|串成|连成|回收|兑现|早就|原来|真相|钥匙|拼合)/.test(tail)) return "reveal";
  return "none";
}

// ============================================================
// 意象库 —— 与 styleBible.ts DEFAULT_PROFILE.imagery_bank 保持同步
// ============================================================

const IMAGERY_ITEMS: Record<string, string[]> = {
  B1: ["锅炉管道", "配电箱", "昏暗值班室", "工具墙", "安全告示", "水泥地裂缝"],
  "1F": ["大堂登记台", "转椅", "保安室窗户", "信箱", "公告栏", "天花板日光灯"],
  "3F": ["楼梯间", "黑毽子", "住户门牌", "旧地毯", "消防栓", "墙皮剥落"],
  "7F": ["窗台", "天台铁门", "晾衣绳", "夕阳余晖", "老式挂钟", "盆栽枯叶"],
  夜晚: ["路灯投影", "手机屏幕微光", "门缝漏光", "远处车灯", "暖气片响声"],
  通用: ["校服袖口", "粉笔灰", "走廊灯管", "下课铃", "没寄出的信", "铁门凉意"],
};

// ============================================================
// 提取函数（纯函数，可测试）
// ============================================================

/**
 * 从叙事文本中提取意象键。
 * 逐意象组检测，每组有一项匹配即认为该组命中。
 */
export function extractImageryKeys(narrative: string): string[] {
  if (!narrative || typeof narrative !== "string") return [];

  const found: string[] = [];
  for (const [key, items] of Object.entries(IMAGERY_ITEMS)) {
    for (const item of items) {
      if (narrative.includes(item)) {
        found.push(key);
        break;
      }
    }
  }
  return found;
}

// ============================================================
// 数据形状
// ============================================================

export type PacingLedgerInsertParams = {
  sessionId: string;
  /** 登录用户 ID 或 null（游客）。 */
  userId: string | null | undefined;
  turnIndex: number;
  narrative: string;
  /** Pacing 验证后的 beat 状态（如 "rising"、"peak"）。可为 null。 */
  beatState: string | null | undefined;
};

// ============================================================
// 火写入口（fire-and-forget）
// ============================================================

/**
 * 异步写叙事节奏账本，fire-and-forget。
 *
 * - 调用 classifyNarrativeRegister 实时分类
 * - 提取意象键
 * - catch 吞所有错误（fail-open）
 *
 * 调用方不得 await。
 */
export function insertPacingLedgerRow(params: PacingLedgerInsertParams): void {
  void (async () => {
    try {
      const narrative = params.narrative;
      const { register } = classifyNarrativeRegister(narrative);
      const imageryKeys = extractImageryKeys(narrative);
      const isPayoff = register === "payoff";
      const beat = params.beatState ?? null;
      const hookType = classifyNarrativeHookType(narrative);

      // 懒导入 db 避免在测试环境下触发 server-only guard
      const { db } = await import("@/db");
      await db.insert(narrativePacingLedger).values({
        sessionId: params.sessionId,
        userId: params.userId ?? null,
        turnIndex: params.turnIndex,
        register,
        beat,
        hookType,
        imageryKeys,
        isPayoff,
      });
    } catch {
      // fail-open：表可能尚未 db:push，优雅降级
    }
  })();
}
