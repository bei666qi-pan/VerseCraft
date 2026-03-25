/**
 * 秩序、经济、B1、锚点、管理者结构 — 结构化条目，可拼块进 packet 或 RAG。
 */

export interface WorldOrderCanonEntry {
  id: string;
  title: string;
  worldLogic: string;
  gameplayBinding: string[];
}

export const WORLD_ORDER_CANON: readonly WorldOrderCanonEntry[] = [
  {
    id: "b1_stability_band",
    title: "B1 迟滞稳定带",
    worldLogic:
      "B1 贴近配电与排污结构，电磁噪声、洗涤碱液与人类维护行为迟滞龙胃消化律，形成可长期驻留的低侵蚀带。",
    gameplayBinding: ["幸存者交易/锻造/修整", "服务节点中枢", "锚点重构安全窗"],
  },
  {
    id: "revive_anchor",
    title: "锚点与回声重构",
    worldLogic:
      "锚点记录回声体最近稳定拓扑；死亡后于锚点重构需支付时间窗并释放携带负荷，故有推进、掉落与局势改写。",
    gameplayBinding: ["12h 类推进叙事", "复活后任务/关系演化", "不可无代价反复重置"],
  },
  {
    id: "originium",
    title: "原石与分配权",
    worldLogic:
      "原石为未完全同化的高熵结晶，可延缓同化、支付修复并换取短暂清醒。控制原石流即控制公寓内秩序。",
    gameplayBinding: ["工资与交易媒介", "锻造/修复成本", "任务高奖=秩序分配"],
  },
  {
    id: "elder_steward",
    title: "夜读老人与清场悖论",
    worldLogic:
      "持消化日志者预测崩坏窗口并分配资源：既维持最低秩序，也借高危任务筛选个体，完成清场实验。",
    gameplayBinding: ["高奖任务带筛选性", "委托兼救火与审查", "7F 叙事权重"],
  },
  {
    id: "wandering_merchant",
    title: "游荡商人",
    worldLogic: "来自夹层外环集市的短时交易者，货物可扰动楼层僵局，与管理者互需互防。",
    gameplayBinding: ["不稳定高价交换", "可打破资源死锁", "与 7F 秩序博弈"],
  },
] as const;

export function buildWorldOrderCanonBlock(): string {
  return WORLD_ORDER_CANON.map((entry) => {
    const bindings = entry.gameplayBinding.map((x) => `- ${x}`).join("\n");
    return [`【${entry.title}】`, entry.worldLogic, "可观测关联：", bindings].join("\n");
  }).join("\n\n");
}

/** 兼容旧名 */
export const SYSTEM_CANON_REGISTRY = WORLD_ORDER_CANON;
export function buildSystemCanonBlock(): string {
  return buildWorldOrderCanonBlock();
}
