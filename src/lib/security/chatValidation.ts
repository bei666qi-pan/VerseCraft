import { sanitizeInputText } from "@/lib/security/helpers";

export type IncomingMessage = {
  role: "system" | "user" | "assistant" | string;
  content: string;
  reasoning_content?: unknown;
};

/**
 * 客户端结构化上下文（V1）
 *
 * 目标：让关键裁决输入不再主要依赖 `playerContext` 文本反解析。
 * 注意：这不是“完美服务端权威”，但能显著降低：
 * - 通过篡改 prompt 文本伪造原石/背包/武器栏/职业/折扣资格的作弊面
 * - 解析脆弱性（正则误匹配/语言变体/模型输出插入等）
 */
export type ClientStructuredContextV1 = {
  v: 1;
  /** 客户端当前回合序号（用于基本一致性检查/审计） */
  turnIndex: number;
  /** 基础位置/时间（服务可用性与 guard 分支所需） */
  playerLocation: string;
  time?: { day: number; hour: number };
  /** 玩家关键属性（用于武器化门槛、职业证据等裁决；仍会被服务端 clamp 与白名单过滤） */
  stats?: {
    sanity: number;
    agility: number;
    luck: number;
    charm: number;
    background: number;
  };
  /** 关键资源 */
  originium: number;
  /** 行囊/仓库：只传 ID 列表，服务端按 registry 校验存在性 */
  inventoryItemIds: string[];
  warehouseItemIds: string[];
  /** 武器槽与武器背包：允许传 full weapon（用于 WZ-*）但必须是对象数组且受限 */
  equippedWeapon: Record<string, unknown> | null;
  weaponBag: Array<Record<string, unknown>>;
  /** 职业：只传当前职业（单职业制），避免大对象注入 */
  currentProfession: string | null;
  /** 世界标记/服务解锁：从 snapshot worldFlags 提取的 key 列表（用于折扣/服务可用性） */
  worldFlags: string[];
  /** 在场 NPC：客户端可提供，服务端仍会以自身链路更新为准（暂时降权，不作为唯一真相） */
  presentNpcIds?: string[];
};

export type ChatValidationResult =
  | {
      ok: true;
      messages: IncomingMessage[];
      playerContext: string;
      latestUserInput: string;
      sessionId: string | null;
      clientState: ClientStructuredContextV1 | null;
    }
  | { ok: false; status: number; error: string };

const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 4000;
const MAX_PLAYER_CONTEXT_CHARS = 6000;
const MAX_CLIENT_STATE_JSON_CHARS = 10_000;

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function asStringArray(v: unknown, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (out.length >= maxLen) break;
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    out.push(s);
  }
  return out;
}

function asPlainObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function validateClientState(raw: unknown): ClientStructuredContextV1 | null {
  const obj = asPlainObject(raw);
  if (!obj) return null;
  // Guard size early (avoid giant payload abuse)
  try {
    const s = JSON.stringify(obj);
    if (s.length > MAX_CLIENT_STATE_JSON_CHARS) return null;
  } catch {
    return null;
  }

  const v = clampInt(obj.v, 1, 1);
  if (v !== 1) return null;

  const turnIndex = clampInt(obj.turnIndex, 0, 99999);
  const playerLocation = sanitizeInputText(String(obj.playerLocation ?? ""), 80);
  if (!playerLocation) return null;

  const timeObj = asPlainObject(obj.time);
  const time =
    timeObj
      ? { day: clampInt(timeObj.day, 0, 99), hour: clampInt(timeObj.hour, 0, 23) }
      : undefined;

  const statsObj = asPlainObject(obj.stats);
  const stats = statsObj
    ? {
        sanity: clampInt(statsObj.sanity, 0, 99),
        agility: clampInt(statsObj.agility, 0, 99),
        luck: clampInt(statsObj.luck, 0, 99),
        charm: clampInt(statsObj.charm, 0, 99),
        background: clampInt(statsObj.background, 0, 99),
      }
    : undefined;

  const originium = clampInt(obj.originium, 0, 999999);

  const inventoryItemIds = asStringArray(obj.inventoryItemIds, 96);
  const warehouseItemIds = asStringArray(obj.warehouseItemIds, 96);

  const equippedWeaponRaw = obj.equippedWeapon;
  const equippedWeapon =
    equippedWeaponRaw === null ? null : (asPlainObject(equippedWeaponRaw) ?? null);
  const weaponBagRaw = Array.isArray(obj.weaponBag) ? obj.weaponBag : [];
  const weaponBag = weaponBagRaw
    .filter((x) => asPlainObject(x))
    .slice(0, 24) as Array<Record<string, unknown>>;

  const currentProfessionText = sanitizeInputText(String(obj.currentProfession ?? ""), 16);
  const currentProfession = currentProfessionText && currentProfessionText !== "无" ? currentProfessionText : null;

  const worldFlags = asStringArray(obj.worldFlags, 128);

  const presentNpcIds = obj.presentNpcIds ? asStringArray(obj.presentNpcIds, 32) : undefined;

  return {
    v: 1,
    turnIndex,
    playerLocation,
    ...(time ? { time } : {}),
    ...(stats ? { stats } : {}),
    originium,
    inventoryItemIds,
    warehouseItemIds,
    equippedWeapon,
    weaponBag,
    currentProfession,
    worldFlags,
    ...(presentNpcIds ? { presentNpcIds } : {}),
  };
}

export function validateChatRequest(body: unknown): ChatValidationResult {
  const bodyObj = (body ?? {}) as Record<string, unknown>;
  const rawMessages = bodyObj.messages;
  const rawPlayerContext = bodyObj.playerContext;
  const rawSessionId = bodyObj.sessionId;
  const rawClientState = bodyObj.clientState;

  if (!Array.isArray(rawMessages)) {
    return { ok: false, status: 400, error: "messages must be an array" };
  }
  if (rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: "messages size is invalid" };
  }

  const sanitizedMessages: IncomingMessage[] = [];
  for (const item of rawMessages) {
    const role = String(item?.role ?? "").trim();
    const content = sanitizeInputText(String(item?.content ?? ""), MAX_MESSAGE_CHARS);
    if (!role || !content) {
      return { ok: false, status: 400, error: "invalid message item" };
    }
    if (!["system", "user", "assistant"].includes(role)) {
      return { ok: false, status: 400, error: "invalid message role" };
    }
    sanitizedMessages.push({ role, content });
  }

  const playerContext = sanitizeInputText(String(rawPlayerContext ?? ""), MAX_PLAYER_CONTEXT_CHARS);
  const latestUserInput =
    sanitizedMessages
      .slice()
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";

  const sessionIdCandidate = sanitizeInputText(String(rawSessionId ?? ""), 120);
  const sessionId = sessionIdCandidate || null;

  const clientState = validateClientState(rawClientState);

  return {
    ok: true,
    messages: sanitizedMessages,
    playerContext,
    latestUserInput,
    sessionId,
    clientState,
  };
}
