/**
 * 从客户端同步的 playerContext 解析世界运行信号，供揭露规则与 runtime packet 使用。
 * 仅解析已约定格式字段，未知内容忽略。
 */

const TIME_RE = /游戏时间\[第(\d+)日\s+(\d+)时\]/;
const LOCATION_RE = /用户位置\[([^\]]+)\]/;
const WORLD_FLAGS_RE = /世界标记：([^。]+)。/;
const ANCHOR_RE = /锚点解锁：B1\[(\d)\]，1F\[(\d)\]，7F\[(\d)\]/;
const REVIVE_RE = /最近复活：/;
const DEATH_COUNT_RE = /死亡累计\[(\d+)\]/;
const ORIGINIUM_RE = /原石\[(\d+)\]/;
const MAIN_THREAT_RE = /主威胁状态：([^。]+)。/;
const CODEX_RE = /图鉴已解锁：([^。]+)。/;
const FLOOR_SCORE_RE = /进度\[最高层分(\d+)\]/;
/** 本轮是否已发生锚点重构（回写）；与 worldFlags `cycle.anchor_rebuild` 二选一或并存 */
const ANCHOR_REBUILT_CYCLE_RE = /本轮锚点重构\[1\]/;

export type MainThreatPhase = "idle" | "active" | "suppressed" | "breached";

export interface PlayerWorldSignals {
  day: number;
  hour: number;
  locationNode: string | null;
  /** 自 location 推断的地上层 1–7，B1/B2 为 null */
  residentialFloorNum: number | null;
  isB1: boolean;
  isB2: boolean;
  is7F: boolean;
  worldFlags: string[];
  hasReviveLine: boolean;
  deathCount: number;
  originium: number | null;
  anchorB1: boolean;
  anchor1F: boolean;
  anchor7F: boolean;
  mainThreatByFloor: Record<string, { threatId: string; phase: MainThreatPhase; suppressionProgress: number }>;
  anyThreatSuppressedOrBreached: boolean;
  maxCodexFavorability: number;
  professionCurrent: string | null;
  professionAnyCertified: boolean;
  historicalMaxFloorScore: number;
  activeTaskTitles: string[];
  /** 当前十日窗口内是否已触发锚点重构（叙事/服务端可写入上文或 flag） */
  anchorRebuiltThisCycle: boolean;
}

function inferResidentialFloorFromNode(node: string | null): number | null {
  if (!node) return null;
  const m = node.match(/^(\d)F_/);
  if (!m) return null;
  return Number.parseInt(m[1] ?? "", 10) || null;
}

function parseMainThreatMap(raw: string): PlayerWorldSignals["mainThreatByFloor"] {
  const out: PlayerWorldSignals["mainThreatByFloor"] = {};
  const chunks = raw.split("，").map((x) => x.trim()).filter(Boolean);
  for (const c of chunks) {
    const m = c.match(/^([A-Za-z0-9]+)\[([^|\]]+)\|([^|\]]+)\|(\d+)\]$/);
    if (!m) continue;
    const floorId = m[1] ?? "";
    const threatId = m[2] ?? "";
    const phaseRaw = m[3] ?? "idle";
    const phase: MainThreatPhase =
      phaseRaw === "idle" || phaseRaw === "active" || phaseRaw === "suppressed" || phaseRaw === "breached"
        ? phaseRaw
        : "idle";
    const suppressionProgress = Math.max(0, Math.min(100, Number(m[4] ?? "0") || 0));
    if (floorId && threatId) out[floorId] = { threatId, phase, suppressionProgress };
  }
  return out;
}

function parseMaxCodexFavor(raw: string | null): number {
  if (!raw) return 0;
  let max = 0;
  const parts = raw.split("，");
  for (const p of parts) {
    const m = p.match(/好感(\d+)/);
    if (m) max = Math.max(max, Number.parseInt(m[1] ?? "0", 10) || 0);
  }
  return max;
}

function parseActiveTaskTitles(ctx: string): string[] {
  const raw = ctx.match(/任务追踪：([^。]+)。/)?.[1]?.trim();
  if (!raw) return [];
  return raw
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\[[^\]]*\]$/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function parsePlayerWorldSignals(
  playerContext: string | null | undefined,
  playerLocation: string | null
): PlayerWorldSignals {
  const ctx = String(playerContext ?? "");
  const tm = ctx.match(TIME_RE);
  const day = tm ? Number.parseInt(tm[1] ?? "1", 10) || 1 : 1;
  const hour = tm ? Number.parseInt(tm[2] ?? "0", 10) || 0 : 0;

  const locFromCtx = ctx.match(LOCATION_RE)?.[1]?.trim() ?? null;
  const locationNode = locFromCtx ?? playerLocation ?? null;

  const flagsRaw = ctx.match(WORLD_FLAGS_RE)?.[1]?.trim();
  const worldFlags =
    !flagsRaw || flagsRaw === "无"
      ? []
      : flagsRaw
          .split("，")
          .map((x) => x.trim())
          .filter(Boolean);

  const am = ctx.match(ANCHOR_RE);
  const anchorB1 = am ? am[1] === "1" : true;
  const anchor1F = am ? am[2] === "1" : true;
  const anchor7F = am ? am[3] === "1" : false;

  const mainRaw = ctx.match(MAIN_THREAT_RE)?.[1]?.trim() ?? "";
  const mainThreatByFloor = mainRaw ? parseMainThreatMap(mainRaw) : {};
  const anyThreatSuppressedOrBreached = Object.values(mainThreatByFloor).some(
    (x) => x.phase === "suppressed" || x.phase === "breached"
  );

  const profMatch = ctx.match(/职业状态：当前\[([^\]]*)\]/);
  const profCurrentRaw = (profMatch?.[1] ?? "").trim();
  const professionCurrent = profCurrentRaw && profCurrentRaw !== "无" ? profCurrentRaw : null;
  const certifiedMatch = ctx.match(/已认证\[([^\]]*)\]/);
  const certifiedInner = certifiedMatch?.[1]?.trim() ?? "";
  const professionAnyCertified =
    worldFlags.some((f) => f.startsWith("profession.certified.")) ||
    (certifiedInner.length > 0 && certifiedInner !== "无");

  const codexRaw = ctx.match(CODEX_RE)?.[1] ?? null;
  const resFloor = inferResidentialFloorFromNode(locationNode);
  const isB1 = Boolean(locationNode?.startsWith("B1_"));
  const isB2 = Boolean(locationNode?.startsWith("B2_"));
  const is7F = Boolean(locationNode?.startsWith("7F_"));

  const floorScoreM = ctx.match(FLOOR_SCORE_RE);
  const historicalMaxFloorScore = floorScoreM ? Number.parseInt(floorScoreM[1] ?? "0", 10) || 0 : 0;

  const deathM = ctx.match(DEATH_COUNT_RE);
  const deathCount = deathM ? Number.parseInt(deathM[1] ?? "0", 10) || 0 : 0;

  const oriM = ctx.match(ORIGINIUM_RE);
  const originium = oriM ? Number.parseInt(oriM[1] ?? "", 10) : null;

  const anchorRebuiltThisCycle =
    ANCHOR_REBUILT_CYCLE_RE.test(ctx) ||
    worldFlags.includes("cycle.anchor_rebuild") ||
    worldFlags.includes("cycle.anchor_rebuilt_this_cycle");

  return {
    day,
    hour,
    locationNode,
    residentialFloorNum: resFloor,
    isB1,
    isB2,
    is7F,
    worldFlags,
    hasReviveLine: REVIVE_RE.test(ctx),
    deathCount,
    originium: Number.isFinite(originium ?? NaN) ? (originium as number) : null,
    anchorB1,
    anchor1F,
    anchor7F,
    mainThreatByFloor,
    anyThreatSuppressedOrBreached,
    maxCodexFavorability: parseMaxCodexFavor(codexRaw),
    professionCurrent: professionCurrent,
    professionAnyCertified,
    historicalMaxFloorScore,
    activeTaskTitles: parseActiveTaskTitles(ctx),
    anchorRebuiltThisCycle,
  };
}
