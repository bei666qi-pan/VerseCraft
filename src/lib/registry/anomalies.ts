// src/lib/registry/anomalies.ts
// 如月公寓空间异常机制注册表：异常体是空间机制的外显，不是逐层 Boss。

import type { Anomaly } from "./types";

export const ANOMALIES: readonly Anomaly[] = [
  {
    id: "A-001",
    name: "时差症候群",
    floor: "1",
    combatPower: 4,
    displayDangerLevel: "中",
    threatRating: 4,
    appearance:
      "登记口附近的时钟突然倒转，挂历页飞速翻动。你的影子与你的动作产生数秒延迟，像被另一份登记表提前写走。",
    triggerCondition: "玩家试图矫正时间、篡改登记、追逐延迟影子，或否认自己的当前身份锚点。",
    escalationPattern: "时间错位先造成记忆断片，再让行动顺序错乱，最终把玩家从当前叙事登记中剥离。",
    counterWindow: "停止纠正外部时钟，记住姓名、入楼时间和随身表读数；用登记物或见证者锚住当前身份。",
    narrativeRole: "把玩家从普通误入者转成可登记对象，提示公寓先处理身份再处理肉体。",
    floorMechanismTheme: "身份/登记/时间错位",
    killingRule:
      "若持续追逐延迟影子或强行改写登记，时间线会把你视作无法归档的异常标本，触发高风险剥离。",
    survivalMethod:
      "停止纠正时间显示，默念自己的姓名和入楼时刻，借随身表或登记物锚定身份；待倒转停止后撤离。",
    sanityDamage: 8,
  },
  {
    id: "A-002",
    name: "无头猎犬",
    floor: "4",
    combatPower: 6,
    displayDangerLevel: "高",
    threatRating: 6,
    appearance:
      "4 楼走廊深处传来沉重喘息与指甲刮擦声。无头犬形轮廓凭声源锁定猎物，断颈处滴落黑色粘液。",
    triggerCondition: "玩家回应狗叫、敲门寻找大黄、奔跑制造连续声源，或利用盲人执念无准备地靠近声源。",
    escalationPattern: "先用熟悉叫声标记情绪，再沿脚步/呼吸追踪位置；被锁定后风险快速升级为追猎。",
    counterWindow: "静默、隔音、转移声源、利用导盲杖/录音残片制造短暂误导窗口，然后撤离。",
    narrativeRole: "把‘救狗’与‘声音诱饵’绑定，让玩家学会交涉、取舍与验证传闻。",
    floorMechanismTheme: "声音诱捕/导盲犬执念/4F 失物链",
    killingRule:
      "若把狗叫当作单纯求救并持续回应，猎犬会沿声源追溯到你的位置，造成位置暴露和高强度追猎。",
    survivalMethod:
      "保持静默，降低脚步声；必要时把硬物或录音作为诱饵声源，趁其偏移时撤离并安抚相关 NPC。",
    sanityDamage: 25,
  },
  {
    id: "A-003",
    name: "认知腐蚀者",
    floor: "3",
    combatPower: 7,
    displayDangerLevel: "高",
    threatRating: 7,
    appearance:
      "你脑中涌现从未经历过的记忆：在这栋公寓住了十年、参加过自己的葬礼。墙上文字开始逐字扭曲。",
    triggerCondition: "玩家相信虚假记忆并据此行动，或尝试解读污染文字来替代真实线索。",
    escalationPattern: "先写入温和日常，再制造依恋与熟悉感，最后覆盖玩家对姓名、地点和关系的判断。",
    counterWindow: "复述真实姓名、入楼事实和当前目标；用照片/手记记录扭曲前的文字，延迟解读。",
    narrativeRole: "把线索验证和自我记录做成核心玩法，而不是让玩家背诵规则。",
    floorMechanismTheme: "认知/童年/虚假记忆",
    killingRule:
      "若完全服从虚假记忆行动，玩家会被写入错误身份，进入人格崩解或长期迷失风险。",
    survivalMethod:
      "固定三项事实：姓名、入楼场景、当前目标；先拍照或记录，不在污染态下解释文字。",
    sanityDamage: 35,
  },
  {
    id: "A-004",
    name: "管道中的屠夫",
    floor: "2",
    combatPower: 7,
    displayDangerLevel: "高",
    threatRating: 7,
    appearance:
      "2 楼诊室、地漏与水龙头涌出猩红沉淀物，伴随碎骨与毛发。液体凝成持刀人形，是管道分拣系统的拟态投射。",
    triggerCondition: "饮用红水、触碰返涌沉淀物、在水源附近流血，或用刀具与凝聚体正面对抗。",
    escalationPattern: "红水先标记样本，再由管线拖拽；凝聚体越接近完整人形，撤退成本越高。",
    counterWindow: "关闭水源，隔离地漏，用盐/石灰/干燥剂阻断根部凝聚；离开 3 米管线范围。",
    narrativeRole: "把 2F 医疗、样本、管道与原石稳定秩序连成一条分拣线。",
    floorMechanismTheme: "医疗/样本/水源或管道分拣",
    killingRule:
      "若在管线标记后继续饮用或触碰沉淀物，屠夫会把你判作可处理样本并升级拖拽/切割风险。",
    survivalMethod:
      "关闭所有水源，用干燥或封堵材料处理根部，马上撤离潮湿空间；不要把它当可硬拼的人形敌人。",
    sanityDamage: 30,
  },
  {
    id: "A-005",
    name: "器官拟态墙",
    floor: "5",
    combatPower: 6,
    displayDangerLevel: "中高",
    threatRating: 6,
    appearance:
      "墙皮像皮肤般起伏，剥落处露出粉红肉膜与血管纹理。墙面睁开无瞳孔的眼，像在判断你能否被替换。",
    triggerCondition: "触碰肉化墙面、长时间凝视墙眼，或试图用利器把墙当作普通障碍切开。",
    escalationPattern: "先拟态为可躲藏/可创作的表面，再把轮廓、器官和身份逐步替换。",
    counterWindow: "遮住墙眼、避免对视、倒退离开；用颜料/布料/烟雾制造轮廓干扰。",
    narrativeRole: "让 5F 的庇护、创作和形体替换互相咬合，逼玩家判断‘安全壳’是否可信。",
    floorMechanismTheme: "器官拟态/形体替换",
    killingRule:
      "若把墙面当普通掩体并持续接触，拟态墙会开始轮廓替换，造成吞并或身份污染。",
    survivalMethod:
      "不要对视，不要背身贴墙；遮挡观察面后倒退撤离，必要时用外观干扰物争取窗口。",
    sanityDamage: 20,
  },
  {
    id: "A-006",
    name: "楼梯间的倒行者",
    floor: "6",
    combatPower: 8,
    displayDangerLevel: "高",
    threatRating: 8,
    appearance:
      "楼梯上出现背对你的身影，脚掌与台阶方向相反。他的后脑光滑如镜，映出你所在的位置。",
    triggerCondition: "直视其镜面后脑、从背后超越、在错向楼梯间奔跑，或把错层门牌当真实楼层追逐。",
    escalationPattern: "先倒置方向感，再制造错层门牌与镜像路线，最后让玩家在楼梯上做出反向行动。",
    counterWindow: "闭眼、扶墙、倒退到平台；用镜面碎片确认真实方向，不追逐 10F/11F 等错层标记。",
    narrativeRole: "把 6F 的镜像、错层和 N-016 失眠投影绑定，修正越界楼层污染。",
    floorMechanismTheme: "镜像/方向/倒行",
    killingRule:
      "若与镜面后脑建立视觉接触并继续移动，方向感会被反写，导致坠落、迷失或错层卷入。",
    survivalMethod:
      "闭眼扶墙等待，必要时倒退至上一平台；把错层门牌视作污染投影，不当作真实地图。",
    sanityDamage: 40,
  },
  {
    id: "A-007",
    name: "13 楼门扉",
    floor: "7",
    combatPower: 9,
    displayDangerLevel: "极高",
    threatRating: 9,
    appearance:
      "电梯显示 13。走廊两侧房门紧闭，灰尘里的鞋尖全指向电梯。尽头半开的门里传来你的声音。",
    triggerCondition: "把 13 楼当真实楼层探索，回应门内呼唤，或把假出口当成终局出口。",
    escalationPattern: "先提供似是而非的出口，再用熟人声音和门牌错觉拖入未消化层。",
    counterWindow: "不要跨出电梯/门线；若已误入，锁定来路直线撤回，不回应门内声音。",
    narrativeRole: "把 7F 假出口、未消化层和终局资格筛选区分开，防止玩家误把捷径当主线。",
    floorMechanismTheme: "假出口/13 楼门扉/未消化层",
    killingRule:
      "若回应门内呼唤并把假门当出口，玩家会被困进未消化层闭环，付出时间、关系或身份代价。",
    survivalMethod:
      "拒绝互动并撤回真实楼层；若必须调查，只记录门牌与声音，不跨越门线。",
    sanityDamage: 50,
  },
  {
    id: "A-008",
    name: "深渊守门人",
    floor: "B2",
    combatPower: 10,
    displayDangerLevel: "终局",
    threatRating: 10,
    appearance:
      "地下二层出口木门前，高逾三米的类人轮廓由住户残影叠合而成，面容不断轮换。它不是普通敌人，而是出口喉管的资格筛选机制。",
    triggerCondition: "未满足出口链却硬闯 B2、试图破坏出口木门，或把短暂窗口误判为通关条件。",
    escalationPattern: "先压迫精神与影子，再剥夺撤退路线；凌晨 1 点或抵挡攻击只提供侦查/撤退窗口，不完成通关。",
    counterWindow: "短暂窗口可用于侦查、谈判或撤退；真正逃离必须满足路线碎片、B2 权限、钥物/资格、认可/替代通行、代价试炼和最终窗口行动。",
    narrativeRole: "终局出口喉管与资格审计，不是可以偷跑或硬打通过的 Boss 房。",
    floorMechanismTheme: "出口喉管/守门人/资格审计",
    killingRule:
      "未获通行资格时硬闯会触发终局审计；抵挡攻击只能保命撤退，不能等同于打开出口。",
    survivalMethod:
      "把 1 点窗口和三次抵挡视作侦查/撤退手段；完成六段出口链后，才在最终窗口执行离开动作。",
    sanityDamage: 80,
  },
];
