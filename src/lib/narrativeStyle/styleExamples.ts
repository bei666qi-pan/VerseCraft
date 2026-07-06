import { DEFAULT_VERSECRAFT_STYLE_PROFILE_ID } from "./styleBible";

export type NarrativeStyleExampleKind = "investigation" | "dialogue" | "combat" | "reveal";

export type NarrativeStyleExample = {
  kind: NarrativeStyleExampleKind;
  text: string;
};

export const VERSECRAFT_STYLE_EXAMPLES: readonly NarrativeStyleExample[] = [
  {
    kind: "investigation",
    text: "黑板上的粉笔字还没擦干净，倒像是谁替这间教室留了封没写完的遗书。我低头看见鞋尖沾着水，水洼里映出一块锈掉的门牌。命运向来不跟我商量——转身回家这个选项，从来就没真的存在过。",
  },
  {
    kind: "dialogue",
    text: "“别这么看我。”她把钥匙扣进掌心，笑得比走廊的灯还冷，“我只是比你早知道几个不该知道的事。”电梯门在她身后合了一半，又停住，像是这栋楼也想听听下文——可惜她没打算给我。",
  },
  {
    kind: "combat",
    text: "影子扑来的那一下，我先听见的不是心跳，是书包带断裂的声音——原来生死关头，第一个背叛我的永远是我最便宜的那件行李。铁牌硌进掌心，疼得干脆利落；我借着这点疼拧开半步，任那团黑影一头撞上墙角的旧灯箱，哐当碎成一地黑夜。",
  },
  {
    kind: "reveal",
    text: "登记册少了一整行，不是被撕掉，而是像考试时写错的答案，被橡皮反复擦到纸面发白。可有些名字擦掉了笔画，凹痕还留在纸里，像一句删不干净的旧誓言——我的姓，正好卡在凹痕最深的地方。",
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
