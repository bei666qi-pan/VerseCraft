/** 固定开局叙事：由前端直接渲染，不经大模型流式输出 */
export const FIXED_OPENING_NARRATIVE =
  "一股庞大的知识粗暴地灌进了我的脑子，像有人拎着铁锤敲击颅骨——疼痛顺着脊椎一路炸开，我在冰冷的地面上大口喘气，骨髓在颤。\n\n眼前是熟悉又陌生的灰色石墙，裂缝里渗出暗色的水渍；头顶昏黄灯管时明时暗，嗡嗡声压在耳边。空气里混杂着潮湿霉味、金属锈味，还有一丝若有若无的血腥。\n\n我勉强抬起头，意识到这里不是普通的地下室，而是名为「如月公寓」的某个角落——一栋被改造成消化器官的建筑，七层之上盘踞着无法徒手杀死的诡异，而我只是在地下一层的安全阴影里苟延残喘。我把呼吸放慢，听见黑暗里传来极轻的刮擦声，像在数数。";

/**
 * 开局系统局：触发首回合 DM JSON（时间/地点/BGM 等）；叙事与首屏四选项均由前端固定/随机，**勿依赖本请求的 options**。
 * 必须与 play 页中 `openingOptionsOnlyRound` 判定字符串完全一致。
 */
export const OPENING_SYSTEM_PROMPT =
  "【开局·会话初始化】客户端已向玩家展示固定开场叙事（约三百字）与本地随机四条行动选项，你禁止复述苏醒、环境描写或如月公寓设定。请严格以 JSON 格式输出：narrative 仅填单个全角句号「。」作为占位；options 填空数组 []（客户端会忽略你输出的 options）。其余字段按常规模板填合理默认值（is_action_legal:true，sanity_damage:0，is_death:false，consumes_time:true，consumed_items:[]，player_location:\"B1_SafeZone\"，bgm_track:\"bgm_1_calm\" 等）。请严格以 JSON 格式输出。";

/** 模型缺省选项时的兜底（非首条助手回合合并用） */
export const DEFAULT_FOUR_ACTION_OPTIONS: readonly string[] = [
  "查看周围环境",
  "检查背包与随身物品",
  "尝试与附近原住民搭话",
  "谨慎前往下一处房间",
] as const;
