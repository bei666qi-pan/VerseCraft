import { ANOMALIES } from "./anomalies";
import { APARTMENT_SURVIVAL_NOTES } from "./rules";
import type { FloorId } from "./types";
import { FLOORS, MAP_ROOMS } from "./world";

export interface WorldClosureMatrixEntry {
  floorId: FloorId;
  floorLabel: string;
  legalRoomNodes: readonly string[];
  publicTheme: string;
  hiddenMechanism: string;
  linkedAnomalyId: string | null;
  keyNpcIds: readonly string[];
  survivalNoteIds: readonly string[];
  itemIds: readonly string[];
  warehouseItemIds: readonly string[];
  counterWindowSummary: string;
  escapeRelevance: string;
  revealTierRequired: "surface" | "fracture" | "deep" | "abyss";
}

const floorLabel = (floorId: FloorId) => FLOORS.find((f) => f.id === floorId)?.label ?? floorId;

export const WORLD_CLOSURE_MATRIX: readonly WorldClosureMatrixEntry[] = [
  {
    floorId: "B1",
    floorLabel: floorLabel("B1"),
    legalRoomNodes: MAP_ROOMS["B1"],
    publicTheme: "安全缓冲、服务、登记额度与恢复",
    hiddenMechanism: "稳定带阻止 hostile 直接伤害，但保留服务、交易、复活、真相与时间代价。",
    linkedAnomalyId: null,
    keyNpcIds: ["N-008", "N-014", "N-015", "N-020"],
    survivalNoteIds: ["note_basement_open"],
    itemIds: [],
    warehouseItemIds: ["W-B101", "W-B102", "W-B103", "W-B104", "W-B105", "W-B106"],
    counterWindowSummary: "休整、补给、薪资、锚点与传闻交叉验证；不是免费天堂。",
    escapeRelevance: "出口主线的资源与许可准备层。",
    revealTierRequired: "surface",
  },
  {
    floorId: "1",
    floorLabel: floorLabel("1"),
    legalRoomNodes: MAP_ROOMS["1"],
    publicTheme: "身份登记、物业口与时间错位",
    hiddenMechanism: "公寓先处理玩家是谁，再处理玩家能不能继续行动。",
    linkedAnomalyId: "A-001",
    keyNpcIds: ["N-001", "N-003", "N-010", "N-018"],
    survivalNoteIds: ["note_mechanical_watch"],
    itemIds: ["I-A01"],
    warehouseItemIds: ["W-101", "W-102", "W-103", "W-104", "W-105", "W-106", "W-107", "W-108", "W-202", "W-204", "W-206"],
    counterWindowSummary: "姓名、入楼时间、随身表与登记物互相校准。",
    escapeRelevance: "欣蓝与登记口提供 B2 通行权限线索。",
    revealTierRequired: "surface",
  },
  {
    floorId: "2",
    floorLabel: floorLabel("2"),
    legalRoomNodes: MAP_ROOMS["2"],
    publicTheme: "医疗、样本与水源",
    hiddenMechanism: "红水和诊室是管道分拣的入口，决定样本被哪条消化线接收。",
    linkedAnomalyId: "A-004",
    keyNpcIds: ["N-002"],
    survivalNoteIds: ["note_red_water_settle", "note_red_uniform_tea"],
    itemIds: ["I-A03"],
    warehouseItemIds: ["W-201", "W-203", "W-205", "W-404", "W-408"],
    counterWindowSummary: "关闭水源、干燥/封堵地漏、离开管线范围。",
    escapeRelevance: "钥物与普通封锁处理能力来源。",
    revealTierRequired: "surface",
  },
  {
    floorId: "3",
    floorLabel: floorLabel("3"),
    legalRoomNodes: MAP_ROOMS["3"],
    publicTheme: "童年、熟悉感与虚假记忆",
    hiddenMechanism: "认知污染先伪造日常，再写入错误因果。",
    linkedAnomalyId: "A-003",
    keyNpcIds: ["N-004"],
    survivalNoteIds: [],
    itemIds: [],
    warehouseItemIds: ["W-301", "W-302", "W-303", "W-304", "W-305", "W-306"],
    counterWindowSummary: "记录真实姓名、入楼事实与当前目标；污染文字先拍照不解读。",
    escapeRelevance: "提供线索验证能力，防止假出口叙事覆盖真实目标。",
    revealTierRequired: "surface",
  },
  {
    floorId: "4",
    floorLabel: floorLabel("4"),
    legalRoomNodes: MAP_ROOMS["4"],
    publicTheme: "导盲犬、狗叫与声音诱捕",
    hiddenMechanism: "熟悉声音与救援冲动会被猎犬转成追踪链。",
    linkedAnomalyId: "A-002",
    keyNpcIds: ["N-005", "N-006"],
    survivalNoteIds: ["note_dog_bark"],
    itemIds: ["I-B01"],
    warehouseItemIds: ["W-401", "W-402", "W-403", "W-405", "W-406", "W-407"],
    counterWindowSummary: "静默、隔音、诱饵声源和 NPC 情绪安抚。",
    escapeRelevance: "教玩家区分传闻、求救与诱捕。",
    revealTierRequired: "surface",
  },
  {
    floorId: "5",
    floorLabel: floorLabel("5"),
    legalRoomNodes: MAP_ROOMS["5"],
    publicTheme: "庇护、画室与形体替换",
    hiddenMechanism: "安全壳可被拟态墙转成轮廓和器官替换。",
    linkedAnomalyId: "A-005",
    keyNpcIds: ["N-007"],
    survivalNoteIds: ["note_wall_swallow", "note_rot_door"],
    itemIds: [],
    warehouseItemIds: ["W-501", "W-502", "W-503", "W-504", "W-505", "W-506"],
    counterWindowSummary: "遮挡墙眼、避免对视、用外观干扰物撤离。",
    escapeRelevance: "叶线提供反向线索与庇护取舍。",
    revealTierRequired: "fracture",
  },
  {
    floorId: "6",
    floorLabel: floorLabel("6"),
    legalRoomNodes: MAP_ROOMS["6"],
    publicTheme: "镜像、倒行与错层门牌",
    hiddenMechanism: "方向感和楼层认知会被反写，10F/11F 只是投影。",
    linkedAnomalyId: "A-006",
    keyNpcIds: ["N-009", "N-016"],
    survivalNoteIds: ["note_mirror_cover", "note_reverse_stair"],
    itemIds: [],
    warehouseItemIds: ["W-601", "W-602", "W-603", "W-604", "W-605", "W-606"],
    counterWindowSummary: "闭眼扶墙、确认真实节点、拒绝追逐错层门牌。",
    escapeRelevance: "帮助识别假路线和错层污染。",
    revealTierRequired: "fracture",
  },
  {
    floorId: "7",
    floorLabel: floorLabel("7"),
    legalRoomNodes: MAP_ROOMS["7"],
    publicTheme: "假出口、夜读账本与未消化层",
    hiddenMechanism: "13 楼门扉筛除把假门当出口的人。",
    linkedAnomalyId: "A-007",
    keyNpcIds: ["N-011", "N-012", "N-013", "N-019"],
    survivalNoteIds: ["note_thirteenth_floor", "note_rot_door"],
    itemIds: [],
    warehouseItemIds: ["W-701", "W-702", "W-703", "W-704", "W-705", "W-706", "W-707", "W-708", "W-709", "W-710"],
    counterWindowSummary: "不跨门线、不回应呼唤，记录假出口证据并撤回真实楼层。",
    escapeRelevance: "给出假出口辨认、代价试炼与终局资格前置。",
    revealTierRequired: "deep",
  },
  {
    floorId: "B2",
    floorLabel: floorLabel("B2"),
    legalRoomNodes: MAP_ROOMS["B2"],
    publicTheme: "出口喉管与守门人审计",
    hiddenMechanism: "真正离开必须满足资格链；短暂窗口只用于侦查或撤退。",
    linkedAnomalyId: "A-008",
    keyNpcIds: [],
    survivalNoteIds: ["note_basement_open"],
    itemIds: [],
    warehouseItemIds: ["W-B201", "W-B202", "W-B203", "W-B204"],
    counterWindowSummary: "路线碎片、B2 权限、钥物/资格、认可/替代通行、代价试炼、最终窗口行动。",
    escapeRelevance: "唯一真正出口；不能偷跑、硬打或破门。",
    revealTierRequired: "abyss",
  },
];

export const WORLD_CLOSURE_BY_FLOOR = Object.fromEntries(
  WORLD_CLOSURE_MATRIX.map((entry) => [entry.floorId, entry])
) as Record<FloorId, WorldClosureMatrixEntry>;

export function getCanonicalAnomalyIdForFloor(floorId: FloorId): string | null {
  return WORLD_CLOSURE_BY_FLOOR[floorId]?.linkedAnomalyId ?? null;
}

export function getCanonicalFloorForAnomaly(anomalyId: string): FloorId | null {
  const anomaly = ANOMALIES.find((a) => a.id === anomalyId);
  return anomaly?.floor ?? null;
}

export function survivalNoteExists(noteId: string): boolean {
  return APARTMENT_SURVIVAL_NOTES.some((note) => note.id === noteId);
}
