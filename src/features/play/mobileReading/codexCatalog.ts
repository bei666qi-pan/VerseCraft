export type CodexCatalogSlot = {
  id: string;
  type: "npc";
  floor: "B1";
  displayName: string;
  fallbackLocation: string;
  quote?: string;
};

export const B1_NPC_CODEX_SLOTS: readonly CodexCatalogSlot[] = [
  {
    id: "N-008",
    type: "npc",
    floor: "B1",
    displayName: "电工老刘",
    fallbackLocation: "配电间 / 各楼层",
    quote: "别乱碰开关，线路会记住你的房间号。",
  },
  {
    id: "N-014",
    type: "npc",
    floor: "B1",
    displayName: "洗衣房阿姨",
    fallbackLocation: "地下室洗衣房",
  },
  {
    id: "N-015",
    type: "npc",
    floor: "B1",
    displayName: "麟泽",
    fallbackLocation: "B1 安全中枢",
  },
  {
    id: "N-020",
    type: "npc",
    floor: "B1",
    displayName: "灵伤",
    fallbackLocation: "B1 储物间",
  },
] as const;

export const B1_NPC_CODEX_TOTAL = B1_NPC_CODEX_SLOTS.length;
