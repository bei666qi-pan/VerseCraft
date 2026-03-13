// src/lib/registry/warehouseItems.ts
// 仓库物品注册表 - 60 件。存放于仓库，无属性要求，无等级，收益略大于副作用，楼层越高越强。

import type { WarehouseItem } from "./types";

/** 守夜人（无面保安 N-018）拥有复活物品 */
export const NIGHT_WATCHMAN_ID = "N-018";

export const WAREHOUSE_ITEMS: readonly WarehouseItem[] = [
  // === B1 层 6 件（最弱）===
  { id: "W-B101", name: "配电间的绝缘胶带", description: "电工遗留的胶带。", benefit: "封闭漏电线路，房间安全2小时。", sideEffect: "2小时后失效，焦味吸引诡异。", ownerId: "N-008", floor: "B1" },
  { id: "W-B102", name: "褪色的洗衣标签", description: "从床单上扯下的标签。", benefit: "隔绝腐臭2小时，理智消耗减半。", sideEffect: "吸收体味，易被追踪。", ownerId: "N-014", floor: "B1" },
  { id: "W-B103", name: "锈蚀的保险丝", description: "配电箱拆下的废保险丝。", benefit: "投许愿池换「短路避灾」，下次遭遇争取撤离。", sideEffect: "2小时内灯光闪烁。", ownerId: "N-008", floor: "B1" },
  { id: "W-B104", name: "发黄的漂洗剂瓶", description: "洗衣房用剩的漂洗剂。", benefit: "泼向污染源净化2小时，腐蚀液态诡异。", sideEffect: "瓶身渗液，携带可灼伤。", ownerId: "N-014", floor: "B1" },
  { id: "W-B105", name: "储物间的旧钥匙", description: "一把无法辨认编号的钥匙。", benefit: "开B1任意废弃储物间门。", sideEffect: "2小时后门锁死，门内则被困。", ownerId: "N-008", floor: "B1" },
  { id: "W-B106", name: "洗衣液空瓶", description: "印有物业 Logo 的空瓶。", benefit: "装液体隔绝气息3小时。", sideEffect: "装过红水一夜后会蠕动。", ownerId: "N-014", floor: "B1" },
  // === 1 楼 8 件 ===
  { id: "W-101", name: "陈婆婆的顶针", description: "一枚老式铜顶针。", benefit: "魅力+3约3小时，NPC更易接纳。", sideEffect: "超3小时勒紧，难脱下。", ownerId: "N-001", floor: "1" },
  { id: "W-102", name: "邮差的旧邮戳", description: "沾满干涸印泥的橡皮戳。", benefit: "盖信上标记已送达，跳过邮差2次投递。", sideEffect: "会显现你的名字和未来日期。", ownerId: "N-003", floor: "1" },
  { id: "W-103", name: "物业的空白表单", description: "物业办公室的空白表格。", benefit: "伪造合规身份，通过物业检查。", sideEffect: "无人注视时会自动填死因。", ownerId: "N-010", floor: "1" },
  { id: "W-104", name: "门厅的枯萎盆栽", description: "一盆枯死的绿植。", benefit: "吸收认知污染，理智+3约5小时。", sideEffect: "会复活并朝你生长。", ownerId: "N-001", floor: "1" },
  { id: "W-105", name: "信箱区的铁夹子", description: "夹报纸用的铁夹。", benefit: "夹门缝阻止自动关闭3小时。", sideEffect: "3小时后夹紧难取。", ownerId: "N-003", floor: "1" },
  { id: "W-106", name: "实习徽章的别针", description: "引导员遗落的别针。", benefit: "部分NPC误认为内部人员，好感+5。", sideEffect: "1天内会刺入皮肤，需取下。", ownerId: "N-020", floor: "1" },
  { id: "W-107", name: "保安室的镜子碎片", description: "从破碎镜子上剥落的碎片。", benefit: "见无面保安五官，获得1次识破机会。", sideEffect: "割伤手掌，镜中脸会扭曲。", ownerId: "N-018", floor: "1" },
  { id: "W-108", name: "守夜人的复活烛芯", description: "浸过油脂的蜡烛芯。", benefit: "复活1名死亡NPC/诡异，对你好感+10。", sideEffect: "1天内遭遇生命威胁试炼。", ownerId: "N-018", floor: "1", isResurrection: true },
  // === 2 楼 6 件 ===
  { id: "W-201", name: "诊室的消毒棉", description: "林医生诊室遗落的棉球。", benefit: "止血，理智+3。", sideEffect: "吸血膨胀，2小时内丢弃。", ownerId: "N-002", floor: "2" },
  { id: "W-202", name: "时差症候群的表盘", description: "从扭曲时钟脱落的表盘。", benefit: "免疫时间扭曲4小时。", sideEffect: "指针倒转，影响时间感。", ownerId: "A-001", floor: "2" },
  { id: "W-203", name: "病历夹的金属扣", description: "病历本上的金属扣。", benefit: "出身+4约3小时。", sideEffect: "3小时后升温烫伤。", ownerId: "N-002", floor: "2" },
  { id: "W-204", name: "走廊的挂历残页", description: "一页被撕下的挂历。", benefit: "锚定时间感2小时。", sideEffect: "日期会变成你生日。", ownerId: "A-001", floor: "2" },
  { id: "W-205", name: "药柜的干燥剂", description: "药柜中的硅胶干燥剂。", benefit: "延缓水源凝聚诡异3小时。", sideEffect: "吸够湿气后现出眼球。", ownerId: "N-002", floor: "2" },
  { id: "W-206", name: "影子延迟的残影", description: "时差症候群的延迟影子碎片。", benefit: "下一次攻击推迟，争取撤离。", sideEffect: "影子脱离身体，2小时内需找回。", ownerId: "A-001", floor: "2" },
  // === 3 楼 6 件 ===
  { id: "W-301", name: "阿花的旧发绳", description: "小女孩用过的发绳。", benefit: "魅力+5约3小时，孩童NPC好感+12。", sideEffect: "3小时后收紧需剪断。", ownerId: "N-004", floor: "3" },
  { id: "W-302", name: "认知腐蚀者的记忆残片", description: "从扭曲记忆剥离的碎片。", benefit: "混淆记忆追踪诡异2小时。", sideEffect: "忘记1件重要记忆24小时。", ownerId: "A-003", floor: "3" },
  { id: "W-303", name: "楼梯间的毽羽", description: "黑色毽子上脱落的羽毛。", benefit: "吸引幼童执念诡异，争取逃脱。", sideEffect: "阿花会记住气味，下次更执著。", ownerId: "N-004", floor: "3" },
  { id: "W-304", name: "扭曲文字的拓片", description: "从墙上拓下的扭曲符号。", benefit: "读懂认知污染含义。", sideEffect: "书写扭曲2小时。", ownerId: "A-003", floor: "3" },
  { id: "W-305", name: "陈婆婆的线头", description: "陈婆婆织毛衣时掉落的线头。", benefit: "赠阿花好感+12。", sideEffect: "线头会长回陈婆婆处。", ownerId: "N-004", floor: "3" },
  { id: "W-306", name: "虚假记忆的结晶", description: "认知腐蚀留下的透明结晶。", benefit: "免疫认知污染2小时。", sideEffect: "注入虚假记忆影响判断。", ownerId: "A-003", floor: "3" },
  // === 4 楼 8 件 ===
  { id: "W-401", name: "盲人的墨镜链", description: "导盲者常用的眼镜链。", benefit: "幸运+4约3小时。", sideEffect: "3小时内勒紧后颈需取下。", ownerId: "N-005", floor: "4" },
  { id: "W-402", name: "无头猎犬的项圈残骸", description: "猎犬颈间脱落的金属项圈。", benefit: "摇响吸引听觉诡异，争取撤离。", sideEffect: "猎犬会记住声音，下次易锁定。", ownerId: "A-002", floor: "4" },
  { id: "W-403", name: "张先生的报纸角", description: "无日期报纸撕下的边角。", benefit: "锚定时间感3小时，免疫时差混乱。", sideEffect: "会浮现你的死期日期。", ownerId: "N-006", floor: "4" },
  { id: "W-404", name: "管道屠夫的骨渣", description: "屠夫凝聚体脱落的骨渣。", benefit: "撒水源污染管道，液态诡异3小时内无法凝聚。", sideEffect: "2小时内会生长，需清理。", ownerId: "A-004", floor: "4" },
  { id: "W-405", name: "导盲杖的橡胶头", description: "导盲杖底部的橡胶套。", benefit: "塞门缝减脚步声，敏捷+4约3小时。", sideEffect: "吸附地面残留变重。", ownerId: "N-005", floor: "4" },
  { id: "W-406", name: "狗叫的录音残片", description: "录有狗叫的磁带碎片。", benefit: "混淆听觉诡异，争取撤离。", sideEffect: "猎犬会追踪声源，需迅速撤离。", ownerId: "A-002", floor: "4" },
  { id: "W-407", name: "401 室的旧算盘", description: "张先生用过的算盘。", benefit: "出身+4约3小时。", sideEffect: "算珠会显示不愿见的数字。", ownerId: "N-006", floor: "4" },
  { id: "W-408", name: "屠夫的刀锈", description: "屠夫刀刃上的锈迹。", benefit: "涂门缝，水管诡异无法从该门凝聚。", sideEffect: "24小时后门无法打开。", ownerId: "A-004", floor: "4" },
  // === 5 楼 6 件 ===
  { id: "W-501", name: "画室的褪色颜料", description: "画家用剩的颜料管。", benefit: "改变外观2小时，迷惑视觉诡异。", sideEffect: "会显现画家脸，凝视会吸引她。", ownerId: "N-007", floor: "5" },
  { id: "W-502", name: "器官拟态墙的眼睑", description: "拟态墙剥落的肉膜。", benefit: "拟态为墙2小时，逃避视觉追踪。", sideEffect: "2小时内会与皮肤融合。", ownerId: "A-005", floor: "5" },
  { id: "W-503", name: "未完成的自画像碎片", description: "画家画布上撕下的碎片。", benefit: "魅力+5约3小时，画家好感+15。", sideEffect: "碎片上的眼睛会转向你。", ownerId: "N-007", floor: "5" },
  { id: "W-504", name: "墙眼的分泌物", description: "拟态墙眼睛分泌的透明液。", benefit: "涂镜面遮蔽镜像诡异2小时。", sideEffect: "腐蚀镜面，用后可能碎裂。", ownerId: "A-005", floor: "5" },
  { id: "W-505", name: "调色盘上的混色", description: "调色盘上的混合颜料。", benefit: "改面容2小时，混淆面容识别诡异。", sideEffect: "洗掉后面容短暂模糊。", ownerId: "N-007", floor: "5" },
  { id: "W-506", name: "拟态墙的血管丝", description: "墙内抽出的细小血管。", benefit: "点燃驱散5米内污染2小时，灼伤低阶诡异。", sideEffect: "燃烧惨叫吸引其他诡异。", ownerId: "A-005", floor: "5" },
  // === 6 楼 6 件 ===
  { id: "W-601", name: "双胞胎的共用手帕", description: "两人共用过的旧手帕。", benefit: "选择机制诡异无法选定你2次。", sideEffect: "会分裂成两半，各映半张脸。", ownerId: "N-009", floor: "6" },
  { id: "W-602", name: "倒行者的脚印拓片", description: "楼梯上拓下的倒行脚印。", benefit: "倒转方向感2小时，规避方向混乱诡异。", sideEffect: "取下后短暂分不清上下左右。", ownerId: "A-006", floor: "6" },
  { id: "W-603", name: "失眠者的眼罩", description: "失眠症患者用过的眼罩。", benefit: "屏蔽视觉污染3小时，理智消耗减半。", sideEffect: "摘下后短暂看到墙吞咽幻象。", ownerId: "N-016", floor: "6" },
  { id: "W-604", name: "镜像维度的碎片", description: "倒行者身上剥离的镜面碎片。", benefit: "见镜像诡异真实倒影2小时，可造成伤害。", sideEffect: "倒影会试图与你交换位置。", ownerId: "A-006", floor: "6" },
  { id: "W-605", name: "共鸣水晶的碎屑", description: "双胞胎水晶上掉落的碎屑。", benefit: "预知双胞胎位置2小时。", sideEffect: "听见两人心声，可能混淆自我。", ownerId: "N-009", floor: "6" },
  { id: "W-606", name: "失眠者手记的残页", description: "手记上撕下的字迹。", benefit: "保持清醒3小时，免疫睡眠攻击。", sideEffect: "字迹变你的笔迹，写满你的秘密。", ownerId: "N-016", floor: "6" },
  // === 7 楼 10 件（最强）===
  { id: "W-701", name: "夜读老人的书页", description: "消化日志脱落的泛黄书页。", benefit: "获知1名已消化住户死因，理智+5。", sideEffect: "会显现你名字，完成则被记录。", ownerId: "N-011", floor: "7" },
  { id: "W-702", name: "厨师的刀柄缠布", description: "屠夫菜刀柄上的缠布。", benefit: "敏捷+5约2.5小时。", sideEffect: "2.5小时后吸满血污难解。", ownerId: "N-012", floor: "7" },
  { id: "W-703", name: "13 楼门扉的灰尘", description: "门缝中扫出的尘埃。", benefit: "标记13楼入口1.5小时，避免误入。", sideEffect: "灰尘聚拢成脚印指向你。", ownerId: "A-007", floor: "7" },
  { id: "W-704", name: "钢琴师的无声琴键", description: "亡灵钢琴上取下的琴键。", benefit: "理智+8约2小时。", sideEffect: "旋律在脑中循环24小时。", ownerId: "N-013", floor: "7" },
  { id: "W-705", name: "调查员的暗码表", description: "前调查员用的密码对照表。", benefit: "破译1次加密信息，出身+8约3小时。", sideEffect: "部分记忆被加密24小时。", ownerId: "N-019", floor: "7" },
  { id: "W-706", name: "门扉内的呼唤残响", description: "13楼门内传出的声音残片。", benefit: "吸引门扉注意，为他人争取撤离。", sideEffect: "听久会被门扉标记。", ownerId: "A-007", floor: "7" },
  { id: "W-707", name: "消化日志的目录页", description: "记录消化进度的目录。", benefit: "获知当前消化阶段，出身+5约2.5小时。", sideEffect: "目录会新增一条是你。", ownerId: "N-011", floor: "7" },
  { id: "W-708", name: "管道屠夫的恐惧结晶", description: "厨师与屠夫对抗时凝结的结晶。", benefit: "驱散8米内水源凝聚诡异2小时并伤害。", sideEffect: "屠夫记住气息，下次更狂暴。", ownerId: "N-012", floor: "7" },
  { id: "W-709", name: "前调查员的录音带", description: "记录调查结论的磁带。", benefit: "获知1条公寓核心情报。", sideEffect: "内容与所知矛盾，引发认知混乱。", ownerId: "N-019", floor: "7" },
  { id: "W-710", name: "门扉封印的裂痕", description: "13楼门扉上剥离的封印碎片。", benefit: "欺骗门扉2小时，不触发必杀。", sideEffect: "裂痕扩散，门扉执念+1。", ownerId: "A-007", floor: "7" },
  // === B2 层 4 件（最强层）===
  { id: "W-B201", name: "守门人的残影碎片", description: "深渊守门人脱落的残影。", benefit: "守门人威压，诡异2小时内不主动攻击。", sideEffect: "2小时内会与影子融合，需丢弃。", ownerId: "A-008", floor: "B2" },
  { id: "W-B202", name: "出口通道的锈迹", description: "B2出口门上的锈迹。", benefit: "腐蚀两扇门锁，强行打开。", sideEffect: "锈迹蔓延到下一个触碰的金属。", ownerId: "A-008", floor: "B2" },
  { id: "W-B203", name: "住户残影的聚合体", description: "守门人身上住户残影的聚合。", benefit: "获得随机已消化住户记忆，理智+10。", sideEffect: "失去自我认知2小时。", ownerId: "A-008", floor: "B2" },
  { id: "W-B204", name: "守门人面容的碎片", description: "守门人轮换面容上剥落的碎片。", benefit: "幻化守门人面容2小时，震慑诡异。", sideEffect: "面容会凝视你直至入睡。", ownerId: "A-008", floor: "B2" },
];
