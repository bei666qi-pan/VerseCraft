import { DEFAULT_VERSECRAFT_STYLE_PROFILE_ID } from "./styleBible";

export type NarrativeStyleExampleKind = "investigation" | "dialogue" | "combat" | "reveal";

export type NarrativeStyleExample = {
  kind: NarrativeStyleExampleKind;
  text: string;
};

export const VERSECRAFT_STYLE_EXAMPLES: readonly NarrativeStyleExample[] = [
  {
    kind: "investigation",
    text: "黑板上的粉笔字还没擦干净。我低头看见鞋尖沾着水，水里映出一块生锈的门牌，像有人把晚自习后的走廊硬塞进了地下一层。",
  },
  {
    kind: "dialogue",
    text: "“别这么看我。”她把钥匙扣进掌心，笑得很轻，“我也只是比你早迟到几分钟。”电梯门在她身后合了一半，又停住。",
  },
  {
    kind: "combat",
    text: "影子扑来的时候，我先听见自己书包带断开的声音。铁牌硌进掌心，疼得我清醒了一点，于是我侧身，让那东西撞上墙角的旧灯箱。",
  },
  {
    kind: "reveal",
    text: "登记册少了一行。不是被撕掉，而是像考试时写错的答案，被人用橡皮擦到发白，只剩我的姓还卡在纸纹里。",
  },
];

export function getNarrativeStyleExamplesCompact(
  profileId: string = DEFAULT_VERSECRAFT_STYLE_PROFILE_ID
): Record<NarrativeStyleExampleKind, string> {
  void profileId;
  return Object.fromEntries(
    VERSECRAFT_STYLE_EXAMPLES.map((example) => [example.kind, example.text])
  ) as Record<NarrativeStyleExampleKind, string>;
}
