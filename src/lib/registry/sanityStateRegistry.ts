/**
 * 理智值状态效应系统（G1 + G4）。
 *
 * 背景：理智（stats.sanity）此前只是一个纯数值——受伤时扣减、归零触发死亡结算，
 * 中间没有任何“状态”语义。本模块把「当前理智 / 历史理智峰值」的比值折算为
 * 离散状态档位，供两处消费：
 *
 *  1) G1 —— 与 reveal 分级门禁联动（见 revealRegistry.ts 新增的 sanity_* 规则）。
 *     呼应 Bloodborne《血源诅咒》“洞察”双刃剑设计：越接近崩溃，越能触及被隐藏的真相。
 *  2) G4 —— 生成叙事不可靠性提示（narrative-only）。
 *     参考 Sunless Sea「数值 + 持续性叙事后果」联动手法、Darkest Dungeon 压力/缺陷、
 *     Call of Cthulhu 临时疯狂四段式规则。
 *
 * 设计取舍：
 *  - 用比值（当前/历史峰值）而非绝对值分档，因为角色创建时的初始理智点数因加点而异，
 *    绝对阈值会在不同build之间产生不一致的档位体验；比值同时呼应现有“生命汇源”天赋
 *    已确立的“历史峰值即人格完整度上限”的既定叙事（见 useGameStore.ts 的
 *    historicalMaxSanity 棘轮机制）。
 *  - narrativeHint 只允许影响叙事文风（错觉/不可靠感），严禁据此新增或篡改任何结构化
 *    字段、NPC 私密信息或已建立的世界事实——这是 turn engine "state delta first,
 *    narrative 是呈现不是状态真相源" 的既定原则，写在每一档 hint 文案里，而不是寄望于
 *    调用方自觉遵守。
 *  - 扩展时只追加档位判定阈值旁的注释与新规则，不改变已发布档位的语义边界。
 */

export type SanityBandId = "unknown" | "stable" | "strained" | "fractured" | "critical";

/** 数值越大代表状态越严重；unknown 恒为 -1，不参与"至少达到某档"的判定。 */
export const SANITY_BAND_RANK: Record<SanityBandId, number> = {
  unknown: -1,
  stable: 0,
  strained: 1,
  fractured: 2,
  critical: 3,
};

interface SanityBandMeta {
  title: string;
  /** 供 prompt 使用的叙事不可靠性提示；空字符串代表该档不附加提示。 */
  narrativeHint: string;
}

const SANITY_BAND_METAS: Record<Exclude<SanityBandId, "unknown">, SanityBandMeta> = {
  stable: { title: "平稳", narrativeHint: "" },
  strained: {
    title: "紧绷",
    narrativeHint:
      "主角心智略显紧绷：可让叙事偶尔带一闪而过的错觉细节（光影/声响/时间感轻微失真），但不得据此改变任何已确认的事实。",
  },
  fractured: {
    title: "裂隙",
    narrativeHint:
      "主角心智出现裂隙：叙事可表现感官与记忆的轻度不可靠（重复的画面、错位的对话片段、无法确认是否亲历），但位置/物品/任务/NPC 状态等结构化事实必须与状态数据保持一致，不可让不可靠感改写实际状态。",
  },
  critical: {
    title: "濒崩",
    narrativeHint:
      "主角心智濒临崩溃：现实感稀薄、自我与他者边界模糊，叙事可出现无法证伪的幻觉描写，但幻觉只能以主观叙事口吻呈现，禁止据此新增/篡改结构化字段，禁止借幻觉泄露 NPC 私密或 DM-only 信息。",
  },
};

/** 档位边界（含）：ratio <= 该值即落入对应档位；由重到轻依次判定。 */
const CRITICAL_MAX_RATIO = 0.2;
const FRACTURED_MAX_RATIO = 0.4;
const STRAINED_MAX_RATIO = 0.7;

/**
 * 计算「当前理智 / 历史理智峰值」的比值，裁剪到 [0,1]。
 * 任一输入缺失、非有限数、或历史峰值 <= 0 时返回 null（表示信号未知，
 * 调用方必须将 null 视为安全默认档位 unknown，不触发任何联动）。
 */
export function computeSanityRatio(current: number | null, historicalMax: number | null): number | null {
  if (current == null || historicalMax == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(historicalMax)) return null;
  if (historicalMax <= 0) return null;
  const ratio = current / historicalMax;
  if (!Number.isFinite(ratio)) return null;
  return Math.max(0, Math.min(1, ratio));
}

/** ratio 为 null 时返回 unknown（安全默认，不参与任何门禁联动）。 */
export function computeSanityBand(ratio: number | null): SanityBandId {
  if (ratio == null) return "unknown";
  if (ratio <= CRITICAL_MAX_RATIO) return "critical";
  if (ratio <= FRACTURED_MAX_RATIO) return "fractured";
  if (ratio <= STRAINED_MAX_RATIO) return "strained";
  return "stable";
}

export function getSanityBandTitle(band: SanityBandId): string {
  if (band === "unknown") return "未知";
  return SANITY_BAND_METAS[band].title;
}

/**
 * 生成叙事不可靠性提示块（G4）。stable / unknown 返回空字符串（不占用 prompt 篇幅）。
 * 调用方应仅在非空时拼接进 prompt，且需保持"提示≠事实"的措辞不被裁剪掉。
 */
export function buildSanityNarrativeHintBlock(band: SanityBandId): string {
  if (band === "unknown" || band === "stable") return "";
  const meta = SANITY_BAND_METAS[band];
  if (!meta.narrativeHint) return "";
  return `理智状态提示（仅影响叙事风格，不是新增事实）：${meta.title}——${meta.narrativeHint}`;
}
