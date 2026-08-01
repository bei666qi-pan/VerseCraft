// src/lib/ai/tools/dmAgentRouteIntegration.ts
/**
 * DM Agent → DM JSON 映射的统一注册表门禁。
 *
 * 本模块只保留注册表收口函数 `buildDmAgentDmJson`：DM-agent 回合的
 * stateDelta.itemsGranted 必须先经过与主链路 registeredMechanicsGuard 相同
 * 的注册表事实源校验，未注册 id 被剔除并记录 `unregistered_item_pruned_v1`，
 * 合法注册物品不受影响。
 *
 * DM-agent route 接线（tryRunDmAgentTurn / feature flag / orchestrator）属于
 * integrate-bounded-dm-agent-tools 特性流，未随本分支提交；该特性落地时应
 * 复用本函数完成最终 DM JSON 映射。
 */

import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";

const REGISTERED_WAREHOUSE_ITEM_IDS = new Set(WAREHOUSE_ITEMS.map((item) => item.id));

/**
 * DM-agent 回合结果的最小结构形状（结构化子集）。
 * 完整 DmAgentTurnResult 由 dmAgent 特性流定义；本守卫只依赖这三个字段。
 */
export interface DmAgentStateDeltaLite {
  itemsConsumed?: string[];
  itemsGranted?: string[];
  [key: string]: unknown;
}

export interface DmAgentTurnResultLite {
  narrative?: string;
  toolsUsed?: unknown;
  stateDelta?: DmAgentStateDeltaLite | null;
  [key: string]: unknown;
}

/**
 * DM-agent stateDelta → DM JSON 的统一映射。
 *
 * 与主链路 registeredMechanicsGuard 使用同一注册表事实源：任何进入最终
 * DM JSON 的物品都必须是已注册 id（道具或仓库物品）。grant_item 工具自身
 * 已做校验（T13），此处是 defense-in-depth 的收口层，未注册 id 被剔除并
 * 记录 `unregistered_item_pruned_v1`，合法注册物品不受影响。
 */
export function buildDmAgentDmJson(turnResult: DmAgentTurnResultLite): Record<string, unknown> {
  const dmJson: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: turnResult.narrative || "（DM Agent 处理完成）",
    is_death: false,
    consumes_time: true,
    options: [] as string[],
    dm_agent_tools_used: turnResult.toolsUsed,
    dm_agent_state_delta: turnResult.stateDelta,
  };
  const sd = turnResult.stateDelta;
  if (sd) {
    if (sd.itemsConsumed?.length) dmJson.consumed_items = sd.itemsConsumed;
    if (sd.itemsGranted?.length) {
      const granted = sd.itemsGranted.filter(
        (id) => findRegisteredItemById(id) !== undefined || REGISTERED_WAREHOUSE_ITEM_IDS.has(id),
      );
      if (granted.length > 0) dmJson.awarded_items = granted.map((id) => ({ id, name: id }));
      if (granted.length !== sd.itemsGranted.length) {
        dmJson._commit_flags = ["unregistered_item_pruned_v1"];
      }
    }
  }
  return dmJson;
}
