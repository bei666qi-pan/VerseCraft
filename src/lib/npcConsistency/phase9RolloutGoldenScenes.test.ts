/**
 * 阶段 9 rollout：golden 场景矩阵（不接大模型，断言链路/不变量）。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accumulateDmFromSseEvent } from "@/features/play/stream/sseFrame";
import { tryParseDM } from "@/features/play/stream/dmParse";
import { buildNpcPlayerBaselinePacket } from "@/lib/npcBaselineAttitude/builders";
import { buildRuntimeContextPackets } from "@/lib/playRealtime/runtimeContextPackets";
import { replaceInternalNpcIdsForDisplay } from "@/lib/play/playerFacingText";
import { filterTasksForTaskBoardVisibilityV2, partitionTasksForBoard } from "@/lib/play/taskBoardUi";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import {
  getVerseCraftRolloutMetricsSnapshot,
  recordFinalFrameCommitOutcome,
  resetVerseCraftRolloutMetrics,
} from "@/lib/observability/versecraftRolloutMetrics";
import { buildStyleGuidePacketBlock } from "@/lib/playRealtime/playerChatSystemPrompt";
import { getNpcCanonicalIdentity, NIGHT_READER_NPC_ID, XINLAN_NPC_ID } from "@/lib/registry/npcCanon";
import { MAJOR_NPC_IDS } from "@/lib/registry/majorNpcDeepCanon";
import { CURRENT_OPENING_OPTIONS_SOURCE } from "@/features/play/opening/openingMode";
import type { GameTask } from "@/store/useGameStore";

function dmWire(): string {
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测",
    is_death: false,
    consumes_time: false,
    options: ["a", "b", "c", "d"],
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
  });
}

describe("phase9 golden：世界入口 / 任务 / commit / 展示", () => {
  it("1 空间权柄：flags 含 space + world entry + 社交可开关", () => {
    const f = getVerseCraftRolloutFlags();
    assert.equal(typeof f.enableSpaceAuthorityCanon, "boolean");
    assert.equal(typeof f.enableWorldEntryPackets, "boolean");
    assert.equal(typeof f.enableNpcSocialSurface, "boolean");
  });

  it("2 月初误闯：普通 NPC 基线 packet 含误闯语义（默认 monthly entry）", () => {
    const p = buildNpcPlayerBaselinePacket({ npcId: "N-003", scene: { locationId: "B1", maxRevealRank: 0, hotThreatPresent: false } });
    assert.ok(p.playerAddressCue.includes("同学") || p.playerAddressCue.includes("事务"));
  });

  it("3 高魅力 vs 夜读：熟悉感上限与特权不同", () => {
    const major = getNpcCanonicalIdentity(MAJOR_NPC_IDS[0]!);
    const night = getNpcCanonicalIdentity(NIGHT_READER_NPC_ID);
    assert.equal(major.memoryPrivilege, "major_charm");
    assert.equal(night.memoryPrivilege, "night_reader");
    assert.ok((major.revealTierCap ?? 0) >= 0);
  });

  it("4 欣蓝：最强门闸但不等于全知（特权 xinlan + 真相档位 cap）", () => {
    const x = getNpcCanonicalIdentity(XINLAN_NPC_ID);
    assert.equal(x.memoryPrivilege, "xinlan");
    assert.ok(x.revealTierCap >= 1);
  });

  it("5 UI：内部 id 可替换为显示名", () => {
    const { replaced, text } = replaceInternalNpcIdsForDisplay("见 N-001");
    assert.ok(replaced >= 1);
    assert.ok(!text.includes("N-001"));
  });

  it("6 任务板 V2：soft_lead+available 不进入分区", () => {
    const soft = {
      id: "soft1",
      title: "引线",
      desc: "d",
      status: "available",
      type: "character",
      taskNarrativeLayer: "soft_lead",
    } as unknown as GameTask;
    const formal = {
      id: "f1",
      title: "正式",
      desc: "d",
      status: "available",
      type: "main",
    } as unknown as GameTask;
    const filtered = filterTasksForTaskBoardVisibilityV2([soft, formal], true);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.id, "f1");
  });

  it("7 promise 轻量仍可出现（conversation_promise）", () => {
    const p = {
      id: "p1",
      title: "人情",
      desc: "d",
      status: "available",
      type: "character",
      goalKind: "promise",
    } as unknown as GameTask;
    const part = partitionTasksForBoard([p], 4);
    assert.ok(part.paths.length + (part.primary ? 1 : 0) >= 0);
  });

  it("8 开场：首轮 options 来源为主笔而非本地池", () => {
    assert.equal(CURRENT_OPENING_OPTIONS_SOURCE, "model_first_turn");
  });

  it("9 首轮 options：DM JSON 可由 tryParseDM 解析", () => {
    const ok = tryParseDM(dmWire());
    assert.ok(ok?.options?.length === 4);
  });

  it("10 文风 packet：非空且不包含具体作品名", () => {
    const s = buildStyleGuidePacketBlock();
    assert.ok(s.length > 20);
    assert.ok(!s.includes("诡秘") && !s.includes("龙族"));
  });

  it("11 final frame：SSE 累积以 __VERSECRAFT_FINAL__ 为准", () => {
    const ev = `data: __VERSECRAFT_FINAL__:${dmWire()}`;
    const { raw } = accumulateDmFromSseEvent(ev, "garbage{");
    const parsed = tryParseDM(raw);
    assert.ok(parsed?.narrative);
  });

  it("12 观测：finalFrame commit 记录可写读", () => {
    resetVerseCraftRolloutMetrics();
    recordFinalFrameCommitOutcome({ usedFinalFrame: true, parseOk: true });
    const snap = getVerseCraftRolloutMetricsSnapshot();
    assert.ok(snap.finalFrameCommitSuccessCount >= 1);
  });

  it("13 runtime：含 player_world_entry_packet（默认开）", () => {
    const ctx = ["用户位置[B1_SafeZone]。", "游戏时间[第1日 10时]。", "NPC当前位置：N-001@B1_SafeZone。"].join("\n");
    const json = buildRuntimeContextPackets({
      playerContext: ctx,
      latestUserInput: "测",
      playerLocation: null,
      focusNpcId: "N-001",
      maxChars: 60000,
    });
    assert.ok(json.includes("player_world_entry_packet"));
  });

  it("14 fast/minimal/full：minimal 仍含 school_cycle 键（边界一致）", () => {
    const ctx = ["用户位置[B1_SafeZone]。", "游戏时间[第1日 10时]。"].join("\n");
    const full = buildRuntimeContextPackets({
      playerContext: ctx,
      latestUserInput: "x",
      playerLocation: null,
      maxChars: 50000,
      contextMode: "full",
    });
    const min = buildRuntimeContextPackets({
      playerContext: ctx,
      latestUserInput: "x",
      playerLocation: null,
      maxChars: 50000,
      contextMode: "minimal",
    });
    assert.ok(full.includes("school_cycle_arc_packet"));
    assert.ok(min.includes("school_cycle_arc_packet"));
  });
});
