// src/lib/registry/items.ts
// 如月公寓物品注册表 - 81 件 (S1/A3/B10/C17/D50)

import type { Item } from "./types";

export const ITEMS: readonly Item[] = [
  // === S级 1个 ===
  {
    id: "I-S01",
    name: "染血的如月建筑原稿",
    tier: "S",
    description:
      "一份泛黄的建筑设计图，边缘浸染暗红色污渍。图纸标注了如月公寓的「真实结构」——承重墙被标为「骨骼投影」，水管网络被标为「消化管道」。知晓结构者可利用规则漏洞，跨越战力鸿沟对诡异施加致命一击。",
    statBonus: { background: 5, sanity: 3 },
    tags: "meta,truth",
    ruleKill: true,
  },
  // === A级 3个 ===
  {
    id: "I-A01",
    name: "停止转动的怀表",
    tier: "A",
    description:
      "一枚古董怀表，秒针永久停在 2:47。持有者偶尔能听见表内传来倒计时的滴答声——但那是时间在倒流。可短暂篡改局部时间流速。",
    statBonus: { luck: 3, sanity: 2 },
    tags: "time,rewind",
  },
  {
    id: "I-A02",
    name: "防污染应急协议残页",
    tier: "A",
    description:
      "上世纪 80 年代秘密研究机构遗留的协议碎片。记载了红水静置、镜子遮挡等核心规则的原始依据。持有者可临时「强化」对特定规则的理解，抵挡一次致命攻击；亦可利用规则逆写对诡异施加规则类杀伤。",
    statBonus: { background: 4 },
    tags: "protocol,rules",
    blockLethal: true,
    ruleKill: true,
  },
  {
    id: "I-A03",
    name: "未消化的钥匙",
    tier: "A",
    description:
      "一把从公寓某处「排泄物」中捡回的金属钥匙。表面覆盖半透明生物膜，仍在轻微蠕动。能打开公寓内任意一扇「未完全消化」的门。",
    statBonus: { luck: 2, agility: 2 },
    tags: "key,digestion",
  },
  // === B级 5个 ===
  {
    id: "I-B01",
    name: "沾染腥味的狗绳",
    tier: "B",
    description:
      "一条褪色的皮质狗绳，末端断裂，沾满干涸的暗色污渍。曾属于 4 楼某只导盲犬。无头猎犬会对此物产生短暂困惑，为逃生争取数秒。",
    statBonus: { agility: 2 },
    tags: "beast,memory",
  },
  {
    id: "I-B02",
    name: "陈婆婆的毛线团",
    tier: "B",
    description:
      "一团未织完的毛线，颜色诡异渐变。可短暂缠绕小型诡异实体，但使用后毛线会「长」入使用者指尖，需在 24 小时内找到剪刀切断。",
    statBonus: { charm: 1 },
    tags: "binding,trap",
  },
  {
    id: "I-B03",
    name: "林医生的听诊器",
    tier: "B",
    description:
      "能听见墙壁内部「消化」声的听诊器。可用于预判器官拟态墙的出现位置，但长时间佩戴会听见自己的心跳逐渐变慢。",
    statBonus: { background: 2 },
    tags: "diagnostic,sound",
  },
  {
    id: "I-B04",
    name: "邮差的空白信封",
    tier: "B",
    description:
      "一个没有寄件人也没有收件人的信封。将某人的名字写在信封上后，可短暂屏蔽其与 13 楼门扉的因果关联——但信封会在使用后自动填满讣告内容。",
    statBonus: { luck: 2 },
    tags: "mail,isolation",
  },
  {
    id: "I-B05",
    name: "夜读老人的书签",
    tier: "B",
    description:
      "一片金属书签，刻着无法辨认的页码。夹入任意书本后，可临时「遮蔽」自己的存在，使认知腐蚀者难以定位——但书签会逐渐显现你的名字。",
    statBonus: { sanity: 1 },
    tags: "conceal,cognition",
  },
  // === C级 10个 ===
  {
    id: "I-C01",
    name: "工业级强碱疏通剂",
    tier: "C",
    description:
      "高浓度氢氧化钠制剂，用于管道疏通。对管道中的屠夫具有强腐蚀作用，可暂时阻断其从水源凝聚。使用时会释放刺鼻气味，吸引其他诡异。",
    statBonus: {},
    tags: "chemical,corrosive",
  },
  {
    id: "I-C02",
    name: "破裂的八卦镜",
    tier: "C",
    description:
      "一面碎裂的八卦镜，镜面布满裂痕。可短暂「固定」楼梯间倒行者的身影，使其无法移动，但镜面每使用一次裂痕加深，三次后彻底碎裂。",
    statBonus: { sanity: 1 },
    tags: "mirror,exorcism",
  },
  {
    id: "I-C03",
    name: "防爆手电筒",
    tier: "C",
    description:
      "强光手电，电池续航约 2 小时。光柱可驱散部分认知污染产生的幻觉，但强光会惊动无头猎犬，切勿在 4 楼使用。",
    statBonus: { agility: 1 },
    tags: "light,tool",
  },
  {
    id: "I-C04",
    name: "符纸护身符",
    tier: "C",
    description:
      "不知名道士留下的黄符，朱砂字迹已褪色。可抵挡一次致命攻击（包括 B2 守门人的单次攻击），使用后符纸自燃成灰。",
    statBonus: { sanity: 2 },
    tags: "protection,exorcism",
    blockLethal: true,
  },
  {
    id: "I-C05",
    name: "机械腕表",
    tier: "C",
    description:
      "物业发放的机械腕表，走时准确。是公寓内唯一可信任的时间参考，可抵抗时差症候群的因果侵蚀。电池耗尽需前往保安室更换。",
    statBonus: { sanity: 1 },
    tags: "time,reference",
  },
  {
    id: "I-C06",
    name: "深色遮光布",
    tier: "C",
    description:
      "一块足够遮盖镜子的厚重布料。凌晨 2 点后遮挡镜子可避免与倒行者发生视觉接触。布料本身会逐渐吸收镜中的「残留影像」。",
    statBonus: {},
    tags: "mirror,cover",
  },
  {
    id: "I-C07",
    name: "石灰粉包",
    tier: "C",
    description:
      "建筑用石灰粉，可用于阻断管道屠夫与水源的连接。撒向屠夫「根部」可暂时瘫痪其行动约 30 秒。",
    statBonus: {},
    tags: "chemical,corrosive",
  },
  {
    id: "I-C08",
    name: "耳塞",
    tier: "C",
    description:
      "工业级隔音耳塞。佩戴后可屏蔽 4 楼狗叫与部分墙壁蠕动声，但无法隔绝无头猎犬的因果追溯——若已回应过狗叫，耳塞无效。",
    statBonus: { sanity: 1 },
    tags: "sound,protection",
  },
  {
    id: "I-C09",
    name: "盐袋",
    tier: "C",
    description:
      "一袋未开封的食用盐。撒在门缝或管道口可暂时「净化」污染，对管道屠夫有一定驱散效果。用量有限。",
    statBonus: {},
    tags: "chemical,purification",
  },
  {
    id: "I-C10",
    name: "折叠刀",
    tier: "C",
    description:
      "普通多功能折叠刀。可切割绳索、开罐头，但切勿用于对抗诡异——刀具会激发管道屠夫的「食材」判定。",
    statBonus: { agility: 1 },
    tags: "tool,utility",
  },
  // === D级 30个 ===
  {
    id: "I-D01",
    name: "过期罐头",
    tier: "D",
    description:
      "锈迹斑斑的肉罐头，保质期已过三年。食用可恢复少量体力，但有 30% 概率触发轻度食物中毒，导致敏捷暂时下降。",
    statBonus: {},
    tags: "consumable,risky",
  },
  {
    id: "I-D02",
    name: "新鲜生肉",
    tier: "D",
    description:
      "一块来源不明的鲜红肉类。可用来分散管道屠夫或无头猎犬的注意，但携带它会吸引更多诡异靠近。",
    statBonus: {},
    tags: "bait,danger",
  },
  {
    id: "I-D03",
    name: "发霉面包",
    tier: "D",
    description:
      "长了绿色霉斑的切片面包。食用后理智值微幅下降，但可暂时混淆认知腐蚀者的「味觉追踪」。",
    statBonus: { sanity: -1 },
    tags: "consumable,tainted",
  },
  {
    id: "I-D04",
    name: "锈蚀的螺丝钉",
    tier: "D",
    description:
      "从配电间捡来的废旧螺丝。可临时堵住漏水的水龙头，但锈迹会污染水质，静置时间需延长至 24 小时。",
    statBonus: {},
    tags: "junk,utility",
  },
  {
    id: "I-D05",
    name: "皱巴巴的报纸",
    tier: "D",
    description:
      "日期模糊的旧报纸。可用来包裹其他物品以隔绝气息，但报纸上的新闻会随时间「更新」成与你相关的噩耗。",
    statBonus: {},
    tags: "wrapper,ominous",
  },
  {
    id: "I-D06",
    name: "一次性纸杯",
    tier: "D",
    description:
      "印有物业 Logo 的纸杯。可用于盛放静置后的红水（若急需），但纸杯会逐渐渗出红色液渍，建议尽快使用后丢弃。",
    statBonus: {},
    tags: "container,disposable",
  },
  {
    id: "I-D07",
    name: "断裂的铅笔",
    tier: "D",
    description:
      "笔芯已断的短铅笔。可用于在墙上做记号或书写，但写下的字迹会在 1 小时后扭曲成无法辨认的符号。",
    statBonus: {},
    tags: "writing,cursed",
  },
  {
    id: "I-D08",
    name: "褪色照片",
    tier: "D",
    description:
      "一张合影，人脸已模糊。凝视超过 10 秒会看见照片中的人开始移动。可用来短暂吸引某些诡异的注意。",
    statBonus: { sanity: -1 },
    tags: "memory,bait",
  },
  {
    id: "I-D09",
    name: "空药瓶",
    tier: "D",
    description:
      "林医生诊室遗落的药瓶，内无药片。可装盛少量液体，但装过红水的瓶子会持续渗出腐蚀性液体。",
    statBonus: {},
    tags: "container,hazard",
  },
  {
    id: "I-D10",
    name: "脏兮兮的抹布",
    tier: "D",
    description:
      "沾满不明污渍的破布。可用来擦拭镜面，但擦拭后的镜子会映出「错误」的倒影。不建议用于遮挡镜子。",
    statBonus: {},
    tags: "cleaning,cursed",
  },
  {
    id: "I-D11",
    name: "干瘪的橙子",
    tier: "D",
    description:
      "一个放置过久的橙子，表皮发黑。食用可恢复微量理智，但果肉内可能藏有黑色丝状物——那是公寓的「消化残留」。",
    statBonus: { sanity: 1 },
    tags: "consumable,tainted",
  },
  {
    id: "I-D12",
    name: "塑料打火机",
    tier: "D",
    description:
      "廉价打火机，燃料所剩无几。可点燃符纸或制造光源，但在器官拟态墙附近使用可能「激怒」墙壁。",
    statBonus: {},
    tags: "fire,risky",
  },
  {
    id: "I-D13",
    name: "磨损的拖鞋",
    tier: "D",
    description:
      "一双穿旧的塑料拖鞋。穿着可减少脚步声，但鞋底沾有不明粘液，会在地面留下痕迹，可能被追踪。",
    statBonus: { agility: 1 },
    tags: "footwear,stealth",
  },
  {
    id: "I-D14",
    name: "生锈的钥匙",
    tier: "D",
    description:
      "一把无法辨认门牌号的钥匙。可能打开公寓内某扇废弃房间的门——也可能打开 13 楼的门。使用前请三思。",
    statBonus: {},
    tags: "key,unknown",
  },
  {
    id: "I-D15",
    name: "皱褶的便签纸",
    tier: "D",
    description:
      "一叠彩色便签。可用于记录规则或留下讯息，但便签上的字迹会在无人注视时悄悄改变。",
    statBonus: {},
    tags: "writing,unreliable",
  },
  {
    id: "I-D16",
    name: "浑浊的矿泉水",
    tier: "D",
    description:
      "一瓶未开封的矿泉水，液体呈微黄。饮用可缓解口渴，但有 10% 概率是红水的「稀释版本」，导致轻微理智损伤。",
    statBonus: { sanity: -1 },
    tags: "consumable,risky",
  },
  {
    id: "I-D17",
    name: "断线的耳机",
    tier: "D",
    description:
      "一边已无声的耳机。佩戴单耳可屏蔽部分环境噪音，但会听到细微的耳语——来源不明。",
    statBonus: { sanity: -1 },
    tags: "sound,mixed",
  },
  {
    id: "I-D18",
    name: "破洞的塑料袋",
    tier: "D",
    description:
      "超市购物袋，底部有裂口。可用来包裹生肉等吸引诡异的物品以隔绝气味，但隔绝效果有限。",
    statBonus: {},
    tags: "wrapper,weak",
  },
  {
    id: "I-D19",
    name: "发条玩具",
    tier: "D",
    description:
      "一个上发条会跳的青蛙玩具。可制造声响吸引无头猎犬——但也会吸引它朝你的方向移动。慎用。",
    statBonus: {},
    tags: "bait,sound",
  },
  {
    id: "I-D20",
    name: "褪色明信片",
    tier: "D",
    description:
      "一张没有邮戳的明信片，背面写着「别回来」。可临时阻挡邮差老王的视线，使其跳过你一次，但明信片会在一小时后自动消失。",
    statBonus: {},
    tags: "mail,consumable",
  },
  {
    id: "I-D21",
    name: "裂开的肥皂",
    tier: "D",
    description:
      "一块干裂的肥皂。可用于清洁手上的血污或粘液，但使用后肥皂会「吸收」污渍的颜色，逐渐变红。",
    statBonus: {},
    tags: "cleaning,absorbent",
  },
  {
    id: "I-D22",
    name: "无电池的遥控器",
    tier: "D",
    description:
      "电视遥控器，电池仓空置。按下按键会发出轻微的咔哒声，可用来测试周围是否有依赖听觉的诡异。",
    statBonus: {},
    tags: "tool,test",
  },
  {
    id: "I-D23",
    name: "发黄的纱布",
    tier: "D",
    description:
      "一卷医用纱布，边缘泛黄。可包扎伤口，但纱布会与伤口「融合」，拆除时会造成二次伤害。",
    statBonus: {},
    tags: "medical,risky",
  },
  {
    id: "I-D24",
    name: "空罐头盒",
    tier: "D",
    description:
      "吃剩的罐头空壳。可当作临时容器或制造声响，但罐头边缘锋利，使用不当可能划伤。",
    statBonus: {},
    tags: "container,junk",
  },
  {
    id: "I-D25",
    name: "折断的梳子",
    tier: "D",
    description:
      "梳齿断了大半的塑料梳子。可用来整理仪容以维持理智，但梳头时会听见不属于自己的头发被扯断的声音。",
    statBonus: { sanity: 0 },
    tags: "personal,uncanny",
  },
  {
    id: "I-D26",
    name: "过期牛奶",
    tier: "D",
    description:
      "一盒胀包的牛奶，已过期两周。饮用会导致腹泻和敏捷下降，但可用来「污染」红水，使其暂时失去腐蚀性——以毒攻毒。",
    statBonus: { agility: -2 },
    tags: "consumable,chemical",
  },
  {
    id: "I-D27",
    name: "掉色的窗帘绳",
    tier: "D",
    description:
      "一根从旧窗帘上拆下的拉绳。可用于捆绑或制作简易陷阱，但绳子会逐渐收紧，长时间捆绑会勒入皮肉。",
    statBonus: {},
    tags: "binding,danger",
  },
  {
    id: "I-D28",
    name: "碎镜片",
    tier: "D",
    description:
      "从破裂八卦镜上脱落的碎片。握在手中可短暂看见「真实」倒影，但碎片会割伤手掌，且每次使用都会缩小。",
    statBonus: { sanity: 1 },
    tags: "mirror,fragment",
  },
  {
    id: "I-D29",
    name: "漏水的钢笔",
    tier: "D",
    description:
      "笔尖漏墨的老式钢笔。写下的字迹会随时间扩散成模糊的污渍。可用于签署「不重要的」文件以糊弄物业。",
    statBonus: {},
    tags: "writing,unreliable",
  },
  {
    id: "I-D30",
    name: "瘪掉的篮球",
    tier: "D",
    description:
      "一个漏气的旧篮球。拍打可制造规律声响，用来掩盖心跳或呼吸——但规律的声响同样会吸引无头猎犬。",
    statBonus: {},
    tags: "sound,double-edged",
  },
  // === 新增 D 级 20 个 ===
  {
    id: "I-D31",
    name: "发黑的银币",
    tier: "D",
    description: "一枚氧化发黑的民国银元。可投入物业办公室的许愿池换取一次「投币问路」，但池底会传来咀嚼声。",
    statBonus: {},
    tags: "coin,omen",
  },
  {
    id: "I-D32",
    name: "褪色的红绳",
    tier: "D",
    description: "一根断开的红绳手链。据说曾用于辟邪，如今只剩微弱的气息隔绝效果，可短暂延缓认知腐蚀者的定位。",
    statBonus: { sanity: 0 },
    tags: "charm,weak",
  },
  {
    id: "I-D33",
    name: "黏糊的糖纸",
    tier: "D",
    description: "一张皱巴巴的水果糖纸，表面沾满黏稠物。可贴在门缝临时隔绝气味，但会吸引嗜甜的诡异。",
    statBonus: {},
    tags: "wrapper,bait",
  },
  {
    id: "I-D34",
    name: "生锈的别针",
    tier: "D",
    description: "一枚老式安全别针。可固定衣角或临时修补，但针尖沾有不明血迹，携带可能引发「猎物」判定。",
    statBonus: {},
    tags: "tool,risky",
  },
  {
    id: "I-D35",
    name: "裂开的粉饼",
    tier: "D",
    description: "一块碎成两半的粉饼。可用于掩盖面色苍白以维持理智，但粉底会逐渐变红，仿佛吸了血。",
    statBonus: { sanity: 0 },
    tags: "personal,uncanny",
  },
  {
    id: "I-D36",
    name: "空火柴盒",
    tier: "D",
    description: "印着「如月」字样的火柴盒，内无一物。擦燃盒面可产生微光，但火光会短暂映出不该存在的影子。",
    statBonus: {},
    tags: "fire,vision",
  },
  {
    id: "I-D37",
    name: "湿漉漉的鞋垫",
    tier: "D",
    description: "一双浸过水的鞋垫。塞入门缝可吸收部分水汽，延缓管道屠夫的水源凝聚，但鞋垫会逐渐「活」过来。",
    statBonus: {},
    tags: "absorbent,danger",
  },
  {
    id: "I-D38",
    name: "缺页的日历",
    tier: "D",
    description: "一本老式撕页日历，缺失了第 3 日到第 10 日的页码。剩余页面上的日期会在无人注视时悄悄改变。",
    statBonus: {},
    tags: "time,unreliable",
  },
  {
    id: "I-D39",
    name: "半瓶漱口水",
    tier: "D",
    description: "薄荷味漱口水，剩半瓶。含在口中可短暂屏蔽腐臭，但吞咽会导致喉咙「锁死」感，持续数分钟。",
    statBonus: {},
    tags: "consumable,mixed",
  },
  {
    id: "I-D40",
    name: "断掉的橡皮筋",
    tier: "D",
    description: "一根失去弹性的橡皮筋。可用于捆扎小物或做简易记号，但橡皮筋会逐渐缩紧，最终勒入物体内部。",
    statBonus: {},
    tags: "binding,creepy",
  },
  {
    id: "I-D41",
    name: "发霉的茶叶",
    tier: "D",
    description: "一包长满白毛的袋泡茶。泡水饮用可微幅提神，但有概率触发「记忆闪回」——看见不属于自己的过去。",
    statBonus: { sanity: -1 },
    tags: "consumable,tainted",
  },
  {
    id: "I-D42",
    name: "歪斜的相框",
    tier: "D",
    description: "空相框，玻璃有裂纹。将照片放入后，相框会逐渐「修正」照片内容，使其更符合公寓的叙事。",
    statBonus: {},
    tags: "memory,cursed",
  },
  {
    id: "I-D43",
    name: "掉漆的拨浪鼓",
    tier: "D",
    description: "婴儿玩具，漆面斑驳。摇动可制造声响吸引或分散诡异注意，但长时间使用会听见婴儿啼哭声。",
    statBonus: {},
    tags: "sound,bait",
  },
  {
    id: "I-D44",
    name: "卷曲的指甲剪",
    tier: "D",
    description: "生锈的指甲剪。剪下的指甲必须立刻烧掉，否则会吸引「收集者」类型的诡异上门索要。",
    statBonus: {},
    tags: "personal,taboo",
  },
  {
    id: "I-D45",
    name: "漏气的打火机",
    tier: "D",
    description: "一次性打火机，气体泄漏。可勉强点燃符纸，但火焰会呈现诡异的蓝色，且可能引发小型爆燃。",
    statBonus: {},
    tags: "fire,risky",
  },
  {
    id: "I-D46",
    name: "发黄的绷带",
    tier: "D",
    description: "一卷过期的医用绷带。包扎伤口可止血，但绷带会与皮肤「融合」，24 小时后难以撕除。",
    statBonus: {},
    tags: "medical,risky",
  },
  {
    id: "I-D47",
    name: "瘪掉的牙膏",
    tier: "D",
    description: "一支挤空的牙膏。剪开后可用管身装少量液体，但装过红水的管子会在一小时内开始蠕动。",
    statBonus: {},
    tags: "container,hazard",
  },
  {
    id: "I-D48",
    name: "褪色的门牌",
    tier: "D",
    description: "一块无法辨认房号的金属门牌。挂在门可短暂混淆「邮差」的投递判定，使其跳过你一次。",
    statBonus: {},
    tags: "identity,consumable",
  },
  {
    id: "I-D49",
    name: "开裂的塑料勺",
    tier: "D",
    description: "一次性塑料勺，勺柄有裂痕。可舀取液体或粉末，但接触红水后会迅速溶解，释放毒雾。",
    statBonus: {},
    tags: "tool,fragile",
  },
  {
    id: "I-D50",
    name: "无墨的印泥",
    tier: "D",
    description: "干涸的红色印泥。按在纸上会留下模糊印迹，可用于伪造签名糊弄物业，但印泥会逐渐「渗血」。",
    statBonus: {},
    tags: "writing,ominous",
  },
  // === 新增 C 级 7 个 ===
  {
    id: "I-C11",
    name: "铜铃铛",
    tier: "C",
    description: "一枚小巧的铜铃。摇响可驱散 3 米内低阶认知污染，但对无头猎犬无效，反而会暴露位置。",
    statBonus: { sanity: 1 },
    tags: "sound,exorcism",
  },
  {
    id: "I-C12",
    name: "备用电池",
    tier: "C",
    description: "物业配发的 5 号电池一对。可更换手电或机械表电池，恢复设备续航。电池本身不带污染。",
    statBonus: {},
    tags: "utility,clean",
  },
  {
    id: "I-C13",
    name: "铁蒺藜",
    tier: "C",
    description: "四枚尖刺铁蒺藜。撒在走廊可延缓人形诡异的追击，但对无实体诡异无效。用后难以回收。",
    statBonus: { agility: 1 },
    tags: "trap,physical",
  },
  {
    id: "I-C14",
    name: "褪色护身符",
    tier: "C",
    description: "一枚不知名寺庙求来的护身符。可抵挡一次轻度精神污染（理智损伤减半），使用后符纸碎裂。",
    statBonus: { sanity: 2 },
    tags: "protection,consumable",
  },
  {
    id: "I-C15",
    name: "橡胶手套",
    tier: "C",
    description: "厚实工业橡胶手套。佩戴可徒手接触红水或腐蚀性液体而不受伤，但手套会逐渐与皮肤粘连。",
    statBonus: {},
    tags: "protection,hazard",
  },
  {
    id: "I-C16",
    name: "便携灭火器",
    tier: "C",
    description: "小型干粉灭火器。可喷灭火源或暂时「窒息」管道屠夫的水雾形态，使用一次后耗尽。",
    statBonus: {},
    tags: "chemical,tool",
  },
  {
    id: "I-C17",
    name: "夜光贴纸",
    tier: "C",
    description: "一板荧光贴纸。贴在墙壁可标记路线，黑暗中可见。贴纸会逐渐显现诡异的符号，需定期更换。",
    statBonus: {},
    tags: "marker,utility",
  },
  // === 新增 B 级 5 个 ===
  {
    id: "I-B06",
    name: "陈婆婆的织针",
    tier: "B",
    description:
      "陈婆婆遗落的金属织针。使用此物品可增加特定 NPC 的好感度——尤其是与「织造」相关的住客。将织针归还或赠予，对方会视为重大恩情。",
    statBonus: { charm: 2 },
    tags: "gift,favor",
  },
  {
    id: "I-B07",
    name: "林医生的处方笺",
    tier: "B",
    description:
      "一张空白处方笺，印有林医生签名。写下 NPC 名字并「开药」可增加该 NPC 的好感度，对方会认为你懂医术且关心其健康。仅限使用一次。",
    statBonus: { charm: 2 },
    tags: "gift,favor",
  },
  {
    id: "I-B08",
    name: "邮差的挂号信",
    tier: "B",
    description:
      "一封未投递的挂号信，收件人处空白。将某 NPC 名字填入并「送达」，可大幅增加该 NPC 好感度——邮差老王的因果会强制完成这单业务。",
    statBonus: { luck: 2 },
    tags: "gift,favor",
  },
  {
    id: "I-B09",
    name: "保安的巡逻表",
    tier: "B",
    description:
      "物业保安的巡逻时间表。掌握后可精准规避巡逻路线；若将表赠予对物业有敌意的 NPC，使用此物品可增加其好感度，换取合作。",
    statBonus: { agility: 2, background: 1 },
    tags: "intel,favor",
  },
  {
    id: "I-B10",
    name: "夜读老人的书",
    tier: "B",
    description:
      "一本无字的厚皮书。赠予喜爱阅读的 NPC 可增加其好感度；书中会逐渐浮现赠予对象最渴望的知识，令其感激涕零。",
    statBonus: { charm: 2 },
    tags: "gift,favor",
  },
];
