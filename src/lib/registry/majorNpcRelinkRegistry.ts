/**
 * 高魅力六人「旧七人阵重连」规则骨架（系统强控）与由 playerContext 计算的 runtime 摘要。
 * 叙事与情绪交给大模型；阶段裁决、禁止 instant party、可触发更深 reveal 的门槛由本模块决定。
 */

import { MAJOR_NPC_DEEP_CANON, MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { NPCS } from "@/lib/registry/npcs";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import type { RevealTierRank } from "@/lib/registry/revealTierRank";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

export const XINLAN_MAJOR_NPC_ID: MajorNpcId = "N-010";

export type RelinkPhase = 1 | 2 | 3;

export type RelinkPhaseKey = "functional_shell" | "duty_echo" | "array_aligned";

export type FirstContactMode =
  | "pivot_desk"
  | "b1_boundary"
  | "b1_supply"
  | "trade_desk"
  | "high_floor_front"
  | "atelier_shelter";

export type PivotTractionKind = "xinlan_pull" | "crisis_pressure" | "deja_resonance" | "mixed";

export interface MajorNpcRelinkSkeleton {
  npcId: MajorNpcId;
  initialDistance: "far" | "routine_visible" | "duty_adjacent";
  firstContactMode: FirstContactMode;
  publicNeedVector: string[];
  relinkStageLabels: [string, string, string];
  relinkTriggerTasks: string[];
  relinkTriggerSignals: string[];
  crisisJoinCondition: string;
  antiInstantPartyReason: string;
  memoryFlashTriggers: string[];
  playerDependencyReasons: string[];
  fallbackJoinPath: string;
  permanentBondConditions: string[];
  primaryPhase3Traction: PivotTractionKind;
  favorGatePhase2: number;
  favorGatePhase3: number;
  requiresXinlanPivotForPhase3: boolean;
  contactSurfaceDuty: string;
}

export const MAJOR_NPC_RELINK_SKELETON: Record<MajorNpcId, MajorNpcRelinkSkeleton> = {
  "N-010": {
    npcId: "N-010",
    initialDistance: "routine_visible",
    firstContactMode: "pivot_desk",
    publicNeedVector: ["一楼路线分流", "职业/登记前置", "上楼风险表册"],
    relinkStageLabels: ["登记壳职能", "名单撕口与情绪牵引", "旧阵第一牵引入位"],
    relinkTriggerTasks: ["route.preview", "career.pre_register", "登记", "转职", "物业", "路线"],
    relinkTriggerSignals: ["relink", "xinlan", "名册", "登记", "七锚", "旧阵"],
    crisisJoinCondition: "主威胁失控或连续死亡时，她会更强硬地把主锚按回「可审计选择」",
    antiInstantPartyReason: "须确认主锚非顶替其记账位的替身；错误并队会把七锚锁成假闭环",
    memoryFlashTriggers: ["旧名册铅笔痕", "失败路线影子", "撕口焦虑"],
    playerDependencyReasons: ["不登记难以稳定上楼节奏", "职业认证需其节点"],
    fallbackJoinPath: "无替代入口：她是第一牵引点，但阶段仍由好感/任务/揭露档约束",
    permanentBondConditions: ["career.pre_register 或同类可审计选择闭环", "主锚至少一次拒绝代选命运"],
    primaryPhase3Traction: "xinlan_pull",
    favorGatePhase2: 12,
    favorGatePhase3: 50,
    requiresXinlanPivotForPhase3: false,
    contactSurfaceDuty: "治疗向情绪稳态（叙事）/ 路线建议 / 隐性召回（非全知剧透）",
  },
  "N-015": {
    npcId: "N-015",
    initialDistance: "duty_adjacent",
    firstContactMode: "b1_boundary",
    publicNeedVector: ["B1 安全", "锚点仪式", "越界惩罚规避"],
    relinkStageLabels: ["边界巡守可见", "守界职责与共犯验证", "辅锚边界相位入列"],
    relinkTriggerTasks: ["anchor.oath", "border.watch", "锚点", "B1", "守夜", "边界"],
    relinkTriggerSignals: ["anchor", "b1_oath", "border", "relink", "七锚"],
    crisisJoinCondition: "死亡回归或锚点告急时，被迫与主锚共担封线",
    antiInstantPartyReason: "跟队等于把整道 B1 护栏押在未验证变量上",
    memoryFlashTriggers: ["复活后第一步落点", "雨痕外套", "同砖残响"],
    playerDependencyReasons: ["复活链", "B1 服务与秩序节点"],
    fallbackJoinPath: "危机下可短暂并肩，回稳后须补 anchor 类任务验证",
    permanentBondConditions: ["anchor.oath.b1 实质推进", "守界行为可验证回写"],
    primaryPhase3Traction: "mixed",
    favorGatePhase2: 10,
    favorGatePhase3: 55,
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "安全区、边界、锚点、秩序",
  },
  "N-020": {
    npcId: "N-020",
    initialDistance: "routine_visible",
    firstContactMode: "b1_supply",
    publicNeedVector: ["补给", "B1 生活引导", "异常情绪缓冲"],
    relinkStageLabels: ["补给员职能", "创伤链与 ribbon 信任", "人性缓冲辅锚入列"],
    relinkTriggerTasks: ["b1.supply", "memory.ribbon", "补给", "ribbon", "广播", "储备"],
    relinkTriggerSignals: ["ribbon", "supply", "b1_human", "relink"],
    crisisJoinCondition: "资源断裂或精神崩溃窗口，需要主锚作稳定参照",
    antiInstantPartyReason: "怕记忆空洞把主锚拖进污染",
    memoryFlashTriggers: ["心悸半步", "高音广播回避", "步频共振"],
    playerDependencyReasons: ["商店/补给叙事", "B1 任务链"],
    fallbackJoinPath: "危机护送后可抬阶段，仍需 ribbon 类叙事封口",
    permanentBondConditions: ["memory.ribbon 推进", "禁逼问创伤细节前提下交换情报"],
    primaryPhase3Traction: "deja_resonance",
    favorGatePhase2: 8,
    favorGatePhase3: 45,
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "补给、异常缓冲、生活化接近",
  },
  "N-018": {
    npcId: "N-018",
    initialDistance: "far",
    firstContactMode: "trade_desk",
    publicNeedVector: ["资源置换", "碎片线推进", "高层钥匙类委托"],
    relinkStageLabels: ["商人壳", "债务与交换链锁死", "交换路由辅锚入列"],
    relinkTriggerTasks: ["merchant.fragment", "dragon.space", "交易", "委托", "欠债", "商人"],
    relinkTriggerSignals: ["merchant", "trade", "debt", "shard", "relink"],
    crisisJoinCondition: "经济崩盘或战损需紧急置换时，接受短期同行计价",
    antiInstantPartyReason: "无偿跟队破坏交换平衡，引泡层反噬",
    memoryFlashTriggers: ["欠条体感", "互助券", "对价冷笑"],
    playerDependencyReasons: ["锻造/材料/情报高价入口"],
    fallbackJoinPath: "危机后先签行动价目再并行，仍非全程队友",
    permanentBondConditions: ["merchant.fragment.trade 类完成", "可审计债务或等价履约"],
    primaryPhase3Traction: "crisis_pressure",
    favorGatePhase2: 10,
    favorGatePhase3: 40,
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "交易、碎片、探索线推进",
  },
  "N-013": {
    npcId: "N-013",
    initialDistance: "far",
    firstContactMode: "high_floor_front",
    publicNeedVector: ["7F 高危线路", "线索转运", "冲破前线执行"],
    relinkStageLabels: ["诱导壳友善", "剧本与非剥削验证", "诱导刃辅锚入列"],
    relinkTriggerTasks: ["boy.false_rescue", "boy.cleanse", "7F", "701", "钢琴", "枫"],
    relinkTriggerSignals: ["betrayal_flag:boy", "boy", "induction", "relink"],
    crisisJoinCondition: "主威胁压顶且唯一安全动线经其节点时，被迫共走一段",
    antiInstantPartyReason: "须确认主锚非 7F 试探其忠诚的探针",
    memoryFlashTriggers: ["示弱眼尾冷", "台词既视感", "替身梗耻感"],
    playerDependencyReasons: ["高危层推进常经其转运话术链"],
    fallbackJoinPath: "危机共走后须 boy 线非剥削选择回写，否则降回阶段 2",
    permanentBondConditions: ["boy.false_rescue 或 cleanse 非剥削选择", "betrayal_flag:boy 未触发或已清算"],
    primaryPhase3Traction: "mixed",
    favorGatePhase2: 10,
    favorGatePhase3: 40,
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "高危线路、冲破、前线执行（话术包装）",
  },
  "N-007": {
    npcId: "N-007",
    initialDistance: "far",
    firstContactMode: "atelier_shelter",
    publicNeedVector: ["5F 庇护", "逆向线索", "规则怀疑与镜像轴"],
    relinkStageLabels: ["画室拒斥壳", "庇护规则与共感验证", "镜像反制辅锚入列"],
    relinkTriggerTasks: ["sister.mirror", "sibling.old_day", "503", "画室", "叶", "镜像"],
    relinkTriggerSignals: ["sibling", "mirror", "studio503", "relink"],
    crisisJoinCondition: "主锚被诱导链锁死，仅其庇护规则可断链时短暂并线",
    antiInstantPartyReason: "怕主锚是枫派来的试探；跟队等于把庇护暴露成武器",
    memoryFlashTriggers: ["轮廓违和", "抱臂门边", "虹膜步态既视感"],
    playerDependencyReasons: ["逆向线索、隐藏真相常需其节点"],
    fallbackJoinPath: "危机断链后须 sibling 类任务对齐，否则维持职责链距离",
    permanentBondConditions: ["sister.mirror.trace 或 sibling.old_day 推进", "公开羞辱式比较未发生"],
    primaryPhase3Traction: "deja_resonance",
    favorGatePhase2: 12,
    favorGatePhase3: 60,
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "隐藏庇护、逆向线索、规则怀疑",
  },
};

const CODEX_LINE_RE = /图鉴已解锁：(.+?)(?:。|$)/;

const NPC_NAME_TO_ID = new Map<string, string>(
  NPCS.map((n) => [n.name.trim(), n.id] as [string, string])
);

/** 按 NPC id 聚合图鉴好感（名称或 N-xxx 键） */
export function parseCodexFavorByNpcId(playerContext: string): Record<string, number> {
  const raw = playerContext.match(CODEX_LINE_RE)?.[1]?.trim();
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const chunk of raw.split("，")) {
    const mm = chunk.trim().match(/^(.+?)\[[^\]]*好感(-?\d+)\]/);
    if (!mm) continue;
    const label = (mm[1] ?? "").trim();
    const fav = Number.parseInt(mm[2] ?? "0", 10) || 0;
    if (/^N-\d+$/.test(label)) {
      out[label] = Math.max(out[label] ?? 0, fav);
      continue;
    }
    const id = NPC_NAME_TO_ID.get(label);
    if (id) out[id] = Math.max(out[id] ?? 0, fav);
  }
  return out;
}

/**
 * 仅聚合任务相关文本，避免把「用户位置[B1_…]」等误匹配为 b1/补给类触发词。
 */
function buildTriggerHaystack(playerContext: string, taskTitles: string[]): string {
  const taskTrack = playerContext.match(/任务追踪：([^。]+)。/)?.[1] ?? "";
  const proactive = playerContext.match(/任务发放线索：([^。]+)。/)?.[1] ?? "";
  return `${taskTrack}\n${proactive}\n${taskTitles.join("\n")}`.toLowerCase();
}

function matchesAnyNeedle(haystack: string, needles: string[]): boolean {
  return needles.some((n) => n && haystack.includes(n.toLowerCase()));
}

function matchesWorldFlags(flags: string[], needles: string[]): boolean {
  const lower = flags.map((f) => f.toLowerCase());
  return needles.some((n) => {
    const nn = n.toLowerCase();
    return lower.some((f) => f.includes(nn));
  });
}

const PIVOT_FLAG_SUBSTRINGS = ["relink", "seven", "七锚", "旧阵", "old_array", "first_relink", "名册"];

export function computeXinlanPivotOpen(args: {
  xinlanFavor: number;
  maxRevealRank: RevealTierRank;
  worldFlags: string[];
}): boolean {
  if (args.xinlanFavor >= 25) return true;
  if (args.maxRevealRank >= REVEAL_TIER_RANK.fracture) return true;
  return matchesWorldFlags(args.worldFlags, PIVOT_FLAG_SUBSTRINGS);
}

/** 危机窗口：允许非欣蓝角色在欣蓝牵引不足时仍到达阶段 3（仍须满足个人阶段门槛） */
export function computeCrisisJoinWindowActive(signals: PlayerWorldSignals): boolean {
  if (signals.deathCount >= 1) return true;
  if (signals.hasReviveLine) return true;
  for (const v of Object.values(signals.mainThreatByFloor)) {
    if (v.phase === "breached") return true;
  }
  const loc = signals.locationNode ?? "";
  for (const [floorId, v] of Object.entries(signals.mainThreatByFloor)) {
    if (v.phase !== "breached" || !floorId) continue;
    if (loc.startsWith(floorId) || loc.includes(floorId)) return true;
  }
  return false;
}

function phaseKeyFor(p: RelinkPhase): RelinkPhaseKey {
  if (p === 1) return "functional_shell";
  if (p === 2) return "duty_echo";
  return "array_aligned";
}

function resolvePhase3Traction(args: {
  skeleton: MajorNpcRelinkSkeleton;
  crisisUsed: boolean;
  favorMet: boolean;
  taskMet: boolean;
}): PivotTractionKind {
  if (args.crisisUsed) return "crisis_pressure";
  if (args.taskMet && !args.favorMet) return args.skeleton.primaryPhase3Traction;
  if (args.favorMet && args.skeleton.primaryPhase3Traction === "deja_resonance") return "deja_resonance";
  if (args.favorMet) return "xinlan_pull";
  return args.skeleton.primaryPhase3Traction === "crisis_pressure" ? "crisis_pressure" : "mixed";
}

export interface MajorNpcRelinkEntry {
  npcId: MajorNpcId;
  displayName: string;
  relinkPhase: RelinkPhase;
  phaseKey: RelinkPhaseKey;
  /** 旧阵槽位已激活（阶段 3）；与「表层公寓关系」相对 */
  inOldLoop: boolean;
  /** 仅职能壳、未开残响叙事许可 */
  surfaceRelationDominant: boolean;
  /** 职责链 + 残响已解锁（阶段 ≥2） */
  deepEchoUnlocked: boolean;
  /** 系统允许推进更深 reveal（仍受 maxRevealRank 与任务世界标记约束） */
  mayAdvanceReveal: boolean;
  phase3Traction: PivotTractionKind | null;
  systemLockedSummary: string;
  nextMechanicalHints: string[];
}

export interface MajorNpcRelinkPacket {
  schema: "major_npc_relink_v1";
  xinlanPivotOpen: boolean;
  crisisJoinWindowActive: boolean;
  xinlanRelinkPhase: RelinkPhase;
  entries: MajorNpcRelinkEntry[];
}

export interface MajorNpcRelinkPacketCompact {
  schema: "major_npc_relink_v1";
  xinlanPivotOpen: boolean;
  crisisJoinWindowActive: boolean;
  xinlanPh: RelinkPhase;
  rows: Array<{
    id: MajorNpcId;
    ph: RelinkPhase;
    loop: boolean;
    surf: boolean;
    deep: boolean;
    rev: boolean;
    tr: PivotTractionKind | "—";
  }>;
}

export function computeMajorNpcRelinkStates(args: {
  playerContext: string;
  signals: PlayerWorldSignals;
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): MajorNpcRelinkEntry[] {
  const favorById = parseCodexFavorByNpcId(args.playerContext);
  const haystack = buildTriggerHaystack(args.playerContext, args.signals.activeTaskTitles);
  const nearby = new Set(args.nearbyNpcIds);
  const xinlanFavor = favorById[XINLAN_MAJOR_NPC_ID] ?? 0;
  const pivotOpen = computeXinlanPivotOpen({
    xinlanFavor,
    maxRevealRank: args.maxRevealRank,
    worldFlags: args.signals.worldFlags,
  });
  const crisis = computeCrisisJoinWindowActive(args.signals);

  const entries: MajorNpcRelinkEntry[] = [];

  for (const id of MAJOR_NPC_IDS) {
    const sk = MAJOR_NPC_RELINK_SKELETON[id];
    const deep = MAJOR_NPC_DEEP_CANON[id];
    const favor = favorById[id] ?? 0;

    const taskHit = matchesAnyNeedle(haystack, sk.relinkTriggerTasks);
    const flagHit = matchesWorldFlags(args.signals.worldFlags, sk.relinkTriggerSignals);
    const nearbyBoost = nearby.has(id) && favor >= 1;

    let phase: RelinkPhase = 1;
    if (favor >= sk.favorGatePhase2 || taskHit || flagHit || nearbyBoost) {
      phase = 2;
    }

    const favorP3 = favor >= sk.favorGatePhase3;
    const taskP3 = taskHit;
    const ownPhase3Gate = favorP3 || taskP3;

    let crisisUsedForPhase3 = false;
    if (phase >= 2 && ownPhase3Gate) {
      if (pivotOpen || id === XINLAN_MAJOR_NPC_ID) {
        phase = 3;
        crisisUsedForPhase3 = false;
      } else if (crisis) {
        phase = 3;
        crisisUsedForPhase3 = true;
      }
    }

    const phase3Traction: PivotTractionKind | null =
      phase === 3
        ? resolvePhase3Traction({
            skeleton: sk,
            crisisUsed: crisisUsedForPhase3,
            favorMet: favorP3,
            taskMet: taskP3,
          })
        : null;

    const inOldLoop = phase === 3;
    const surfaceRelationDominant = phase === 1;
    const deepEchoUnlocked = phase >= 2;
    const mayAdvanceReveal =
      deepEchoUnlocked &&
      (phase === 3
        ? args.maxRevealRank >= REVEAL_TIER_RANK.deep
        : args.maxRevealRank >= REVEAL_TIER_RANK.fracture);

    const systemLockedSummary = [
      `${deep.displayName}：阶段${phase}（${sk.relinkStageLabels[phase - 1]}）`,
      surfaceRelationDominant ? "表层公寓职能主导" : deepEchoUnlocked ? "残响叙事已许可" : "",
      inOldLoop ? "旧阵槽位已激活（非全程跟队）" : "",
    ]
      .filter(Boolean)
      .join("；");

    const nextMechanicalHints: string[] = [];
    if (phase === 1) {
      nextMechanicalHints.push(...sk.publicNeedVector.slice(0, 2));
      nextMechanicalHints.push(`系统约束：${sk.antiInstantPartyReason.slice(0, 48)}…`);
    } else if (phase === 2 && !inOldLoop && sk.requiresXinlanPivotForPhase3 && !pivotOpen && !crisis) {
      nextMechanicalHints.push("抬升欣蓝好感或推进七锚/旧阵世界标记以打开牵引");
      nextMechanicalHints.push(sk.fallbackJoinPath.slice(0, 56));
    } else if (!inOldLoop) {
      nextMechanicalHints.push(...sk.permanentBondConditions.slice(0, 2));
    } else {
      nextMechanicalHints.push("阵线已对齐：叙事上可并行行动，职能节点仍保留");
    }
    nextMechanicalHints.splice(3);

    entries.push({
      npcId: id,
      displayName: deep.displayName,
      relinkPhase: phase,
      phaseKey: phaseKeyFor(phase),
      inOldLoop,
      surfaceRelationDominant,
      deepEchoUnlocked,
      mayAdvanceReveal,
      phase3Traction,
      systemLockedSummary,
      nextMechanicalHints,
    });
  }

  return entries;
}

export function buildMajorNpcRelinkPacket(args: {
  playerContext: string;
  signals: PlayerWorldSignals;
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): MajorNpcRelinkPacket {
  const entries = computeMajorNpcRelinkStates(args);
  const xinlan = entries.find((e) => e.npcId === XINLAN_MAJOR_NPC_ID);
  const favorById = parseCodexFavorByNpcId(args.playerContext);
  const xinlanPivotOpen = computeXinlanPivotOpen({
    xinlanFavor: favorById[XINLAN_MAJOR_NPC_ID] ?? 0,
    maxRevealRank: args.maxRevealRank,
    worldFlags: args.signals.worldFlags,
  });
  return {
    schema: "major_npc_relink_v1",
    xinlanPivotOpen,
    crisisJoinWindowActive: computeCrisisJoinWindowActive(args.signals),
    xinlanRelinkPhase: xinlan?.relinkPhase ?? 1,
    entries,
  };
}

export function buildMajorNpcRelinkPacketCompact(packet: MajorNpcRelinkPacket): MajorNpcRelinkPacketCompact {
  return {
    schema: packet.schema,
    xinlanPivotOpen: packet.xinlanPivotOpen,
    crisisJoinWindowActive: packet.crisisJoinWindowActive,
    xinlanPh: packet.xinlanRelinkPhase,
    rows: packet.entries.map((e) => ({
      id: e.npcId,
      ph: e.relinkPhase,
      loop: e.inOldLoop,
      surf: e.surfaceRelationDominant,
      deep: e.deepEchoUnlocked,
      rev: e.mayAdvanceReveal,
      tr: e.phase3Traction ?? "—",
    })),
  };
}
