const LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "地下二层通道",
  B2_GatekeeperDomain: "地下二层守门领域",
  B1_SafeZone: "地下一层安全区",
  B1_Storage: "地下一层储物间",
  B1_Laundry: "地下一层洗衣房",
  B1_PowerRoom: "地下一层配电间",
  "1F_Lobby": "一楼门厅",
  "1F_PropertyOffice": "一楼物业办公室",
  "1F_GuardRoom": "一楼保安室",
  "1F_Mailboxes": "一楼信箱区",
  "2F_Clinic201": "二楼 201 诊室",
  "2F_Room202": "二楼 202 室",
  "2F_Room203": "二楼 203 室",
  "2F_Corridor": "二楼走廊",
  "3F_Room301": "三楼 301 室",
  "3F_Room302": "三楼 302 室",
  "3F_Stairwell": "三楼楼梯间",
  "4F_Room401": "四楼 401 室",
  "4F_Room402": "四楼 402 室",
  "4F_CorridorEnd": "四楼走廊尽头",
  "5F_Room501": "五楼 501 室",
  "5F_Room502": "五楼 502 室",
  "5F_Studio503": "五楼 503 画室",
  "6F_Room601": "六楼 601 室",
  "6F_Room602": "六楼 602 室",
  "6F_Stairwell": "六楼楼梯间",
  "7F_Room701": "七楼 701 室",
  "7F_Bench": "七楼长椅区",
  "7F_Kitchen": "七楼厨房",
  "7F_SealedDoor": "七楼封闭门区",
};

const COMPACT_LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "B2 通道",
  B2_GatekeeperDomain: "B2 守门领域",
  B1_SafeZone: "B1 安全中枢",
  B1_Storage: "B1 储物间",
  B1_Laundry: "B1 洗衣房",
  B1_PowerRoom: "B1 配电间",
  "1F_Lobby": "1F 门厅",
  "1F_PropertyOffice": "1F 物业办公室",
  "1F_GuardRoom": "1F 保安室",
  "1F_Mailboxes": "1F 信箱区",
  "2F_Clinic201": "2F 201 诊室",
  "2F_Room202": "2F 202 室",
  "2F_Room203": "2F 203 室",
  "2F_Corridor": "2F 走廊",
  "3F_Room301": "3F 301 室",
  "3F_Room302": "3F 302 室",
  "3F_Stairwell": "3F 楼梯间",
  "4F_Room401": "4F 401 室",
  "4F_Room402": "4F 402 室",
  "4F_CorridorEnd": "4F 走廊尽头",
  "5F_Room501": "5F 501 室",
  "5F_Room502": "5F 502 室",
  "5F_Studio503": "5F 503 画室",
  "6F_Room601": "6F 601 室",
  "6F_Room602": "6F 602 室",
  "6F_Stairwell": "6F 楼梯间",
  "7F_Room701": "7F 701 室",
  "7F_Bench": "7F 长椅区",
  "7F_Kitchen": "7F 厨房",
  "7F_SealedDoor": "7F 封闭门区",
};

export function formatLocationLabel(location: string | null | undefined): string {
  const key = String(location ?? "").trim();
  if (!key) return "未知区域";
  return LOCATION_LABELS[key] ?? "未知区域";
}

export function formatCompactLocationLabel(location: string | null | undefined): string {
  const key = String(location ?? "").trim();
  if (!key) return "未知区域";
  return COMPACT_LOCATION_LABELS[key] ?? LOCATION_LABELS[key] ?? "未知区域";
}
