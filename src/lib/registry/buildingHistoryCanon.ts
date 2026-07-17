/**
 * Building History Canon — 如月公寓建筑时间线与楼层固化演变
 *
 * 本文件记录公寓自 1972 年建成至 2026 年现状的所有重要历史节点。
 * 时间线是硬锚点，DM 编排不可偏离。
 */

import type { FloorId } from "./types";

/**
 * 建筑时间线里程碑
 * 所有日期均为故事内真实时间，非玩家感知时间。
 */
export interface BuildingMilestone {
  year: number;
  /** 精确月份（可选） */
  month?: number;
  /** 事件标题 */
  title: string;
  /** 事件详述 */
  detail: string;
  /** 是否涉及空间异变 */
  isAnomalous?: boolean;
}

export const BUILDING_MILESTONES: readonly BuildingMilestone[] = [
  {
    year: 1972,
    title: "如月公寓竣工",
    detail:
      "如月公寓作为普通居民楼建成。建筑格局为地下两层、地上七层的标准结构。原设计无任何异常空间。",
    isAnomalous: false,
  },
  {
    year: 1975,
    month: 9,
    title: "耶里学校临时实验设施",
    detail:
      "如月公寓地下一层与地下二层被耶里学校租用，秘密改建为『地下实验设施』。B1 作为密闭缓冲层，B2 作为实验核心区。学校在地下二层的原型实验中首次建立了与现实夹层的稳定异频路由，这是「泡层」概念的原型。",
    isAnomalous: true,
  },
  {
    year: 1978,
    month: 6,
    title: "学校撤离与设施封存",
    detail:
      "耶里学校因不明原因终止实验并撤离。B1 和 B2 被快速封存，但封存并未彻底清理异频残留。地下二层留下了部分未完成的基础设施与空间折叠残余。公寓恢复正常民用状态。",
    isAnomalous: false,
  },
  {
    year: 1980,
    month: 3,
    title: "公寓公开招租",
    detail:
      "如月公寓面向社会公开招租。1F-7F 全部住满。陈婆婆为首批住户之一。此时公寓尚无异常现象。",
    isAnomalous: false,
  },
  {
    year: 1985,
    month: 8,
    title: "前调查员入职秘密机构",
    detail:
      "上世纪 80 年代，秘密研究机构开始关注如月公寓周边空间异常信号。前调查员（N-019）随后被派驻调查。此时公寓底层开始出现居民「记错楼道」的现象，被归因于旧建筑结构问题。",
    isAnomalous: true,
  },
  {
    year: 1990,
    month: 11,
    title: "电梯异常事件",
    detail:
      "住户报告电梯经常在非停靠楼层停留。多次维修始终无法根治。电梯实际上重新打开了 B2 的裂隙路由通道——电梯井成为连接地上层与地下泡层的垂直管道。此后 B2 门开始出现「锁上就打不开」的规则性现象。",
    isAnomalous: true,
  },
  {
    year: 2005,
    month: 7,
    title: "最后一次大规模装修",
    detail:
      "公寓进行最后一次大规模重新装修，主要涉及水管更换和电路改造。装修过程中工人在 4F 墙壁内发现类似血管的纤维结构，被当作树根处理。这次改造意外加速了「水管消化网络」的形成，A-004（管道屠夫）的出现可追溯至此。",
    isAnomalous: false,
  },
  {
    year: 2024,
    month: 11,
    title: "暗月裂隙·空间碎片泄露",
    detail:
      "耶里学校地下设施的陈旧异频路由因未知原因重新激活。空间权柄碎片沿裂隙路由泄露，将如月公寓从常轨坐标剥离，钉入龙胃黏膜与现实夹层之间。公寓开始呈现泡层消化特征。主锚·楚博士在观测实验中被卷入。238 名在住人员全部被困。",
    isAnomalous: true,
  },
  {
    year: 2024,
    month: 12,
    title: "楼层固化纪元·零月",
    detail:
      "泡泡层稳定化完成。公寓以日为约十小时、夜约十四小时的节律运转。各楼层开始呈现特异性消化功能。B1 因原设计作为缓冲层，成为唯一的稳定安全区。七辅锚系统形成雏形。238 人中多数在第一个月内被消化。",
    isAnomalous: true,
  },
  {
    year: 2026,
    month: 7,
    title: "故事当前时间",
    detail:
      "当前叙事时间。公寓异常已持续约 20 个月。循环系统、锚系统、记忆气泡生态均已稳定。剩余住户约 43 人，6 名辅锚在循环中维持着微妙的平衡。玩家（第 7 锚位的外来回声体）进入公寓。",
    isAnomalous: true,
  },
] as const;

/**
 * 楼层消化功能演变与固化时间
 * 记录每个楼层呈现特异消化功能的时间节点（从 2024.11 起计月数）。
 * 「无明确月份」表示该楼层功能在泡层稳定过程中逐渐形成，无精准触发事件。
 */
export interface FloorEvolutionEntry {
  floorId: FloorId;
  /** 楼层消化/功能角色的定型描述 */
  digestionRole: string;
  /** 该角色从开始到固化的推定月份数（从 2024.11 起计） */
  solidificationMonth?: number;
  /** 功能简述 */
  functionNote: string;
}

export const FLOOR_EVOLUTION: readonly FloorEvolutionEntry[] = [
  {
    floorId: "B2",
    digestionRole: "排泄喉管",
    solidificationMonth: 3,
    functionNote:
      "被守门人封印与深渊守门者审计通行资格的终止消化出口。木门被规则不可破坏，钥匙/权限/代价/守门人认可四重条件锁定。",
  },
  {
    floorId: "B1",
    digestionRole: "安全缓冲层",
    solidificationMonth: 1,
    functionNote:
      "唯一可运维稳定层。地下室的结构与过去耶里学校的缓冲层设计意外阻止了直接消化力渗透。提供交易、修复、锚点重构与有限安全窗口。",
  },
  {
    floorId: "1",
    digestionRole: "身份剥离层",
    solidificationMonth: 4,
    functionNote:
      "新住户的身份信息在登记口被系统性地剥离/重写。登记处的每一张表格都是一次'身份代谢'。欣蓝在此执行登记权柄。A-001 时差症候群在此活跃。",
  },
  {
    floorId: "2",
    digestionRole: "管道分拣层",
    solidificationMonth: 5,
    functionNote:
      "公寓水管网络在 2F 形成分支节点。A-004（管道屠夫）主要活动层。林医生的诊室作为管道沉淀物的二级分拣点。",
  },
  {
    floorId: "3",
    digestionRole: "认知改写层",
    solidificationMonth: 6,
    functionNote:
      "A-003（认知腐蚀者）常驻楼层的核心改写面。住户在此发生的认知偏差会加速被楼体同化。阿花的黑色毽子是改写失败的凝固物。",
  },
  {
    floorId: "4",
    digestionRole: "声索狩猎层",
    solidificationMonth: 7,
    functionNote:
      "A-002（无头猎犬）主动狩猎楼层。声音诱导是主要诱杀手段。周伯的盲人与狗叙事是公寓制造的最成功的诱饵回路之一。",
  },
  {
    floorId: "5",
    digestionRole: "器官重塑层",
    solidificationMonth: 9,
    functionNote:
      "住户在此出现器官与感知层面的异常重塑。画室是痕迹最深的房间——画中人的轮廓比真人多转角度是重塑过程的反射。",
  },
  {
    floorId: "6",
    digestionRole: "镜像复制层",
    solidificationMonth: 10,
    functionNote:
      "公寓在此运作镜像复制机制。阿织/阿绣是最好的产出物证。错层门牌（10F 投影）是 6F 边界破损的表现。A-006（倒行者）活动于此。",
  },
  {
    floorId: "7",
    digestionRole: "残余循环层",
    solidificationMonth: 12,
    functionNote:
      "公寓无法彻底消化的残余在此循环。A-007（门扉囚徒）与管理者对峙。陶师傅的剁肉声对抗 A-004 的高层渗透。前调查员的笔记在此记录。",
  },
] as const;

/** 构建 DM 可读的楼层演变上下文块 */
export function buildFloorEvolutionBlock(): string {
  return FLOOR_EVOLUTION.map(
    (f) =>
      `【${f.floorId}】${f.digestionRole}（固化约 ${f.solidificationMonth} 月）：${f.functionNote}`
  ).join("\n");
}
