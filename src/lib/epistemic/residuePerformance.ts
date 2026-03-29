/**
 * 情绪残响演出：玩法向「体感标签」注入，与命题事实/知识权限解耦。
 * 无长段硬编码台词；由 DM 在标签约束下自由发挥。
 */

import { isNightHour } from "@/features/play/endgame/endgame";
import { enableNpcResidue } from "./featureFlags";
import type { EpistemicResidueRecentEntry, SessionMemoryForDm } from "@/lib/memoryCompress";
import type { EpistemicAnomalyResult, NpcEpistemicProfile } from "./types";

export type { EpistemicResidueRecentEntry } from "@/lib/memoryCompress";

export type ResiduePerformanceMode =
  | "none"
  | "faint_familiarity"
  | "aversion"
  | "trust_without_reason"
  | "dread"
  | "protective_pull";

export type ResidueTriggerKind =
  | "proximity_dialogue"
  | "keyword_echo"
  | "night_pressure"
  | "sensitive_place"
  | "charged_item"
  | "crisis_tone"
  | "boundary_probe";

export type EpistemicResiduePromptPacket = {
  v: 1;
  npc_epistemic_residue_packet: true;
  npcId: string;
  residueMode: Exclude<ResiduePerformanceMode, "none">;
  residueStrength: number;
  activeTriggers: ResidueTriggerKind[];
  performanceTags: string[];
  narrativeConstraints: string[];
  xinlanIntensity?: "standard" | "elevated";
};

export type EpistemicResiduePerformancePlan = {
  packet: EpistemicResiduePromptPacket | null;
  /** 非空且回合成功结束时写入会话嵌入，用于 anti-repeat */
  persistEntry: EpistemicResidueRecentEntry | null;
  augmentationBlock: string;
};

const TAGS: Record<Exclude<ResiduePerformanceMode, "none">, string[]> = {
  faint_familiarity: ["micro_pause", "eye_lingering", "deja_vague", "wrong_footed_warmth"],
  aversion: ["shoulders_brace", "half_step_back", "tone_cools", "cut_sentence_short"],
  trust_without_reason: ["unearned_soften", "self_correct_suspicion", "proximity_pull_uncanny"],
  dread: ["throat_tight", "scan_exits", "voice_low", "deflect_direct_answer"],
  protective_pull: ["body_blocks_hazard_vector", "hand_half_stop", "sharp_warn_then_soften"],
};

const XINLAN_EXTRA = ["almost_named_you", "list_anxiety_spike", "holds_back_full_picture", "world_wrongness_sensed"];

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) >>> 0;
}

function tryParseGameHour(playerContext: string): number | null {
  const c = String(playerContext ?? "");
  const m = c.match(/"hour"\s*:\s*(\d{1,2})\b/);
  if (m) {
    const h = Number(m[1]);
    return Number.isFinite(h) ? Math.min(23, Math.max(0, Math.trunc(h))) : null;
  }
  const m2 = c.match(/\bhour\s*[:=]\s*(\d{1,2})\b/i);
  if (m2) {
    const h = Number(m2[1]);
    return Number.isFinite(h) ? Math.min(23, Math.max(0, Math.trunc(h))) : null;
  }
  return null;
}

export function detectResidueTriggers(args: {
  latestUserInput: string;
  playerContext: string;
  focusNpcId: string;
  presentNpcIds: string[];
  anomaly: boolean;
}): ResidueTriggerKind[] {
  const t = new Set<ResidueTriggerKind>();
  const u = String(args.latestUserInput ?? "");
  const c = String(args.playerContext ?? "");
  const needle = `${u}\n${c}`;
  const pid = args.focusNpcId.trim();
  if (pid && args.presentNpcIds.some((x) => String(x).toUpperCase() === pid.toUpperCase())) {
    t.add("proximity_dialogue");
  }
  const h = tryParseGameHour(c);
  if (h != null && isNightHour(h)) t.add("night_pressure");
  if (/档案|地下室|\bB1\b|\bB2\b|观测|锚点|七锚|轮回|周目|闭环|校籍/.test(needle)) t.add("keyword_echo");
  if (/危险|快跑|逃|血|受伤|倒|火|塌/.test(u)) t.add("crisis_tone");
  if (/刀|钥匙|照片|终端|煤油|标本|怀表|铭牌/.test(needle)) t.add("charged_item");
  if (/档案室|天台|电梯|楼梯间|门禁|值班室/.test(needle)) t.add("sensitive_place");
  if (args.anomaly) t.add("boundary_probe");
  return [...t];
}

function modePoolForProfile(profile: NpcEpistemicProfile): Exclude<ResiduePerformanceMode, "none">[] {
  if (profile.isXinlanException) {
    return ["faint_familiarity", "trust_without_reason", "dread", "protective_pull", "aversion"];
  }
  const bias = profile.suspicionBias ?? 0;
  const base: Exclude<ResiduePerformanceMode, "none">[] = ["faint_familiarity", "aversion", "trust_without_reason"];
  if (bias > 0.05) base.push("dread");
  if (bias < -0.05) base.push("protective_pull");
  else base.push("dread", "protective_pull");
  return [...new Set(base)] as Exclude<ResiduePerformanceMode, "none">[];
}

function pickMode(args: {
  pool: Exclude<ResiduePerformanceMode, "none">[];
  recentForNpc: EpistemicResidueRecentEntry[];
  seed: number;
}): Exclude<ResiduePerformanceMode, "none"> | null {
  const banned = new Set(args.recentForNpc.slice(0, 3).map((e) => e.mode));
  const candidates = args.pool.filter((m) => !banned.has(m));
  const use = candidates.length ? candidates : args.pool;
  if (!use.length) return null;
  return use[args.seed % use.length] ?? use[0] ?? null;
}

function residueStrength(profile: NpcEpistemicProfile, triggerCount: number, anomaly: boolean): number {
  let s = profile.isXinlanException ? 4 : 2;
  if ((profile.suspicionBias ?? 0) > 0.1) s += 1;
  if ((profile.suspicionBias ?? 0) < -0.1) s += 1;
  s += Math.min(2, Math.max(0, triggerCount - 1));
  if (anomaly) s += 2;
  return Math.min(6, s);
}

function fireThreshold(profile: NpcEpistemicProfile, triggerCount: number, anomaly: boolean): number {
  if (profile.isXinlanException) {
    let t = 20 + triggerCount * 9;
    if (anomaly) t += 28;
    return Math.min(80, t);
  }
  let t = 8 + triggerCount * 8;
  if (anomaly) t += 22;
  return Math.min(58, t);
}

function recentForNpc(mem: SessionMemoryForDm | null, npcId: string): EpistemicResidueRecentEntry[] {
  const list = mem?.epistemic_residue_recent_uses ?? [];
  return list.filter((e) => e.npcId.toUpperCase() === npcId.toUpperCase());
}

export function buildEpistemicResiduePerformancePlan(input: {
  focusNpcId: string | null;
  profile: NpcEpistemicProfile | null;
  anomalyResult: EpistemicAnomalyResult | null;
  mem: SessionMemoryForDm | null;
  latestUserInput: string;
  playerContext: string;
  presentNpcIds: string[];
  requestId: string;
  nowIso: string;
}): EpistemicResiduePerformancePlan {
  const empty: EpistemicResiduePerformancePlan = { packet: null, persistEntry: null, augmentationBlock: "" };
  if (!enableNpcResidue()) return empty;

  const npcId = input.focusNpcId?.trim() || null;
  const profile = input.profile;
  if (!npcId || !profile || !profile.retainsEmotionalResidue) return empty;

  const anomaly = Boolean(input.anomalyResult?.anomaly);
  const triggers = detectResidueTriggers({
    latestUserInput: input.latestUserInput,
    playerContext: input.playerContext,
    focusNpcId: npcId,
    presentNpcIds: input.presentNpcIds,
    anomaly,
  });

  const seed = djb2(`${npcId}|${input.requestId}|${input.latestUserInput.slice(0, 48)}`);
  const roll = seed % 100;
  const threshold = fireThreshold(profile, triggers.length, anomaly);
  if (roll >= threshold) return empty;

  const pool = modePoolForProfile(profile);
  const recent = recentForNpc(input.mem, npcId);
  const mode = pickMode({ pool, recentForNpc: recent, seed: seed >>> 3 });
  if (!mode) return empty;

  const strength = residueStrength(profile, triggers.length, anomaly);
  const baseTags = [...TAGS[mode]];
  if (profile.isXinlanException) {
    const xi = XINLAN_EXTRA[(seed >>> 7) % XINLAN_EXTRA.length];
    if (xi) baseTags.push(xi);
  }
  const uniqTags = [...new Set(baseTags)].slice(0, 10);

  const narrativeConstraints = [
    "禁止陈述可核对的具体旧事或秘密命题",
    "禁止替玩家确认其独知设定",
    "仅允许体感/微表情/语气/动作层面的「不对劲」",
    "避免固定套话反复出现（如每回合「我们是不是见过」）",
  ];
  if (profile.isXinlanException) {
    narrativeConstraints.push("可更强地表现「几乎想起什么但说不全」；仍禁止单回合说尽根因/七锚/通关链");
  } else {
    narrativeConstraints.push("熟悉感应短暂、克制，不得写成完整回忆");
  }

  const packet: EpistemicResiduePromptPacket = {
    v: 1,
    npc_epistemic_residue_packet: true,
    npcId,
    residueMode: mode,
    residueStrength: strength,
    activeTriggers: triggers.slice(0, 6),
    performanceTags: uniqTags,
    narrativeConstraints,
    xinlanIntensity: profile.isXinlanException ? "elevated" : undefined,
  };

  return {
    packet,
    persistEntry: { npcId, mode, iso: input.nowIso },
    augmentationBlock: buildEpistemicResidueAugmentationBlock(packet),
  };
}

const MAX_JSON = 900;

export function buildEpistemicResidueAugmentationBlock(packet: EpistemicResiduePromptPacket | null): string {
  if (!packet) return "";
  let json = JSON.stringify(packet);
  if (json.length > MAX_JSON) {
    json = JSON.stringify({
      ...packet,
      performanceTags: packet.performanceTags.slice(0, 6),
      activeTriggers: packet.activeTriggers.slice(0, 4),
      narrativeConstraints: packet.narrativeConstraints.slice(0, 3),
      _trimmed: true,
    });
  }
  return [
    "",
    "## 【npc_epistemic_residue_packet】",
    json,
    "主笔：用微动作/呼吸/停顿/目光实现 performanceTags；不得把 narrativeConstraints 当台词照念；仍输出合法顶层玩家 JSON。",
    "",
  ].join("\n");
}
