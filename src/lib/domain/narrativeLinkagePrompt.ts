// 阶段 6：把「目标↔物证↔手记升格」咬进 DM 长上下文（纯字符串）

import type { ClueEntry } from "./narrativeDomain";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * 供 getPromptContext：列出进行中/可接目标的物证门槛与手记升格候选。
 */
export function buildNarrativeLinkagePromptBlock(args: {
  tasks: GameTaskV2[];
  clues: ClueEntry[];
  inventoryItemIds: string[];
  warehouseItemIds: string[];
  maxChars?: number;
}): string {
  const inv = new Set(args.inventoryItemIds.map((x) => String(x).trim()).filter(Boolean));
  const wh = new Set(args.warehouseItemIds.map((x) => String(x).trim()).filter(Boolean));
  const open = (args.tasks ?? []).filter((t) => t.status === "active" || t.status === "available");
  const parts: string[] = [];

  for (const t of open.slice(0, 10)) {
    const req = t.requiredItemIds;
    if (!req?.length) continue;
    const bits = req.slice(0, 8).map((id) => {
      const reg = findRegisteredItemById(id);
      const name = reg?.name ?? id;
      const held = inv.has(id) || wh.has(id);
      const tail = held ? "已持有" : reg ? "未持有" : "未注册/自定义";
      return `${name}[${id}|${tail}]`;
    });
    parts.push(`${clamp(t.title, 40)}[${t.id}]门槛：${bits.join("，")}`);
  }

  const mature = (args.clues ?? []).filter((c) => c.maturesToObjectiveId && String(c.maturesToObjectiveId).trim());
  if (mature.length > 0) {
    parts.push(
      `手记升格候选：${mature
        .slice(0, 8)
        .map((c) => `${clamp(c.title, 24)}→${c.maturesToObjectiveId}`)
        .join("；")}`
    );
  }

  const text = parts.length > 0 ? `【叙事咬合·物证与升格】${parts.join(" | ")}` : "";
  const max = args.maxChars ?? 520;
  return text.length <= max ? text : clamp(text, max);
}
