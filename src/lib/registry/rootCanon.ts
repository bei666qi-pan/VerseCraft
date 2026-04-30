/**
 * Immutable Root Canon — 最少量不可变根真相（不含楼层细化、经济叙事块）。
 */

import type { FloorId } from "./types";

export interface ImmutableRootCanonEntry {
  id: string;
  title: string;
  truth: string;
}

export const IMMUTABLE_ROOT_CANON: readonly ImmutableRootCanonEntry[] = [
  {
    id: "dragon_stomach_anchor",
    title: "龙胃锚定",
    truth:
      "如月公寓并非被摧毁，而是被【空间】权柄碎片钉在龙胃黏膜与现实夹层之间，形成半消化、半稳定的异常泡层。",
  },
  {
    id: "yeliri_school_first_leak",
    title: "耶里学校·碎片缘起",
    truth:
      "【空间】权柄碎片初次大规模异动与「卷入」叙事，可追溯至耶里学校侧泄露；其后裂隙路由将异常泡层锚定于龙胃与现实夹层之间。",
  },
  {
    id: "space_fragment_causality",
    title: "空间碎片因果",
    truth:
      "碎片泄露将关联建筑从常轨坐标剥离；如月公寓泡层被龙胃当作外来组织包裹并重写，楼层呈现为可运维的消化阶段性切片（收容结构，而非同一泄露点的简单复制）。",
  },
  {
    id: "seven_anchor_containment",
    title: "七锚收容",
    truth:
      "泡层内嵌固定七锚：主锚为外来卷入的回声体；六名为长期标定的共鸣辅锚，共同分担稳定代价。公寓负责收容与循环调度，学校侧负责缘起卷入。",
  },
  {
    id: "b2_exit_truth",
    title: "出口与守门人",
    truth:
      "地下二层是唯一穿透夹层的出口喉管。A-008 守门人负责筛除不稳定个体；凌晨 1 点与抵挡攻击只能形成侦查/撤退窗口，不能替代钥物、许可、认可与代价链。出口门由不可破坏的规则木门封锁。",
  },
  {
    id: "player_echo_identity",
    title: "玩家回声体",
    truth:
      "玩家不是普通住户，而是被碎片捕获的外来回声体（主锚）。强处在于难以被循环彻底抛弃、可保留碎片化记忆、对空间褶皱敏感；非典型无限成长战力模板，秩序与资源裁决仍服从系统。",
  },
] as const;

/** 与玩法/地图强绑定的全局硬锚（不可在叙事中推翻）。 */
export const STABLE_MECHANISM_ANCHORS: readonly string[] = [
  "地下二层是唯一实体出口，A-008 深渊守门人常驻；B2 不是普通 Boss 房。",
  "出口木门不可被物理破坏，需路线碎片、B2 通行权限、钥物/资格、守门人认可或替代通行、代价试炼与最终窗口行动。",
  "地下一层（B1）是稳定带：允许交易、修整与锚点重构；只拦 hostile 直接伤害，不免除服务、交易、复活、锻造、真相与时间代价。",
  "游戏时间第 3 日 0 时起进入暗月阶段，威胁整体抬升（与龙月校准相位同一闭环，非独立 debuff）。",
  "NPC 固定 ID 为 N-001 至 N-020，禁止无来源新增角色。",
  "诡异楼层绑定：1F A-001，2F A-004，3F A-003，4F A-002，5F A-005，6F A-006，7F A-007，B2 A-008（不得互换楼层）。",
  "叙事向存在约十日量级的封闭纠错窗口；位相末闪烁为执行型回收，用于收紧不可收敛分支，并与锚点回写语义同构但触发不同（非单纯死亡描写）。",
  "龙月为外置校准能量源；公寓借其辐照驱动泡层节律，与第3日起暗月阶段、十日窗口前兆—纠错链同一解释面。",
] as const;

/** 建筑结构（与 MAP / FLOORS 一致，仅作根目录速查）。 */
export const STRUCTURE_FLOORS_SUMMARY: readonly { id: FloorId; label: string; note: string }[] = [
  { id: "B2", label: "地下二层", note: "出口通道、守门人结界。A-008。" },
  { id: "B1", label: "地下一层", note: "迟滞稳定带：服务中枢、锚点重构安全窗、原石经济前台；相对地上层更「可运维」。" },
  { id: "1", label: "1 楼", note: "门厅、物业、保安、信箱。" },
  { id: "2", label: "2 楼", note: "诊室 201、走廊。" },
  { id: "3", label: "3 楼", note: "301/302、楼梯间。" },
  { id: "4", label: "4 楼", note: "401/402、走廊尽头。" },
  { id: "5", label: "5 楼", note: "画室 503 等。" },
  { id: "6", label: "6 楼", note: "601/602、楼梯间。" },
  { id: "7", label: "7 楼", note: "长椅、厨房、封门、管理者活动面。" },
] as const;

export function buildImmutableRootCanonBlock(): string {
  return IMMUTABLE_ROOT_CANON.map((entry) => `【${entry.title}】${entry.truth}`).join("\n");
}

export function buildStableMechanismAnchorBlock(): string {
  return STABLE_MECHANISM_ANCHORS.map((line) => `- ${line}`).join("\n");
}

export function buildStructureSummaryBlock(): string {
  return STRUCTURE_FLOORS_SUMMARY.map((f) => `- ${f.label}（${f.id}）：${f.note}`).join("\n");
}
