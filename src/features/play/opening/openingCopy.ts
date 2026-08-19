import type { GameLanguage } from "@/lib/i18n/language";
import type { WorldId } from "@/lib/worlds/types";

/** 固定开局叙事：由前端直接渲染，不经大模型流式输出 */
export const FIXED_OPENING_NARRATIVE = `夕阳斜斜地压在黑板上，粉笔灰薄薄洒了一层。老师的声音在教室里来回反弹，平得让人犯困。

离下课还有十三分钟。

时钟滴答滴答，针一样扎着我太阳穴。我把书立起来挡住半张脸，手从桌肚里摸出老掉牙的MP3——算了，听课不如看小说。

耳机刚塞进去，世界忽然静了一瞬。

不是安静。是所有声音被硬生生抽走了一拍。粉笔停在黑板上，窗帘停在风里，连时钟的滴答声都断了。

然后有人开口。

那声音不大，却从穹顶最高的地方压下来，带着一种不该属于人类喉咙的威严——钟声、雷鸣、一口生锈了上百年的铜钟被重重敲响。

【言灵·解】

我甚至没来得及听清那两个字。

空气炸开了。教室前排的玻璃整排爆碎，冲击波把我连人带椅掀翻出去，后背撞上墙，肺里的空气被挤空。耳朵里只剩尖锐的鸣响。我趴在碎玻璃和卷子里，眼前一阵一阵发黑，鼻腔里全是血和粉笔灰。前桌那个总在午休偷吃辣条的男生正捂着额头，血从指缝往外淌。

我撑起身体，腿软得不像自己的。

窗外操场上空，有人悬在那里。浑身裹着炽白的光，风在他周围扭曲，夕阳被更强烈的光吞没了。他抬手的时候，教学楼外墙震出细密的裂纹。

这不可能。

可掉在我脚边那台摔裂了的MP3，耳机线还在手腕上晃——冷冰冰地告诉我，这不是梦。

后门有人哭着往外挤。有人在喊妈，有人在喊救命。那种声音一下子把我拍醒了。

跑。

我撞开人群冲进走廊。走廊里更乱，玻璃渣和灰尘混在一起，广播只剩电流噪音嘶嘶地响。有人从楼梯上滚下去，有人蹲在墙角发抖。

我跑得肺都快炸了。

然后那个声音又落下来，这一次更近——像有人贴在我耳边低语，冷冰冰的。

【言灵·虚】

脚下的地板消失了。

我坠入黑暗，坠落时什么也抓不住，风在耳边呼啸。光、尖叫、鲜血、走廊、那个悬在天上的身影，全被黑暗吞掉了。

最后的意识，自己还在想一件很蠢的事——今天明明还有十三分钟才下课。

……

等我再睁开眼，头顶是一根快坏掉的灯管，一明一灭，嗡嗡地响。

我躺在冰冷的水泥地上，后脑发疼。掌心按进灰里，摸到细碎的砂石，一点点湿冷的水迹。空气里有霉味、铁锈味、还有一丝淡得发甜的血腥气。

墙是灰色的，裂缝弯弯曲曲地伸出去。角落里堆着旧纸箱和生了锈的铁架。

我撑着墙站起来，喉咙发干，心跳撞得肋骨发疼。

墙角有半枚校徽，沾了灰、裂了一道缝。不远处躺着一只断掉表带的电子表，秒针还在走。更远一点，墙上有一道发暗的血手印，指尖朝走廊深处拖过去——有人拼了命想逃。

有人来过。不止一个。

我说不上来为什么，但心里很清楚——那些人大概率没能活着离开这里。

我以前在贴吧写过两篇烂尾小说，连评论区嘲讽我的哥们我都记得ID。但现在站在这条又黑又冷的走廊里，我觉得——这次大概不行。

我对着那枚校徽站了一会儿，慢慢把手从墙上放下来。

得先想清楚三件事：这是哪、怎么出去、出去之前怎么活。

头顶灯管又闪了一下，整条走廊在那一瞬间亮起来，又暗回去。就在那一明一灭之间，我看见墙上的一块掉漆铁牌。

上面写着四个字。

如月公寓。

我盯着那块铁牌，脑子里慢慢浮现出一个更实在的问题——我该怎么从这里出去。

有人说十日之内找不到出口就会永远留在这里，只剩十天了。

走廊深处忽然又传来一声轻响。这一次很近，近得我能判断出——那是脚步声。有人，或者什么东西，在走廊尽头拖着步子走了一下，又停了。

我屏住呼吸，那声音没有再响起。

但我站在这条走廊里，心跳重得发疼——背后那道脚步声的回声还没散。`;

export const FIXED_OPENING_NARRATIVE_EN = `Late sunlight lay across the blackboard. A thin veil of chalk dust drifted through the room while the teacher's voice bounced from wall to wall, level enough to make everyone sleepy.

Thirteen minutes until class ended.

The clock ticked against my temples. I propped my book up, slipped an ancient MP3 player from my desk, and decided a bad novel was still better than listening.

The instant I put in an earbud, the world went still.

Not quiet. Everything had been ripped out of time for a single beat. Chalk stopped against the board. Curtains froze in the wind. Even the clock lost its tick.

Then someone spoke.

The voice was not loud, but it came down from the highest point of the ceiling with the weight of a bell, thunder, and a rusted bronze gong struck after a hundred years.

【Word of Power: Release】

I did not even have time to understand it.

The room exploded. Every window at the front of the classroom shattered at once. The shockwave threw me and my chair into the wall, knocked the air from my lungs, and left nothing in my ears but a hard, bright whine.

Outside, a figure hung above the playground, wrapped in white light. Wind twisted around him. When he raised a hand, hairline cracks ran across the school building.

This could not be real.

But the broken MP3 player at my feet and the earbud cord still looped around my wrist told me otherwise.

Someone was crying near the back door. Someone else was shouting for help. That was enough to wake me up.

Run.

I forced my way into the corridor. It was worse there: dust, glass, a broken broadcast system hissing with static, students stumbling down the stairs or crouching against the walls.

Then the voice came again, closer this time, as if it were whispering directly into my ear.

【Word of Power: Void】

The floor disappeared.

I fell into darkness. Light, screams, blood, the corridor, that figure in the sky—everything vanished before I could catch hold of it. My last stupid thought was that class had still had thirteen minutes left.

…

When I opened my eyes again, a failing fluorescent tube buzzed above me.

I was lying on cold concrete. Mold, rust, and a faint sweetness like old blood hung in the air. The walls were gray and split with cracks. Old cardboard boxes and rusted shelves crowded the corners.

Near my hand lay half a school badge, cracked down the middle. Farther away, a broken digital watch still counted seconds. A dark bloody handprint dragged toward the end of the corridor.

Someone had been here. More than one person.

I could not explain why, but I knew most of them had not found a way out.

Years ago I had posted two unfinished stories online. Standing in this black, freezing corridor, I had the unpleasant feeling that this one would not forgive an unfinished ending.

I made myself think of three things: where was I, how did I leave, and how did I stay alive until then?

The light flickered. For one bright second, I saw a peeling metal sign on the wall.

Kisaragi Apartments.

The name made the question feel real: how was I supposed to leave this place?

Someone had said that anyone who failed to find an exit in ten days would remain here forever. That left ten days.

A soft sound came from the far end of the corridor. Close enough to recognize as a footstep. Someone—or something—dragged one foot, then stopped.

I held my breath. The sound did not come again.

But its echo was still behind me, and my heart would not slow down.`;

export const XINGNI_FIXED_OPENING_NARRATIVE = `青石县的雨刚停。

他坐在归雁客栈最靠墙的旧桌旁，掌心压着一只缺口茶盏。窗外车辙积着浑水，挑担的脚夫与佩剑散修擦肩而过，谁也没多看这个脸色苍白的年轻人一眼。

三个月前，他还是炼气六层。如今气海留着一道未愈的裂痕，每次运转灵力，都像有细针沿经脉缓慢刮过。修为跌到炼气二层，储物袋里只剩十二枚灵石，以及一部最寻常的基础吐纳法。

但人还活着，路便没有断。

柜台后的柳三娘拨了拨算盘。邻桌两个散修正低声谈论黑松岭的妖兽委托；更远处，有人提到了百草堂、神工坊，以及七日后在升仙台举行的升仙试。

青石县很小，小到一场雨就能洗净半条街。

可对一个跌落谷底的散修而言，这里已经足够大——大到能藏下灵材、机缘、敌手，以及一条重新向上的路。

他松开茶盏，缓缓吐出一口浊气。

先从眼前这一步开始。`;

export function getFixedOpeningNarrative(language: GameLanguage = "zh-CN", worldId: WorldId = "dark_moon_prologue"): string {
  if (worldId === "xingni_taichu") return XINGNI_FIXED_OPENING_NARRATIVE;
  return language === "en-US" ? FIXED_OPENING_NARRATIVE_EN : FIXED_OPENING_NARRATIVE;
}

/**
 * 开局系统局：触发首回合 DM JSON；固定长文已由前端展示，**首轮 options 必须由本请求产出**（非空四条）。
 * 与 `isOpeningSystemUserMessage` 判定同步；服务端据此注入首轮承接约束。
 *
 * Phase-3 重写：
 * - 固定开场结尾已改为"十日出口"钩子 + "背后有脚步声"的威胁收束
 * - 首轮 beat 目标：承接钩子，给玩家四个"求生方向感"选项（探索/接触人/清点自身/观察环境）
 * - 选项要求对齐 §11：四方向差异化、代价可嗅、允许一条歪点子
 * - 文风对齐 v3：短句断喝、第一人称碎碎念、禁止三连喻
 */
export const OPENING_SYSTEM_PROMPT =
  "【开局·首轮主笔请求】客户端已用固定第一人称长文展示：教室言灵·解→坠入「如月公寓」B1地下附近→灯管明灭→前人血手印→走廊脚步声收束。你是叙事主笔，不是系统初始化程序。玩家是月初被裂口甩进来的学生之一，惊惧未散但比多数人更能压住慌。请严格输出单一 JSON 对象：" +
  "narrative 可仅填全角句号「。」作极简承接，或写 1–3 句极短篇，必须紧接固定文案收束处（头痛、心跳、黑暗里的脚步声、十日出口等可择一二），禁止整段复述教室与言灵过程，禁止另起无关场域，禁止教程清单腔；" +
  "options 必须恰好 4 条非空字符串，每条为第一人称可执行的当下行动，互不相同；四个选项应朝四个方向拉开——探索环境/接触在场的人/清点自身状况/观察风险与出口，允许一条带点小聪明或歪点子的选项；禁止套用任何提前写好的模板或固定列表；禁止一上来跨层宏大目标，禁止『系统刷新』式点名强迫遇见某固定角色；" +
  "其余键按常规模板合理默认：is_action_legal:true，sanity_damage:0，is_death:false，consumes_time:true，consumed_items:[]，player_location:\"B1_SafeZone\"，bgm_track:\"bgm_b1_daily\" 等。" +
  "禁止输出空数组作为 options；禁止省略 options 键。";

export const OPENING_SYSTEM_PROMPT_EN =
  "[Opening · first-turn DM request] The client has already shown a fixed first-person English opening: a classroom collapses into Kisaragi Apartments near B1, a flickering light, an old bloody handprint, and footsteps in a corridor. You are the narrative lead, not a system initializer. The player is a student thrown through the rift at the start of the month. Output exactly one JSON object. " +
  "narrative may be a single period or 1–3 very short English sentences continuing the fixed ending (headache, heartbeat, footsteps in darkness, or the ten-day exit); do not recap the classroom or begin an unrelated scene. " +
  "options must be exactly four non-empty, distinct English first-person actionable strings. Spread them across exploring, approaching someone present, checking personal condition, and observing danger or exits. Do not use a fixed template, force a named character encounter, or start with a grand cross-floor objective. " +
  "Use sensible defaults for remaining fields: is_action_legal:true, sanity_damage:0, is_death:false, consumes_time:true, consumed_items:[], player_location:\"B1_SafeZone\", bgm_track:\"bgm_b1_daily\". Never omit options or return an empty options array.";

export const XINGNI_OPENING_SYSTEM_PROMPT =
  "【星逆·太初·青石县开局首轮】客户端已展示固定第三人称开场：气海受损、修为跌至炼气二层的落魄散修坐在归雁客栈，听见黑松岭委托与升仙试消息。请严格以 JSON 格式输出单一对象。" +
  "narrative 仅作一至三句第三人称贴身承接，不复述开场，不进入柳三娘或其他 NPC 内心；" +
  "options 必须是四条第三人称可执行行动，分别侧重打听公开消息、检查自身资源、观察客栈在场人物、前往相邻登记地点；不得写第一人称，不得编造地点、NPC、功法、物品或通行出口；" +
  "其余键使用合法保守默认：is_action_legal:true，sanity_damage:0，is_death:false，consumes_time:false，consumed_items:[]，player_location:\"QS_GUOYAN_INN\"。不得提交未满足条件的 world_delta。";

export function getOpeningSystemPrompt(language: GameLanguage = "zh-CN", worldId: WorldId = "dark_moon_prologue"): string {
  if (worldId === "xingni_taichu") return XINGNI_OPENING_SYSTEM_PROMPT;
  return language === "en-US" ? OPENING_SYSTEM_PROMPT_EN : OPENING_SYSTEM_PROMPT;
}

/** 与 route / 客户端首轮判定对齐（trim 后全等） */
export function isOpeningSystemUserMessage(userContent: string): boolean {
  const normalized = String(userContent ?? "").trim();
  return normalized === OPENING_SYSTEM_PROMPT.trim() || normalized === OPENING_SYSTEM_PROMPT_EN.trim() || normalized === XINGNI_OPENING_SYSTEM_PROMPT.trim();
}
