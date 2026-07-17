import type { GameLanguage } from "./language";

export function languageText(language: GameLanguage, zh: string, en: string): string {
  return language === "en-US" ? en : zh;
}

export const ENGLISH_STAT_LABELS = {
  sanity: "Sanity",
  agility: "Agility",
  luck: "Luck",
  charm: "Charm",
  background: "Origin",
} as const;

export const ENGLISH_PROFESSION_LABELS: Record<string, string> = {
  守灯人: "Lamp Keeper",
  巡迹客: "Trail Seeker",
  觅兆者: "Omen Seeker",
  齐日角: "Dayhorn",
  溯源师: "Source Seeker",
};

export const ENGLISH_TALENT_LABELS: Record<string, string> = {
  时间回溯: "Time Rewind",
  命运馈赠: "Gift of Fate",
  主角光环: "Hero's Halo",
  生命汇源: "Life Spring",
  洞察之眼: "Eye of Insight",
  丧钟回响: "Deathbell Echo",
};

export function localizedTalentName(language: GameLanguage, talent: string | null | undefined): string | null {
  if (!talent) return null;
  return language === "en-US" ? ENGLISH_TALENT_LABELS[talent] ?? talent : talent;
}

const ENGLISH_LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "B2 Passage", B2_GatekeeperDomain: "B2 Gatekeeper Domain", B1_SafeZone: "B1 Safe Hub",
  B1_Storage: "B1 Storage", B1_Laundry: "B1 Laundry", B1_PowerRoom: "B1 Power Room",
  "1F_Lobby": "1F Lobby", "1F_PropertyOffice": "1F Property Office", "1F_GuardRoom": "1F Guard Room",
  "1F_Mailboxes": "1F Mailboxes", "2F_Clinic201": "2F Clinic 201", "2F_Room202": "2F Room 202",
  "2F_Room203": "2F Room 203", "2F_Corridor": "2F Corridor", "3F_Room301": "3F Room 301",
  "3F_Room302": "3F Room 302", "3F_Stairwell": "3F Stairwell", "4F_Room401": "4F Room 401",
  "4F_Room402": "4F Room 402", "4F_CorridorEnd": "4F Corridor End", "5F_Room501": "5F Room 501",
  "5F_Room502": "5F Room 502", "5F_Studio503": "5F Studio 503", "6F_Room601": "6F Room 601",
  "6F_Room602": "6F Room 602", "6F_Stairwell": "6F Stairwell", "7F_Room701": "7F Room 701",
  "7F_Bench": "7F Bench Area", "7F_Kitchen": "7F Kitchen", "7F_SealedDoor": "7F Sealed Door",
};

export function formatLocalizedLocation(language: GameLanguage, location: string | null | undefined, fallback: string): string {
  if (language !== "en-US") return fallback;
  return ENGLISH_LOCATION_LABELS[String(location ?? "").trim()] ?? fallback;
}

const ENGLISH_CODEX_NAMES: Record<string, string> = {
  "N-001": "Grandma Chen", "N-002": "Dr. Lin", "N-003": "Old Wang, the Postman", "N-004": "A-Hua",
  "N-005": "Uncle Zhou", "N-006": "Mr. Zhang, Retired Teacher", "N-007": "Ye", "N-008": "Old Liu, Electrician",
  "N-009": "A-Zhi", "N-010": "Xinlan", "N-011": "The Night Reader", "N-012": "Master Tao", "N-013": "Feng",
  "N-014": "The Laundry Auntie", "N-015": "Linze", "N-016": "Sister Zhang", "N-017": "Aunt Hong", "N-018": "Beixia",
  "N-019": "Former Investigator", "N-020": "Spirit Wound", "N-021": "A-Xiu", "N-022": "Old Ma",
  "N-023": "Aunt Blue Basin", "N-024": "The Hunched Elder", "N-025": "A-Shou, Night Watch", "N-026": "Switch Sister",
  "N-027": "The Pajama Sisters", "N-028": "Old Wu, Night Watch", "N-029": "Zhou at Reception", "N-030": "Master Zhang, Hallway",
  "N-031": "Old Xie, Former Studio Tenant", "N-032": "Old Chen of the Corridor", "N-033": "Old Wu, 7F Resident",
  "N-034": "A-Zhen, 7F Lamplighter", "N-035": "Lobby Night-Shift Barista", "N-036": "Old Qin, Visitor Registrar",
  "N-037": "Aunt Fang, Retired 2F Carer", "N-038": "A-Fang, 3F Stair Resident", "N-039": "Teacher Wang, 4F",
  "N-040": "Xiaolin, 5F Art Student", "N-041": "Xiao Zheng, 6F Night Owl", "N-042": "Old Zhuang, 7F Window Elder",
  "N-043": "Old Qian, B1 Boiler Worker", "N-044": "Liao An", "N-045": "Su Mi",
  "A-001": "Temporal Lag Syndrome", "A-002": "Headless Hound", "A-003": "Cognitive Corroder",
  "A-004": "Butcher in the Pipes", "A-005": "Organ-Mimic Wall", "A-006": "Stairwell Backwalker",
  "A-007": "The Thirteenth-Floor Door", "A-008": "Abyss Gatekeeper",
};

export function localizedCodexName(language: GameLanguage, id: string, fallback: string): string {
  return language === "en-US" ? ENGLISH_CODEX_NAMES[id] ?? fallback : fallback;
}
