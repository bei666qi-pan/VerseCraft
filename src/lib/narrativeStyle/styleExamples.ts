import { DEFAULT_VERSECRAFT_STYLE_PROFILE_ID } from "./styleBible";

export type NarrativeStyleExampleKind = "investigation" | "dialogue" | "combat" | "reveal" | "low_sanity" | "item_usage" | "talent_activation" | "npc_emotional";

export type NarrativeStyleExample = {
  kind: NarrativeStyleExampleKind;
  text: string;
};

// 2026-07 phase-1：按 STYLE_BIBLE v3 重写。
// 覆盖不同 register 与场景，去选项预告尾巴，加对白与人物温度。
export const VERSECRAFT_STYLE_EXAMPLES: readonly NarrativeStyleExample[] = [
  {
    kind: "investigation",
    text: "我把登记单上的人名和日期对了一遍。没对上。再对一遍——依然没对上。三个月前那场被压下去的报修，和随后接连消失的住户，在线索交叉处汇成一个清晰的节点。档案里缺页的位置被人刻意撕掉，但残留的编号已经足够把整条链路补完。",
  },
  {
    kind: "dialogue",
    text: "“你今天和昨天不一样。”叶靠在墙边，像在辨认我的轮廓。我等他往下说。他沉默了一会儿：“昨天的你走路的节奏比今天快。”他说的是一句废话。但他说的认真。在这栋楼里，有人认真观察你——这件事比所有异常都让人不安。",
  },
  {
    kind: "combat",
    text: "影子扑来的那一下，我先听见的不是心跳，是书包带断裂的声音——原来生死关头，第一个背叛我的永远是最便宜的那件行李。铁牌硌进掌心，疼得干脆利落。我借着这点疼拧开半步，黑影一头撞上墙角的旧灯箱，哐当碎成一地黑暗。",
  },
  {
    kind: "reveal",
    text: "口袋里那半张登记表突然发烫。我抽出来，把缺口对上欣蓝那天留给我的半行字——严丝合缝。“通行许可：持表人，一名。”三天前她说“剩下的你自己填”，我以为是客气。原来她早就把我的名字，写在了我看不见的那一半上。",
  },
  {
    kind: "low_sanity",
    text: "灯管闪了第三下。我数着的。但我数的东西不一定还在——走廊尽头那个蹲着的人影，已经好久没动过了。正常的东西不会这么久不动。除非它在等我眨眼。我攥紧手电，指节发白。理智像一根绷得太久的皮筋，正在从中间一点一点裂开。",
  },
  {
    kind: "item_usage",
    text: "绷带缠到第三圈的时候我才发现手在抖。不是疼的——伤口早麻了。是刚才那一瞬间的后劲，像迟到的下课铃，在事情过了之后才轰地一声撞进脑子里。我用牙咬紧绷带末端，尝到了血和消毒水的混合味。行囊里还剩一支镇痛剂。我看了它三秒，然后拉上了拉链。今晚可能还需要它。",
  },
  {
    kind: "talent_activation",
    text: "就在我以为膝盖要碎了的那一刻，胸口炸开一道暖流——生命汇源。我不信这名字，但每次它激活的时候我都觉得有什么东西在替我撑住。像是有人从很远的地方递了一只手过来，不问你值不值得。暖意退去之后痛又回来了，但痛至少证明我还活着。走廊那头，暂时安静了。",
  },
  {
    kind: "npc_emotional",
    text: "她把最后一格能量块塞进我手里，笑得照旧太亮，句尾照旧空了半拍。“拿着。你比我需要——”那半拍里，她飞快看了一眼自己空掉的补给箱，又把箱盖合上，像什么都没数过。我把能量块掰成两半，一半放回她掌心。她没接，只是站在原地看了我一眼。那一眼里什么都有。",
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
