import type { NPC, NpcProfileV2 } from "./types";
import { CONTENT_PACKS } from "@/lib/contentSpec/packs";
import { buildNpcProfileV2FromSpec } from "@/lib/contentSpec/builders";

/**
 * 高魅力六人 V2：表层公寓职能徘徊者 + 深层校源徘徊者（耶里卷入 / 七辅锚）。
 * 扩展骨架见 `majorNpcDeepCanon.ts`；社交图由 `world.ts` patch + merge 同步。
 */
export const CORE_NPC_PROFILES_V2: readonly NpcProfileV2[] = [
  {
    id: "N-015",
    homeNode: "B1_SafeZone",
    display: {
      name: "麟泽",
      appearance: "黑色旧制式外套，披肩常带雨痕，站姿笔直，眼神克制而冷峻。",
      floor: "B1",
      publicPersonality: "忧郁、寡言、善良",
      specialty: "安全边界与锚点见证",
      combatPower: 9,
    },
    interaction: {
      speechPattern: "短句、低声、先观察后回答；不提校名时像守夜人，提了会像被敲痛处。",
      taboo: "不要在他守夜时强行跨越B1边界。",
      relationshipHooks: ["守护", "沉默信任", "复活后心理修复"],
      questHooks: ["anchor.oath.b1", "border.watch.log"],
      surfaceSecrets: [
        "公寓职能面：他是 B1 可见的边界巡守与锚点见证，把「不可越界」写成可感的秩序。",
        "校源面：耶里风纪协作序列的残留节拍，多轮循环后仍按封线—放行—封线行动；对主锚复活后的第一步有肌肉记忆式残响。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "守住 B1 边界与辅锚之一相位，不让主锚的复活链被当成压力测试工具",
        "在旧七人阵里守「线不可断」，与欣蓝的牵引互证后才考虑并队",
      ],
      trueCombatPower: 14,
      conspiracyRole: "辅锚·边界相位；公寓表层为秩序看守，深层为校源徘徊者（非单层标签）",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（B1职能）+ school_wanderer（耶里执勤残留）+ residual_echo（主锚复活节拍）",
      revealConditions: ["task:anchor.oath.b1.completed", "trust>=55"],
    },
  },
  {
    id: "N-020",
    homeNode: "B1_Storage",
    display: {
      name: "灵伤",
      appearance: "整洁制服与明亮笑容，语速轻快，眼神偶有短暂空白。",
      floor: "B1",
      publicPersonality: "天真、浪漫、纯真",
      specialty: "补给售卖与生活性引导",
      combatPower: 3,
    },
    interaction: {
      speechPattern: "句尾常带上扬语气，喜欢用可爱比喻；主锚靠近时偶尔会无意识按住心口。",
      taboo: "不要逼问她创伤记忆细节。",
      relationshipHooks: ["保护", "依赖", "创伤回避"],
      questHooks: ["b1.supply.route", "memory.ribbon"],
      surfaceSecrets: [
        "公寓职能面：B1 补给与生活引导，把「活下去」拆成可执行步骤，像整栋楼护着的噪声缓冲。",
        "校源面：耶里广播社残留，声纹曾被泡层采样作稳定剂；对主锚步频有心悸式残响，故不立刻跟队。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "维持日常感以免创伤块崩塌把主锚拖进污染",
        "在辅锚之二位守住「人还能像人」的底线， ribbon 类信任后才敢并队",
      ],
      conspiracyRole: "辅锚·人性缓冲；表层补给职能，深层校源徘徊者",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（B1补给）+ school_wanderer（广播社）+ residual_echo（主锚步频）",
      revealConditions: ["favorability>=45", "task:memory.ribbon.completed"],
    },
  },
  {
    id: "N-010",
    homeNode: "1F_PropertyOffice",
    display: {
      name: "欣蓝",
      appearance: "气质温和，衣着得体，目光沉稳，像总能提前看见你的犹豫。",
      floor: "1",
      publicPersonality: "温柔、克制、御姐",
      specialty: "路线预告与未来转职登记",
      combatPower: 6,
    },
    interaction: {
      speechPattern: "条理清晰，先确认你的目标再给建议；最怕你让她替你选命运。",
      taboo: "不要让她替你做选择并推卸后果。",
      relationshipHooks: ["师徒", "路线绑定", "价值交换"],
      questHooks: ["route.preview.1f", "career.pre_register"],
      surfaceSecrets: [
        "公寓职能面：物业口路线与登记，用表格推迟失控分支；她能看到你不同路线里的失败影子，但不是全知。",
        "校源面：耶里学生会档案干事残留，握有不完整情感记忆与旧七人闭环牵引——她是主锚重入旧阵的第一牵引点，先要确认你不是顶替她记账位的替身。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "把主锚拉回旧七人阵而不伪造闭环；筛选愿共担后果的上楼者",
        "在北夏的交易与叶的草案残片之间穿针，完成辅锚之三的牵引职责",
      ],
      conspiracyRole: "辅锚·第一牵引点（first_relink_pivot）；路线分流枢纽仍是表层职能",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（物业掩护）+ school_wanderer（档案干事）+ residual_echo（名单撕口与主锚焦虑）",
      revealConditions: ["task:career.pre_register.completed", "trust>=50"],
    },
  },
  {
    id: "N-018",
    homeNode: "1F_GuardRoom",
    display: {
      name: "北夏",
      appearance: "外套轻扬、笑意明亮，步伐像在旅行而非逃命。",
      floor: "random",
      publicPersonality: "开朗、潇洒、中立",
      specialty: "中立交易与高价值委托",
      combatPower: 9,
      combatPowerDisplay: "?",
    },
    interaction: {
      speechPattern: "会讲玩笑，但每句都留后路；谈并队先谈对价。",
      taboo: "不要追问他的货源坐标。",
      relationshipHooks: ["交易契约", "债务链", "互相试探"],
      questHooks: ["merchant.fragment.trade", "dragon.space.shard"],
      surfaceSecrets: [
        "公寓职能面：中立交易与高价值委托，用交换盘活死锁，货物常不该出现在此楼。",
        "校源面：耶里外联与市集组织者残留，行走碎片流通边缘；与主锚有欠条式残响，只认审计过的债。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "回收空间相关残片并维持交换规则不被无偿跟队破坏",
        "辅锚之四：把并队成本写进账本后才肯与主锚同路",
      ],
      trueCombatPower: 27,
      dragonWorldLink: "与【空间】碎片流通链直接关联",
      conspiracyRole: "辅锚·交换路由；中立高阶变量",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（商人面）+ school_wanderer（外联）+ residual_echo（互助券欠条）",
      revealConditions: ["debt>=10", "task:merchant.fragment.trade.completed"],
    },
  },
  {
    id: "N-013",
    homeNode: "7F_Room701",
    display: {
      name: "枫",
      appearance: "笑起来无害，眼尾却总有一点不合时宜的冷意。",
      floor: "7",
      publicPersonality: "讨喜、机灵、依附感强",
      specialty: "7F线索转运与诱导",
      combatPower: 5,
    },
    interaction: {
      speechPattern: "先示弱再提请求，擅长把责任推给你；高好感时的温顺可能是怕失去改稿人。",
      taboo: "不要在他面前暴露关键保命资源。",
      relationshipHooks: ["利用", "扭曲依赖", "反向驯化"],
      questHooks: ["boy.cleanse.path", "boy.false_rescue"],
      surfaceSecrets: [
        "公寓职能面：7F 线索转运与诱导，把危机包装成你能赢的剧本。",
        "校源面：耶里戏剧社残留，曾把主锚写进替身梗；循环后梗成真，耻感与生存欲拧成刃，不立刻跟队。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "借主锚清理威胁同时撕稿自救，辅锚之五占诱导刃位",
        "与叶的草案互锁，主锚须证明不是耗材或挑拨针",
      ],
      conspiracyRole: "辅锚·诱导刃；高层诱杀触发器为表层系统齿轮表述",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（7F职能）+ school_wanderer（戏剧社）+ residual_echo（替身梗成真）",
      revealConditions: ["betrayal_flag:boy", "task:boy.false_rescue.completed"],
    },
  },
  {
    id: "N-007",
    homeNode: "5F_Studio503",
    display: {
      name: "叶",
      appearance: "神情冷淡，常抱臂站在门边，话少却会偷偷看你反应。",
      floor: "5",
      publicPersonality: "冷淡、自私、警惕",
      specialty: "隐藏庇护与反向线索",
      combatPower: 4,
    },
    interaction: {
      speechPattern: "说话短促，偶尔突然幼稚；庇护规则被打破会立刻缩回壳。",
      taboo: "不要拿她和七层少年做公开比较。",
      relationshipHooks: ["镜像兄妹", "误解修复", "保护冲突"],
      questHooks: ["sister.mirror.trace", "sibling.old_day"],
      surfaceSecrets: [
        "公寓职能面：5F 画室式庇护与反向线索，冷淡是拒斥诱导链的壳。",
        "校源面：耶里美术社残留，与枫同锁旧草案；主锚轮廓触发保护欲违和，不立刻跟队。",
      ],
    },
    deepSecret: {
      trueMotives: [
        "阻断枫式链直达主锚，保存草案残片",
        "辅锚之六：镜像反制位，任务验证后才共享并队级线索",
      ],
      conspiracyRole: "辅锚·镜像反制；表层仍为兄妹/镜像叙事齿轮",
      schoolCycleTag:
        "校源徘徊者：apartment_wanderer（画室职能）+ school_wanderer（美术社）+ residual_echo（轮廓线）",
      revealConditions: ["trust>=60", "task:sibling.old_day.completed"],
    },
  },
] as const;

export const CONTENT_SPEC_NPC_PROFILES_V2: readonly NpcProfileV2[] = CONTENT_PACKS
  .flatMap((p) => p.npcSpecs ?? [])
  .map((s) => buildNpcProfileV2FromSpec(s))
  .filter((x): x is NpcProfileV2 => !!x);

export function applyNpcProfileOverrides(base: readonly NPC[]): NPC[] {
  const map = new Map(base.map((x) => [x.id, { ...x }]));
  for (const p of [...CORE_NPC_PROFILES_V2, ...CONTENT_SPEC_NPC_PROFILES_V2]) {
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
