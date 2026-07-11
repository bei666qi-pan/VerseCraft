import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { validateNarrativeStyle } from "@/lib/narrativeStyle/styleValidator";

const TEXT = `夕阳斜斜地压在黑板上，粉笔灰薄薄洒了一层。老师的声音在教室里来回反弹，平得让人犯困。

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

describe("Fixed opening v3 — validateNarrativeStyle check", () => {
  test("全段 styleValidator 遥测", () => {
    const report = validateNarrativeStyle({ narrative: TEXT, turnMode: "narrative_only" });
    const mediumIssues = report.issues.filter((i) => i.severity === "medium");
    const highIssues = report.issues.filter((i) => i.severity === "high");
    console.log(`字数: ${TEXT.length}`);
    console.log(`ok: ${report.ok}`);
    console.log(`issues: ${report.issues.map((i) => `${i.code}(${i.severity})`).join(", ") || "无"}`);
    console.log(`hookType: ${report.telemetry.hookType}`);
    console.log(`simileCount: ${report.telemetry.simileCount}`);
    console.log(`sensoryHits: ${report.telemetry.sensoryWordCount}`);
    console.log(`spread: ${report.telemetry.sentenceLengthSpread}`);
    console.log(`longSentences: ${report.telemetry.longSentenceCount}`);
    console.log(`shortSentences: ${report.telemetry.shortSentenceCount}`);
    console.log(`uniqueRatio: ${report.telemetry.uniqueWordRatio}`);
    assert.equal(mediumIssues.length, 0, `medium issues: ${mediumIssues.map((i) => i.code).join(", ")}`);
    assert.equal(highIssues.length, 0, `high issues: ${highIssues.map((i) => i.code).join(", ")}`);
  });
});
