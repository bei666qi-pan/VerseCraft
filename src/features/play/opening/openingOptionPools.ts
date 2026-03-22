import { DEFAULT_FOUR_ACTION_OPTIONS } from "./openingCopy";

/**
 * 多类开局选项池（探索 / 观察 / 社交 / 谨慎 / 休整等），与开局 prompt 倾向对齐。
 * 每次 {@link pickEmbeddedOpeningOptions} 尽量从**不同池**各抽一条再打乱，不足则用兜底池补位。
 */
export const OPENING_OPTION_POOLS: readonly (readonly string[])[] = [
  [
    "摸黑往走廊深处探一步",
    "贴着墙根摸索配电箱方向",
    "蹲下来听地面有没有管道回声",
    "数头顶灯管闪烁间隔记时间",
  ],
  [
    "抬头辨认墙角水渍形状",
    "嗅空气里霉味和铁锈的比例",
    "看地面灰尘上有没有脚印",
    "摸一把墙面判断潮不潮",
  ],
  [
    "压低声音问黑暗里有没有人",
    "假装咳嗽试探有没有回应",
    "朝安全区方向喊一声求助",
    "屏住呼吸等刮擦声再响一次",
  ],
  [
    "先退回灯管最亮的那块地",
    "背靠墙站定不轻易转身",
    "把脚步放到最轻慢慢挪",
    "记住来路拐角防止走丢",
  ],
  [
    "原地坐下缓一缓头痛",
    "深呼吸把心跳压下去",
    "掐自己一把确认不是梦",
    "默念公寓规则稳住神志",
  ],
  [
    "翻口袋确认有没有能照明的",
    "摸腰带扣当临时武器",
    "检查鞋底滑不滑",
    "把领口拉高挡一点冷气",
  ],
] as const;

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

/** 嵌入式开场首屏展示的本地四条（互异、随机、多倾向）；与模型返回的 options 无关。 */
export function pickEmbeddedOpeningOptions(): string[] {
  const poolOrder = OPENING_OPTION_POOLS.map((_, i) => i);
  shuffleInPlace(poolOrder);

  const picked: string[] = [];
  for (const pi of poolOrder) {
    if (picked.length >= 4) break;
    const pool = OPENING_OPTION_POOLS[pi]!;
    const idx = Math.floor(Math.random() * pool.length);
    const choice = pool[idx]!;
    if (!picked.includes(choice)) picked.push(choice);
  }

  const filler = [...DEFAULT_FOUR_ACTION_OPTIONS];
  shuffleInPlace(filler);
  for (const c of filler) {
    if (picked.length >= 4) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return picked.slice(0, 4);
}
