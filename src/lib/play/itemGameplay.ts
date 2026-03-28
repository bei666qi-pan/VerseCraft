// src/lib/play/itemGameplay.ts
// 阶段 4：物品可玩性锚点（叙事主导、选项注入、使用意图），与注册表/domainLayer 回接。

import type { ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import type { Item, ItemDomainLayer, WarehouseItem } from "@/lib/registry/types";

/** 从注册表字段推断玩法层（无 domainLayer 时的回退）。 */
export function inferItemDomainLayer(item: Item): ItemDomainLayer {
  if (item.domainLayer) return item.domainLayer;
  const tags = String(item.tags ?? "").toLowerCase();
  const et = item.effectType;
  if (et === "intel" || tags.includes("truth") || tags.includes("evidence")) return "evidence";
  if (et === "key" || et === "access") return "key";
  if (et === "consumable") return "consumable";
  if (et === "disguise" || et === "amnesty" || et === "tempFavor" || tags.includes("gift")) {
    return "social_token";
  }
  if (
    et === "shield" ||
    et === "ruleKill" ||
    et === "purify" ||
    et === "binding" ||
    et === "bait" ||
    et === "trigger" ||
    et === "transform"
  ) {
    return "tool";
  }
  return "material";
}

const LAYER_LABEL: Record<ItemDomainLayer, string> = {
  evidence: "证据",
  key: "门禁",
  consumable: "消耗",
  tool: "工具",
  social_token: "社交",
  material: "物资",
};

/** 阶段 5：物品外显短标签（玩法层 + 可选「关键物」） */
export function getItemUiRoleTags(item: Item): string[] {
  const out: string[] = [];
  const tagStr = String(item.tags ?? "");
  if (item.tier === "S" || item.ruleKill === true || /(^|,)(meta|truth)(,|$)/i.test(tagStr)) {
    out.push("关键物");
  }
  const layer = inferItemDomainLayer(item);
  const layerLabel: Record<ItemDomainLayer, string> = {
    evidence: "证据",
    tool: "工具",
    consumable: "消耗",
    social_token: "交换物",
    key: "门禁",
    material: "材料",
  };
  out.push(layerLabel[layer]);
  return [...new Set(out)];
}

/** UI 与提示用：单件道具的玩法要点（非数值）。 */
export function getItemGameplayUiHints(item: Item): string[] {
  const layer = inferItemDomainLayer(item);
  const lines: string[] = [];
  lines.push(`玩法层：${LAYER_LABEL[layer]}`);

  switch (layer) {
    case "evidence":
      lines.push("可出示质问、印证或反驳说法；可能解锁真相分支或改写任务推进。");
      lines.push("风险：伪证、激怒对象或证据被没收时，可能关闭某条叙事支路。");
      break;
    case "key":
      lines.push("可替代硬闯，打开区域或隐蔽路线；常与时间/次数消耗绑定。");
      lines.push("错过窗口时，路线可能被封锁或由他人先占。");
      break;
    case "consumable":
      lines.push("权衡：现在恢复/保命，或留到更高压场景；无脑使用可能错失关键回合。");
      lines.push("失败：属性不足时可能浪费效果或仅得部分收益。");
      break;
    case "tool":
      lines.push("改变场景交互：引开威胁、束缚、净化、触发隐藏观察窗等。");
      lines.push("被替代：若叙事侧已用别法解决同一危险，道具价值可能下降。");
      break;
    case "social_token":
      lines.push("贿赂、安抚、换情报或抬信任；可完成委托前置或软化对抗。");
      lines.push("反噬：选错对象或时机可能降信任、引来监视。");
      break;
    default:
      lines.push("可作交付物、交换物或锻造材料；具体后果由当幕叙事裁定。");
  }

  if (item.effectSummary?.trim()) {
    lines.push(`效果摘要：${item.effectSummary.trim()}`);
  }
  return lines;
}

export type ItemGameplayPromptContext = {
  inventoryItems: Item[];
  warehouseItems: WarehouseItem[];
  playerLocation: string;
  nowHour: number;
  presentNpcIds: string[];
  /** 主威胁摘要：floorId[phase] */
  threatChunks?: string[];
  lowSanityThreshold?: number;
};

function clampChars(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (max <= 0) return "";
  return t.length <= max ? t : t.slice(0, max);
}

/** 拼入 DM 长上下文：锚定「物品能做什么」而非堆数值。 */
export function buildItemGameplayPromptBlock(ctx: ItemGameplayPromptContext, maxChars = 900): string {
  const low = ctx.lowSanityThreshold ?? 38;
  const inv = ctx.inventoryItems ?? [];
  const wh = ctx.warehouseItems ?? [];
  if (inv.length === 0 && wh.length === 0) return "";

  const parts: string[] = [];
  parts.push(
    `【物品玩法锚点】位置[${ctx.playerLocation}]；在场NPC数[${ctx.presentNpcIds.length}]；游戏时[${ctx.nowHour}h]。`
  );

  const invLines = inv.slice(0, 14).map((it) => {
    const layer = inferItemDomainLayer(it);
    const tail =
      layer === "evidence"
        ? "可质证/解锁分支"
        : layer === "key"
          ? "可开锁/替代硬闯"
          : layer === "consumable"
            ? "一次性·需权衡时机"
            : layer === "social_token"
              ? "贿赂安抚换情报"
              : layer === "tool"
                ? "改场景交互"
                : "交付/锻造材料";
    return `${it.id}|${it.name}|${LAYER_LABEL[layer]}：${tail}`;
  });
  if (invLines.length) parts.push(`行囊：${invLines.join("；")}。`);

  if (wh.length > 0) {
    const whLines = wh.slice(0, 6).map((w) => `${w.id}|${w.name}|仓库物资·可交易/应急`);
    parts.push(`仓库：${whLines.join("；")}。`);
  }

  if (ctx.threatChunks?.length) {
    parts.push(`威胁上下文：${ctx.threatChunks.slice(0, 4).join("，")}。`);
  }

  parts.push(
    "裁定要求：玩家使用/出示/交付物品时，应用 consumed_items、clue_updates、task_updates、relationship_updates 中至少一类写回；避免「用了等于没写」。"
  );

  const text = parts.join("");
  return clampChars(text, maxChars);
}

/** 玩家点击「消耗灵感」发送的结构化锚定句，减轻模型空转。 */
export function buildItemUseStructuredIntent(item: Item): string {
  const layer = inferItemDomainLayer(item);
  const guide =
    layer === "evidence"
      ? "请处理：出示/质证/印证或反驳，并决定是否消耗该物"
      : layer === "key"
        ? "请处理：开锁、潜入或豁免检定，并决定是否消耗次数"
        : layer === "consumable"
          ? "请处理：立即收益与后续风险的权衡，并决定是否移除道具"
          : layer === "social_token"
            ? "请处理：贿赂、安抚或许诺，并写回关系/委托进度"
            : layer === "tool"
              ? "请处理：场景交互后果（引开、束缚、净化等）"
              : "请处理：交付、交换或材料消耗";

  return (
    `【物品行动·系统锚定】物品[${item.id}|${item.name}|层=${LAYER_LABEL[layer]}]。` +
    `${guide}。` +
    `本回合须给出清晰叙事后果，并用 consumed_items / clue_updates / task_updates / relationship_updates / new_tasks 之一反映状态；禁止仅口头无事发生。`
  );
}

// —— 选项注入（服务端）：须 ≤ resolveDmTurn 的 maxOptionChars（默认 40）——

const INJECT: Array<{
  prefix: string;
  text: string;
  needNpc: boolean;
  /** 当存在该层物品时允许 */
  layer: ItemDomainLayer | "any";
  /** 仅当理智低于阈值时注入（用于消耗权衡）；undefined 表示不检查 */
  sanityBelow?: number;
}> = [
  { prefix: "【证】", text: "【证】出示物品质问在场者导向真相", needNpc: true, layer: "evidence" },
  { prefix: "【社】", text: "【社】用礼物或许诺换情报与信任", needNpc: true, layer: "social_token" },
  {
    prefix: "【衡】",
    text: "【衡】斟酌是否立刻用掉一次性补给",
    needNpc: false,
    layer: "consumable",
    sanityBelow: 40,
  },
  { prefix: "【门】", text: "【门】用钥匙或通行物尝试开新路", needNpc: false, layer: "key" },
  { prefix: "【具】", text: "【具】用工具争取窗口或处理威胁", needNpc: false, layer: "tool" },
];

export type ClientStateItemSlice = {
  inventoryItemIds?: string[];
  warehouseItemIds?: string[];
  presentNpcIds?: string[];
  stats?: { sanity?: number };
};

function parseClientStateSlice(raw: unknown): ClientStateItemSlice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const ids = (x: unknown) =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  return {
    inventoryItemIds: ids(o.inventoryItemIds),
    warehouseItemIds: ids(o.warehouseItemIds),
    presentNpcIds: ids(o.presentNpcIds),
    stats:
      o.stats && typeof o.stats === "object" && !Array.isArray(o.stats)
        ? (o.stats as { sanity?: number })
        : undefined,
  };
}

function collectLayersFromIds(ids: string[]): Set<ItemDomainLayer> {
  const set = new Set<ItemDomainLayer>();
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const it = findRegisteredItemById(id);
    if (it) set.add(inferItemDomainLayer(it));
  }
  return set;
}

function optionHasPrefix(options: string[], prefix: string): boolean {
  return options.some((o) => typeof o === "string" && o.includes(prefix));
}

export function shouldSkipItemOptionInjection(args: {
  resolved: ResolvedDmTurn;
  clientPurpose?: string | null;
}): boolean {
  if (args.resolved.is_death) return true;
  if (!args.resolved.is_action_legal) return true;
  if (args.clientPurpose === "options_regen_only") return true;
  const m = args.resolved.security_meta;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    if (String((m as Record<string, unknown>).settlement_guard ?? "") === "stage2_freeze_on_illegal_or_death") {
      return true;
    }
  }
  return false;
}

/**
 * 在服务端最终 options 上补足「物品驱动」短选项（最多 4 条、每条截断到 maxOptionChars）。
 * 仅在仍有空位且不与现有选项前缀重复时注入。
 */
export function applyItemGameplayOptionInjection(
  resolved: ResolvedDmTurn,
  clientState: unknown,
  maxOptions = 4,
  maxOptionChars = 40
): ResolvedDmTurn {
  const opts = Array.isArray(resolved.options) ? [...resolved.options] : [];
  const slots = maxOptions - opts.length;
  if (slots <= 0) return resolved;

  const slice = parseClientStateSlice(clientState);
  const allIds = [...(slice.inventoryItemIds ?? []), ...(slice.warehouseItemIds ?? [])];
  const layers = collectLayersFromIds(allIds);
  const npcOk = (slice.presentNpcIds ?? []).length > 0;
  const sanity = Number(slice.stats?.sanity ?? 100);

  const usedPrefixes = new Set<string>();
  for (const row of INJECT) {
    if (opts.length >= maxOptions) break;
    if (row.needNpc && !npcOk) continue;
    if (row.layer !== "any" && !layers.has(row.layer)) continue;
    if (row.sanityBelow !== undefined && !(sanity < row.sanityBelow)) continue;
    if (optionHasPrefix(opts, row.prefix)) continue;
    if (usedPrefixes.has(row.prefix)) continue;
    const line = clampChars(row.text, maxOptionChars);
    if (!line) continue;
    opts.push(line);
    usedPrefixes.add(row.prefix);
  }

  if (opts.length === resolved.options.length) return resolved;
  return { ...resolved, options: opts };
}
