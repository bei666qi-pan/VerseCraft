import type { NpcProfileV2, NPC } from "@/lib/registry/types";
import type { HiddenNpcCombatProfileV1 } from "./types";

export type CombatRangeBias = "contact" | "near" | "mixed";
export type CombatDestructionScale = "none" | "minor" | "room" | "corridor";
export type CombatFinishTendency = "subdue" | "trade_exit" | "break_morale" | "kill_if_rule";

/**
 * 结构化战斗风格定义（V1）
 * - 目的：让“战斗方式=人格延伸”可以长期维护，而不是散乱 prompt 句子
 * - 注意：这里描述的是叙事/裁决锚点，不是数值面板
 */
export type CombatStyleDefinitionV1 = {
  styleKey: string;
  label: string;
  /**
   * movementStyle：移动与站位偏好
   * 示例：贴墙、卡门框、半步换位、绕背、短促突进后撤等
   */
  movementStyle: string[];
  /**
   * pressureSource：压迫来源（空间/规则/心理/器物）
   * 强约束：必须是“局部失真/局部异常”，不允许毁天灭地
   */
  pressureSource: string[];
  rangeBias: CombatRangeBias;
  contactFeel: string[];
  anomalyFlavor: string[];
  environmentInteraction: string[];
  destructionScale: CombatDestructionScale;
  finishTendency: CombatFinishTendency;
  signatureBeats: string[];
  forbiddenExaggerations: string[];
};

export type CombatStyleResolveResult = {
  styleKey: string;
  def: CombatStyleDefinitionV1;
  reasons: string[];
};

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function commonForbidden(): string[] {
  return [
    "禁止写成毁天灭地或大范围爆炸",
    "禁止写成光炮/陨石/大招对轰",
    "禁止把走廊写成崩塌的城市战场",
    "禁止血条/技能轮换式数值战斗",
    "禁止高速连闪到看不清的超人战",
    "破坏尺度最多到：房间/走廊/楼梯间/门厅/局部器物",
  ];
}

/**
 * 高魅力 NPC 专属风格（强辨识度，战斗方式=人格延伸）
 * styleKey 约定：major:N-xxx
 */
export const NPC_COMBAT_STYLE_REGISTRY_V1: Record<string, CombatStyleDefinitionV1> = {
  "major:N-015": {
    styleKey: "major:N-015",
    label: "边界巡守·守线卡位",
    movementStyle: [
      "永远不把背交出去；先占门框与拐角",
      "半步换位，逼你离开可退处",
      "手臂/肩位卡住你要越线的那一下",
    ],
    pressureSource: [
      "空间边界像被画了线：你一越线，空气就变重",
      "规则压迫：‘你不该过去’被写成身体阻力",
    ],
    rangeBias: "contact",
    contactFeel: ["近身压迫、肢体控制、像把你按回‘该站的位置’"],
    anomalyFlavor: ["微异能：边界感具象化为沉重与阻力（非大范围护罩）"],
    environmentInteraction: ["利用门框/墙角/楼梯扶手把退路卡成窄缝"],
    destructionScale: "minor",
    finishTendency: "subdue",
    signatureBeats: [
      "先一句短硬警告，再用站位把你逼回线内",
      "不追杀到底：只把冲突压回可控范围",
    ],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止写成‘一掌震碎整层楼’"], 10),
  },
  "major:N-010": {
    styleKey: "major:N-010",
    label: "登记口交易·条件与撤离窗口",
    movementStyle: ["始终站在‘你需要通过的那条线’旁边", "以退为进：让你自己走进不舒服的位置"],
    pressureSource: ["心理账本：每一步都像在签字", "空间秩序：走廊被她的节奏切成‘可过/不可过’"],
    rangeBias: "mixed",
    contactFeel: ["不爱硬碰：用一句话让你迟疑，再用那半秒换位置"],
    anomalyFlavor: ["微异能：‘犹豫’被放大成身体迟滞（局部、短促）"],
    environmentInteraction: ["利用柜台/门禁/登记口‘通过权’制造停顿"],
    destructionScale: "none",
    finishTendency: "trade_exit",
    signatureBeats: ["先问目标，再给两条都带代价的路", "真正的‘打’发生在你开口之前"],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止把她写成莽撞打手"], 10),
  },
  "major:N-018": {
    styleKey: "major:N-018",
    label: "商人式对抗·试探换价",
    movementStyle: ["短促贴近试探，立刻拉开", "永远留退路，永远看出口"],
    pressureSource: ["对价压迫：你越急，他越把窗口收窄", "器物压迫：用物件/地形换优势"],
    rangeBias: "mixed",
    contactFeel: ["像‘谈判’一样动手：每一下都在要价，不在求杀"],
    anomalyFlavor: ["微异能：交换链的‘等价’像短暂束缚（局部、瞬间）"],
    environmentInteraction: ["拿走一件小物，等于拿走你的一点自由（叙事锚）"],
    destructionScale: "minor",
    finishTendency: "trade_exit",
    signatureBeats: ["给你看见‘可以赢’的错觉，然后把代价写到你身上", "赢了也不追：收账才是结束"],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止写成屠杀型狂战"], 10),
  },
  "major:N-013": {
    styleKey: "major:N-013",
    label: "诱导刃·示弱与反咬",
    movementStyle: ["先示弱退半步，引你靠近", "贴着危险点走：你跟上就要付代价"],
    pressureSource: ["社交压迫：一句话让你觉得‘不帮就是错’", "空间诱导：把你带到不舒服的位置"],
    rangeBias: "near",
    contactFeel: ["不靠力量赢：靠你先动手、先失衡"],
    anomalyFlavor: ["微异能：‘同情/责任感’被短暂放大成动作偏差（局部）"],
    environmentInteraction: ["借门缝、阴影、杂物堆制造‘看似安全’的陷阱点"],
    destructionScale: "minor",
    finishTendency: "break_morale",
    signatureBeats: ["先让你觉得自己占理，再在你最用力那下让你出丑", "不把冲突推到大破坏：更像一刀割在自尊上"],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止写成纯近战猛男"], 10),
  },
  "major:N-007": {
    styleKey: "major:N-007",
    label: "镜像反制·错位回弹",
    movementStyle: ["不正面对撞：总在你用力那下侧开半步", "以墙面/镜面找角度，不追直线"],
    pressureSource: ["错位压迫：你越用力，越像打在自己身上", "空间反射：方向感被轻微扭曲"],
    rangeBias: "near",
    contactFeel: ["像‘回弹’：不疼在当下，疼在你下一步站错的位置"],
    anomalyFlavor: ["微异能：镜像/反射造成的‘半拍延迟’（局部、短促）"],
    environmentInteraction: ["利用玻璃、金属、反光面做定位与反制（不写光炮）"],
    destructionScale: "none",
    finishTendency: "subdue",
    signatureBeats: ["不抢攻：等你露出破绽再让你自己绊倒", "结束像把门关上：把你推回‘不该来’的那边"],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止写成华丽异能特效连发"], 10),
  },
  "major:N-020": {
    styleKey: "major:N-020",
    label: "止损护送·温柔压迫",
    movementStyle: ["先护住你手上的危险动作", "把冲突带离‘会出事的角落’"],
    pressureSource: ["情绪压迫：笑着但不容你继续", "节奏压迫：把你的冲动按成停顿"],
    rangeBias: "contact",
    contactFeel: ["更像控制与保护：短促动作把你按停，不追杀"],
    anomalyFlavor: ["微异能：‘日常感’短暂覆盖恐惧，使人迟疑（局部、短促）"],
    environmentInteraction: ["用台面/货架/门帘把视线切碎，避免扩散"],
    destructionScale: "minor",
    finishTendency: "subdue",
    signatureBeats: ["先让你意识到‘你会受伤’，再把冲突降级", "不升级破坏：她的强在于止损"],
    forbiddenExaggerations: uniq([...commonForbidden(), "禁止写成治愈光环或大范围净化"], 10),
  },
};

/**
 * 普通 NPC/服务 NPC 的默认模板：可长期维护的“风格族谱”
 * styleKey 约定：tpl:...
 */
export const NPC_COMBAT_STYLE_TEMPLATES_V1: Record<string, CombatStyleDefinitionV1> = {
  "tpl:service_staff": {
    styleKey: "tpl:service_staff",
    label: "服务职能·短促止损",
    movementStyle: ["靠近但不追：用站位阻断冲突升级", "把人推回安全边界"],
    pressureSource: ["职能压迫：‘这里不许闹’写进动作里"],
    rangeBias: "contact",
    contactFeel: ["短促、克制、按停为主"],
    anomalyFlavor: ["微异能：空间秩序的轻微回弹（局部）"],
    environmentInteraction: ["利用台面/门框/栏杆把动作收束"],
    destructionScale: "minor",
    finishTendency: "subdue",
    signatureBeats: ["先一句规矩，再一记按停", "冲突被压回可控范围"],
    forbiddenExaggerations: uniq(commonForbidden(), 10),
  },
  "tpl:dangerous_resident": {
    styleKey: "tpl:dangerous_resident",
    label: "危险住户·近身压迫",
    movementStyle: ["贴近压迫，逼退路", "短爆发后停手观察"],
    pressureSource: ["空间压迫：走廊变窄，呼吸变重"],
    rangeBias: "near",
    contactFeel: ["抓、推、卡位；动作带一点不讲理的狠"],
    anomalyFlavor: ["微异能：局部气压/重力错位（房间级别）"],
    environmentInteraction: ["用家具/门缝制造狭窄窗口"],
    destructionScale: "room",
    finishTendency: "break_morale",
    signatureBeats: ["先压住你，再给你一个退的台阶"],
    forbiddenExaggerations: uniq(commonForbidden(), 10),
  },
  "tpl:information_broker": {
    styleKey: "tpl:information_broker",
    label: "情报型·威慑与撤离",
    movementStyle: ["不恋战：一旦逼到你退就停", "永远靠近出口或视线死角"],
    pressureSource: ["心理压迫：用信息威胁替代硬碰"],
    rangeBias: "mixed",
    contactFeel: ["更像威慑：让你觉得‘继续会更糟’"],
    anomalyFlavor: ["微异能：短暂‘被注视’的窒息感（局部）"],
    environmentInteraction: ["用阴影/走廊回声制造错觉"],
    destructionScale: "minor",
    finishTendency: "trade_exit",
    signatureBeats: ["一句话把你钉在原地，然后撤离"],
    forbiddenExaggerations: uniq(commonForbidden(), 10),
  },
};

export function getCombatStyleFromRegistry(styleKey: string): CombatStyleDefinitionV1 | null {
  const k = String(styleKey ?? "").trim();
  if (!k) return null;
  return NPC_COMBAT_STYLE_REGISTRY_V1[k] ?? NPC_COMBAT_STYLE_TEMPLATES_V1[k] ?? null;
}

export function getRegisteredStyleKeyForMajorNpc(npcId: string): string | null {
  const k = `major:${String(npcId ?? "").trim()}`;
  return NPC_COMBAT_STYLE_REGISTRY_V1[k] ? k : null;
}

export function resolveNpcStyleTemplateKey(args: {
  npcId: string;
  npcProfileV2: NpcProfileV2 | null;
  npcRegistryRow?: NPC | null;
  hiddenProfile?: Pick<HiddenNpcCombatProfileV1, "storyClass" | "styleTags"> | null;
}): string {
  const storyClass = args.hiddenProfile?.storyClass ?? (args.npcId ? (args.npcId.startsWith("N-") ? "resident" : "unknown") : "unknown");
  if (storyClass === "major_charm") return `major:${args.npcId}`;

  const specialty = String(args.npcRegistryRow?.specialty ?? args.npcProfileV2?.display?.specialty ?? "").trim();
  if (/后勤|补给|服务|登记|洗衣|配电/.test(specialty)) return "tpl:service_staff";
  if (/情报/.test(specialty)) return "tpl:information_broker";
  if (/战斗辅助/.test(specialty)) return "tpl:dangerous_resident";

  // 最后兜底：按风格标签族谱
  const head = (args.hiddenProfile?.styleTags ?? []).find((x) => x && x !== "unknown");
  if (head === "tradecraft" || head === "social_pressure") return "tpl:information_broker";
  return "tpl:dangerous_resident";
}

