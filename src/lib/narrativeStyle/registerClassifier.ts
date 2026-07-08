/**
 * Register Classifier
 *
 * Phase-0: 情绪档位分类器。
 * 将叙事段落分类到五种 register：suspense / wit / levity / warmth / payoff。
 * 纯统计特征，不调用 LLM。
 *
 * 用于 styleValidator telemetry 补全和未来 live judge 前的 register 预判。
 */

// === 类型定义 ===

export type NarrativeRegister = "suspense" | "wit" | "levity" | "warmth" | "payoff";

export interface RegisterClassification {
  register: NarrativeRegister;
  scores: Record<NarrativeRegister, number>;
  topKeywords: string[];
}

// === Register 特征词典 ===

interface RegisterProfile {
  register: NarrativeRegister;
  keywords: RegExp;
  weight: number; // 命中一词的加分
}

const REGISTER_PROFILES: RegisterProfile[] = [
  {
    register: "suspense",
    keywords: /(灯管|闪烁|闪|黑|暗|影|暗处|门缝|走廊|尽头|脚步|回声|不对|声音|忽然|突然|可能|像被|停在|没有回答|没有|异常|不对|门后|楼上|背后|刮擦|沉默|危险|退路|逼近|靠近)/g,
    weight: 2,
  },
  {
    register: "wit",
    keywords: /(登记|对|线索|名字|日期|数字|拼合|缺口|对不上|档案|记录|笔记|折角|标记|逻辑|推理|猜测|验证|推敲|答案|密码|序号|编号|签名)/g,
    weight: 2,
  },
  {
    register: "levity",
    keywords: /(笑|开玩笑|逗|乐|放松|轻松|不着急|哈|没当回事|幽默|打趣|调侃|薄荷糖|口袋|翻遍|全套装备|一眼看穿|挤眼睛|挑眉)/g,
    weight: 2,
  },
  {
    register: "warmth",
    keywords: /(塞|伞|掌心|暖|温|笑|扶|拉|牵|抱|护|信|等|递|掰|分|留|心疼|担心|照顾|陪)/g,
    weight: 2,
  },
  {
    register: "payoff",
    keywords: /(真相|线头|串成|连成|早就|原来|钥匙|拼合|印|痕迹|对应|吻合|合上|收|拆|填|写|印好|等着|兑现|那半|半张|另一半)/g,
    weight: 2,
  },
];

/** 对叙事文本进行 register 分类 */
export function classifyNarrativeRegister(narrative: string): RegisterClassification {
  const scores: Record<NarrativeRegister, number> = {
    suspense: 0,
    wit: 0,
    levity: 0,
    warmth: 0,
    payoff: 0,
  };
  const topKeywords: string[] = [];

  for (const profile of REGISTER_PROFILES) {
    let match: RegExpExecArray | null;
    const re = new RegExp(profile.keywords.source, "g");

    let count = 0;
    while ((match = re.exec(narrative)) !== null) {
      count += 1;
      if (topKeywords.length < 8 && match[0]) {
        const kw = match[0];
        if (!topKeywords.includes(kw)) topKeywords.push(kw);
      }
    }

    scores[profile.register] = count * profile.weight;
  }

  // 找最高分 register
  const sorted = (Object.entries(scores) as [NarrativeRegister, number][]).sort(
    (a, b) => b[1] - a[1]
  );
  const bestRegister = sorted[0]?.[0] ?? "suspense";
  const bestScore = sorted[0]?.[1] ?? 0;

  // 如果最高分是 0，默认 suspense
  const register = bestScore > 0 ? bestRegister : "suspense";

  return { register, scores, topKeywords: topKeywords.slice(0, 6) };
}

/** 与 `expectedRegister` 比较（供 rubric 使用） */
export function registerMatchesExpected(
  classified: NarrativeRegister,
  expected: NarrativeRegister,
): boolean {
  return classified === expected;
}

export type { RegisterProfile };
