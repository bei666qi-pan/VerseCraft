/**
 * 地上层消化轴与诡异绑定（floor_lore_packet）。
 * 学制/七锚/校源/旧阵重连等真相由 `school_*`、`cycle_*`、`major_npc_*` runtime 子包与 RAG bootstrap 专条承载，不在此重复长文。
 */
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
    linkedAnomalyId: "A-004",
    publicTheme: "医疗、样本与水源异常",
    hiddenTheme: "管道分拣与可食性评估",
    publicOmen: "消毒水底下有铁锈味；诊室水龙头偶尔吐出细小沉淀，地漏像在呼吸。",
    hiddenCausal: "误诊即分拣：评估你适合被哪条管线接收，再用水源把样本送走。",
    digestionStage: "消化前评估阶段：判断目标可被何种管道线拆解",
    mainThreatMapping: "A-004 管道中的屠夫：红水、诊室与地漏的管道分拣投影。",
    truthProgress: "治疗与帮助叙事常为分级处理的伪装；红水不是禁忌而是分拣迹象。",
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
    linkedAnomalyId: "A-002",
    publicTheme: "失物、导盲犬与声音诱捕",
    hiddenTheme: "声源标记与情绪追猎",
    publicOmen: "走廊尽头反复传来狗叫；每次回应后，脚步声都会更近一点。",
    hiddenCausal: "失踪不是单纯走丢，而是声音诱饵把救援冲动接进猎犬追踪链。",
    digestionStage: "诱捕标记阶段：用熟悉声音筛出会回应的人",
    mainThreatMapping: "A-002 无头猎犬：听觉诱猎、目标标记与导盲犬执念。",
    truthProgress: "理解传闻、NPC 情绪和声音证据必须交叉验证。",
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
    publicTheme: "假出口、长椅账本与未消化门扉",
    hiddenTheme: "残差回收与出口资格误导",
    publicOmen: "夜里门牌会短暂跳到 13；远处有翻书声无页响，像在给失败者归档。",
    hiddenCausal: "7F 分配资源与残差回收，制造假出口来筛除尚未具备资格的人。",
    digestionStage: "结算调度阶段：资源分配、残差回收与假出口筛选。",
    mainThreatMapping: "A-007 十三楼门扉：未消化层投影与假出口诱导。",
    truthProgress: "管理者与出口秩序是权力博弈；接近出口不等于拥有通行资格。",
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
