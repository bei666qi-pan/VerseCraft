import type { Item, Weapon } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import { PROFESSION_REGISTRY } from "@/lib/profession/registry";
import { computeWeaponMaintenanceBand } from "./weaponLifecycle";

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function weaponStyleTags(w: Weapon | null): string[] {
  if (!w) return [];
  const tags = Array.isArray((w as any).counterTags) ? (w as any).counterTags : [];
  const mods = Array.isArray((w as any).currentMods) ? (w as any).currentMods : [];
  const inf = Array.isArray((w as any).currentInfusions) ? (w as any).currentInfusions : [];
  const infusionTags = inf
    .map((x: any) => String(x?.threatTag ?? ""))
    .filter(Boolean)
    .slice(0, 2);
  return Array.from(new Set([...tags, ...mods, ...infusionTags])).slice(0, 6);
}

export function buildWeaponStrategyDigest(args: {
  weapon: Weapon | null;
  profession: ProfessionId | null;
  mainThreatSummary?: string;
}): { title: string; whyCarry: string; keepOrSwap: string; maintenance: string; professionBias: string } {
  const w = args.weapon;
  if (!w) {
    return {
      title: "主手：空",
      whyCarry: "你现在没有主手对策。短期内你会更依赖运气与NPC援手。",
      keepOrSwap: "建议：先凑出一把能稳定执行的工具型主手，再谈深入。",
      maintenance: "维护：无",
      professionBias: args.profession ? `你的职业倾向（${args.profession}）会影响你适合的武器风格。` : "职业倾向会影响你适合的武器风格。",
    };
  }
  const stability = clampInt((w as any).stability ?? 0, 0, 100);
  const contamination = clampInt((w as any).contamination ?? 0, 0, 100);
  const tags = weaponStyleTags(w);
  const band = computeWeaponMaintenanceBand(w);
  const mainThreat = args.mainThreatSummary ? `当前局面：${args.mainThreatSummary}` : "";

  const whyCarry =
    tags.length > 0
      ? `它更像一把「${tags.slice(0, 3).join(" / ")}」的对策工具：你带着它，是为了在关键回合换到窗口。`
      : "它的风格不够清晰：更像临时拿在手里的工具，但仍能当作对策锚点。";

  const keepOrSwap = (() => {
    if (band.unstableOrPolluted) return "决策：现在继续带它是在赌。要么先维护把风险压回去，要么换一把更稳的。";
    if (band.needsMaintenance) return "决策：它还能用，但你正在透支它。趁还没出事，安排一次维护。";
    return "决策：它处于可控区间，值得继续带着推进；除非你要换一种对策风格。";
  })();

  const maintenance =
    band.reasons.length > 0
      ? `稳定${stability}/污染${contamination}：${band.reasons.join("；")}`
      : `稳定${stability}/污染${contamination}：可控。`;

  const professionBias = (() => {
    if (!args.profession) return "职业联动：未认证职业时，系统不会给你额外的偏向提示。";
    const def = PROFESSION_REGISTRY[args.profession];
    return `职业联动（${args.profession}）：${def.playstyle.weaponSynergy}`;
  })();

  return {
    title: `主手：${w.name ?? "未知武器"}`,
    whyCarry: [whyCarry, mainThreat].filter(Boolean).join(" "),
    keepOrSwap,
    maintenance,
    professionBias,
  };
}

export function buildWeaponizationWhyLine(args: {
  profession: ProfessionId | null;
  inventory: Item[];
}): string {
  const p = args.profession;
  if (!p) return "武器化建议：先做一把“可靠的基础对策”，比追求高阶更重要。";
  if (p === "守灯人") return "武器化建议（守灯人）：优先稳与可控污染——窗口比爆发更值钱。";
  if (p === "巡迹客") return "武器化建议（巡迹客）：优先机动与低耗——撤离窗口要能兑现。";
  if (p === "觅兆者") return "武器化建议（觅兆者）：优先能验证标签的风格——一次正确胜过多次乱试。";
  if (p === "齐日角") return "武器化建议（齐日角）：优先威慑与边界——别让武器替你说谎。";
  return "武器化建议（溯源师）：优先可维护与可追溯来源——让每次修复都能当证据。";
}

