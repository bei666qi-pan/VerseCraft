// src/lib/playRealtime/ruleSnapshot.ts
import type { PlayerRuleSnapshot } from "@/lib/playRealtime/types";

/**
 * Lightweight heuristics over client-provided context strings (deterministic, fast).
 */
export function buildRuleSnapshot(playerContext: string, latestUserInput: string): PlayerRuleSnapshot {
  const combined = `${playerContext}\n${latestUserInput}`;
  const input = latestUserInput.trim();
  const compactInput = input.replace(/\s+/g, "");
  const shortQuestionHint =
    compactInput.length > 0 &&
    compactInput.length <= 32 &&
    /([?？]$|谁|什么|为何|为什么|怎么|怎样|哪里|哪儿|吗|呢|有没有|是否|能不能|可不可以|是谁|是什么|在哪里|怎么办)/.test(compactInput);

  return {
    in_combat_hint: /战斗|攻击|诡异|伤害|躲避|闪避|击杀|格挡|反击|持刀|符|盐|石灰/.test(combined),
    in_dialogue_hint: shortQuestionHint || /对话|询问|说服|交谈|喊话|商量|解释|道歉|威胁/.test(combined),
    location_changed_hint: /前往|进入|离开|走上|下楼|上楼|推门|退回|走廊|房间|电梯/.test(input),
    high_value_scene:
      input.length >= 6 &&
      (/探索|观察|环视|环顾|打量|聆听|嗅|触摸|摸索|细看/.test(input) ||
        /战斗|遭遇|逼近|寒意|脚步|阴影/.test(combined)),
  };
}
