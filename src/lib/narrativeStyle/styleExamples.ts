import { DEFAULT_VERSECRAFT_STYLE_PROFILE_ID } from "./styleBible";

export type NarrativeStyleExampleKind = "investigation" | "dialogue" | "combat" | "reveal" | "low_sanity" | "item_usage" | "talent_activation" | "npc_emotional";

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
  {
    kind: "low_sanity",
    text: "灯管闪了第三下。我数着的。但我数的东西不一定还在——走廊尽头那个蹲着的人影，我已经盯了它十秒，它一次都没动过。正常的东西不会这么久不动。除非它在等我眨眼。我攥紧手电，指节发白，感觉到理智像一根绷得太久的皮筋，在这栋楼的压力下正在从中间一点一点裂开。",
  },
  {
    kind: "item_usage",
    text: "绷带缠到第三圈的时候我才发现手在抖。不是疼的——伤口早麻了。是刚才那一瞬间的后劲，像迟到的下课铃，在事情过了之后才轰地一声撞进脑子里。我用牙咬紧绷带末端，尝到了血和消毒水的混合味。行囊里还剩一支镇痛剂。我看了它三秒，然后拉上了拉链——今晚可能还需要它做别的事。",
  },
  {
    kind: "talent_activation",
    text: "就在我以为膝盖要碎了的那一刻，胸口炸开一道暖流——生命汇源。我不信这名字，但每次它激活的时候我都觉得有什么东西在替我撑住。像是有人从很远的地方递了一只手过来，不问你值不值得。暖意退去之后痛又回来了，但痛至少证明我还活着。",
  },
  {
    kind: "npc_emotional",
    text: "老刘没回头。他把螺丝刀插回腰间，盯着配电箱里那些不该在墙里的东西看了很久。\"你知道吗，\"他说，声音忽然低了八度，\"这栋楼的灯没彻底亮过。我修了十二年，没一天彻底亮过。\"他关上了配电箱的门，动作轻得像在给什么东西盖被子。然后他骂了一句脏话，又变回了那个暴躁的电工。但我看见了他刚才的眼神——那是一个知道真相但决定装作不知道的人。",
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
