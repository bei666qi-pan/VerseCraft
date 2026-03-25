import type { FloorId } from "./types";

export type ThreatAxisFloorId = Exclude<FloorId, "B1" | "B2">;

export interface FloorLoreEntry {
  floorId: ThreatAxisFloorId;
  linkedAnomalyId: string;
  publicTheme: string;
  hiddenTheme: string;
  publicOmen: string;
  /** 一句隐秘因果，供 deep+ packet；勿对 surface 全量输出 */
  hiddenCausal: string;
  digestionStage: string;
  mainThreatMapping: string;
  truthProgress: string;
  systemNaturalization: string[];
  professionBias: string[];
}

export const FLOOR_LORE_BY_ID: Record<ThreatAxisFloorId, FloorLoreEntry> = {
  "1": {
    floorId: "1",
    linkedAnomalyId: "A-001",
    publicTheme: "入驻秩序与身份登记",
    hiddenTheme: "身份剥离与消化编号化",
    publicOmen: "登记表与门牌偶尔对不上；日期在告示栏上自相矛盾。",
    hiddenCausal: "本层对应摄入登记：公寓先夺取「你是谁」，再处理肉体。",
    digestionStage: "摄入登记阶段：将外来者转为可处理对象",
    mainThreatMapping: "A-001 时差症候群：时间错位摄入，打散线性身份记忆。",
    truthProgress: "玩家意识到公寓会先夺取身份再动肉体。",
    systemNaturalization: ["新手任务与规则学习", "低强度武器准备", "关系起点"],
    professionBias: ["齐日角", "巡迹客"],
  },
  "2": {
    floorId: "2",
    linkedAnomalyId: "A-002",
    publicTheme: "医疗与修复",
    hiddenTheme: "样本化检查与可食性评估",
    publicOmen: "走廊里听见的脚步声与诊室钟表不同步；消毒水底下有铁锈味。",
    hiddenCausal: "误诊即分拣：评估你适合被哪条消化管线接收。",
    digestionStage: "消化前评估阶段：判断目标可被何种方式分解",
    mainThreatMapping: "A-002 无头猎犬：听觉诱猎、目标标记。",
    truthProgress: "治疗与帮助叙事常为分级处理的伪装。",
    systemNaturalization: ["情报任务", "反制标签武器", "策略锻造"],
    professionBias: ["觅兆者", "守灯人"],
  },
  "3": {
    floorId: "3",
    linkedAnomalyId: "A-003",
    publicTheme: "童年与日常幻象",
    hiddenTheme: "认知覆写与依恋钩子",
    publicOmen: "熟悉的面孔在转角重复；童声与成人脚步叠在一起。",
    hiddenCausal: "情感幻觉用于软化抵抗，方便写入错误因果。",
    digestionStage: "认知软化阶段：以情感幻觉降低抵抗。",
    mainThreatMapping: "A-003 认知腐蚀者：改写因果感与记忆序列。",
    truthProgress: "区分可见叙事与真实机制。",
    systemNaturalization: ["分支任务后果", "关系代价", "图鉴线索"],
    professionBias: ["觅兆者", "齐日角"],
  },
  "4": {
    floorId: "4",
    linkedAnomalyId: "A-004",
    publicTheme: "搜寻与失物",
    hiddenTheme: "管道拖拽与生物分拣",
    publicOmen: "天花板水滴落地变慢；管道深处有拖拽节奏的回音。",
    hiddenCausal: "失踪是进入分解流程，不是人间蒸发。",
    digestionStage: "输送切割阶段：导入管道线拆解。",
    mainThreatMapping: "A-004 管道屠夫：物理拖拽与切割。",
    truthProgress: "理解失踪与管道线的关系。",
    systemNaturalization: ["战斗准备", "补给修复循环", "高风险委托"],
    professionBias: ["守灯人", "巡迹客"],
  },
  "5": {
    floorId: "5",
    linkedAnomalyId: "A-005",
    publicTheme: "创作与表达",
    hiddenTheme: "器官拟态与形态替换",
    publicOmen: "墙皮像皮肤一样起伏；镜中轮廓慢半步跟随。",
    hiddenCausal: "个体可被改写成可替换的功能部件。",
    digestionStage: "组织重塑阶段：可复用器官部件化。",
    mainThreatMapping: "A-005 器官拟态墙：吞并边界与轮廓。",
    truthProgress: "公寓把人部件化。",
    systemNaturalization: ["轻锻造收益", "污染与稳定度", "证据链任务"],
    professionBias: ["溯源师", "守灯人"],
  },
  "6": {
    floorId: "6",
    linkedAnomalyId: "A-006",
    publicTheme: "镜像与分身",
    hiddenTheme: "维度错位与自我裂解",
    publicOmen: "楼梯台阶数往返不一致；镜中人先眨眼。",
    hiddenCausal: "复制体替代原体是常见淘汰机制。",
    digestionStage: "映射复制阶段：替代体淘汰原体。",
    mainThreatMapping: "A-006 楼梯间倒行者：镜像维度压迫。",
    truthProgress: "自我身份可被替换。",
    systemNaturalization: ["身份关系任务", "路径敏感决策", "职业分化"],
    professionBias: ["巡迹客", "齐日角"],
  },
  "7": {
    floorId: "7",
    linkedAnomalyId: "A-007",
    publicTheme: "管理与秩序中心",
    hiddenTheme: "消化账本与清场实验",
    publicOmen: "夜里走廊灯管一齐变红一瞬；远处有翻书声无页响。",
    hiddenCausal: "7F 分配资源与残差回收，决定谁可被允许接近出口叙事。",
    digestionStage: "结算调度阶段：资源分配与离开资格。",
    mainThreatMapping: "A-007 十三楼门扉：残渣闸门与封印。",
    truthProgress: "管理者与出口秩序是权力博弈，非善恶二元。",
    systemNaturalization: ["高阶任务", "原石武器关系耦合", "分支存档与职业终局"],
    professionBias: ["溯源师", "守灯人", "觅兆者"],
  },
};

/** @deprecated 使用 FLOOR_LORE_BY_ID；保留别名避免大范围重命名 */
export const FLOOR_DIGESTION_AXES = FLOOR_LORE_BY_ID;

export type FloorDigestionAxis = FloorLoreEntry;

export function getFloorLoreByLocation(location: string | null): FloorLoreEntry | null {
  if (!location) return null;
  const m = location.match(/^(\d)F_/);
  if (!m) return null;
  const id = m[1] as ThreatAxisFloorId;
  return FLOOR_LORE_BY_ID[id] ?? null;
}
