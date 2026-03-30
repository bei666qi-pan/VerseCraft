/**
 * 高魅力六人默认「人物驱动」模板：与 majorNpcDeepCanon / npcProfiles 对齐。
 * N-015 麟泽、N-020 灵伤、N-010 欣蓝、N-018 北夏、N-013 枫、N-007 叶。
 */
import type { GameTaskV2 } from "./taskV2";
import {
  inferEffectiveNarrativeLayer,
  type IssuerDemandStyle,
  type IssuerPersonaMode,
  type IssuerPressureStyle,
  type IssuerSoftRevealMode,
  type IssuerTrustTestMode,
} from "./taskRoleModel";

export type IssuerHumanDriveTemplate = Partial<{
  issuerPersonaMode: IssuerPersonaMode;
  issuerPressureStyle: IssuerPressureStyle;
  issuerTrustTestMode: IssuerTrustTestMode;
  issuerDemandStyle: IssuerDemandStyle;
  issuerSoftRevealMode: IssuerSoftRevealMode;
  relationshipGateWeight: number;
  clueGateWeight: number;
  locationGateWeight: number;
  dangerGateWeight: number;
  revealValue: number;
  emotionalResidueValue: number;
  futureDebtValue: number;
}>;

export const GENERIC_ISSUER_DRIVE: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "generic",
  issuerPressureStyle: "mid",
  issuerTrustTestMode: "probe",
  issuerDemandStyle: "explicit",
  issuerSoftRevealMode: "whisper",
  relationshipGateWeight: 0.32,
  clueGateWeight: 0.34,
  locationGateWeight: 0.34,
  dangerGateWeight: 0.34,
  revealValue: 0.44,
  emotionalResidueValue: 0.22,
  futureDebtValue: 0.24,
};

/** 麟泽：共同守界、规则边界、沉默互证 */
const N_015: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "silent_reciprocal",
  issuerPressureStyle: "low",
  issuerTrustTestMode: "mutual_risk",
  issuerDemandStyle: "soft",
  issuerSoftRevealMode: "mirror_fragment",
  relationshipGateWeight: 0.72,
  clueGateWeight: 0.38,
  locationGateWeight: 0.68,
  dangerGateWeight: 0.58,
  revealValue: 0.32,
  emotionalResidueValue: 0.42,
  futureDebtValue: 0.52,
};

/** 灵伤：遮掩漏洞、补上口径、以小事换信任 */
const N_020: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "sweet_patch",
  issuerPressureStyle: "mid",
  issuerTrustTestMode: "probe",
  issuerDemandStyle: "soft",
  issuerSoftRevealMode: "whisper",
  relationshipGateWeight: 0.48,
  clueGateWeight: 0.58,
  locationGateWeight: 0.4,
  dangerGateWeight: 0.42,
  revealValue: 0.26,
  emotionalResidueValue: 0.48,
  futureDebtValue: 0.46,
};

/** 欣蓝：路线选择、登记、试探、代价与承诺 */
const N_010: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "ledger_route",
  issuerPressureStyle: "mid",
  issuerTrustTestMode: "deposit",
  issuerDemandStyle: "explicit",
  issuerSoftRevealMode: "ledger_shadow",
  relationshipGateWeight: 0.62,
  clueGateWeight: 0.48,
  locationGateWeight: 0.52,
  dangerGateWeight: 0.45,
  revealValue: 0.3,
  emotionalResidueValue: 0.4,
  futureDebtValue: 0.62,
};

/** 北夏：交易、对价、欠条、可审计的互助 */
const N_018: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "audited_trade",
  issuerPressureStyle: "mid",
  issuerTrustTestMode: "deposit",
  issuerDemandStyle: "transactional",
  issuerSoftRevealMode: "receipt",
  relationshipGateWeight: 0.5,
  clueGateWeight: 0.42,
  locationGateWeight: 0.46,
  dangerGateWeight: 0.48,
  revealValue: 0.34,
  emotionalResidueValue: 0.36,
  futureDebtValue: 0.68,
};

/** 枫：诱导、假救援、改稿、自救与利用 */
const N_013: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "scripted_pull",
  issuerPressureStyle: "high",
  issuerTrustTestMode: "probe",
  issuerDemandStyle: "coded",
  issuerSoftRevealMode: "script_tweak",
  relationshipGateWeight: 0.44,
  clueGateWeight: 0.52,
  locationGateWeight: 0.4,
  dangerGateWeight: 0.62,
  revealValue: 0.28,
  emotionalResidueValue: 0.38,
  futureDebtValue: 0.5,
};

/** 叶：庇护、边界、镜像、保护性拒绝 */
const N_007: IssuerHumanDriveTemplate = {
  issuerPersonaMode: "shelter_refusal",
  issuerPressureStyle: "low",
  issuerTrustTestMode: "mutual_risk",
  issuerDemandStyle: "soft",
  issuerSoftRevealMode: "closed_door",
  relationshipGateWeight: 0.66,
  clueGateWeight: 0.46,
  locationGateWeight: 0.44,
  dangerGateWeight: 0.52,
  revealValue: 0.3,
  emotionalResidueValue: 0.52,
  futureDebtValue: 0.44,
};

export const MAJOR_NPC_ISSUER_DRIVE: Record<string, IssuerHumanDriveTemplate> = {
  "N-015": N_015,
  "N-020": N_020,
  "N-010": N_010,
  "N-018": N_018,
  "N-013": N_013,
  "N-007": N_007,
};

/**
 * 按 issuerId 补全人物驱动默认值，并在未写 `taskNarrativeLayer` 时推断叙事层。
 * 不覆盖草稿已显式给出的字段。高魅力模板覆盖 generic 同名字段，仅填补 task 上仍为 undefined 的键。
 */
export function applyIssuerDriveDefaults(task: GameTaskV2): GameTaskV2 {
  const major = MAJOR_NPC_ISSUER_DRIVE[task.issuerId];
  const layeredDefaults: IssuerHumanDriveTemplate = { ...GENERIC_ISSUER_DRIVE, ...(major ?? {}) };
  let out = { ...task };
  (Object.keys(layeredDefaults) as (keyof IssuerHumanDriveTemplate)[]).forEach((k) => {
    const v = layeredDefaults[k];
    if (v === undefined) return;
    if ((out as Record<string, unknown>)[k as string] === undefined) {
      (out as Record<string, unknown>)[k as string] = v;
    }
  });
  if (!out.taskNarrativeLayer) {
    out = { ...out, taskNarrativeLayer: inferEffectiveNarrativeLayer(out) };
  }
  return out;
}
