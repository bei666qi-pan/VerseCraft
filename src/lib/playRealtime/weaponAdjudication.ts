import { getWeaponById } from "@/lib/registry/weapons";
import { guessPlayerLocationFromContext } from "@/lib/playRealtime/b1Safety";

type DmRecord = Record<string, unknown>;

type ThreatPhase = "idle" | "active" | "suppressed" | "breached";

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function inferFloorIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  if (location.startsWith("B2_")) return "B2";
  if (location.startsWith("B1_")) return "B1";
  const m = location.match(/^(\d)F_/);
  return m?.[1] ?? null;
}

function parseEquippedWeaponFromPlayerContext(playerContext: string): {
  weaponId: string | null;
  stability: number | null;
  counterTags: string[];
  mods: string[];
  infusions: Array<{ threatTag: "liquid" | "mirror" | "cognition" | "seal"; turnsLeft: number }>;
  contamination: number | null;
  repairable: boolean | null;
} {
  const m = playerContext.match(
    /主手武器\[([^\]|]+)\|稳定(\d+)\|反制([^|\]]*)(?:\|模组([^|\]]*))?(?:\|灌注([^|\]]*))?(?:\|污染(\d+))?(?:\|可修复([01]))?\]/
  );
  if (!m) {
    return { weaponId: null, stability: null, counterTags: [], mods: [], infusions: [], contamination: null, repairable: null };
  }
  const weaponId = (m[1] ?? "").trim() || null;
  const stabilityRaw = Number(m[2] ?? "0");
  const counterTags = (m[3] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "无");
  const mods = (m[4] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "无");
  const infusions = (m[5] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x.includes(":"))
    .map((x) => {
      const [threatTag, turnsLeft] = x.split(":");
      return {
        threatTag: threatTag as "liquid" | "mirror" | "cognition" | "seal",
        turnsLeft: Number(turnsLeft ?? "0") || 0,
      };
    })
    .filter((x) => x.turnsLeft > 0);
  const contaminationRaw = Number(m[6] ?? "NaN");
  const repairable = m[7] === "1" ? true : m[7] === "0" ? false : null;
  return {
    weaponId,
    stability: Number.isFinite(stabilityRaw) ? clampInt(stabilityRaw, 0, 100) : null,
    counterTags,
    mods,
    infusions,
    contamination: Number.isFinite(contaminationRaw) ? clampInt(contaminationRaw, 0, 100) : null,
    repairable,
  };
}

function stableRand01(seed: string): number {
  // Deterministic pseudo-rand [0,1) using FNV-like hashing.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to [0,1)
  const u = (h >>> 0) / 2 ** 32;
  return u;
}

function classifyThreatTags(threatId: string | null): string[] {
  if (!threatId) return [];
  // 最小闭环：先覆盖现有异常表的明确语义；后续可迁移到 registry 的 threatTags。
  const map: Record<string, string[]> = {
    "A-001": ["time", "anchor"],
    "A-002": ["sound", "silence"],
    "A-003": ["cognition"],
    "A-004": ["liquid", "conductive"],
    "A-005": ["flesh", "binding"],
    "A-006": ["mirror", "direction"],
    "A-007": ["seal", "door"],
    "A-008": ["seal", "cognition", "liquid"],
  };
  return map[threatId] ?? [];
}

function intersects(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a.map((x) => x.toLowerCase()));
  return b.some((x) => set.has(String(x).toLowerCase()));
}

function isHighRiskThreatAction(latestUserInput: string, threatPhase: ThreatPhase, baseSanityDamage: number): boolean {
  const t = String(latestUserInput ?? "");
  if (baseSanityDamage > 0) return true;
  if (threatPhase === "active" || threatPhase === "breached") {
    return /(压制|突破|硬闯|攻击|对抗|封|闯|搏|冲|追|强行)/.test(t);
  }
  return /(压制|威胁|异常|诡异|对抗)/.test(t);
}

function appendNarrative(record: DmRecord, line: string) {
  const prev = typeof record.narrative === "string" ? record.narrative : "";
  record.narrative = prev ? `${prev}\n\n${line}` : line;
}

function ensureWeaponUpdatesArray(record: DmRecord): Array<Record<string, unknown>> {
  const prev = Array.isArray(record.weapon_updates)
    ? (record.weapon_updates as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
  record.weapon_updates = prev;
  return prev;
}

function pickPrimaryThreatUpdate(record: DmRecord, floorId: string | null): Record<string, unknown> | null {
  const updates = Array.isArray(record.main_threat_updates)
    ? (record.main_threat_updates as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
  if (updates.length === 0) return null;
  if (floorId) {
    const hit = updates.find((u) => typeof u.floorId === "string" && u.floorId === floorId);
    if (hit) return hit;
  }
  return updates[0] ?? null;
}

/**
 * 武器战术裁决（最小稳定闭环，服务端终帧生效）。
 *
 * 目标：
 * - 武器必须影响主威胁应对，但不抹除危险（只“降低风险/给窗口/改变消耗”）。
 * - 失配/污染/稳定度低必须产生失败后果（污染堆积、失稳、额外精神损耗等）。
 * - 模型只负责叙事描述；系统负责最终生效与结构化回写。
 *
 * 输入依赖：
 * - dmRecord: 已经通过 normalize + mainThreatGuard 的结构化输出（含 sanity_damage / main_threat_updates）。
 * - playerContext: 用于读取当前装备武器的“真实状态快照”（当前仍可被改包，但至少能锁定效果边界）。
 */
export function applyWeaponTacticalAdjudication(args: {
  dmRecord: DmRecord;
  playerContext: string;
  latestUserInput: string;
  requestId: string;
}): DmRecord {
  const next = { ...args.dmRecord };
  const baseDamageRaw = Number(next.sanity_damage ?? 0);
  const baseDamage = Number.isFinite(baseDamageRaw) ? clampInt(baseDamageRaw, 0, 9999) : 0;

  const location =
    (typeof next.player_location === "string" ? next.player_location : null) ??
    guessPlayerLocationFromContext(args.playerContext);
  const floorId = inferFloorIdFromLocation(location);
  const threatUpdate = pickPrimaryThreatUpdate(next, floorId);
  const threatId = threatUpdate && typeof threatUpdate.threatId === "string" ? threatUpdate.threatId : null;
  const phase = (threatUpdate && typeof threatUpdate.phase === "string" ? threatUpdate.phase : "idle") as ThreatPhase;
  const highRisk = isHighRiskThreatAction(args.latestUserInput, phase, baseDamage);

  // 只在“确实是威胁相关高风险回合”介入，避免武器变成所有行动的万能加减器。
  if (!highRisk) return next;

  const w = parseEquippedWeaponFromPlayerContext(args.playerContext);
  const hasWeapon = Boolean(w.weaponId);

  // 没有武器：某些高风险动作更危险（规则 4）。
  if (!hasWeapon) {
    const extra = phase === "active" || phase === "breached" ? 1 : 0;
    if (extra > 0) {
      next.sanity_damage = baseDamage + extra;
      appendNarrative(next, "你没有装备武器，面对主威胁的动作更容易被反噬，精神损耗加剧。");
    }
    return next;
  }

  const baseWeapon = getWeaponById(w.weaponId);
  const counterThreatIds = baseWeapon?.counterThreatIds ?? [];
  const threatTags = classifyThreatTags(threatId);

  const directThreatMatch = Boolean(threatId) && counterThreatIds.includes(threatId!);
  const tagMatch = intersects(w.counterTags ?? [], threatTags);
  const modTags = (w.mods ?? []).map((x) => String(x).toLowerCase());
  const modMatch =
    (modTags.includes("mirror") && threatTags.includes("mirror")) ||
    (modTags.includes("silent") && threatTags.includes("sound")) ||
    (modTags.includes("conductive") && threatTags.includes("liquid")) ||
    (modTags.includes("anti_pollution") && (threatTags.includes("cognition") || threatTags.includes("liquid"))) ||
    (modTags.includes("echo_lure") && threatTags.includes("sound")) ||
    (modTags.includes("grappling") && (phase === "breached" || phase === "active"));

  const infusionActive = (w.infusions ?? []).find((x) => x.turnsLeft > 0 && threatTags.includes(String(x.threatTag)));
  const infusionMatch = Boolean(infusionActive);

  const stability = w.stability ?? 60;
  const contamination = w.contamination ?? 0;

  // 可靠性：稳定度越高越可靠；污染越高越容易故障/反噬。
  const reliabilityBase =
    0.25 +
    clampInt(stability, 0, 100) * 0.0065 -
    clampInt(contamination, 0, 100) * 0.004;
  const reliability = Math.max(0.1, Math.min(0.92, reliabilityBase));
  const roll = stableRand01(`${args.requestId}:${w.weaponId}:${threatId ?? "none"}:${args.latestUserInput}`);
  const reliable = roll < reliability;

  // 评分：直接对威胁命中 > 标签命中 > 模组/灌注修正
  const matchScore =
    (directThreatMatch ? 3 : 0) +
    (!directThreatMatch && tagMatch ? 2 : 0) +
    (modMatch ? 1 : 0) +
    (infusionMatch ? 2 : 0);

  // 武器总是有代价：威胁回合默认轻微累积污染（闭环：锻造维护有意义）
  const baseContamGain = directThreatMatch || tagMatch || infusionMatch ? 2 : 5;
  const contamGain = clampInt(baseContamGain + (reliable ? 0 : 4), 0, 15);
  const stabilityLoss = clampInt((reliable ? 1 : 5) + (matchScore <= 1 ? 2 : 0), 0, 12);

  // 效果：只降低风险/给窗口/改变消耗，不直接清空危险
  let dmgDelta = 0;
  let suppressionDelta = 0;
  let fault = false;
  let repairable = w.repairable ?? true;

  if (!reliable) {
    fault = true;
    // 故障：额外精神损耗 + 失稳更严重
    dmgDelta += 1;
    suppressionDelta += 0;
    // 高污染故障会触发“不可维护”一段时间（需回 B1 处理），作为硬后果
    if (contamination >= 70) repairable = false;
  } else if (matchScore >= 4) {
    // 正确武器 + 有灌注/模组加成：强优势，但仍留至少 1 点伤害（除非本来就是 0）
    if (baseDamage > 0) dmgDelta -= Math.min(2, Math.max(0, baseDamage - 1));
    suppressionDelta += 15;
  } else if (matchScore >= 3) {
    // 直接命中 counterThreatIds：中强优势
    if (baseDamage > 0) dmgDelta -= Math.min(1, Math.max(0, baseDamage - 1));
    suppressionDelta += 12;
  } else if (matchScore >= 2) {
    // 标签/模组命中：中等优势
    if (baseDamage > 0) dmgDelta -= 1;
    suppressionDelta += 8;
  } else {
    // 装备错误武器硬闯：更危险（污染/失稳更快；并可能多吃 1 伤害）
    dmgDelta += phase === "active" || phase === "breached" ? 1 : 0;
    suppressionDelta += 0;
  }

  const nextDamage = clampInt(baseDamage + dmgDelta, 0, 9999);
  next.sanity_damage = nextDamage;

  // 写回主威胁窗口：只提供“窗口/进度”，不直接跳 suppressed
  if (threatUpdate && suppressionDelta > 0) {
    const prevProg = Number(threatUpdate.suppressionProgress ?? 0);
    const safePrev = Number.isFinite(prevProg) ? clampInt(prevProg, 0, 100) : 0;
    threatUpdate.suppressionProgress = clampInt(safePrev + suppressionDelta, 0, 100);
    // 只在进度很高且不是 active breach 的情况下，允许提升到 suppressed（给“窗口”，不等于免死）
    const phaseNow = typeof threatUpdate.phase === "string" ? threatUpdate.phase : "idle";
    if ((phaseNow === "active" || phaseNow === "breached") && (threatUpdate.suppressionProgress as number) >= 85) {
      threatUpdate.phase = "suppressed";
    }
  }

  // 写回武器状态（污染/稳定度/repairable）
  const wu = ensureWeaponUpdatesArray(next);
  wu.push({
    weaponId: w.weaponId,
    contamination: clampInt((contamination ?? 0) + contamGain, 0, 100),
    stability: clampInt((stability ?? 60) - stabilityLoss, 0, 100),
    repairable,
  });

  // 叙事兜底：告诉 DM “系统裁决生效”，避免胡写神兵无敌
  const summary = [
    directThreatMatch ? "反制命中" : tagMatch || modMatch || infusionMatch ? "部分命中" : "失配",
    fault ? "故障" : "稳定",
    `可靠性${Math.round(reliability * 100)}%`,
    `污染+${contamGain}`,
    `稳定-${stabilityLoss}`,
  ].join("·");
  appendNarrative(next, `（战术裁决）武器介入：${summary}。`);

  // 结构化审计：写入 security_meta，供反作弊/追责（不影响前端契约）
  const meta =
    next.security_meta && typeof next.security_meta === "object" && !Array.isArray(next.security_meta)
      ? (next.security_meta as Record<string, unknown>)
      : {};
  next.security_meta = {
    ...meta,
    weapon_adjudication: {
      threatId,
      phase,
      hasWeapon,
      weaponId: w.weaponId,
      directThreatMatch,
      tagMatch,
      modMatch,
      infusionMatch,
      reliability: Number(reliability.toFixed(2)),
      roll: Number(roll.toFixed(4)),
      fault,
      baseDamage,
      finalDamage: nextDamage,
      suppressionDelta,
    },
  };

  return next;
}

