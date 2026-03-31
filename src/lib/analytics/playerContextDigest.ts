type Digest = {
  worldFlags: string[];
  professionCertified: boolean;
  professionTrialOffered: boolean;
  professionTrialAccepted: boolean;
  professionCurrent: string | null;
  weaponId: string | null;
  weaponContamination: number | null;
  weaponRepairable: boolean | null;
  weaponNeedsMaintenance: boolean;
  weaponPollutionHigh: boolean;
  guideHitLiu: boolean;
  guideHitLinz: boolean;
};

const WORLD_FLAGS_RE = /世界标记：([^。]+)。/;
const PROFESSION_RE = /职业状态：当前\[([^\]]+)]，已认证\[([^\]]*)]，可认证\[([^\]]*)]，被动\[([^\]]*)]/;
const EQUIPPED_WEAPON_RE =
  /主手武器\[([^\]|]+)\|稳定(\d+)\|反制([^|\]]*)(?:\|模组([^|\]]*))?(?:\|灌注([^|\]]*))?(?:\|污染(\d+))?(?:\|可修复([01]))?\]/;

function splitList(raw: string): string[] {
  const t = String(raw ?? "").trim();
  if (!t || t === "无") return [];
  return t
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 64);
}

export function buildPlayerContextDigest(playerContext: string): Digest {
  const flags = splitList(playerContext.match(WORLD_FLAGS_RE)?.[1] ?? "");

  const pm = playerContext.match(PROFESSION_RE);
  const cur = (pm?.[1] ?? "").trim();
  const professionCurrent = cur && cur !== "无" ? cur : null;

  const professionCertified =
    flags.some((f) => f.startsWith("profession.certified.")) ||
    String(pm?.[2] ?? "")
      .split("/")
      .map((x) => x.trim())
      .filter(Boolean)
      .some((x) => x !== "无");
  const professionTrialOffered = flags.some((f) => f.startsWith("profession.trial.offered."));
  const professionTrialAccepted = flags.some((f) => f.startsWith("profession.trial.accepted."));

  const wm = playerContext.match(EQUIPPED_WEAPON_RE);
  const weaponId = (wm?.[1] ?? "").trim() || null;
  const stability = wm?.[2] ? Number(wm[2]) : NaN;
  const contamination = wm?.[6] ? Number(wm[6]) : NaN;
  const weaponContamination = Number.isFinite(contamination) ? Math.max(0, Math.min(100, Math.trunc(contamination))) : null;
  const weaponRepairable = wm?.[7] === "1" ? true : wm?.[7] === "0" ? false : null;
  const st = Number.isFinite(stability) ? Math.max(0, Math.min(100, Math.trunc(stability))) : 0;
  const c = typeof weaponContamination === "number" ? weaponContamination : 0;
  const weaponNeedsMaintenance = weaponRepairable === true && (st < 65 || c >= 40);
  const weaponPollutionHigh = c >= 70;

  const guideHitLiu = playerContext.includes("电工老刘") || playerContext.includes("N-008");
  const guideHitLinz = playerContext.includes("麟泽") || playerContext.includes("N-015");

  return {
    worldFlags: flags,
    professionCertified,
    professionTrialOffered,
    professionTrialAccepted,
    professionCurrent,
    weaponId,
    weaponContamination,
    weaponRepairable,
    weaponNeedsMaintenance,
    weaponPollutionHigh,
    guideHitLiu,
    guideHitLinz,
  };
}

export function inferWeaponizationAttempted(latestUserText: string): boolean {
  const t = String(latestUserText ?? "").toLowerCase();
  return t.includes("forge_weaponize_") || /武器化|锻造/.test(t) && /weaponize|forge_weaponize/.test(t);
}

