import { DEFAULT_VERSECRAFT_STYLE_PROFILE_ID } from "./styleBible";

export type NarrativeStyleExampleKind = "investigation" | "dialogue" | "combat" | "reveal";

export type NarrativeStyleExample = {
  kind: NarrativeStyleExampleKind;
  text: string;
};

export const VERSECRAFT_STYLE_EXAMPLES: readonly NarrativeStyleExample[] = [
  {
    kind: "investigation",
    text: "门缝里没有风，灰却向外走。我蹲下去，看见鞋印停在门内半寸，像有人刚把自己收回房间。",
  },
  {
    kind: "dialogue",
    text: "“别问楼上。”她把钥匙推回我掌心，“问了也会有人替你回答。”她笑了一下，眼神没有松。",
  },
  {
    kind: "combat",
    text: "影子扑来时，我先听见骨节敲地。铁管砸空，墙皮炸开，白灰像雪。我退半步，把门牌攥紧。",
  },
  {
    kind: "reveal",
    text: "登记册少了一页。缺口很新，边缘却焦黑。名字没有消失，只是挪到下一行，和我的笔迹挨着。",
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
