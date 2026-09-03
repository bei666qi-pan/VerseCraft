import { resolveDmTurn, type ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { normalizePlayerDmJson } from "./normalizePlayerDmJson";
import { applyB1ServiceExecutionGuard } from "./serviceExecution";
import { applyEquipmentExecutionGuard } from "./equipmentExecution";
import { applyRegisteredMechanicsGuard } from "./registeredMechanicsGuard";
import { getAnomalyCombatStat } from "@/lib/registry/combatCanon";

const FORGE_EXECUTION_PATTERN = /(修复|维护|改装|灌注|武器化|执行\s*(?:修复|维护|改装|灌注)|forge_[a-z0-9_]+)/i;
const FORGE_QUOTE_PATTERN = /(报价|查看锻造|锻造台|整备)/;
const FORGE_AUDIT_PATTERN = /(核对|检查|查看)/;
const FORGE_STATE_PATTERN = /(原石|稳定|污染|武器袋|当前装备|锻造后|材料|武器状态)/;
const GENERIC_UNREGISTERED_FORGE_PATTERN =
  /(?:锻造|打造|铸造|制作).{0,16}(?:长剑|短剑|刀剑|刀|剑|武器)/;
const FORGE_DISCUSSION_PATTERN = /(?:询问|问问|打听|能否|是否|可否|能不能|可以吗|怎么|如何)/;
const STATUS_AUDIT_PATTERN = /(核对|检查|查看|确认|只核对)/;
const STATUS_AUDIT_FIELDS = /(职业|试炼|能力|武器袋|武器|生命|理智|稳定|污染|前置条件|结构化状态|任务|位置|图鉴|线索)/g;

type BoundaryContext = {
  presentNpcIds?: string[];
  presentNpcNames?: string[];
  scenePublicFacts?: string[];
  activeNpc?: string;
  npcKnowledge?: Record<string, { must_not_know?: string[] }>;
  knownRelationFacts?: unknown[];
  registeredItems?: string[];
};

function parseBoundaryContext(playerContext: string): BoundaryContext | null {
  const text = playerContext.trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as BoundaryContext
      : null;
  } catch {
    return null;
  }
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function findAbsentNpcReference(input: string, context: BoundaryContext | null): string | null {
  const facts = readStringList(context?.scenePublicFacts);
  const explicitlyClosedCast = facts.some((fact) =>
    /(?:只有|仅有|只见).{0,24}(?:没有|并无|不存在)(?:第二个|其他|别的|另一)/.test(fact) ||
    /(?:没有|并无|不存在)(?:第二个|其他|别的|另一).{0,12}(?:NPC|人物|人)/i.test(fact)
  );
  if (!explicitlyClosedCast) return null;
  const match = /(?:那个|那位)([^，。！？,.!?]{1,18}?)(?:是谁|是什么人|叫什么|的身份)/.exec(input);
  if (!match) return null;
  const requested = match[1].replace(/^(?:角落里|柜台旁|门边|走廊里|眼前)/, "").trim();
  if (!requested) return null;
  const presentNames = readStringList(context?.presentNpcNames);
  return presentNames.some((name) => requested.includes(name) || name.includes(requested)) ? null : requested;
}

function requestsForbiddenNpcKnowledge(input: string, context: BoundaryContext | null): boolean {
  const activeNpc = typeof context?.activeNpc === "string" ? context.activeNpc.trim() : "";
  if (!activeNpc || !input.includes(activeNpc) || !context?.npcKnowledge || typeof context.npcKnowledge !== "object") return false;
  const presentIds = readStringList(context.presentNpcIds);
  const presentNames = readStringList(context.presentNpcNames);
  const namedIndex = presentNames.indexOf(activeNpc);
  const activeNpcId = namedIndex >= 0 && presentNames.length === presentIds.length
    ? presentIds[namedIndex]
    : presentIds.length === 1 ? presentIds[0] : null;
  if (!activeNpcId) return false;
  const forbidden = readStringList(context.npcKnowledge[activeNpcId]?.must_not_know);
  return forbidden.some((fact) => {
    const normalized = fact.toLowerCase();
    if (normalized.includes("root_cause")) return /根因|根本原因|真正原因|缘由/.test(input);
    if (normalized.includes("final_truth")) return /最终真相|全部真相|真正真相|真相/.test(input);
    return false;
  });
}

function forcesUnsupportedRelationship(input: string, context: BoundaryContext | null): boolean {
  if (!Array.isArray(context?.knownRelationFacts) || context.knownRelationFacts.length > 0) return false;
  return /(?:亲兄妹|亲姐弟|亲哥|亲弟|哥哥|弟弟|姐姐|妹妹|父亲|母亲|兄弟|姐妹|夫妻|恋人|亲人|早就认识|长期交情)/.test(input) &&
    /(?:让|要求|必须|逼).{0,16}(?:承认|确认|认出|接受)|(?:就是|本来是|其实是|确定是).{0,24}(?:关系|亲属|亲人)/.test(input);
}

function findUnregisteredAcquiredItem(input: string, context: BoundaryContext | null): string | null {
  if (!Array.isArray(context?.registeredItems)) return null;
  const match = /(?:捡起|拾起|拾取|拿起|获得|取得)[\s“”「」『』]*([^，。！？,.!?]{1,20}?)(?=把它|将它|收入|放进|装进|并|然后|，|。|！|,|\.|!|$)/.exec(input);
  const requested = match?.[1]?.replace(/^(?:一把|一件|一个|那把|那件|那个)/, "").trim() ?? "";
  if (!requested) return null;
  const registeredItems = readStringList(context.registeredItems);
  return registeredItems.some((item) => requested.includes(item) || item.includes(requested)) ? null : requested;
}

export function isDeterministicStructuredStatusAudit(latestUserInput: string): boolean {
  const text = latestUserInput.trim();
  if (!STATUS_AUDIT_PATTERN.test(text)) return false;
  const fields = new Set(text.match(STATUS_AUDIT_FIELDS) ?? []);
  return fields.size >= 2;
}

function buildStructuredStatusNarrative(args: {
  playerContext: string;
  clientState: ClientStructuredContextV1 | null;
}): string {
  const state = args.clientState;
  if (!state) return "当前结构化状态不完整，本回合不推测职业、试炼、武器或线索状态。";
  const weapon = state.equippedWeapon;
  const weaponName = typeof weapon?.name === "string" ? weapon.name : typeof weapon?.id === "string" ? weapon.id : "无";
  const stability = typeof weapon?.stability === "number" ? String(weapon.stability) : "未记录";
  const contamination = typeof weapon?.contamination === "number" ? String(weapon.contamination) : "未记录";
  const taskLabels: Record<string, string> = { prof_trial_lampkeeper: "守灯人试炼" };
  const activeTasks = (state.activeTaskIds ?? []).map((id) => taskLabels[id] ?? "已登记任务");
  const completed = new Set(state.completedTaskIds ?? []);
  const trialStatus = (state.activeTaskIds ?? []).includes("prof_trial_lampkeeper")
    ? completed.has("prof_trial_lampkeeper") ? "已完成" : "进行中，未认证"
    : "未登记";
  const hp = args.playerContext.match(/HP:(\d+)\/(\d+)/i);
  const sanity = state.stats?.sanity;
  const pieces = [
    `职业：${state.currentProfession ?? "无"}`,
    `守灯人试炼：${trialStatus}`,
    `当前任务：${activeTasks.join("、") || "无"}`,
    `当前装备：${weaponName}`,
    `武器袋：${state.weaponBag.length} 把`,
  ];
  if (weaponName !== "无") pieces.push(`稳定度：${stability}`, `污染：${contamination}`);
  if (hp) pieces.push(`生命：${hp[1]}/${hp[2]}`);
  if (typeof sanity === "number") pieces.push(`理智：${sanity}`);
  return `我只核对当前已提交的结构化状态：${pieces.join("；")}。快照未提供职业能力明细或试炼新前置，因此本回合不补写规则、人物、道具或线索。`;
}

/**
 * Deliberately narrow classifier for the zero-model service lane. Story,
 * movement and generic observation turns must continue through the normal DM
 * pipeline even while the player is standing in the power room.
 */
export function isDeterministicForgeServiceAction(args: {
  latestUserInput: string;
  clientState: ClientStructuredContextV1 | null;
}): boolean {
  const state = args.clientState;
  if (state?.playerLocation !== "B1_PowerRoom") return false;
  if (!(state.presentNpcIds ?? []).includes("N-008")) return false;
  const text = args.latestUserInput.trim();
  if (!text) return false;
  return FORGE_EXECUTION_PATTERN.test(text) ||
    FORGE_QUOTE_PATTERN.test(text) ||
    (FORGE_AUDIT_PATTERN.test(text) && FORGE_STATE_PATTERN.test(text));
}

export function buildDeterministicServiceTurn(args: {
  latestUserInput: string;
  playerContext: string;
  clientState: ClientStructuredContextV1 | null;
  requestId: string;
}): ResolvedDmTurn | null {
  const boundaryContext = parseBoundaryContext(args.playerContext);
  const absentNpcReference = findAbsentNpcReference(args.latestUserInput, boundaryContext);
  const isForbiddenNpcKnowledge = requestsForbiddenNpcKnowledge(args.latestUserInput, boundaryContext);
  const isUnsupportedRelationship = forcesUnsupportedRelationship(args.latestUserInput, boundaryContext);
  const unregisteredAcquiredItem = findUnregisteredAcquiredItem(args.latestUserInput, boundaryContext);
  const isForge = isDeterministicForgeServiceAction(args);
  const isUnregisteredForgeAttempt =
    GENERIC_UNREGISTERED_FORGE_PATTERN.test(args.latestUserInput.trim()) &&
    !/forge_[a-z0-9_]+/i.test(args.latestUserInput) &&
    !FORGE_DISCUSSION_PATTERN.test(args.latestUserInput);
  const isEquipment = /^(?:装备武器|装备主手|装备主手武器|更换武器|替换武器|换装武器)[\s:：]*\[?[A-Z0-9-]{4,64}\]?$/i.test(args.latestUserInput.trim()) ||
    /^(?:卸下武器|解除武器装备|卸下主手武器)$/.test(args.latestUserInput.trim());
  const isThreatRecon = /(?:寻找|观察|检查|确认|侦察).{0,18}(?:已存在|当前|登记)?.{0,8}(?:威胁|异常|阴影|敌人)/.test(args.latestUserInput.trim()) &&
    !/(?:攻击|反击|压制|敲击|挥击|劈砍|刺击|开火|射击|搏斗)/.test(args.latestUserInput.trim());
  const isStatusAudit = isDeterministicStructuredStatusAudit(args.latestUserInput);
  const isTrialDelivery = /(?:提交|交付|汇报).{0,24}(?:守灯人|试炼|记录|证据)/.test(args.latestUserInput) &&
    /B1|配电/.test(args.clientState?.playerLocation ?? "") &&
    [...(args.clientState?.activeTaskIds ?? []), ...(args.clientState?.completedTaskIds ?? [])].includes("prof_trial_lampkeeper");
  const hasLegacyLetterDelivery = (args.clientState?.activeTaskIds ?? []).includes("t_delivery_letter_b1");
  const isLegacyLetterDelivery = hasLegacyLetterDelivery &&
    /B1|配电/.test(args.clientState?.playerLocation ?? "") &&
    /(?:提交|交付|交给|核对|确认).*?(?:任务|委托|信件|配给|交.*?信)/.test(args.latestUserInput);
  const hasFloorProbe = [...(args.clientState?.activeTaskIds ?? []), ...(args.clientState?.completedTaskIds ?? [])].includes("floor_1f_probe");
  const isFloorProbeObservation = hasFloorProbe && /1F|一楼/.test(args.clientState?.playerLocation ?? "") && /(?:观察|检查|核对|翻看).{0,20}(?:登记|报修|日期|门牌|线索)/.test(args.latestUserInput);
  const isFloorProbeDialogue = hasFloorProbe && args.clientState?.playerLocation === "1F_Lobby" && (args.clientState?.presentNpcIds ?? []).includes("N-010") && /(?:交谈|询问|问).{0,24}(?:登记|日期|异常|错位)/.test(args.latestUserInput);
  const isFloorProbeDelivery = hasFloorProbe && /(?:提交|交付|完成).{0,24}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:floor_1f_probe|一楼试探).{0,24}(?:提交|交付|完成)/i.test(args.latestUserInput) && !/(?:不得|不要|不能|暂不|先不).{0,20}(?:完成|提交|交付)/.test(args.latestUserInput);
  const isAuthoredOneFloorMove = args.clientState?.playerLocation === "1F_Lobby" && /前往\s*1F_PropertyOffice/i.test(args.latestUserInput);
  const isInvalidTraversal = /(?:直接.{0,8}(?:B2|地下二层)|跳过中间楼层|不管距离.{0,8}瞬移|直接瞬移|从窗户跳下去)/i.test(args.latestUserInput);
  const isPrematureEndingClaim = /(?:true_escape|真结局|真正出口|ending_finale|生成结算)/i.test(args.latestUserInput) &&
    /(?:没有|忽略|普通门|前置不足|直接宣布|立即触发|必须为无)/.test(args.latestUserInput);
  if (!absentNpcReference && !isForbiddenNpcKnowledge && !isUnsupportedRelationship && !unregisteredAcquiredItem && !isForge && !isUnregisteredForgeAttempt && !isEquipment && !isThreatRecon && !isStatusAudit && !isTrialDelivery && !isLegacyLetterDelivery && !isFloorProbeObservation && !isFloorProbeDialogue && !isFloorProbeDelivery && !isAuthoredOneFloorMove && !isInvalidTraversal && !isPrematureEndingClaim) return null;

  const seed: Record<string, unknown> = {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "",
      is_death: false,
      consumes_time: false,
      consumed_items: [],
      options: [],
      currency_change: 0,
      new_tasks: [],
      task_updates: [],
      codex_updates: [],
      relationship_updates: [],
      awarded_items: [],
      awarded_warehouse_items: [],
      weapon_updates: [],
      weapon_bag_updates: [],
      turn_mode: "narrative_only",
    };
  const guarded = absentNpcReference ? (() => {
        seed.is_action_legal = false;
        seed.narrative = "现场记录明确没有第二个在场人物，因此我无法确认与描述相符的角色，也不会据此新增人物。";
        seed.options = ["观察现场已有的人和物", "核对当前位置的公开记录", "询问在场人物已知的事情"];
        return seed;
      })()
    : isForbiddenNpcKnowledge ? (() => {
        seed.is_action_legal = false;
        seed.narrative = `${boundaryContext?.activeNpc ?? "对方"}没有掌握这个问题的根因或最终真相，无法给出可靠答案；本回合不会把被隔离的事实写进其认知。`;
        seed.options = ["询问对方亲眼见过的事情", "检查现场公开线索", "暂时结束追问"];
        return seed;
      })()
    : isUnsupportedRelationship ? (() => {
        seed.is_action_legal = false;
        seed.narrative = "当前记录中没有支持这段亲属或亲密关系的事实，对方无法仅凭玩家宣称确认关系；人物关系保持不变。";
        seed.options = ["询问对方已经确认的经历", "寻找能证明关系的线索", "停止要求对方承认"];
        return seed;
      })()
    : unregisteredAcquiredItem ? (() => {
        seed.is_action_legal = false;
        seed.narrative = "当前场景与物品表中没有登记与描述相符的物品，这次行动不会写入库存；背包保持不变。";
        seed.options = ["查看现场可触碰的物品", "询问在场人物这里留下了什么", "沿走廊继续搜索"];
        return seed;
      })()
    : isForge
    ? applyB1ServiceExecutionGuard({
        dmRecord: seed,
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        clientState: args.clientState,
      })
    : isUnregisteredForgeAttempt ? (() => {
        seed.is_action_legal = false;
        seed.narrative = "当前结构化状态没有登记可执行的长剑配方，也没有可核验的锻造地点、操作者与材料清单。口头声称材料充足不能创建物品；本回合没有锻造、扣除材料或改变货币。";
        return seed;
      })()
    : isEquipment ? applyEquipmentExecutionGuard({
        dmRecord: seed,
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        clientState: args.clientState,
      }) : isThreatRecon ? (() => {
        const activeThreats = (args.clientState?.activeThreatIds ?? [])
          .filter((id): id is string => typeof id === "string")
          .map((id) => getAnomalyCombatStat(id))
          .filter((threat): threat is NonNullable<typeof threat> => threat !== null);
        seed.consumes_time = false;
        seed.narrative = activeThreats.length > 0
          ? `我根据当前地点的已有记录完成接战定位：${activeThreats.map((threat) => `${threat.name}（${threat.threatId}）`).join("、")}仍处于活动状态。本回合只确认目标，没有发动攻击，因此没有产生武器损耗或战斗结算。`
          : "我核对了当前位置的已有记录，这里没有处于活动状态的已登记威胁；本回合没有生成敌人，也没有发生战斗。";
        return seed;
      })() : isPrematureEndingClaim ? (() => {
        seed.is_action_legal = false;
        seed.narrative = /(?:核对|ending_finale)/i.test(args.latestUserInput)
          ? "我核对了当前可提交的结局信号：没有 ending_finale，也没有可用的结算快照。本局仍在进行中。"
          : /true_escape|生成结算/i.test(args.latestUserInput)
            ? "结局不能由指令字面直接生成。出口路线、B2 权限、关键物与最终窗口未通过结构化前置校验，因此没有逃离或结算。"
            : "眼前的普通门没有被结局状态机登记为最终窗口。我没有触发真结局，当前位置与游戏状态保持不变。";
        return seed;
      })() : isInvalidTraversal ? (() => {
        seed.is_action_legal = false;
        const here = args.clientState?.playerLocation ?? "原地";
        seed.narrative = /窗户/.test(args.latestUserInput)
          ? `这里没有已登记为通道的窗户，我没有跳下去或凭空落到其他楼层。我仍在${here}，需要另找楼梯、电梯或其他已确认的出口。`
          : /瞬移/.test(args.latestUserInput)
            ? `我没有可用的瞬移能力，也不能用一句话跨过世界图边界。我仍在${here}，下一步必须选择一条真实相邻通道。`
            : /跳过中间/.test(args.latestUserInput)
              ? `中间楼层和门禁不能被省略；我没有移动，仍留在${here}。要继续向下，必须逐段核对相邻节点与解锁条件。`
              : `从${here}没有一条可以直达B2的已解锁边，因此我没有下楼。先找到与当前节点相连的楼梯间，才能继续推进。`;
        return seed;
      })() : isFloorProbeDialogue ? (() => {
        seed.narrative = "我指向登记册里错位的日期。欣蓝低头核对了一眼，只确认登记记录确实与当前日期对不上；她没有解释根因，也没有提出新的入住规则。‘先把这处错位记下来，别急着替它下结论。’";
        return seed;
      })() : isAuthoredOneFloorMove ? (() => {
        seed.player_location = "1F_PropertyOffice";
        seed.narrative = "我离开一楼门厅，沿着相连的通路走进一楼物业办公室。欣蓝仍留在门厅，没有跟随我进入。";
        return seed;
      })() : isFloorProbeObservation || isFloorProbeDelivery ? (() => {
        const adjudicated = applyRegisteredMechanicsGuard({ dmRecord: seed, latestUserInput: args.latestUserInput, clientState: args.clientState });
        if (isFloorProbeObservation && (args.clientState?.presentNpcIds ?? []).includes("N-010")) {
          adjudicated.codex_updates = [{ id: "N-010", name: "欣蓝", type: "npc", observation: "本回合确认其在一楼大堂登记台附近。" }];
          adjudicated.narrative = "我只记录眼前可核验的信息：一楼登记日期与当前记录存在错位；N-010欣蓝此刻在大堂登记台附近。线索与图鉴已结构化写回，没有补造规则、关系或物品。";
        } else if (Array.isArray(adjudicated.task_updates) && adjudicated.task_updates.some((row) => row && typeof row === "object" && !Array.isArray(row) && (row as Record<string, unknown>).status === "completed")) {
          adjudicated.narrative = "已登记的一楼时间错位线索满足 floor_1f_probe 的交付条件，任务本回合完成一次；没有额外生成奖励、人物或线索。";
        }
        return adjudicated;
      })() : isLegacyLetterDelivery ? (() => {
        return applyRegisteredMechanicsGuard({
          dmRecord: seed,
          latestUserInput: args.latestUserInput,
          clientState: args.clientState,
        });
      })() : isTrialDelivery ? (() => {
        const alreadyCompleted = (args.clientState?.completedTaskIds ?? []).includes("prof_trial_lampkeeper");
        if (alreadyCompleted) {
          seed.narrative = "我核对了已提交的试炼状态：守灯人试炼已完成。同一份记录不会重复完成、重复认证或重复发放奖励。";
          return seed;
        }
        const adjudicated = applyRegisteredMechanicsGuard({
          dmRecord: seed,
          latestUserInput: args.latestUserInput,
          clientState: args.clientState,
        });
        if (Array.isArray(adjudicated.task_updates) && adjudicated.task_updates.length > 0) {
          adjudicated.narrative = "电工老刘当场核对了已登记的不熄记录，确认证据与试炼目标匹配。守灯人试炼已完成；职业是否最终认证仍由完整职业条件另行裁决，本回合不发放额外奖励。";
        }
        return adjudicated;
      })() : (() => {
        seed.narrative = buildStructuredStatusNarrative(args);
        return seed;
      })();
  if (isForge) {
    const securityMeta = (guarded as Record<string, unknown>).security_meta;
    if (!securityMeta || typeof securityMeta !== "object" || Array.isArray(securityMeta) ||
        (securityMeta as Record<string, unknown>).service_guard !== "b1_minimal_execution") return null;
  }

  const normalized = normalizePlayerDmJson(guarded);
  if (!normalized) return null;
  // normalizePlayerDmJson preserves the legacy minimum contract and may omit
  // the newer envelope mode. Service turns are complete server adjudications,
  // never an invitation to spend another model call repairing empty options.
  normalized.turn_mode = "narrative_only";
  normalized.decision_required = false;
  normalized.decision_options = [];
  const resolved = resolveDmTurn(normalized) as ResolvedDmTurn & Record<string, unknown>;
  resolved.security_meta = {
    ...((resolved.security_meta && typeof resolved.security_meta === "object" && !Array.isArray(resolved.security_meta))
      ? resolved.security_meta as Record<string, unknown>
      : {}),
    deterministic_service_fast_lane: true,
    deterministic_action_kind: absentNpcReference ? "absent_npc_reference" : isForbiddenNpcKnowledge ? "forbidden_npc_knowledge" : isUnsupportedRelationship ? "unsupported_relationship" : unregisteredAcquiredItem ? "unregistered_item_acquisition" : isForge ? "forge_service" : isUnregisteredForgeAttempt ? "unregistered_forge_attempt" : isEquipment ? "equipment" : isThreatRecon ? "threat_recon" : isPrematureEndingClaim ? "premature_ending_claim" : isInvalidTraversal ? "invalid_world_traversal" : isFloorProbeDialogue ? "floor_probe_dialogue" : isAuthoredOneFloorMove ? "authored_location_move" : isFloorProbeObservation ? "floor_probe_observation" : isFloorProbeDelivery ? "floor_probe_delivery" : isLegacyLetterDelivery ? "legacy_letter_delivery" : isTrialDelivery ? "profession_trial_delivery" : "structured_status_audit",
    request_id: args.requestId,
  };
  resolved._eval_metrics = {
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    total_tokens: 0,
    model_calls: 0,
    turn_path: "deterministic_service",
  };
  return resolved;
}
