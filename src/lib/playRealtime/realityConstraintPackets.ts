import { parseRuntimeNpcPrimitives } from "@/lib/playRealtime/runtimeContextPackets";
import { clamp } from "@/lib/clamp";
import { NPCS } from "@/lib/registry/npcs";

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function parseTimeLine(playerContext: string): { day: number | null; hour: number | null } {
  const m = String(playerContext ?? "").match(/游戏时间\[第(\d+)日\s+(\d+)时\]/);
  if (!m) return { day: null, hour: null };
  const day = Number.parseInt(m[1] ?? "", 10);
  const hour = Number.parseInt(m[2] ?? "", 10);
  return {
    day: Number.isFinite(day) ? day : null,
    hour: Number.isFinite(hour) ? hour : null,
  };
}

function parseMainThreatLine(playerContext: string): string {
  const m = String(playerContext ?? "").match(/主威胁状态：([^。]+)。/);
  return clampText(m?.[1] ?? "", 220);
}

function hotThreatPresentFromContext(playerContext: string): boolean {
  const s = String(playerContext ?? "");
  if (!/主威胁状态：/.test(s)) return false;
  return /(active|breached|失控|危险|追逼|压制中)/i.test(s);
}

export function buildRealityConstraintPacketBlock(args: {
  playerContext: string;
  latestUserInput: string;
  playerLocationFallback: string | null;
  clientState: unknown;
  maxChars?: number;
  /** Stable prompt 已承载通用规则时，只发送本回合事实与极短执行提示。 */
  dedupeStableRules?: boolean;
}): string {
  const prim = parseRuntimeNpcPrimitives(args.playerContext, args.playerLocationFallback);
  const time = parseTimeLine(args.playerContext);
  const mainThreat = parseMainThreatLine(args.playerContext);
  const hotThreat = hotThreatPresentFromContext(args.playerContext);
  const cs = args.clientState as any;
  const presentNpcIds =
    Array.isArray(cs?.presentNpcIds) ? (cs.presentNpcIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  const presentNpcs = presentNpcIds.map((id) => {
    const npc = NPCS.find((row) => row.id === id);
    return { id, name: npc?.name ?? null };
  });
  const deadNpcIds =
    Array.isArray(cs?.deadNpcIds) ? (cs.deadNpcIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 32) : [];
  const activeThreatIds =
    Array.isArray(cs?.activeThreatIds) ? (cs.activeThreatIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 24) : [];
  const currentProfession = typeof cs?.currentProfession === "string" ? clampText(cs.currentProfession, 32) : "";
  const equippedWeapon = cs?.equippedWeapon && typeof cs.equippedWeapon === "object"
    ? { id: clampText(String(cs.equippedWeapon.id ?? ""), 64), name: clampText(String(cs.equippedWeapon.name ?? ""), 64) }
    : null;
  const weaponBag = Array.isArray(cs?.weaponBag)
    ? cs.weaponBag.slice(0, 12).flatMap((raw: unknown) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const weapon = raw as Record<string, unknown>;
        const id = clampText(String(weapon.id ?? ""), 64);
        if (!id) return [];
        return [{ id, name: clampText(String(weapon.name ?? ""), 64) }];
      })
    : [];
  const journalClueIds =
    Array.isArray(cs?.journalClueIds) ? (cs.journalClueIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  const directorDigest = cs?.directorDigest?.digest && typeof cs.directorDigest.digest === "string"
    ? clampText(cs.directorDigest.digest, 220)
    : "";
  const memoryDigest = typeof cs?.memoryDigest === "string" ? clampText(cs.memoryDigest, 220) : "";
  const narrativeLinkageDigest = typeof cs?.narrativeLinkageDigest === "string" ? clampText(cs.narrativeLinkageDigest, 220) : "";

  const fullPacket = {
    schema: "reality_constraint_v1",
    scene: {
      location: prim.location ?? null,
      time,
      hot_threat_present: hotThreat,
      main_threat_surface: mainThreat,
      present_npc_ids: presentNpcIds,
      present_npcs: presentNpcs,
      dead_npc_ids: deadNpcIds,
      active_threat_ids: activeThreatIds,
      // Forbid offscreen NPC direct dialogue unless marked present by authority packets.
      offscreen_npc_rule:
        "不在 present_npc_ids（或 npc_scene_authority_packet.presentNpcIds）里的 NPC 禁止直接开口/当面对话；只能远处声响/传闻/回忆。",
      dead_npc_rule: "dead_npc_ids 中的 NPC 已死亡，禁止复活、现身、开口、行动或被移动位置。",
    },
    player_authority: {
      current_profession: currentProfession || null,
      equipped_weapon: equippedWeapon,
      weapon_bag: weaponBag,
      rule: "不得否认、重选或重新拾取这里已存在的职业与装备；武器袋只能包含 weapon_bag 列出的物品，禁止补写撬棍、刀具等不存在装备。",
    },
    locality_rules: {
      location_scope:
        "叙事信息只允许来自‘当前地点’与‘相邻可感知范围’（门缝、走廊拐角、楼梯口传来的声响等）。禁止跨楼层瞬时知道远处发生了什么。",
      transition_required:
        "若发生位置变化（跨门/走廊/楼层），必须写出过渡与阻力（脚步、门、楼梯、光线、气味变化），避免‘一眨眼就到了’。",
      time_cost_feel:
        "动作必须带时间代价感：试探/停顿/短对话=轻；正式交涉/服务/跨层移动=重。禁止瞬间跨多层剧情结论。",
    },
    knowledge_rules: {
      clue_gate:
        "主角不能自然说出未掌握的线索；若灵光一现只能写成‘猜测/不确定’，并需后续验证（手记/线索/任务状态约束）。",
      epistemic_reaction:
        "当玩家/叙事触及 NPC 不应知道的内容，NPC 必须表现反应（惊讶/试探/敌意/警惕/追问/否认），不得无反应承认。",
    },
    social_rules: {
      relationship_pressure:
        "关系（好感/信任/恐惧/债务）必须影响语气与互动：高压时更短、更防御；亲近也要克制，不得‘全员一个味’。",
    },
    threat_rules: {
      when_hot_threat:
        "主威胁热区会改变场景张力、选项风险、NPC 行为：更紧张、更谨慎、更少废话；避免在高压场景里语气过于平静。",
      settlement_gate: "只有 active_threat_ids 中的威胁可产生战斗结算和武器损耗；列表为空时必须明确没有可结算目标。",
    },
    digests: {
      directorDigest,
      memoryDigest,
      narrativeLinkageDigest,
      journalClueIds,
    },
    latest_user_input_hint: clampText(args.latestUserInput, 120),
  };

  const compactPacket = {
    schema: "reality_constraint_v3_compact",
    scene: {
      location: prim.location ?? null,
      time,
      ...(hotThreat ? { hot_threat: true } : {}),
      present_npc_ids: presentNpcIds,
      ...(deadNpcIds.length ? { dead_npc_ids: deadNpcIds } : {}),
      ...(activeThreatIds.length ? { active_threat_ids: activeThreatIds } : {}),
    },
    ...(currentProfession ? { profession: currentProfession } : {}),
    ...(equippedWeapon?.name ? { weapon: equippedWeapon.name } : {}),
    rules: [
      "仅在场NPC可当面对话；死亡NPC不得行动；只写当前或相邻可感知范围；移动须有过渡与时间感",
      "职业、装备、威胁结算只服从本包与结构字段；不得凭空新增任何ID",
    ],
  };

  const packet = args.dedupeStableRules ? compactPacket : fullPacket;
  const text = `## 【reality_constraint_packet】\n${JSON.stringify(packet)}`;
  const maxChars = clamp(args.maxChars ?? 1200, 420, 2600);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}
