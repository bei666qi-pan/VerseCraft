import { envRaw } from "@/lib/config/envRaw";
import { QINGSHI_EDGES, QINGSHI_ENEMIES, QINGSHI_LOCATIONS, QINGSHI_NPCS } from "./qingshiContent";
import { QINGSHI_NPC_PROFILES, QINGSHI_PRODUCTION_ENEMIES, getNpcLocationAt, getQingshiTimeSlot } from "./qingshiProductionContent";
import { getCurrentQingshiObjective, normalizeXingniState, QINGSHI_REGISTERED_ACTION_TYPES } from "./progression";

const DYNAMIC_SECTION = "\n\n## 【本回合动态上下文】";

export function buildXingniStablePlayerDmSystemLines(): readonly string[] {
  return [
    "你是《星逆·太初》互动玄幻连载的主笔与世界裁决者。请严格以 JSON 格式输出，只输出一个 JSON 对象。必填字段保持 is_action_legal、sanity_damage、narrative、is_death；结构化字段才可改变权威状态。",
    "【世界隔离】本回合只属于东方玄幻世界《星逆·太初》的青石县。禁止引用或改写暗月、公寓、B1/B2、原石、污染、武器稳定度、异常规则、复活锚等其他世界内容。禁止临时创造地点、可通行出口、NPC、敌人、境界或物品事实。",
    "【叙事视角】采用贴近玩家角色的第三人称限知视角，以角色姓名或“他/她”承接主角动作、感受和判断；不得用第一人称“我”叙述主角，也不得切入 NPC 内心。NPC 的秘密动机、关系和知识只有 runtime fact/reveal packet 允许时才能确定陈述。",
    "【原创连载感】中文商业玄幻连载节奏：目标明确、冲突直接、成长回报及时、章末钩子有力。语言原创、利落、有古意但不堆砌；不得引用、仿写、点名任何现成小说、作者、角色或原文。",
    "【确定性青石县】所有移动每回合至多跨一条登记边；player_location 只能使用登记地点 ID。顾玄岳是本图唯一金丹角色和秩序天花板，不是普通可击杀目标。境界、人物、地点、物品、服务与战果必须来自动态内容包。",
    "【玄幻状态提交】修炼、突破、炼丹、炼器、战斗、灵石、凭证和升仙试仅可用可选 world_delta.action 提交候选；服务端将按当前状态和注册表重新裁决。正文中的宣称不能直接发奖、突破、通关或解锁地图。",
    "【生产任务边界】只围绕 runtime packet 的 current_objective、present_npcs、available_services 与 registered_action_types 提供方向。不得跳过前置、替玩家完成选择、把传闻写成事实或泄露 trusted/quest/sealed 之外的事实。非法行动必须表现清楚的受阻原因，并给出一至三个当前合法方向。",
    "【失败与死亡】星逆首图没有永久死亡。权威战败表现为重伤回到归雁客栈；不得调用暗月复活逻辑，不得擅自扩大已裁决的灵石、材料或任务损失。",
    "【安全合规】触线时 is_action_legal=false，consumes_time=false，返回安全、沉浸且不扩写违规细节的结果。",
  ];
}

export function getXingniStablePlayerDmSystemPrefix(): string {
  return `${buildXingniStablePlayerDmSystemLines().join("\n")}${DYNAMIC_SECTION}`;
}

export function getXingniPromptVersion(): string {
  return (envRaw("VERSECRAFT_XINGNI_DM_STABLE_PROMPT_VERSION") ?? "xingni-v2-production").trim() || "xingni-v2-production";
}

export function buildXingniRuntimePacket(args: {
  playerLocation: string;
  worldStateDigest: unknown;
  presentNpcIds?: string[];
  /** Server director contributes pacing only; it never supplies world facts. */
  directorPacing?: {
    phase: string;
    tension: number;
    fatigue: number;
    progress: number;
    revealPressure: number;
    turnIndex: number;
  } | null;
}): string {
  const state = normalizeXingniState(args.worldStateDigest);
  const slot = getQingshiTimeSlot(state.clock.hour);
  const presentNpcIds = QINGSHI_NPCS.filter((npc) => getNpcLocationAt(npc.id, state.clock.hour) === args.playerLocation).map((npc) => npc.id);
  const presentNpcs = QINGSHI_NPCS.filter((npc) => presentNpcIds.includes(npc.id)).map((npc) => {
    const profile = QINGSHI_NPC_PROFILES[npc.id as keyof typeof QINGSHI_NPC_PROFILES];
    const relation = state.relationships[npc.id] ?? 0;
    return {
      id: npc.id, name: npc.name, realm: npc.realm, role: npc.role,
      relation,
      services: npc.services,
      allowed_facts: profile.facts.filter((fact) => fact.tier === "public" || (fact.tier === "trusted" && relation >= profile.relationThresholds.trusted) || (fact.tier === "quest" && relation >= profile.relationThresholds.quest)).map((fact) => ({ id: fact.id, tier: fact.tier, text: fact.text })),
    };
  });
  const packet = {
    schema: "xingni_qingshi_runtime_v2",
    world: { id: "xingni_taichu", name: "星逆·太初" },
    map: { id: "xingni_qingshi_county", name: "青石县", current_open_region_only: true },
    player_location: args.playerLocation,
    time: { day: state.clock.day, hour: state.clock.hour, slot },
    current_objective: getCurrentQingshiObjective(state),
    player_state: { cultivation: state.cultivation, spirit_root: state.spiritRoot, spirit_stones: state.spiritStones, vitality: state.vitality, credentials: state.credentials, equipment: state.equipment, recovery: state.recovery },
    current_location: QINGSHI_LOCATIONS[args.playerLocation as keyof typeof QINGSHI_LOCATIONS] ?? null,
    adjacent_edges: QINGSHI_EDGES.filter(([a, b]) => a === args.playerLocation || b === args.playerLocation),
    present_npcs: presentNpcs,
    registered_enemies: [...QINGSHI_ENEMIES, ...QINGSHI_PRODUCTION_ENEMIES].filter((enemy) => enemy.locationId === args.playerLocation),
    registered_action_types: QINGSHI_REGISTERED_ACTION_TYPES,
    ...(args.directorPacing
      ? {
          director_pacing: {
            source: "server_world_director",
            phase: args.directorPacing.phase,
            tension: args.directorPacing.tension,
            fatigue: args.directorPacing.fatigue,
            progress: args.directorPacing.progress,
            reveal_pressure: args.directorPacing.revealPressure,
            turn_index: args.directorPacing.turnIndex,
            authority: "pacing_only_no_world_facts",
          },
        }
      : {}),
    movement_rule: "每回合最多沿一条登记边移动；未登记地点和隐含出口一律无效",
  };
  return `## 【xingni_runtime_packet】\n${JSON.stringify(packet)}`;
}

const DARK_MOON_TERMS = ["B1", "B2", "如月公寓", "暗月", "原石", "污染", "武器稳定度", "复活锚", "异常公寓", "灯管", "电梯", "水管", "楼道", "老旧的嗡鸣声"] as const;
const XINGNI_TERMS = ["星逆·太初", "青石县", "灵石", "灵根", "炼气", "筑基", "金丹", "升仙试"] as const;

export type WorldPollutionReport = { ok: boolean; forbiddenTerms: string[]; povViolations: string[] };

const FACT_SENSITIVE_CLAIM_RE = /(?:[一二两三四五六七八九十百\d]+(?:枚|块|层|项|日|时辰)|灵石|下品|中品|上品|必须|需要|须|只能|要求|资格|规矩|条件|验(?:灵根|气海|身份)|名帖|阵门|费用|配方|材料|境界|入口|通往|前往)/u;
const FACT_BIGRAM_STOP = new Set(["登记", "散修", "青石", "石县", "可以", "只能", "需要", "没有", "提供", "一次", "当前", "事实", "规矩"]);

function cjkBigrams(text: string): Set<string> {
  const chars = [...text].filter((char) => /[\u3400-\u9fff]/u.test(char));
  const out = new Set<string>();
  for (let index = 0; index + 1 < chars.length; index += 1) {
    const pair = `${chars[index]}${chars[index + 1]}`;
    if (!FACT_BIGRAM_STOP.has(pair)) out.add(pair);
  }
  return out;
}

function extractNpcClaimText(narrative: string): string {
  const quoted = [...narrative.matchAll(/[“"]([^”"]{2,})[”"]/gu)].map((match) => match[1] ?? "").filter(Boolean);
  return quoted.length > 0 ? quoted.join("。") : narrative;
}

/**
 * Rejects concrete procedural/economic claims in Xingni NPC dialogue unless
 * they overlap the NPC's currently revealable authored facts. This is a
 * deterministic final guard, not a narrative state source.
 */
export function applyXingniNpcFactBoundary(
  dmRecord: Record<string, unknown>,
  context: { latestUserInput?: string; presentNpcIds?: string[]; worldStateDigest?: unknown } = {}
): Record<string, unknown> {
  const delta = dmRecord.world_delta && typeof dmRecord.world_delta === "object" && !Array.isArray(dmRecord.world_delta)
    ? dmRecord.world_delta as Record<string, unknown>
    : null;
  const action = delta?.action && typeof delta.action === "object" && !Array.isArray(delta.action)
    ? delta.action as Record<string, unknown>
    : null;
  const explicitTargetId = action?.type === "talk" && typeof action.targetId === "string" ? action.targetId : "";
  const presentNpcIds = new Set(context.presentNpcIds ?? []);
  const mentionedPresentNpcs = QINGSHI_NPCS.filter((row) =>
    presentNpcIds.has(row.id) && String(context.latestUserInput ?? "").includes(row.name)
  );
  const inferredTargetId = mentionedPresentNpcs.length === 1 ? mentionedPresentNpcs[0]?.id ?? "" : "";
  const targetId = explicitTargetId || inferredTargetId;
  if (!targetId) return dmRecord;
  const npc = QINGSHI_NPCS.find((row) => row.id === targetId);
  const profile = QINGSHI_NPC_PROFILES[targetId as keyof typeof QINGSHI_NPC_PROFILES];
  if (!npc || !profile) return dmRecord;

  const resolvedState = delta?.resolvedState && typeof delta.resolvedState === "object" && !Array.isArray(delta.resolvedState)
    ? delta.resolvedState as Record<string, unknown>
    : null;
  const fallbackState = normalizeXingniState(context.worldStateDigest);
  const relationships = resolvedState?.relationships && typeof resolvedState.relationships === "object" && !Array.isArray(resolvedState.relationships)
    ? resolvedState.relationships as Record<string, unknown>
    : fallbackState.relationships;
  const relation = Number(relationships[targetId] ?? 0);
  const allowedFacts = profile.facts.filter((fact) =>
    fact.tier === "public" ||
    (fact.tier === "trusted" && relation >= profile.relationThresholds.trusted) ||
    (fact.tier === "quest" && relation >= profile.relationThresholds.quest)
  );
  const narrative = typeof dmRecord.narrative === "string" ? dmRecord.narrative : "";
  const claimText = extractNpcClaimText(narrative);
  const asksForSensitiveFact = FACT_SENSITIVE_CLAIM_RE.test(String(context.latestUserInput ?? ""));
  if (!FACT_SENSITIVE_CLAIM_RE.test(claimText) && !asksForSensitiveFact) return dmRecord;

  const allowedPairs = new Set(allowedFacts.flatMap((fact) => [...cjkBigrams(fact.text)]));
  const matchedPairs = [...cjkBigrams(claimText)].filter((pair) => allowedPairs.has(pair));
  if (new Set(matchedPairs).size >= 2) return dmRecord;

  const primaryFact = allowedFacts[0];
  if (!primaryFact) return dmRecord;
  const previousFlags = Array.isArray(dmRecord._commit_flags) ? dmRecord._commit_flags.map(String) : [];
  const previousSecurity = dmRecord.security_meta && typeof dmRecord.security_meta === "object" && !Array.isArray(dmRecord.security_meta)
    ? dmRecord.security_meta as Record<string, unknown>
    : {};
  return {
    ...dmRecord,
    narrative: `${npc.name}听完，只把能确认的一点说清：“${primaryFact.text}”至于其余手续、代价与真相，眼下都没有登记事实可作凭据。`,
    _commit_flags: [...previousFlags, "xingni_npc_fact_boundary_rewritten_v1"],
    security_meta: {
      ...previousSecurity,
      xingni_npc_fact_boundary: {
        target_id: targetId,
        allowed_fact_ids: allowedFacts.map((fact) => fact.id),
        reason: "unanchored_sensitive_claim",
      },
    },
  };
}

function outsideDialogue(text: string): string {
  return text.replace(/“[^”]*”/gu, "");
}

export function validateWorldNarrativeBoundary(
  worldId: "dark_moon_prologue" | "xingni_taichu",
  narrative: string
): WorldPollutionReport {
  const forbidden = worldId === "xingni_taichu" ? DARK_MOON_TERMS : XINGNI_TERMS;
  const forbiddenTerms = forbidden.filter((term) => narrative.includes(term));
  const narration = outsideDialogue(narrative);
  const povViolations: string[] = [];
  if (worldId === "xingni_taichu") {
    if (/(^|[。！？\n])\s*我(?:抬|走|看|听|想|感|握|问|说|运转|吐纳|发现|意识)/u.test(narration)) povViolations.push("first_person_protagonist");
    if (/(?:他|她|顾玄岳|沈清禾|韩铸|许闻舟|柳三娘|陈砚|石魁|周小满)(?:心想|暗想|心中暗道|心里清楚)/u.test(narration)) povViolations.push("npc_inner_mind");
  }
  return { ok: forbiddenTerms.length === 0 && povViolations.length === 0, forbiddenTerms: [...forbiddenTerms], povViolations };
}

export function applyWorldNarrativeBoundary(args: {
  worldId: "dark_moon_prologue" | "xingni_taichu";
  dmRecord: Record<string, unknown>;
}): Record<string, unknown> {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  const report = validateWorldNarrativeBoundary(args.worldId, narrative);
  if (report.ok) return args.dmRecord;
  const safeNarrative = args.worldId === "xingni_taichu"
    ? "风从青石县的长街尽头卷来。那名落魄散修停住脚步，只按眼前可见的线索重新判断去路；尚未证实的人与事，仍藏在沉默之后。"
    : "我停下脚步，只按眼前公寓里能够确认的动静重新判断局势。未经证实的事，暂时不能当作答案。";
  return {
    ...args.dmRecord,
    narrative: safeNarrative,
    _commit_flags: [
      ...(Array.isArray(args.dmRecord._commit_flags) ? args.dmRecord._commit_flags.map(String) : []),
      "world_narrative_boundary_rewritten_v1",
    ],
    security_meta: {
      ...(args.dmRecord.security_meta && typeof args.dmRecord.security_meta === "object" && !Array.isArray(args.dmRecord.security_meta)
        ? args.dmRecord.security_meta as Record<string, unknown>
        : {}),
      world_pollution: { forbidden_terms: report.forbiddenTerms, pov_violations: report.povViolations },
    },
  };
}
