import type { NPC, NpcProfileV2 } from "./types";

export const CORE_NPC_PROFILES_V2: readonly NpcProfileV2[] = [
  {
    id: "N-015",
    homeNode: "B1_SafeZone",
    display: {
      name: "守门骑士",
      appearance: "黑色旧制式外套，披肩常带雨痕，站姿笔直，眼神克制而冷峻。",
      floor: "B1",
      publicPersonality: "忧郁、寡言、善良",
      specialty: "安全边界与锚点见证",
      combatPower: 9,
    },
    interaction: {
      speechPattern: "短句、低声、先观察后回答。",
      taboo: "不要在他守夜时强行跨越B1边界。",
      relationshipHooks: ["守护", "沉默信任", "复活后心理修复"],
      questHooks: ["anchor.oath.b1", "border.watch.log"],
      surfaceSecrets: ["他记得每一次复活后的你。"],
    },
    deepSecret: {
      trueMotives: ["维持B1边界不崩溃", "确认复活锚点不会落入错误之手"],
      trueCombatPower: 14,
      conspiracyRole: "锚点秩序看守",
      revealConditions: ["task:anchor.oath.b1.completed", "trust>=55"],
    },
  },
  {
    id: "N-020",
    homeNode: "B1_Storage",
    display: {
      name: "售卖员少女",
      appearance: "整洁制服与明亮笑容，语速轻快，眼神偶有短暂空白。",
      floor: "B1",
      publicPersonality: "天真、浪漫、纯真",
      specialty: "补给售卖与生活性引导",
      combatPower: 3,
    },
    interaction: {
      speechPattern: "句尾常带上扬语气，喜欢用可爱比喻。",
      taboo: "不要逼问她创伤记忆细节。",
      relationshipHooks: ["保护", "依赖", "创伤回避"],
      questHooks: ["b1.supply.route", "memory.ribbon"],
      surfaceSecrets: ["B1成员都在保护她不被高层污染接触。"],
    },
    deepSecret: {
      trueMotives: ["维持可运转的日常感", "避免创伤记忆全面崩解"],
      conspiracyRole: "B1人性锚点",
      revealConditions: ["favorability>=45", "task:memory.ribbon.completed"],
    },
  },
  {
    id: "N-010",
    homeNode: "1F_PropertyOffice",
    display: {
      name: "路线引导大姐姐",
      appearance: "气质温和，衣着得体，目光沉稳，像总能提前看见你的犹豫。",
      floor: "1",
      publicPersonality: "温柔、克制、御姐",
      specialty: "路线预告与未来转职登记",
      combatPower: 6,
    },
    interaction: {
      speechPattern: "条理清晰，先确认你的目标再给建议。",
      taboo: "不要让她替你做选择并推卸后果。",
      relationshipHooks: ["师徒", "路线绑定", "价值交换"],
      questHooks: ["route.preview.1f", "career.pre_register"],
      surfaceSecrets: ["她能看到你在不同路线里的失败影子。"],
    },
    deepSecret: {
      trueMotives: ["筛选可进入高层路线的玩家", "降低公寓失控分支"],
      conspiracyRole: "路线分流枢纽",
      revealConditions: ["task:career.pre_register.completed", "trust>=50"],
    },
  },
  {
    id: "N-018",
    homeNode: "1F_GuardRoom",
    display: {
      name: "游荡商人",
      appearance: "外套轻扬、笑意明亮，步伐像在旅行而非逃命。",
      floor: "random",
      publicPersonality: "开朗、潇洒、中立",
      specialty: "中立交易与高价值委托",
      combatPower: 9,
      combatPowerDisplay: "?",
    },
    interaction: {
      speechPattern: "会讲玩笑，但每句都留后路。",
      taboo: "不要追问他的货源坐标。",
      relationshipHooks: ["交易契约", "债务链", "互相试探"],
      questHooks: ["merchant.fragment.trade", "dragon.space.shard"],
      surfaceSecrets: ["他总能拿出不该在这栋楼出现的东西。"],
    },
    deepSecret: {
      trueMotives: ["回收与空间碎片相关的残片", "维持龙世界裂缝的可控交换"],
      trueCombatPower: 27,
      dragonWorldLink: "与【空间】碎片流通链直接关联",
      conspiracyRole: "中立高阶变量",
      revealConditions: ["debt>=10", "task:merchant.fragment.trade.completed"],
    },
  },
  {
    id: "N-013",
    homeNode: "7F_Room701",
    display: {
      name: "七层少年",
      appearance: "笑起来无害，眼尾却总有一点不合时宜的冷意。",
      floor: "7",
      publicPersonality: "讨喜、机灵、依附感强",
      specialty: "7F线索转运与诱导",
      combatPower: 5,
    },
    interaction: {
      speechPattern: "先示弱再提请求，擅长把责任推给你。",
      taboo: "不要在他面前暴露关键保命资源。",
      relationshipHooks: ["利用", "扭曲依赖", "反向驯化"],
      questHooks: ["boy.cleanse.path", "boy.false_rescue"],
      surfaceSecrets: ["高好感后会突然变得异常温顺。"],
    },
    deepSecret: {
      trueMotives: ["借玩家清理竞争威胁", "用亲近关系换生存筹码"],
      conspiracyRole: "高层诱杀触发器",
      revealConditions: ["betrayal_flag:boy", "task:boy.false_rescue.completed"],
    },
  },
  {
    id: "N-007",
    homeNode: "5F_Studio503",
    display: {
      name: "五层妹妹",
      appearance: "神情冷淡，常抱臂站在门边，话少却会偷偷看你反应。",
      floor: "5",
      publicPersonality: "冷淡、自私、警惕",
      specialty: "隐藏庇护与反向线索",
      combatPower: 4,
    },
    interaction: {
      speechPattern: "说话短促，偶尔突然幼稚。",
      taboo: "不要拿她和七层少年做公开比较。",
      relationshipHooks: ["镜像兄妹", "误解修复", "保护冲突"],
      questHooks: ["sister.mirror.trace", "sibling.old_day"],
      surfaceSecrets: ["她会悄悄替陌生人挡一次风险。"],
    },
    deepSecret: {
      trueMotives: ["阻断少年的诱杀链", "保存兄妹共同过去的残片"],
      conspiracyRole: "镜像反制点",
      revealConditions: ["trust>=60", "task:sibling.old_day.completed"],
    },
  },
] as const;

export function applyNpcProfileOverrides(base: readonly NPC[]): NPC[] {
  const map = new Map(base.map((x) => [x.id, { ...x }]));
  for (const p of CORE_NPC_PROFILES_V2) {
    const prev = map.get(p.id);
    if (!prev) continue;
    map.set(p.id, {
      ...prev,
      name: p.display.name,
      floor: p.display.floor,
      personality: p.display.publicPersonality,
      specialty: p.display.specialty,
      combatPower: p.display.combatPower,
      appearance: p.display.appearance,
      taboo: p.interaction.taboo,
      lore: p.interaction.surfaceSecrets.join("；"),
      location: p.homeNode,
    });
  }
  return [...map.values()];
}
