/**
 * Legal-turn options fallback（自 turnEngine/enrichGameState.ts 最小移植）。
 *
 * registeredMechanicsGuard 的 ensureLegalTurnOptions 在合法回合 options 不足
 * 两条时，需要一个非破坏性的兜底来源。完整 enrichGameState 属于另一条
 * （未随本分支提交的）工作流；本模块只移植该守卫实际依赖的
 * `enrichOptionsFromNarrative` 及其 fallback 常量，行为与上游一致：
 * 仅当当前 options 为空时才填充，绝不覆盖已有 options。
 */

const FALLBACK_EXPLORE_OPTIONS = [
  "我继续往前探索，注意观察周围环境的变化。",
  "我检查最近的门是否能够打开。",
  "我停下来仔细听周围的动静。",
  "我寻找附近的光源或标识。",
];

const FALLBACK_DIALOGUE_OPTIONS = [
  "我继续追问刚才的话题，想了解更多。",
  "我试着换个角度提问，看看对方的反应。",
  "我观察对方的表情和动作，判断对方是否可信。",
  "我表示感谢后，准备继续探索。",
];

const FALLBACK_DANGER_OPTIONS = [
  "我保持警惕，慢慢后退到安全距离。",
  "我寻找周围可以当作武器的东西。",
  "我压低身体，尽量不发出声音。",
  "我确认逃跑路线，随时准备撤离。",
];

function narrativeContainsDialogue(narrative: string): boolean {
  // Detect Chinese dialogue markers
  return /[「『"“][^」』"'”]{4,}[」』"'”]/.test(narrative) || narrative.includes("说");
}

function narrativeContainsDanger(narrative: string): boolean {
  const dangerWords = ["危险", "威胁", "怪物", "敌人", "攻击", "逃", "死", "血"];
  return dangerWords.some((w) => narrative.includes(w));
}

/**
 * Generates contextual fallback options based on narrative content.
 * Only used when the LLM returns empty options — fills the hole
 * non-destructively.
 */
export function enrichOptionsFromNarrative(args: {
  currentOptions: string[];
  narrative: string;
}): string[] {
  if (args.currentOptions.length > 0) return args.currentOptions;

  const n = args.narrative;

  if (narrativeContainsDanger(n)) {
    return [...FALLBACK_DANGER_OPTIONS];
  }
  if (narrativeContainsDialogue(n)) {
    return [...FALLBACK_DIALOGUE_OPTIONS];
  }
  return [...FALLBACK_EXPLORE_OPTIONS];
}
