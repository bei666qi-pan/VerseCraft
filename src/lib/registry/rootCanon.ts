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
    id: "space_fragment_causality",
    title: "空间碎片因果",
    truth:
      "碎片泄露时将建筑整体从现实坐标剥离，公寓结构被龙胃当作外来组织包裹并重写，楼层成为消化过程的阶段性切片。",
  },
  {
    id: "b2_exit_truth",
    title: "出口与守门人",
    truth:
      "地下二层是唯一穿透夹层的出口喉管。A-008 守门人负责筛除不稳定个体，出口门由不可破坏的规则木门封锁。",
  },
  {
    id: "player_echo_identity",
    title: "玩家回声体",
    truth:
      "玩家不是普通住户，而是被碎片捕获的外来回声体。回声体可被锚点重构但会支付代价，且无法无限制篡改公寓秩序。",
  },
] as const;

/** 与玩法/地图强绑定的全局硬锚（不可在叙事中推翻）。 */
export const STABLE_MECHANISM_ANCHORS: readonly string[] = [
  "地下二层是唯一实体出口，A-008 深渊守门人常驻。",
  "出口木门不可被物理破坏，需钥匙与暗号链路。",
  "地下一层（B1）是稳定带：允许交易、锻造、修整与锚点重构。",
  "游戏时间第 3 日 0 时起进入暗月阶段，威胁整体抬升。",
  "NPC 固定 ID 为 N-001 至 N-020，禁止无来源新增角色。",
  "诡异楼层绑定：1F A-001 … 7F A-007，B2 A-008（不得互换楼层）。",
] as const;

/** 建筑结构（与 MAP / FLOORS 一致，仅作根目录速查）。 */
export const STRUCTURE_FLOORS_SUMMARY: readonly { id: FloorId; label: string; note: string }[] = [
  { id: "B2", label: "地下二层", note: "出口通道、守门人结界。A-008。" },
  { id: "B1", label: "地下一层", note: "安全中枢、储物/洗衣/配电。无楼层诡异。" },
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
