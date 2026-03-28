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
      "B1 贴近配电与排污结构，电磁噪声、洗涤碱液与人类维护行为共同压低局部熵增，迟滞龙胃消化律；在十日校准—纠错闭环中，这里是面向主锚的「可运维前端」——交易、锻造、修整与锚点重构被系统允许在同一迟滞带内完成，使地上层的节律压迫与地下层的回写窗口形成硬对比（非剧情豁免，是结构位置）。",
    gameplayBinding: ["幸存者交易/锻造/修整", "服务节点中枢", "锚点重构安全窗", "昼夜/位相压迫下的相对喘息面"],
  },
  {
    id: "revive_anchor",
    title: "锚点与回声重构",
    worldLogic:
      "锚点记录主锚（回声体）最近稳定拓扑；重构＝收容回写四元组：拓扑重写、类 12h 时间推进、携带负荷释放（掉落/损耗）、局势再定价（任务/关系/威胁相位）。与窗口末「闪烁纠错」共享回写语义，触发条件不同；二者均非免费回档。",
    gameplayBinding: ["12h 类推进叙事", "复活后任务/关系演化", "不可无代价反复重置", "与 cycle_time_packet 对齐"],
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
      "封闭窗口内单链：校准（含龙月驱动）→ 前兆四轴抬升 → 执行型闪烁 → 失败分支回收；非「重复演戏」。日历可越过第 10 日，但位相按模 10 回折，与客户端昼夜推进兼容。",
    gameplayBinding: ["循环压力叙事", "与暗月/威胁抬升同一闭环", "禁止开局直述机制全貌", "失败痕迹：残响/刻痕/旧笔记/错位物品/关系错位"],
  },
  {
    id: "dragon_moon_calibration",
    title: "龙月校准",
    worldLogic:
      "月亮为龙之外置魔力调度面，是泡层节律与校准能量的来源；游戏内第 3 日起暗月阶段为其可观测偏移。威胁抬升、位相带宽收紧与窗口末闪烁同一解释面下的不同阶段，不得拆成互不相干的「三条设定」。",
    gameplayBinding: ["第3日起暗月阶段", "威胁整体抬升", "与十日窗口强耦合", "registry：cycleMoonFlashRegistry"],
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
