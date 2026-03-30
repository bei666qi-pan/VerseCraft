/**
 * NPC 对玩家的初始认知与特权熟悉感风味（结构化，供 packet / prompt / 测试）。
 */

import { MAJOR_NPC_IDS, type MajorNpcId } from "./majorNpcDeepCanon";
import { NIGHT_READER_NPC_ID } from "./npcCanonBuilders";
import { MONTHLY_INTRUSION_RESIDENT_BASELINE } from "./monthlyIntrusionModel";

export { NIGHT_READER_NPC_ID };

export type FamiliarityIntensity = 1 | 2 | 3 | 4 | 5;

/** 熟悉感演出模式：六人 + 夜读各不相同，禁止同质化 */
export type MajorFamiliarityMode =
  | "brick_rhythm_alarm"
  | "broadcast_hollow_beat"
  | "list_tear_anxiety"
  | "ledger_deja_debt"
  | "script_glitch_shame"
  | "outline_flush_silent"
  | "page_weight_pause";

export type OrdinaryNpcRecognitionOfPlayer = {
  category: "ordinary";
  npcId: string;
  knowsMonthlyStudentsExist: true;
  recognizesPlayerAs: "intruded_student";
  recognizesPlayerAsOldFriend: false;
  expectsPlayerToDieSoon: "usually_yes_some_exceptions";
  treatAs: "another_monthly_student_first";
};

export type PrivilegedNpcRecognitionOfPlayer = {
  category: "major_charm" | "xinlan" | "night_reader";
  npcId: string;
  canFeelFamiliarity: true;
  familiarityMode: MajorFamiliarityMode;
  familiarityIntensity: FamiliarityIntensity;
  /** 仍禁止开局直认、直述完整过去 */
  revealPacingCapped: true;
  /** 给 DM 的短提示，非对白正文 */
  promptPerformanceHints: readonly string[];
};

export type NpcInitialRecognitionSnapshot = OrdinaryNpcRecognitionOfPlayer | PrivilegedNpcRecognitionOfPlayer;

const MAJOR_FLAVOR: Record<
  MajorNpcId,
  { mode: MajorFamiliarityMode; intensity: FamiliarityIntensity; hints: readonly string[] }
> = {
  "N-015": {
    mode: "brick_rhythm_alarm",
    intensity: 3,
    hints: [
      "熟悉感落在脚步与站位：像听过同一串落地声，但否认记得人。",
      "越界时先身体拦、后找词，像防重复事故而非迎客。",
    ],
  },
  "N-020": {
    mode: "broadcast_hollow_beat",
    intensity: 3,
    hints: [
      "心悸跟着你的步频走，像空白频段被填满；用玩笑盖住半拍停顿。",
      "不提旧人姓名；安抚句式过熟，像播过太多次。",
    ],
  },
  "N-010": {
    mode: "list_tear_anxiety",
    intensity: 5,
    hints: [
      "名单末行被撕的焦虑最强：看你像看一道缺角，但不叫出那个缺角的名字。",
      "先问目的地再建议；拒代选；熟悉感强仍分层吐词，禁止单回合说尽根因。",
    ],
  },
  "N-018": {
    mode: "ledger_deja_debt",
    intensity: 3,
    hints: [
      "欠条体感：笑还在，价码先硬；像见过没撕干净的互助券。",
      "熟悉感走交易语法，不走温情相认。",
    ],
  },
  "N-013": {
    mode: "script_glitch_shame",
    intensity: 4,
    hints: [
      "像看见写坏的台词在走：耻感与利用拧在一起，绝不一口喊破旧稿标题。",
      "示弱是钩子，熟悉感表现为「场次错了」的短暂失神。",
    ],
  },
  "N-007": {
    mode: "outline_flush_silent",
    intensity: 3,
    hints: [
      "轮廓与线条先响：侧脸像烫到，立刻缩回冷淡壳。",
      "熟悉感是保护性违和，不是相认拥抱。",
    ],
  },
};

const NIGHT_READER_FLAVOR = {
  mode: "page_weight_pause" as const,
  intensity: 4 as const,
  hints: [
    "熟悉感像书页重量压在膝上：停顿、目光落点偏一寸，不点名不写死期台词给玩家听。",
    "与登记口的名单张力并存，不与六人共用同一种「心悸」模板。",
  ],
};

export function getNpcFamiliarityFlavor(npcId: string): {
  mode: MajorFamiliarityMode;
  intensity: FamiliarityIntensity;
  promptPerformanceHints: readonly string[];
} | null {
  const id = String(npcId ?? "").trim();
  if (id === NIGHT_READER_NPC_ID) {
    return {
      mode: NIGHT_READER_FLAVOR.mode,
      intensity: NIGHT_READER_FLAVOR.intensity,
      promptPerformanceHints: NIGHT_READER_FLAVOR.hints,
    };
  }
  if (MAJOR_NPC_IDS.includes(id as MajorNpcId)) {
    const row = MAJOR_FLAVOR[id as MajorNpcId];
    return {
      mode: row.mode,
      intensity: row.intensity,
      promptPerformanceHints: row.hints,
    };
  }
  return null;
}

export function buildNpcInitialRecognitionOfPlayer(npcId: string): NpcInitialRecognitionSnapshot {
  const id = String(npcId ?? "").trim();
  if (!id) {
    return {
      category: "ordinary",
      npcId: "",
      knowsMonthlyStudentsExist: true,
      recognizesPlayerAs: "intruded_student",
      recognizesPlayerAsOldFriend: false,
      expectsPlayerToDieSoon: MONTHLY_INTRUSION_RESIDENT_BASELINE.expectsNewcomerToDieSoon,
      treatAs: "another_monthly_student_first",
    };
  }

  if (id === NIGHT_READER_NPC_ID) {
    return {
      category: "night_reader",
      npcId: id,
      canFeelFamiliarity: true,
      familiarityMode: NIGHT_READER_FLAVOR.mode,
      familiarityIntensity: NIGHT_READER_FLAVOR.intensity,
      revealPacingCapped: true,
      promptPerformanceHints: NIGHT_READER_FLAVOR.hints,
    };
  }

  if (MAJOR_NPC_IDS.includes(id as MajorNpcId)) {
    const row = MAJOR_FLAVOR[id as MajorNpcId];
    return {
      category: id === "N-010" ? "xinlan" : "major_charm",
      npcId: id,
      canFeelFamiliarity: true,
      familiarityMode: row.mode,
      familiarityIntensity: row.intensity,
      revealPacingCapped: true,
      promptPerformanceHints: row.hints,
    };
  }

  return {
    category: "ordinary",
    npcId: id,
    knowsMonthlyStudentsExist: MONTHLY_INTRUSION_RESIDENT_BASELINE.knowsMonthlyStudentsExist,
    recognizesPlayerAs: "intruded_student",
    recognizesPlayerAsOldFriend: MONTHLY_INTRUSION_RESIDENT_BASELINE.defaultRecognizesAsOldFriend,
    expectsPlayerToDieSoon: MONTHLY_INTRUSION_RESIDENT_BASELINE.expectsNewcomerToDieSoon,
    treatAs: "another_monthly_student_first",
  };
}

/** 附近多人时给 packet 的紧凑列表（上限 n） */
export function buildNearbyNpcRecognitionPacketRows(
  npcIds: readonly string[],
  max = 6
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const raw of npcIds) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const snap = buildNpcInitialRecognitionOfPlayer(id);
    if (snap.category === "ordinary") {
      out.push({
        npcId: id,
        bucket: "ordinary_monthly_intrusion_baseline",
        knowsMonthlyStudentsExist: snap.knowsMonthlyStudentsExist,
        recognizesPlayerAs: snap.recognizesPlayerAs,
        recognizesPlayerAsOldFriend: snap.recognizesPlayerAsOldFriend,
        expectsPlayerToDieSoon: snap.expectsPlayerToDieSoon,
      });
    } else {
      out.push({
        npcId: id,
        bucket: snap.category,
        familiarityMode: snap.familiarityMode,
        familiarityIntensity: snap.familiarityIntensity,
        revealPacingCapped: snap.revealPacingCapped,
        performanceHints: snap.promptPerformanceHints.slice(0, 2),
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

export { isMonthlyIntrusionNpcCommonSense } from "./monthlyIntrusionModel";
