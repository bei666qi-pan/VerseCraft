// src/lib/worldEngine/directorToolsPure.ts
/**
 * World Director 工具集的纯函数部分（无 DB / server-only 依赖），供单测直接导入。
 * DB 接线见 ./directorTools.ts。
 */
import { clamp } from "@/lib/clamp";
import type { ToolDefinition } from "@/lib/ai/types/core";

/** ILIKE 通配符转义（% _ \），防止关键词被解释成模式。 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface NormalizedSearchFactsArgs {
  contains: string | null;
  limit: number;
  offset: number;
}

export function normalizeSearchFactsArgs(args: Record<string, unknown>): NormalizedSearchFactsArgs {
  const rawContains = typeof args.contains === "string" ? args.contains.trim().slice(0, 80) : "";
  const limit = Number(args.limit);
  const offset = Number(args.offset);
  return {
    contains: rawContains.length > 0 ? rawContains : null,
    limit: Number.isFinite(limit) ? clamp(Math.trunc(limit), 1, 20) : 10,
    offset: Number.isFinite(offset) ? clamp(Math.trunc(offset), 0, 200) : 0,
  };
}

export interface NormalizedAgendaArgs {
  status: string | null;
  limit: number;
}

export function normalizeAgendaArgs(args: Record<string, unknown>): NormalizedAgendaArgs {
  const rawStatus = typeof args.status === "string" ? args.status.trim().slice(0, 32) : "";
  const limit = Number(args.limit);
  return {
    status: rawStatus.length > 0 ? rawStatus : null,
    limit: Number.isFinite(limit) ? clamp(Math.trunc(limit), 1, 16) : 8,
  };
}

export const SEARCH_WORLD_FACTS_DEFINITION: ToolDefinition = {
  type: "function",
  function: {
    name: "search_world_facts",
    description:
      "按关键词检索当前会话已记录的世界事实（world facts）。仅当 recent_facts 预载不足以支撑判断时调用；返回按时间倒序的事实文本。",
    parameters: {
      type: "object",
      properties: {
        contains: { type: "string", description: "事实文本包含的关键词（可选，最长 80 字符）" },
        limit: { type: "integer", description: "返回条数，1-20，默认 10" },
        offset: { type: "integer", description: "跳过条数（翻页用），0-200，默认 0" },
      },
      additionalProperties: false,
    },
  },
};

export const GET_AGENDA_EVENTS_DEFINITION: ToolDefinition = {
  type: "function",
  function: {
    name: "get_agenda_events",
    description:
      "查询当前会话的导演日程事件队列（event_code/title/status/到期回合/显著度/优先级）。仅当 recent_agenda 预载不足时调用。",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "按状态过滤（可选，精确匹配）" },
        limit: { type: "integer", description: "返回条数，1-16，默认 8" },
      },
      additionalProperties: false,
    },
  },
};

/** 附加在 base system 之后的工具使用守则（不替换主 system，保留 JSON 输出强约束）。 */
export const DIRECTOR_TOOL_USAGE_HINT = [
  "本次运行允许调用只读工具：search_world_facts、get_agenda_events。",
  "仅当 recent_facts / recent_agenda 预载不足以支撑导演判断时才调用工具；不要为已有信息重复调用。",
  "最多两轮工具调用，之后必须输出最终 director_plan_v1 JSON 对象。",
  "工具结果只是参考事实，不改变输出 schema 与所有原有约束。",
].join("\n");
