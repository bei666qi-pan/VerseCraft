import type {
  ServiceDefinition,
  ServiceNodeDefinition,
  ServiceNodeId,
} from "./types";
import { B1_ABSOLUTE_SAFE_ROOMS } from "./world";

export type B1ServiceState = {
  shopUnlocked?: boolean;
  forgeUnlocked?: boolean;
  anchorUnlocked?: boolean;
  unlockFlags?: Record<string, boolean>;
};

export function createDefaultB1ServiceState(): Required<B1ServiceState> {
  return {
    shopUnlocked: true,
    forgeUnlocked: false,
    anchorUnlocked: true,
    unlockFlags: {},
  };
}

const B1_SAFEZONE_SERVICES: ServiceDefinition[] = [
  {
    id: "svc_b1_anchor",
    kind: "revive_anchor",
    name: "复活锚点",
    description: "死亡后可在此触发安全复活流程。",
    npcIds: ["N-008", "N-014", "N-015"],
    enabledByDefault: true,
  },
  {
    id: "svc_b1_restore",
    kind: "safe_restore",
    name: "安全恢复",
    description: "在安全缓冲层中进行短暂恢复；会消耗时间、服务额度或留下关系债，不是免费无代价治疗。",
    npcIds: ["N-014"],
    enabledByDefault: true,
  },
  {
    id: "svc_b1_gatekeeper",
    kind: "gatekeeper_meeting",
    name: "守门人会面",
    description: "用于出口主线后期的守门人相关会面入口；未获 B2 权限前只显示传闻，不开放会面。",
    npcIds: ["N-008"],
    enabledByDefault: false,
  },
];

const B1_STORAGE_SERVICES: ServiceDefinition[] = [
  {
    id: "svc_b1_shop",
    kind: "shop_trade",
    name: "基础商店",
    description: "售卖基础补给与工具，支持原石消费闭环；每笔交易都记入楼内账本。",
    npcIds: ["N-008", "N-014", "N-020"],
    enabledByDefault: true,
  },
  {
    id: "svc_b1_salary",
    kind: "salary_settlement",
    name: "薪资结算",
    description: "正式委托、登记额度与稳定残响返还的结算入口；不是挂机掉钱。",
    npcIds: ["N-008"],
    enabledByDefault: true,
  },
];

const B1_POWERROOM_SERVICES: ServiceDefinition[] = [
  {
    id: "svc_b1_forge_upgrade",
    kind: "forge_upgrade",
    name: "锻造强化",
    description: "进行有限升级与合成；初期锁定，需取得对策物或服务许可后开启。",
    npcIds: ["N-008"],
    enabledByDefault: false,
  },
  {
    id: "svc_b1_forge_repair",
    kind: "forge_repair",
    name: "武器维护",
    description: "执行基础修复与维护；拿到对策物后可半开放，仍需要原石或关系代价。",
    npcIds: ["N-008"],
    enabledByDefault: false,
  },
];

const B1_LAUNDRY_SERVICES: ServiceDefinition[] = [
  {
    id: "svc_b1_cleanse",
    kind: "cleanse",
    name: "清洁净化",
    description: "处理污染与生活化补给。",
    npcIds: ["N-014"],
    enabledByDefault: true,
  },
  {
    id: "svc_b1_rumor",
    kind: "rumor",
    name: "谣言情报",
    description: "获取柔性情报与楼层传闻；常与 B1 补给面孔交叉验证。",
    npcIds: ["N-014", "N-020"],
    enabledByDefault: true,
  },
  {
    id: "svc_b1_soft_guidance",
    kind: "soft_guidance",
    name: "柔性引导",
    description: "以生活化叙事方式引导玩家推进。",
    npcIds: ["N-014", "N-008", "N-020"],
    enabledByDefault: true,
  },
];

export const B1_SERVICE_NODES: Record<ServiceNodeId, ServiceNodeDefinition> = {
  B1_SafeZone: {
    nodeId: "B1_SafeZone",
    label: "B1 安全中枢",
    isAbsoluteSafeZone: true,
    services: B1_SAFEZONE_SERVICES,
  },
  B1_Storage: {
    nodeId: "B1_Storage",
    label: "B1 储备与交易中枢",
    isAbsoluteSafeZone: true,
    services: B1_STORAGE_SERVICES,
  },
  B1_PowerRoom: {
    nodeId: "B1_PowerRoom",
    label: "B1 锻造维护中枢",
    isAbsoluteSafeZone: true,
    services: B1_POWERROOM_SERVICES,
  },
  B1_Laundry: {
    nodeId: "B1_Laundry",
    label: "B1 生活净化中枢",
    isAbsoluteSafeZone: true,
    services: B1_LAUNDRY_SERVICES,
  },
};

export const SHOP_CATALOG_MINIMAL = [
  { id: "shop_item_bandage", itemId: "I-D23", priceOriginium: 2 },
  { id: "shop_item_flashlight", itemId: "I-C03", priceOriginium: 5 },
  { id: "shop_item_salt", itemId: "I-C09", priceOriginium: 4 },
] as const;

export const FORGE_CATALOG_MINIMAL = [
  {
    id: "forge_recipe_flashlight_battery",
    inputItemIds: ["I-C03", "I-C12"],
    outputItemId: "I-B03",
    costOriginium: 3,
  },
  {
    id: "forge_recipe_knife_repair",
    inputItemIds: ["I-C10"],
    outputItemId: "I-C10",
    costOriginium: 2,
  },
] as const;

export function isB1ServiceNode(location: string | null | undefined): location is ServiceNodeId {
  if (!location) return false;
  return Object.hasOwn(B1_SERVICE_NODES, location);
}

export function isAbsoluteSafeZoneLocation(location: string | null | undefined): boolean {
  return typeof location === "string" && (B1_ABSOLUTE_SAFE_ROOMS as readonly string[]).includes(location);
}

function checkServiceEnabled(serviceId: string, state: B1ServiceState): boolean {
  const unlockFlags = state.unlockFlags ?? {};
  if (unlockFlags[serviceId] === true) return true;
  if (unlockFlags[serviceId] === false) return false;
  if (serviceId.startsWith("svc_b1_shop") && state.shopUnlocked === false) return false;
  if (serviceId.startsWith("svc_b1_forge") && state.forgeUnlocked === false) return false;
  if (serviceId.startsWith("svc_b1_anchor") && state.anchorUnlocked === false) return false;
  return true;
}

export function getServicesForLocation(
  location: string | null | undefined,
  state: B1ServiceState = createDefaultB1ServiceState()
): Array<ServiceDefinition & { available: boolean }> {
  if (!isB1ServiceNode(location)) return [];
  const node = B1_SERVICE_NODES[location];
  return node.services.map((svc) => ({
    ...svc,
    available: (() => {
      const flags = state.unlockFlags ?? {};
      if (flags[svc.id] === true) return true;
      if (flags[svc.id] === false) return false;
      const familyUnlocked =
        svc.id.startsWith("svc_b1_forge")
          ? state.forgeUnlocked === true
          : svc.id.startsWith("svc_b1_shop")
            ? state.shopUnlocked !== false
            : svc.id.startsWith("svc_b1_anchor")
              ? state.anchorUnlocked !== false
              : false;
      return (svc.enabledByDefault || familyUnlocked) && checkServiceEnabled(svc.id, state);
    })(),
  }));
}

export function buildServiceContextForLocation(
  location: string | null | undefined,
  state: B1ServiceState = createDefaultB1ServiceState(),
  presentNpcIds: string[] = []
): string {
  if (!isB1ServiceNode(location)) return "";
  const node = B1_SERVICE_NODES[location];
  const services = getServicesForLocation(location, state);
  const presentSet = new Set(presentNpcIds);
  const lines = [
    "## 【当前位置服务节点（结构化）】",
    `location: ${node.nodeId}`,
    `label: ${node.label}`,
    `absolute_safe_zone: ${node.isAbsoluteSafeZone ? "true" : "false"}`,
    "services:",
    ...services.map((svc) => {
      const inPlace = svc.npcIds.some((id) => presentSet.has(id));
      return `- ${svc.id} | ${svc.name} | available=${svc.available ? "true" : "false"} | npc=${svc.npcIds.join(",")} | npc_present=${inPlace ? "true" : "false"} | ${svc.description}`;
    }),
  ];
  return lines.join("\n");
}
