/**
 * DM Agent 真实 AI 测试脚本
 * 
 * 用法: VERSECRAFT_ENABLE_DM_AGENT=true npx tsx scripts/test-dm-agent-live.ts
 * 
 * 测试 DM Agent 在真实 AI 模型下的 function calling 行为。
 */

// 加载环境变量
import { loadVerseCraftEnvFilesOnce } from "@/lib/config/loadVerseCraftEnv";
loadVerseCraftEnvFilesOnce();

import { runDmAgentTurn } from "@/lib/ai/tools/dmAgentOrchestrator";
import { DM_AGENT_DEFAULTS } from "@/lib/ai/tools/dmAgentTypes";
import type { DmAgentContext } from "@/lib/ai/tools/dmAgentTypes";
import type { ChatMessage } from "@/lib/ai/types/core";

async function main() {
  console.log("🚀 DM Agent 真实 AI 测试");
  console.log("========================\n");

  const ctx: DmAgentContext = {
    requestId: `live-test-${Date.now()}`,
    sessionId: "test-session",
    userId: "test-user",
    playerLocation: "1F_Lobby",
    worldId: "dark_moon",
    flags: {
      dmAgentEnabled: true,
      maxToolRounds: DM_AGENT_DEFAULTS.MAX_TOOL_ROUNDS,
      totalBudgetMs: 60_000,
      perToolTimeoutMs: 5_000,
    },
    serverGameState: {
      clientState: {
        v: 1,
        turnIndex: 0,
        playerLocation: "1F_Lobby",
        originium: 10,
        inventoryItemIds: [],
        warehouseItemIds: [],
        equippedWeapon: null,
        weaponBag: [],
        currentProfession: null,
        worldFlags: [],
      },
      sessionMemory: null,
      latestUserInput: "你好，我想了解一下这个世界",
      totalRounds: 1,
    },
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是 VerseCraft 的 DM（地下城主），一个青春悬疑冒险互动叙事的主笔。
你现在拥有工具可以查询玩家状态、背包、任务、世界上下文等信息。
当玩家询问需要数据的问题时，使用工具查询后给出准确回答。
当玩家只是聊天时，直接叙事回复。

当前场景：玩家身处一栋名为「暗月公寓」的老旧建筑中。
楼层：1F 大厅。时间：下午 2 点。`,
    },
    {
      role: "user",
      content: "你好，我想了解一下这个世界",
    },
  ];

  console.log("📤 发送请求...");
  const t0 = Date.now();

  try {
    const result = await runDmAgentTurn({
      flags: ctx.flags,
      ctx,
      messages,
      onStatus: (status) => console.log(`  📡 状态: ${status}`),
    });

    const elapsed = Date.now() - t0;

    if (!result) {
      console.log("❌ Agent 返回 null（回退到普通 DM）");
      return;
    }

    console.log(`\n✅ 完成！耗时: ${elapsed}ms`);
    console.log(`   工具调用: ${result.toolsUsed ? "是" : "否"}`);
    console.log(`   工具追踪: ${result.toolTrace.length} 条`);
    
    for (const t of result.toolTrace) {
      console.log(`     - ${t.toolName}: ${t.ok ? "✅" : "❌"} (${t.latencyMs}ms)`);
      if (!t.ok) console.log(`       错误: ${t.error}`);
    }

    console.log(`\n📝 叙事输出 (前 300 字):`);
    console.log(result.narrative.slice(0, 300));
    if (result.narrative.length > 300) console.log("...");

    console.log(`\n📊 状态 Delta:`);
    console.log(JSON.stringify(result.stateDelta, null, 2));

  } catch (e) {
    console.error("❌ 测试失败:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
