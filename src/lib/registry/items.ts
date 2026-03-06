// src/lib/registry/items.ts
// 如月公寓物品注册表 - 49 件完整硬编码，禁止占位符

import type { Item } from "./types";

export const ITEMS: readonly Item[] = [
  // === S级 1个 ===
  {
    id: "I-S01",
    name: "染血的如月建筑原稿",
    tier: "S",
    description:
      "一份泛黄的建筑设计图，边缘浸染暗红色污渍。图纸标注了如月公寓的「真实结构」——承重墙被标为「骨骼投影」，水管网络被标为「消化管道」。署名处有被涂抹的研究机构代号。",
    statBonus: { background: 5, sanity: 3 },
    tags: "meta,truth",
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
      "上世纪 80 年代秘密研究机构遗留的协议碎片。记载了红水静置、镜子遮挡等核心规则的原始依据。持有者可临时「强化」对特定规则的理解。",
    statBonus: { background: 4 },
    tags: "protocol,rules",
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
      "不知名道士留下的黄符，朱砂字迹已褪色。可抵御一次低强度的诡异接触，使用后符纸自燃成灰。对高维实体效果有限。",
    statBonus: { sanity: 2 },
    tags: "protection,exorcism",
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
];
