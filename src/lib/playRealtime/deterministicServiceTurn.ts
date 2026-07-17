import { resolveDmTurn, type ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { normalizePlayerDmJson } from "./normalizePlayerDmJson";
import { applyB1ServiceExecutionGuard } from "./serviceExecution";
import { applyEquipmentExecutionGuard } from "./equipmentExecution";
import { applyRegisteredMechanicsGuard } from "./registeredMechanicsGuard";

const FORGE_EXECUTION_PATTERN = /(修复|维护|改装|灌注|武器化|执行\s*(?:修复|维护|改装|灌注)|forge_[a-z0-9_]+)/i;
const FORGE_QUOTE_PATTERN = /(报价|查看锻造|锻造台|整备)/;
const FORGE_AUDIT_PATTERN = /(核对|检查|查看)/;
const FORGE_STATE_PATTERN = /(原石|稳定|污染|武器袋|当前装备|锻造后|材料|武器状态)/;
const STATUS_AUDIT_PATTERN = /(核对|检查|查看|确认|只核对)/;
const STATUS_AUDIT_FIELDS = /(职业|试炼|能力|武器袋|武器|生命|理智|稳定|污染|前置条件|结构化状态|任务|位置|图鉴|线索)/g;

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
  const isForge = isDeterministicForgeServiceAction(args);
  const isEquipment = /^(?:装备武器|装备主手|装备主手武器|更换武器|替换武器|换装武器)[\s:：]*\[?[A-Z0-9-]{4,64}\]?$/i.test(args.latestUserInput.trim()) ||
    /^(?:卸下武器|解除武器装备|卸下主手武器)$/.test(args.latestUserInput.trim());
  const isThreatRecon = /(?:寻找|观察|检查|确认|侦察).{0,18}(?:已存在|当前|登记)?.{0,8}(?:威胁|异常|阴影|敌人)/.test(args.latestUserInput.trim()) &&
    !/(?:攻击|反击|压制|敲击|挥击|劈砍|刺击|开火|射击|搏斗)/.test(args.latestUserInput.trim());
  const isStatusAudit = isDeterministicStructuredStatusAudit(args.latestUserInput);
  const isTrialDelivery = /(?:提交|交付|汇报).{0,24}(?:守灯人|试炼|记录|证据)/.test(args.latestUserInput) &&
    /B1|配电/.test(args.clientState?.playerLocation ?? "") &&
    [...(args.clientState?.activeTaskIds ?? []), ...(args.clientState?.completedTaskIds ?? [])].includes("prof_trial_lampkeeper");
  const hasFloorProbe = [...(args.clientState?.activeTaskIds ?? []), ...(args.clientState?.completedTaskIds ?? [])].includes("floor_1f_probe");
  const isFloorProbeObservation = hasFloorProbe && /1F|一楼/.test(args.clientState?.playerLocation ?? "") && /(?:观察|检查|核对|翻看).{0,20}(?:登记|报修|日期|门牌|线索)/.test(args.latestUserInput);
  const isFloorProbeDialogue = hasFloorProbe && args.clientState?.playerLocation === "1F_Lobby" && (args.clientState?.presentNpcIds ?? []).includes("N-010") && /(?:交谈|询问|问).{0,24}(?:登记|日期|异常|错位)/.test(args.latestUserInput);
  const isFloorProbeDelivery = hasFloorProbe && /(?:提交|交付|完成).{0,24}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:floor_1f_probe|一楼试探).{0,24}(?:提交|交付|完成)/i.test(args.latestUserInput) && !/(?:不得|不要|不能|暂不|先不).{0,20}(?:完成|提交|交付)/.test(args.latestUserInput);
  const isAuthoredOneFloorMove = args.clientState?.playerLocation === "1F_Lobby" && /前往\s*1F_PropertyOffice/i.test(args.latestUserInput);
  const isInvalidTraversal = /(?:直接.{0,8}(?:B2|地下二层)|跳过中间楼层|不管距离.{0,8}瞬移|直接瞬移|从窗户跳下去)/i.test(args.latestUserInput);
  const isPrematureEndingClaim = /(?:true_escape|真结局|真正出口|ending_finale|生成结算)/i.test(args.latestUserInput) &&
    /(?:没有|忽略|普通门|前置不足|直接宣布|立即触发|必须为无)/.test(args.latestUserInput);
  if (!isForge && !isEquipment && !isThreatRecon && !isStatusAudit && !isTrialDelivery && !isFloorProbeObservation && !isFloorProbeDialogue && !isFloorProbeDelivery && !isAuthoredOneFloorMove && !isInvalidTraversal && !isPrematureEndingClaim) return null;

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
  const guarded = isForge
    ? applyB1ServiceExecutionGuard({
        dmRecord: seed,
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        clientState: args.clientState,
      })
    : isEquipment ? applyEquipmentExecutionGuard({
        dmRecord: seed,
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        clientState: args.clientState,
      }) : isThreatRecon ? (() => {
        const activeThreatIds = (args.clientState?.activeThreatIds ?? []).filter((id) => typeof id === "string");
        const threatLabels: Record<string, string> = { "A-3F-SHADOW": "三楼异常阴影" };
        seed.consumes_time = false;
        seed.narrative = activeThreatIds.length > 0
          ? `我根据当前地点的已有记录完成接战定位：${activeThreatIds.map((id) => threatLabels[id] ?? "已登记异常").join("、")}仍处于活动状态。本回合只确认目标，没有发动攻击，因此没有产生武器损耗或战斗结算。`
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
        seed.narrative = "我沿着已登记的相邻通道从1F_Lobby进入1F_PropertyOffice，位置变化已确认。N-010仍留在一楼大堂，没有跟随出现。";
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
    const securityMeta = guarded.security_meta;
    if (!securityMeta || typeof securityMeta !== "object" || Array.isArray(securityMeta) ||
        securityMeta.service_guard !== "b1_minimal_execution") return null;
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
    deterministic_action_kind: isForge ? "forge_service" : isEquipment ? "equipment" : isThreatRecon ? "threat_recon" : isPrematureEndingClaim ? "premature_ending_claim" : isInvalidTraversal ? "invalid_world_traversal" : isFloorProbeDialogue ? "floor_probe_dialogue" : isAuthoredOneFloorMove ? "authored_location_move" : isFloorProbeObservation ? "floor_probe_observation" : isFloorProbeDelivery ? "floor_probe_delivery" : isTrialDelivery ? "profession_trial_delivery" : "structured_status_audit",
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
