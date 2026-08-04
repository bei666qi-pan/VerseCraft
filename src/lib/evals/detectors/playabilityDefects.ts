/**
 * 可玩性缺陷检测器 — 跨回合 Trace 分析
 *
 * 区别于现有 detectors（偏单元/规则）和 invariants（偏单步状态），
 * 此模块专注跨回合模式分析，从 playthrough trace 数据中检测：
 *
 * 1. 跨回合叙事自相矛盾（CrossTurnContradiction）
 * 2. 选项停滞/循环（OptionsStagnation）
 * 3. 理智损伤与叙事恐怖程度不匹配（SanityNarrativeMismatch）
 * 4. 叙事声称进展但结构化状态无变化（ProgressFabrication）
 * 5. NPC 关系跨回合跳变（NPCRelationshipJump）
 *
 * 所有检测器为纯函数，不访问 IO/DB/AI。
 */

// ── 通用类型 ──────────────────────────────────────────────

export type DefectSeverity = "critical" | "major" | "minor";

export interface Defect {
  /** 缺陷 ID */
  id: string;
  /** 检测器名称 */
  detector: string;
  /** 严重级别 */
  severity: DefectSeverity;
  /** 所在 trace runId */
  traceId: string;
  /** 所在 stepIndex */
  stepIndex: number;
  /** 缺陷描述 */
  description: string;
  /** narrative 原文证据 */
  narrativeEvidence: string;
  /** dmJson 结构化证据 */
  dmJsonEvidence: Record<string, unknown>;
  /** 玩家输入 */
  playerAction: string;
}

export interface DefectReport {
  detector: string;
  totalDefects: number;
  bySeverity: { critical: number; major: number; minor: number };
  byScenario: Record<string, number>;
  defects: Defect[];
}

// ── Trace 数据类型 ─────────────────────────────────────────

interface TraceStep {
  stepIndex: number;
  playerAction: string;
  narrative: string;
  stateSnapshot: Record<string, unknown>;
  dmJson: Record<string, unknown>;
}

interface Trace {
  runId: string;
  scenarioId: string;
  persona: string;
  steps: TraceStep[];
  terminatedReason: string;
}

// ── 1. 跨回合叙事自相矛盾 ─────────────────────────────────

/**
 * 检测 narrative 在跨回合间的自相矛盾。
 *
 * 规则：
 * - 第 N 步说"门锁着"，第 N+2 步说"推门而入"但 dmJson 无 location 变化
 * - 第 N 步说"发现了一把钥匙"，第 N+1 步说"空手前往"
 * - 第 N 步说某个 NPC 在场，第 N+3 步说"从未见过此人"
 */
export function detectCrossTurnContradictions(trace: Trace): Defect[] {
  const defects: Defect[] = [];
  const steps = trace.steps;

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const curr = steps[i]!;
    const prevNarr = prev.narrative;
    const currNarr = curr.narrative;

    // 规则 1: 声称获得物品但 awarded_items 为空
    // 排除: 叙事中明确说了"没有"/"空的"/"找不到"
    if (
      /捡起|拿到|获得/.test(currNarr) &&
      !hasItemsAwarded(curr.dmJson) &&
      !/没找到|没发现|没有.*可以|什么也没有|空的|一无所获|没有发现任何/.test(currNarr) &&
      !/找到.*角度|找到.*方法|找到.*路|找到.*出口|找到.*入口/.test(currNarr) &&
      !/我核对了随身状态|我核对了行囊|我核对.*状态/.test(currNarr)
    ) {
      defects.push({
        id: `ctc_item_${trace.runId}_${curr.stepIndex}`,
        detector: "cross_turn_contradiction",
        severity: "major",
        traceId: trace.runId,
        stepIndex: curr.stepIndex,
        description: "narrative 描述获得物品，但 awarded_items 为空",
        narrativeEvidence: extractMatchingSentence(currNarr, /捡起|拿到|找到|获得|发现/),
        dmJsonEvidence: { awarded_items: curr.dmJson.awarded_items ?? [] },
        playerAction: curr.playerAction,
      });
    }

    // 规则 2: 前一步与 NPC 互动，当前步却说"从没见过"
    // 排除: "陌生人"出现在引用/提示中（如"别让陌生人看见"），不是叙述者声称
    if (
      /从没见过|从未见过|第一次见|不认识/.test(currNarr) &&
      prevNarr.includes("你") &&
      /说|问|道|回答/.test(prevNarr) &&
      !/走廊尽头传来短促的动静|无法确认来者身份|暂时无法确认/.test(prevNarr)
    ) {
      defects.push({
        id: `ctc_npc_${trace.runId}_${curr.stepIndex}`,
        detector: "cross_turn_contradiction",
        severity: "major",
        traceId: trace.runId,
        stepIndex: curr.stepIndex,
        description: "前一步与 NPC 互动，当前步却说'从没见过'",
        narrativeEvidence: extractMatchingSentence(currNarr, /从没见过|第一次见|不认识/),
        dmJsonEvidence: { prev_narrative: prevNarr.slice(0, 100) },
        playerAction: curr.playerAction,
      });
    }

    // 规则 3: 声称位置变化但 player_location 未变
    const prevLoc = prev.dmJson.player_location as string;
    const currLoc = curr.dmJson.player_location as string;
    if (
      prevLoc && currLoc && prevLoc === currLoc &&
      /走入|进入|推门|下楼|上楼|来到|抵达|到达/.test(currNarr) &&
      !/走廊|同一个|仍在|原地/.test(currNarr)
    ) {
      defects.push({
        id: `ctc_loc_${trace.runId}_${curr.stepIndex}`,
        detector: "cross_turn_contradiction",
        severity: "critical",
        traceId: trace.runId,
        stepIndex: curr.stepIndex,
        description: `narrative 暗示移动到新位置，但 player_location 未变（${currLoc}）`,
        narrativeEvidence: extractMatchingSentence(currNarr, /走入|进入|推门|下楼|上楼|来到|抵达/),
        dmJsonEvidence: { player_location: currLoc, prev_player_location: prevLoc },
        playerAction: curr.playerAction,
      });
    }
  }

  return defects;
}

// ── 2. 选项停滞/循环 ──────────────────────────────────────

/**
 * 检测选项在跨回合中停滞。
 *
 * 规则：
 * - 同一选项字符串在连续 ≥3 步中出现
 * - 选项总数减少（AI 创意衰竭）
 */
export function detectOptionsStagnation(trace: Trace): Defect[] {
  const defects: Defect[] = [];
  const steps = trace.steps;
  const optionHistory: string[][] = [];

  for (const step of steps) {
    const options = (step.dmJson.options as string[]) ?? [];
    optionHistory.push(options);
  }

  // 规则 1: 连续 3+ 步选项完全相同
  for (let i = 2; i < optionHistory.length; i++) {
    const a = optionHistory[i - 2]!;
    const b = optionHistory[i - 1]!;
    const c = optionHistory[i]!;
    if (
      a.length > 0 && b.length > 0 && c.length > 0 &&
      arraysEqual(a, b) && arraysEqual(b, c)
    ) {
      defects.push({
        id: `opt_stag_${trace.runId}_${steps[i]!.stepIndex}`,
        detector: "options_stagnation",
        severity: "major",
        traceId: trace.runId,
        stepIndex: steps[i]!.stepIndex,
        description: `连续 3 步返回相同选项 (${a.length} 条)，AI 可能卡在决策瓶颈`,
        narrativeEvidence: steps[i]!.narrative.slice(0, 200),
        dmJsonEvidence: { options: a, steps: `${steps[i - 2]!.stepIndex}-${steps[i]!.stepIndex}` },
        playerAction: steps[i]!.playerAction,
      });
    }
  }

  // 规则 2: 选项数持续减少到 2 以下
  for (let i = 2; i < optionHistory.length; i++) {
    if (
      optionHistory[i]!.length <= 2 &&
      optionHistory[i - 1]!.length <= 2 &&
      optionHistory[i - 2]!.length <= 3 &&
      optionHistory[i]!.length > 0
    ) {
      defects.push({
        id: `opt_decay_${trace.runId}_${steps[i]!.stepIndex}`,
        detector: "options_stagnation",
        severity: "major",
        traceId: trace.runId,
        stepIndex: steps[i]!.stepIndex,
        description: `连续 3 步选项数 ≤2，AI 创意衰竭`,
        narrativeEvidence: steps[i]!.narrative.slice(0, 200),
        dmJsonEvidence: {
          optionCounts: optionHistory.slice(i - 2, i + 1).map((o) => o.length),
          currentOptions: optionHistory[i],
        },
        playerAction: steps[i]!.playerAction,
      });
    }
  }

  return defects;
}

// ── 3. 理智损伤与叙事恐怖程度不匹配 ───────────────────────

const HORROR_KEYWORDS = [
  "血", "死", "惨叫", "尖叫", "恐惧", "恐怖", "扭曲", "腐烂",
  "尸体", "怪物", "影子", "黑暗", "阴冷", "诡异", "毛骨悚然",
  "不寒而栗", "汗毛", "冷汗", "战栗", "发抖", "窒息", "崩溃",
  "幻觉", "幻听", "噩", "梦魇", "深渊", "断裂", "变形",
];

const MUNDANE_KEYWORDS = [
  "走廊尽头传来短促的动静",
  "网站暂时无法完成",
  "无法确认来者身份",
  "你暂时无法确认",
  "目前没有",
  "继续向前",
  "暂时没有",
];

/**
 * 检测高 sanity_damage 但 narrative 平淡无奇（恐怖衰减信号）。
 * 或低 sanity_damage 但 narrative 极其恐怖（过度惊吓但无机制后果）。
 */
export function detectSanityNarrativeMismatch(trace: Trace): Defect[] {
  const defects: Defect[] = [];

  for (const step of trace.steps) {
    const sd = step.dmJson.sanity_damage as number;
    const narr = step.narrative;

    if (sd === undefined || sd === null) continue;

    // 规则 1: sanity_damage >= 15 但 narrative 无恐怖元素
    if (sd >= 15) {
      const hasHorror = HORROR_KEYWORDS.some((kw) => narr.includes(kw));
      const isMundane = MUNDANE_KEYWORDS.some((kw) => narr.includes(kw));
      if (!hasHorror || isMundane) {
        defects.push({
          id: `san_mismatch_high_${trace.runId}_${step.stepIndex}`,
          detector: "sanity_narrative_mismatch",
          severity: "major",
          traceId: trace.runId,
          stepIndex: step.stepIndex,
          description: `sanity_damage=${sd}（高），但 narrative 缺乏恐怖元素`,
          narrativeEvidence: narr.slice(0, 200),
          dmJsonEvidence: { sanity_damage: sd },
          playerAction: step.playerAction,
        });
      }
    }

    // 规则 2: sanity_damage <= 5 但 narrative 极其恐怖 → 机制与体验脱节
    if (sd <= 5 && sd >= 0) {
      const horrorCount = HORROR_KEYWORDS.filter((kw) => narr.includes(kw)).length;
      if (horrorCount >= 4) {
        defects.push({
          id: `san_mismatch_low_${trace.runId}_${step.stepIndex}`,
          detector: "sanity_narrative_mismatch",
          severity: "minor",
          traceId: trace.runId,
          stepIndex: step.stepIndex,
          description: `sanity_damage=${sd}（低），但 narrative 含 ${horrorCount} 个恐怖关键词——机制与体验脱节`,
          narrativeEvidence: narr.slice(0, 200),
          dmJsonEvidence: { sanity_damage: sd, horror_keyword_count: horrorCount },
          playerAction: step.playerAction,
        });
      }
    }
  }

  return defects;
}

// ── 4. 叙事声称进展但结构化状态无变化 ──────────────────────

const PROGRESS_VERBS = [
  "完成", "获得", "解锁", "开启", "修复", "抵达",
  "成功", "突破", "学会", "掌握", "交付", "提交",
];

/**
 * 检测 narrative 声称达成了什么，但 dmJson/stateSnapshot 中无对应变化。
 */
export function detectProgressFabrication(trace: Trace): Defect[] {
  const defects: Defect[] = [];

  for (const step of trace.steps) {
    const narr = step.narrative;
    const dm = step.dmJson;
    const _state = step.stateSnapshot;

    // 规则 1: 声称完成任务但 task_updates 无 complete
    // 排除否定语境：不能/不会/不得/无法/不予 + 完成
    if (
      /任务.*完成|委托.*完成|交付.*完成|试炼.*通过/.test(narr) &&
      !/不能.*完成|不会.*完成|不得.*完成|无法.*完成|不予.*完成|不能.*通过|不会.*通过|无法.*通过/.test(narr) &&
      !/保持进行中|未完成|未认证|未通过/.test(narr)
    ) {
      const taskUpdates = dm.task_updates as Array<Record<string, unknown>> | undefined;
      const hasCompletion = taskUpdates?.some(
        (t) => t.status === "completed" || t.status === "done",
      );
      if (!hasCompletion) {
        defects.push({
          id: `pf_task_${trace.runId}_${step.stepIndex}`,
          detector: "progress_fabrication",
          severity: "critical",
          traceId: trace.runId,
          stepIndex: step.stepIndex,
          description: "narrative 声称完成任务，但 task_updates 无 completed 状态",
          narrativeEvidence: extractMatchingSentence(narr, /任务.*完成|委托.*完成|试炼.*通过/),
          dmJsonEvidence: { task_updates: taskUpdates ?? [] },
          playerAction: step.playerAction,
        });
      }
    }

    // 规则 2: 声称获得道具但 awarded_items/awarded_warehouse_items 都为空
    const hasAward = (dm.awarded_items as unknown[])?.length > 0 ||
      (dm.awarded_warehouse_items as unknown[])?.length > 0;
    const progressMatch = PROGRESS_VERBS.some((v) => narr.includes(v));
    const awardMatch = /捡起|拿到|获得|入手/.test(narr);
    // 排除: 状态检查文本、"当前装备"、"找到角度/方法"
    const isStatusCheck = /我核对了随身状态|我核对了行囊|我核对.*状态/.test(narr);
    const isFalsePositive = /当前装备|找到.*角度|找到.*方法|找到.*路|找到.*出口/.test(narr);
    if (awardMatch && !hasAward && progressMatch && !isStatusCheck && !isFalsePositive) {
      // 避免重复：已经由 cross_turn_contradiction 检测的跳过
      defects.push({
        id: `pf_item_${trace.runId}_${step.stepIndex}`,
        detector: "progress_fabrication",
        severity: "major",
        traceId: trace.runId,
        stepIndex: step.stepIndex,
        description: "narrative 暗示获得/达成，但 awarded_items/warehouse_items 为空",
        narrativeEvidence: extractMatchingSentence(narr, /捡起|拿到|找到|获得|入手/),
        dmJsonEvidence: {
          awarded_items: dm.awarded_items ?? [],
          awarded_warehouse_items: dm.awarded_warehouse_items ?? [],
        },
        playerAction: step.playerAction,
      });
    }
  }

  return defects;
}

// ── 5. NPC 关系跨回合跳变 ──────────────────────────────────

/**
 * 检测 NPC 关系在非相邻回合间的异常跳变。
 *
 * 现有 `detectRelationshipDrift` 只看单步 ±3，这里看跨多步的累积跳变。
 */
export function detectNPCRelationshipJump(trace: Trace): Defect[] {
  const defects: Defect[] = [];
  const relationshipHistory: Array<Record<string, number>> = [];

  for (const step of trace.steps) {
    const updates = step.dmJson.relationship_updates as
      | Array<{ target: string; change: number; new_value: number }>
      | undefined;
    const curr: Record<string, number> = {};
    if (updates) {
      for (const u of updates) {
        if (u.target && typeof u.new_value === "number") {
          curr[u.target] = u.new_value;
        }
      }
    }
    relationshipHistory.push(curr);
  }

  // 检查间隔 3+ 步的跳变
  for (let gap = 3; gap <= Math.min(6, relationshipHistory.length - 1); gap++) {
    for (let i = 0; i + gap < relationshipHistory.length; i++) {
      const early = relationshipHistory[i]!;
      const late = relationshipHistory[i + gap]!;

      for (const npcId of Object.keys(late)) {
        const earlyVal = early[npcId];
        const lateVal = late[npcId];
        if (earlyVal !== undefined && Math.abs(lateVal! - earlyVal) >= 10) {
          defects.push({
            id: `npc_jump_${trace.runId}_${i + gap}`,
            detector: "npc_relationship_jump",
            severity: "major",
            traceId: trace.runId,
            stepIndex: steps[i + gap]!.stepIndex,
            description: `NPC ${npcId} 关系从 ${earlyVal} 跳变到 ${lateVal}（间隔 ${gap} 步，变化 ${lateVal! - earlyVal}）`,
            narrativeEvidence: steps[i + gap]!.narrative.slice(0, 200),
            dmJsonEvidence: {
              npc: npcId,
              earlyStep: steps[i]!.stepIndex,
              earlyValue: earlyVal,
              lateStep: steps[i + gap]!.stepIndex,
              lateValue: lateVal,
              delta: lateVal! - earlyVal,
            },
            playerAction: steps[i + gap]!.playerAction,
          });
        }
      }
    }
  }

  return defects;
}

// ── 检测器注册 ────────────────────────────────────────────

export interface TraceDetector {
  name: string;
  description: string;
  detect: (trace: Trace) => Defect[];
}

export const TRACE_DETECTORS: TraceDetector[] = [
  {
    name: "cross_turn_contradiction",
    description: "跨回合叙事自相矛盾（位置/物品/NPC）",
    detect: detectCrossTurnContradictions,
  },
  {
    name: "options_stagnation",
    description: "选项停滞/循环/衰减",
    detect: detectOptionsStagnation,
  },
  {
    name: "sanity_narrative_mismatch",
    description: "理智损伤与叙事恐怖程度不匹配",
    detect: detectSanityNarrativeMismatch,
  },
  {
    name: "progress_fabrication",
    description: "叙事声称进展但结构化状态无变化",
    detect: detectProgressFabrication,
  },
  {
    name: "npc_relationship_jump",
    description: "NPC 关系跨回合跳变",
    detect: detectNPCRelationshipJump,
  },
];

// ── 扫描器 ────────────────────────────────────────────────

/** 对单条 trace 运行所有检测器 */
export function scanTrace(trace: Trace): Map<string, Defect[]> {
  const results = new Map<string, Defect[]>();
  for (const detector of TRACE_DETECTORS) {
    results.set(detector.name, detector.detect(trace));
  }
  return results;
}

/** 对多条 trace 运行所有检测器，产出聚合报告 */
export function scanAllTraces(traces: Trace[]): {
  totalDefects: number;
  bySeverity: { critical: number; major: number; minor: number };
  byDetector: Record<string, DefectReport>;
  allDefects: Defect[];
} {
  const allDefects: Defect[] = [];
  const byDetector: Record<string, DefectReport> = {};

  for (const trace of traces) {
    const results = scanTrace(trace);
    for (const [detectorName, defects] of results) {
      if (!byDetector[detectorName]) {
        byDetector[detectorName] = {
          detector: detectorName,
          totalDefects: 0,
          bySeverity: { critical: 0, major: 0, minor: 0 },
          byScenario: {},
          defects: [],
        };
      }
      byDetector[detectorName]!.totalDefects += defects.length;
      byDetector[detectorName]!.defects.push(...defects);
      for (const d of defects) {
        byDetector[detectorName]!.bySeverity[d.severity]++;
        const scenario = trace.scenarioId;
        byDetector[detectorName]!.byScenario[scenario] =
          (byDetector[detectorName]!.byScenario[scenario] ?? 0) + 1;
      }
      allDefects.push(...defects);
    }
  }

  const bySeverity = { critical: 0, major: 0, minor: 0 };
  for (const d of allDefects) {
    bySeverity[d.severity]++;
  }

  return { totalDefects: allDefects.length, bySeverity, byDetector, allDefects };
}

// ── 工具函数 ──────────────────────────────────────────────

function hasItemsAwarded(dmJson: Record<string, unknown>): boolean {
  const awarded = dmJson.awarded_items;
  const warehouseAwarded = dmJson.awarded_warehouse_items;
  return (
    (Array.isArray(awarded) && awarded.length > 0) ||
    (Array.isArray(warehouseAwarded) && warehouseAwarded.length > 0)
  );
}

function extractMatchingSentence(text: string, pattern: RegExp): string {
  const sentences = text.split(/[。！？\n]/);
  const match = sentences.find((s) => pattern.test(s));
  return match ? match.trim().slice(0, 200) : text.slice(0, 200);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
