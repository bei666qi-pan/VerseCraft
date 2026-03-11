// src/lib/registry/warehouseItems.ts
// 仓库物品注册表 - 60 件。存放于仓库，无属性要求，无等级，收益略大于副作用，楼层越高越强。

import type { WarehouseItem } from "./types";

/** 守夜人（无面保安 N-018）拥有复活物品 */
export const NIGHT_WATCHMAN_ID = "N-018";

export const WAREHOUSE_ITEMS: readonly WarehouseItem[] = [
  // === B1 层 6 件（最弱）===
  { id: "W-B101", name: "配电间的绝缘胶带", description: "电工遗留的胶带。", benefit: "可临时封闭漏电线路，1 小时内该房间安全。", sideEffect: "胶带会逐渐「呼吸」，2 小时后失效且散发焦味吸引诡异。", ownerId: "N-008", floor: "B1" },
  { id: "W-B102", name: "褪色的洗衣标签", description: "从床单上扯下的标签。", benefit: "佩戴可隔绝部分腐臭 30 分钟，理智消耗减半。", sideEffect: "标签会吸收你的体味，诡异更容易追踪你。", ownerId: "N-014", floor: "B1" },
  { id: "W-B103", name: "锈蚀的保险丝", description: "配电箱拆下的废保险丝。", benefit: "投入许愿池可换取一次「短路避灾」——下次遭遇时延迟 10 秒。", sideEffect: "使用后 2 小时内灯光会无故闪烁，增加不安感。", ownerId: "N-008", floor: "B1" },
  { id: "W-B104", name: "发黄的漂洗剂瓶", description: "洗衣房用剩的漂洗剂。", benefit: "泼向污染源可暂时净化 15 分钟。", sideEffect: "瓶身会渗出腐蚀液，携带可能灼伤。", ownerId: "N-014", floor: "B1" },
  { id: "W-B105", name: "储物间的旧钥匙", description: "一把无法辨认编号的钥匙。", benefit: "可打开 B1 任意一扇废弃储物间的门。", sideEffect: "用过的门会在 1 小时后自动锁死，若你在门内则被困。", ownerId: "N-008", floor: "B1" },
  { id: "W-B106", name: "洗衣液空瓶", description: "印有物业 Logo 的空瓶。", benefit: "装盛液体可隔绝气息 1 小时。", sideEffect: "装过红水的瓶子会在一夜后开始蠕动。", ownerId: "N-014", floor: "B1" },
  // === 1 楼 8 件 ===
  { id: "W-101", name: "陈婆婆的顶针", description: "一枚老式铜顶针。", benefit: "佩戴可增加魅力+2 持续 2 小时，NPC 更易接纳。", sideEffect: "顶针会逐渐勒紧手指，超过 2 小时需用力才能脱下。", ownerId: "N-001", floor: "1" },
  { id: "W-102", name: "邮差的旧邮戳", description: "沾满干涸印泥的橡皮戳。", benefit: "盖在信件上可「标记」为已送达，跳过邮差一次投递。", sideEffect: "邮戳会逐渐显现你的名字和某个未来日期。", ownerId: "N-003", floor: "1" },
  { id: "W-103", name: "物业的空白表单", description: "物业办公室的空白表格。", benefit: "填写可伪造一次「合规」身份，通过物业检查。", sideEffect: "表单会在无人注视时自动填满你的死因。", ownerId: "N-010", floor: "1" },
  { id: "W-104", name: "门厅的枯萎盆栽", description: "一盆枯死的绿植。", benefit: "摆放在房间可吸收部分认知污染，理智+2 持续 4 小时。", sideEffect: "盆栽会「复活」并生长 toward 你，需及时移除。", ownerId: "N-001", floor: "1" },
  { id: "W-105", name: "信箱区的铁夹子", description: "夹报纸用的铁夹。", benefit: "可夹住门缝阻止门自动关闭 1 小时。", sideEffect: "夹子会逐渐夹紧，1 小时后难以取下。", ownerId: "N-003", floor: "1" },
  { id: "W-106", name: "实习徽章的别针", description: "引导员遗落的别针。", benefit: "佩戴可让部分 NPC 误认为你是「内部人员」，好感+5。", sideEffect: "别针会逐渐刺入皮肤，1 天内必须取下。", ownerId: "N-020", floor: "1" },
  { id: "W-107", name: "保安室的镜子碎片", description: "从破碎镜子上剥落的碎片。", benefit: "握持可短暂看见无面保安的完整五官，获得 1 次「识破」机会。", sideEffect: "碎片会割伤手掌，且你会短暂看见自己的脸在镜中扭曲。", ownerId: "N-018", floor: "1" },
  { id: "W-108", name: "守夜人的复活烛芯", description: "一根浸过某种油脂的蜡烛芯。使用后可复活除玩家外任意一名已死亡的 NPC 或诡异。", benefit: "复活目标恢复至死亡前状态，且对你初始好感+10。", sideEffect: "1 天内玩家必将遭遇足以威胁生命的试炼（不一定会死）。", ownerId: "N-018", floor: "1", isResurrection: true },
  // === 2 楼 6 件 ===
  { id: "W-201", name: "诊室的消毒棉", description: "林医生诊室遗落的棉球。", benefit: "擦拭伤口可止血并理智+1。", sideEffect: "棉球会吸收血液后膨胀，需在 10 分钟内丢弃。", ownerId: "N-002", floor: "2" },
  { id: "W-202", name: "时差症候群的表盘", description: "从扭曲时钟上脱落的表盘。", benefit: "佩戴可抵抗时差症候群 2 小时，时间感知正常。", sideEffect: "表盘上的指针会开始倒转，影响你的时间感。", ownerId: "A-001", floor: "2" },
  { id: "W-203", name: "病历夹的金属扣", description: "病历本上的金属扣。", benefit: "扣在衣领可临时获得出身+2，持续 1 小时。", sideEffect: "金属扣会逐渐升温，1 小时后烫伤皮肤。", ownerId: "N-002", floor: "2" },
  { id: "W-204", name: "走廊的挂历残页", description: "一页被撕下的挂历。", benefit: "默念上面的日期可「锚定」时间感 30 分钟。", sideEffect: "残页上的日期会逐渐变成你的生日。", ownerId: "A-001", floor: "2" },
  { id: "W-205", name: "药柜的干燥剂", description: "药柜中的硅胶干燥剂。", benefit: "放入容器可吸收湿气，延缓管道屠夫凝聚 20 分钟。", sideEffect: "干燥剂吸收足够后会展露内部——那是一颗眼球。", ownerId: "N-002", floor: "2" },
  { id: "W-206", name: "影子延迟的残影", description: "从时差症候群中剥离的「延迟影子」碎片。", benefit: "使用后可让下一次攻击判定延迟 5 秒。", sideEffect: "你的影子会短暂脱离身体，需在 1 分钟内找回。", ownerId: "A-001", floor: "2" },
  // === 3 楼 6 件 ===
  { id: "W-301", name: "阿花的旧发绳", description: "小女孩用过的发绳。", benefit: "扎头发可增加魅力+3 持续 1 小时，孩童类 NPC 好感+8。", sideEffect: "发绳会逐渐收紧，1 小时后需剪断。", ownerId: "N-004", floor: "3" },
  { id: "W-302", name: "认知腐蚀者的记忆残片", description: "从扭曲记忆中剥离的碎片。", benefit: "吞服可短暂获得「虚假记忆」——混淆认知腐蚀者 20 分钟。", sideEffect: "你会忘记一件真实的重要记忆，持续 24 小时。", ownerId: "A-003", floor: "3" },
  { id: "W-303", name: "楼梯间的毽羽", description: "从黑色毽子上脱落的羽毛。", benefit: "抛出可吸引阿花注意 30 秒，为你争取逃脱时间。", sideEffect: "阿花会记住你的气味，下次见面更执著。", ownerId: "N-004", floor: "3" },
  { id: "W-304", name: "扭曲文字的拓片", description: "从墙上拓下的扭曲符号。", benefit: "凝视可短暂「读懂」认知污染中的真实含义。", sideEffect: "你的书写会逐渐扭曲，持续 2 小时。", ownerId: "A-003", floor: "3" },
  { id: "W-305", name: "陈婆婆的线头", description: "陈婆婆织毛衣时掉落的线头。", benefit: "赠予阿花可增加其好感+12。", sideEffect: "线头会「长」回陈婆婆处，她会知道你送人了。", ownerId: "N-004", floor: "3" },
  { id: "W-306", name: "虚假记忆的结晶", description: "认知腐蚀留下的透明结晶。", benefit: "握持可暂时免疫认知污染 15 分钟。", sideEffect: "结晶会注入一段虚假记忆，可能影响判断。", ownerId: "A-003", floor: "3" },
  // === 4 楼 8 件 ===
  { id: "W-401", name: "盲人的墨镜链", description: "导盲者常用的眼镜链。", benefit: "佩戴可增加幸运+2 持续 2 小时。", sideEffect: "链子会逐渐勒紧后颈，需在 2 小时内取下。", ownerId: "N-005", floor: "4" },
  { id: "W-402", name: "无头猎犬的项圈残骸", description: "从猎犬颈间脱落的金属项圈。", benefit: "摇响可吸引无头猎犬注意 20 秒，朝声源移动。", sideEffect: "猎犬会记住这个声音，下次更容易锁定你。", ownerId: "A-002", floor: "4" },
  { id: "W-403", name: "张先生的报纸角", description: "从无日期报纸上撕下的边角。", benefit: "贴在额头可锚定时间感 1 小时，免疫时差混乱。", sideEffect: "角上的日期会逐渐浮现——那是你的死期。", ownerId: "N-006", floor: "4" },
  { id: "W-404", name: "管道屠夫的骨渣", description: "从屠夫凝聚体中脱落的骨渣。", benefit: "撒向水源可暂时污染管道，屠夫 30 分钟内无法凝聚。", sideEffect: "骨渣会逐渐「生长」，需在 1 小时内清理。", ownerId: "A-004", floor: "4" },
  { id: "W-405", name: "导盲杖的橡胶头", description: "盲人导盲杖底部的橡胶套。", benefit: "塞入门缝可减少脚步声传播，敏捷+2 持续 30 分钟。", sideEffect: "橡胶会吸附地面的「残留」，逐渐变重。", ownerId: "N-005", floor: "4" },
  { id: "W-406", name: "狗叫的录音残片", description: "录有狗叫的磁带碎片。", benefit: "播放可混淆无头猎犬 15 秒。", sideEffect: "猎犬会追踪声源，你需在播放时迅速撤离。", ownerId: "A-002", floor: "4" },
  { id: "W-407", name: "401 室的旧算盘", description: "张先生用过的算盘。", benefit: "拨动可暂时理清混乱数字，出身+2 持续 1 小时。", sideEffect: "算珠会自行移动，显示你不愿看见的数字。", ownerId: "N-006", floor: "4" },
  { id: "W-408", name: "屠夫的刀锈", description: "从屠夫刀刃上刮下的锈迹。", benefit: "涂在门缝可暂时「污染」门，屠夫无法从该门的水管出现。", sideEffect: "锈迹会扩散，24 小时后门将无法打开。", ownerId: "A-004", floor: "4" },
  // === 5 楼 6 件 ===
  { id: "W-501", name: "画室的褪色颜料", description: "画家用剩的颜料管。", benefit: "涂抹可暂时改变物品外观，迷惑诡异 20 分钟。", sideEffect: "颜料会逐渐显现画家的脸，凝视超 5 秒会吸引她。", ownerId: "N-007", floor: "5" },
  { id: "W-502", name: "器官拟态墙的眼睑", description: "从拟态墙上剥落的肉膜。", benefit: "贴在身上可暂时「拟态」为墙的一部分 15 分钟。", sideEffect: "眼睑会逐渐与皮肤融合，需在 15 分钟内撕下。", ownerId: "A-005", floor: "5" },
  { id: "W-503", name: "未完成的自画像碎片", description: "从画家画布上撕下的碎片。", benefit: "持有可增加魅力+3 持续 1 小时，画家好感+10。", sideEffect: "碎片上的眼睛会逐渐转向你。", ownerId: "N-007", floor: "5" },
  { id: "W-504", name: "墙眼的分泌物", description: "器官拟态墙眼睛分泌的透明液。", benefit: "涂抹在镜面上可「遮蔽」倒行者 10 分钟。", sideEffect: "分泌物会逐渐腐蚀镜面，用后镜子可能碎裂。", ownerId: "A-005", floor: "5" },
  { id: "W-505", name: "调色盘上的混色", description: "画家调色盘上的混合颜料。", benefit: "涂在脸上可短暂改变面容，持续 30 分钟。", sideEffect: "洗掉后你的真实面容会短暂模糊。", ownerId: "N-007", floor: "5" },
  { id: "W-506", name: "拟态墙的血管丝", description: "从墙内抽出的细小血管。", benefit: "点燃可驱散 3 米内低阶污染 20 分钟。", sideEffect: "血管燃烧时会发出惨叫，吸引其他诡异。", ownerId: "A-005", floor: "5" },
  // === 6 楼 6 件 ===
  { id: "W-601", name: "双胞胎的共用手帕", description: "两人共用过的旧手帕。", benefit: "持有可让双胞胎无法「选择」你 1 次。", sideEffect: "手帕会逐渐分裂成两半，各映出你的一半脸。", ownerId: "N-009", floor: "6" },
  { id: "W-602", name: "倒行者的脚印拓片", description: "从楼梯上拓下的倒行脚印。", benefit: "贴在脚底可短暂倒转方向感 10 分钟，规避倒行者。", sideEffect: "取下后你会短暂分不清上下左右。", ownerId: "A-006", floor: "6" },
  { id: "W-603", name: "失眠者的眼罩", description: "失眠症患者用过的眼罩。", benefit: "佩戴可屏蔽视觉污染 1 小时，理智消耗减半。", sideEffect: "摘下后你会短暂看到「墙的吞咽」幻象。", ownerId: "N-016", floor: "6" },
  { id: "W-604", name: "镜像维度的碎片", description: "从倒行者身上剥离的镜面碎片。", benefit: "握持可短暂看见楼梯间的「真实」倒影 5 分钟。", sideEffect: "碎片中的倒影会试图与你交换位置。", ownerId: "A-006", floor: "6" },
  { id: "W-605", name: "共鸣水晶的碎屑", description: "从双胞胎水晶上掉落的碎屑。", benefit: "吞服可短暂与双胞胎「共鸣」，预知她们位置 20 分钟。", sideEffect: "你会听见两人的心声，可能混淆自我。", ownerId: "N-009", floor: "6" },
  { id: "W-606", name: "失眠者手记的残页", description: "从手记上撕下的字迹。", benefit: "阅读可保持清醒 2 小时，免疫睡眠类攻击。", sideEffect: "字迹会逐渐变成你的笔迹，并写满你的秘密。", ownerId: "N-016", floor: "6" },
  // === 7 楼 10 件（最强）===
  { id: "W-701", name: "夜读老人的书页", description: "从消化日志上脱落的泛黄书页。", benefit: "阅读可获知一名已消化住户的「死因」，理智+3。", sideEffect: "书页会逐渐显现你的名字，若完成则你将被记录。", ownerId: "N-011", floor: "7" },
  { id: "W-702", name: "厨师的刀柄缠布", description: "屠夫菜刀柄上的缠布。", benefit: "缠绕手腕可增加敏捷+3 持续 2 小时。", sideEffect: "缠布会吸收血污，2 小时后难以解下。", ownerId: "N-012", floor: "7" },
  { id: "W-703", name: "13 楼门扉的灰尘", description: "从门缝中扫出的尘埃。", benefit: "撒向走廊可暂时「标记」13 楼入口 1 小时，避免误入。", sideEffect: "灰尘会逐渐聚拢成脚印，指向你的位置。", ownerId: "A-007", floor: "7" },
  { id: "W-704", name: "钢琴师的无声琴键", description: "从亡灵钢琴上取下的琴键。", benefit: "按下可短暂听见「未完成旋律」，理智+5 持续 30 分钟。", sideEffect: "旋律会在你脑中循环，持续 24 小时。", ownerId: "N-013", floor: "7" },
  { id: "W-705", name: "调查员的暗码表", description: "前调查员用的密码对照表。", benefit: "使用可破译一次加密信息，出身+5 持续 1 小时。", sideEffect: "破译后你的部分记忆会被「加密」，需 24 小时恢复。", ownerId: "N-019", floor: "7" },
  { id: "W-706", name: "门扉内的呼唤残响", description: "从 13 楼门内传出的声音残片。", benefit: "播放可吸引 13 楼门扉注意 30 秒，为他人争取撤离时间。", sideEffect: "残响中有你的声音，听久会被门扉「标记」。", ownerId: "A-007", floor: "7" },
  { id: "W-707", name: "消化日志的目录页", description: "记录消化进度的目录。", benefit: "阅读可获知公寓当前消化阶段，出身+4 持续 2 小时。", sideEffect: "目录会逐渐增加新条目，其中一条是你。", ownerId: "N-011", floor: "7" },
  { id: "W-708", name: "管道屠夫的恐惧结晶", description: "厨师与屠夫对抗时凝结的结晶。", benefit: "捏碎可驱散 5 米内屠夫 1 分钟。", sideEffect: "屠夫会记住你的气息，下次更狂暴。", ownerId: "N-012", floor: "7" },
  { id: "W-709", name: "前调查员的录音带", description: "记录调查结论的磁带。", benefit: "播放可获知一条关于公寓的核心情报。", sideEffect: "磁带中的内容会与你所知矛盾，引发认知混乱。", ownerId: "N-019", floor: "7" },
  { id: "W-710", name: "门扉封印的裂痕", description: "从 13 楼门扉上剥离的封印碎片。", benefit: "持有可短暂「欺骗」门扉 10 秒，不触发必杀。", sideEffect: "裂痕会扩散，门扉对你的执念+1。", ownerId: "A-007", floor: "7" },
  // === B2 层 4 件（最强层）===
  { id: "W-B201", name: "守门人的残影碎片", description: "从深渊守门人身上脱落的残影。", benefit: "握持可短暂获得「守门人威压」，诡异 30 秒内不主动攻击。", sideEffect: "残影会试图与你的影子融合，需在 30 秒内丢弃。", ownerId: "A-008", floor: "B2" },
  { id: "W-B202", name: "出口通道的锈迹", description: "B2 出口门上的锈迹。", benefit: "涂抹可暂时「腐蚀」一扇门的锁，强行打开。", sideEffect: "锈迹会蔓延到你触碰的下一个金属物品。", ownerId: "A-008", floor: "B2" },
  { id: "W-B203", name: "住户残影的聚合体", description: "守门人身上无数住户残影的微小聚合。", benefit: "吞服可短暂获得随机一名已消化住户的「记忆」，理智+5。", sideEffect: "你会短暂失去自我认知，持续 1 小时。", ownerId: "A-008", floor: "B2" },
  { id: "W-B204", name: "守门人面容的碎片", description: "从守门人轮换面容上剥落的碎片。", benefit: "戴上可短暂幻化为守门人面容 5 秒，震慑诡异。", sideEffect: "碎片中的面容会凝视你，持续至你入睡。", ownerId: "A-008", floor: "B2" },
];
