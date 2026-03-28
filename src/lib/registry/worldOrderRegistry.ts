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
      "B1 贴近配电与排污结构，电磁噪声、洗涤碱液与人类维护行为共同压低局部熵增，迟滞龙胃消化律；在七锚收容叙事中，这里也是面向主锚的服务前端——使交易、锻造、修整与锚点重构获得可操作窗口。",
    gameplayBinding: ["幸存者交易/锻造/修整", "服务节点中枢", "锚点重构安全窗"],
  },
  {
    id: "revive_anchor",
    title: "锚点与回声重构",
    worldLogic:
      "锚点记录主锚（回声体）最近稳定拓扑；于锚点重构是收容系统的回写而非免费回档，需支付时间窗并释放携带负荷，故有推进、掉落与局势改写。与十日纠错窗口存在叙事咬合，但不与单次复活指令机械等同。",
    gameplayBinding: ["12h 类推进叙事", "复活后任务/关系演化", "不可无代价反复重置"],
  },
  {
    id: "originium",
    title: "原石与分配权",
    worldLogic:
      "不存在天然原石矿脉。原石主要为泡层空间壁短时析出的稳定能结晶，并叠加夜读老人等秩序节点的记账式再分配。用于延缓他者同化、交易媒介、修复与秩序分配；控制原石流即控制楼内分配权。叙事上禁止把原石写成可无上限堆叠战力的捷径。",
    gameplayBinding: ["工资与交易媒介", "锻造/修复成本", "任务高奖=秩序分配"],
  },
  {
    id: "elder_steward",
    title: "夜读老人与清场悖论",
    worldLogic:
      "夜读老人（N-011）持消化日志，可视作龙月—泡层调度在楼内的记账终端之一：既预测崩坏窗口、再分配稳定能结晶，也借高危任务筛选个体。其「清场」与十日失败轮次回收叙事可相容，但仍须分层揭露。",
    gameplayBinding: ["高奖任务带筛选性", "委托兼救火与审查", "7F 叙事权重"],
  },
  {
    id: "wandering_merchant",
    title: "游荡商人",
    worldLogic:
      "来自夹层外环集市的短时交易者，货物可扰动楼层僵局，与管理者互需互防；可与「校源物资外流」类传言并存，但不改变服务节点与主威胁绑定的硬规则。",
    gameplayBinding: ["不稳定高价交换", "可打破资源死锁", "与 7F 秩序博弈"],
  },
  {
    id: "ten_day_recycle",
    title: "十日纠错窗口",
    worldLogic:
      "约十日量级的叙事窗口末尾，泡层可触发纠错：表现为时间闪烁、分支回收与局势收紧，用于清掉不可收敛轮次；与玩家单次死亡/复活链路叠加时，仍以服务端状态回写为准。",
    gameplayBinding: ["循环压力叙事", "与暗月/威胁抬升可并置", "禁止开局直述机制全貌"],
  },
  {
    id: "dragon_moon_calibration",
    title: "龙月校准",
    worldLogic:
      "月亮为龙之外置魔力调度面；公寓借龙月辐照校准泡层节律。游戏内第3日0时起的暗月阶段对应校准相位偏移，威胁整体抬升是该相位的可观测后果。",
    gameplayBinding: ["第3日0时起暗月阶段", "威胁整体抬升", "与十日窗口叙事可咬合"],
  },
  {
    id: "school_wanderer_state",
    title: "校源徘徊者（状态）",
    worldLogic:
      "六名共鸣辅锚原为耶里学校学生；经长期循环后被系统归类为「校源徘徊者」——这是运行态标签。其余 N-001～N-020 中未标定为辅锚者，仍按公寓旧住民/污染残留等原逻辑处理。",
    gameplayBinding: ["六名高魅力 NPC 深层身份", "不可默认全员校友", "deep+ 揭露"],
  },
  {
    id: "seven_anchor_roles",
    title: "七锚角色分工",
    worldLogic:
      "主锚承担卷入回声与不可抛弃性；六辅锚分担相位噪声与叙事黏着。玩法上不改变 NPC id、节点 id 与 B1 服务表，仅补充因果解释层。",
    gameplayBinding: ["fracture+ 与 packet 注入", "与 key_npc_lore 共存"],
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
