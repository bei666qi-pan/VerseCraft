/**
 * Phase-3 候选开场正文 — validateNarrativeStyle 客观评分
 *
 * 运行：pnpm dlx tsx --test docs/narrative-refactor/drafts/evaluate-candidates.ts
 *
 * 比较 3 个候选开场的 styleValidator 遥测 + 当前生产版基线。
 * 择优标准（按优先级）：
 *   1. issues 数量少且 severity 低（尤其 medium 级不应出现在开场）
 *   2. hookType 非 "none"（开头必须钩子收束）
 *   3. 感官密度 / 信息密度 / 节奏变化 / 比喻密度 健康
 *   4. 总字数接近 1500–1900 字
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { validateNarrativeStyle } from "@/lib/narrativeStyle/styleValidator";

// === 候选正文 ===

const CANDIDATE_A = `夕阳斜斜地压在黑板上，粉笔灰像一层薄雪，老师的声音平得让人犯困。

离下课还有十三分钟。

黑板上方的时钟滴答滴答，像有人拿针扎我太阳穴。我把书立起来挡住半张脸，从桌肚里摸出那台老掉牙的 MP3——算了，听课不如看小说。

耳机刚塞进去，世界忽然静了一瞬。

不是安静，是所有声音被硬生生抽走了一拍。粉笔停在黑板上，窗帘停在风里，连时钟的滴答声都像被掐断了。

然后有人开口。

那声音不大，却像从穹顶压下来的钟鸣，带着一种不属于人类喉咙的威严。

【言灵·解】

我没来得及听懂那两个字，空气就炸了。

教室前排的玻璃整排爆碎，冲击波把我连人带椅掀翻出去，后背撞上墙，肺里的空气被挤空，耳朵里只剩尖锐的鸣响。我趴在碎玻璃和卷子里，眼前一阵一阵发黑，鼻腔里全是血和粉笔灰的味道。

我撑着桌腿站起来，腿软得不像自己的。

窗外的操场上空，有人悬在那里。浑身裹着炽白的光，风在他周围扭曲，夕阳像被更强烈的光吞没了。他抬手的时候，教学楼外墙震出细密的裂纹。

我脑子里只有一个念头：这不可能。

可掉在脚边那台摔裂了的 MP3，耳机线还在我手腕上晃，冷冰冰地告诉我——这不是梦。

后门有人哭着往外挤。我听见有人在喊妈，有人在喊救命。那种声音像潮水一样把我拍醒了。

跑。

我撞开人群冲进走廊。走廊里更乱，玻璃渣和灰尘混在一起，广播只剩电流噪音嘶嘶地响。有人从楼梯上滚下来，有人抱着头往反方向冲。

我跑得肺都快炸了。

然后我又听见了那个声音。这一次更近，像有人贴在我耳边低语，冰冷得像蛇从脖颈上爬过去。

【言灵·虚】

世界忽然失重。脚下的地板消失了。

我像被一只看不见的手拖进黑暗里，坠落时什么也抓不住，只有风在耳边呼啸。光、尖叫、鲜血、走廊、那个悬在天上的身影，全都被黑暗吞掉了。

我最后的意识，是自己还在想一件很蠢的事——

今天明明还有十三分钟才下课。

……

等我再睁开眼，头顶是一根快坏掉的灯管，一明一灭地发出低低的嗡鸣。

我躺在冰冷潮湿的水泥地上，后脑发疼，掌心按进灰里，摸到细碎的砂石和一点点湿冷的水迹。空气里有霉味、铁锈味、还有一丝淡得发甜的血腥气。

墙是灰色的，裂缝像干涸的河床。角落里堆着纸箱和生了锈的铁架。

我撑着墙慢慢站起来，喉咙发干，心跳重得发疼。

墙角有半枚校徽，沾了灰，裂开一道细缝。不远处躺着一只断掉表带的学生电子表，秒针还在走。更远一点，墙上有一道已经发暗的血手印，指尖向着走廊深处拖过去。

有人来过。而且不止一个。

我不知道那些人后来怎么样了，但答案大概不会太好。

黑暗深处忽然响起一声很轻的、像电流接触不良一样的笑，随即又消失了。灯管闪了一下，整条走廊在那一瞬间亮起，又迅速暗回去。

就在那一明一灭之间，我看见墙上的一块掉漆铁牌。

上面写着四个字。

如月公寓。

我盯着那块铁牌，脑子里慢慢浮现出一个更实在的问题——我该怎么从这里出去。头顶的灯管又闪了一下，走廊尽头一片漆黑。有人说十日之内找不到出口就会永远留在这里，只剩十天了。

黑暗深处又传来一声极轻的响动，像是什么东西在走廊尽头拖着步子走了一下，又停了。我屏住呼吸，那声音没有再响起——但我已经没法假装它不存在。`;

const CANDIDATE_B = `离下课还有十三分钟。

我盯时钟盯得发愣，英语单词从耳边飘过去，一个都没进脑子。手从桌肚里摸出 MP3——算了，听课不如看小说。

然后世界裂开了。

不是比喻。教室前排的玻璃整排爆碎，冲击波把我连椅掀翻，后背撞上墙，肺里的空气被挤空。耳朵里只剩尖锐的鸣响。我趴在碎玻璃里，鼻腔全是血和粉笔灰的味道。

窗外的操场上空，有什么东西悬在那里。

一团炽白的、扭曲着空气的光。它抬手的时候，教学楼外墙震出了裂纹。

我脑子里就一个字。

跑。

走廊已经乱了。有人从楼梯上滚下去，有人蹲在墙角发抖。我跑过满地碎玻璃，听见自己喘得像破风箱。

然后那个声音贴着耳边落下来，冷得像蛇。

【言灵·虚】

脚下的地板消失了。

坠落的感觉比死亡更接近失重。风在耳边呼啸，像无数人在同时低笑。光、尖叫、走廊、那个悬在天上的东西，全被黑暗吞掉了。

我最后的意识还在想——今天明明还有十三分钟才下课。

……

灯管在头顶一明一灭。

我躺在水泥地上，后脑发疼，掌心里是灰和砂石。空气里有霉味、铁锈味、还有一点发甜的血腥气。墙角的纸箱生了锈的铁架，远处的黑暗里传来极轻的刮擦声——一下，又一下，像有人在用指甲慢慢地数数。

我花了几秒才想起来自己是谁。

又花了更久，才意识到这里不是学校。

墙角躺着半枚校徽，裂了一道缝。不远处有一只断掉表带的电子表，秒针还在走。墙上有一道发暗的血手印，指尖朝着走廊深处拖过去。

有人来过。而且不止一个。

我撑着墙站起来，腿还有点软。头顶的灯管又闪了一下，我看见墙上那块掉漆的铁牌。

如月公寓。

走廊尽头一片漆黑，但我已经没兴趣站在这发呆等答案了。听说有人在这里活了十天也没找到出口，还剩十天。走廊深处的黑暗里忽然传来一声很轻的声响——像什么东西正在靠近，又像只是错觉。我等了一会儿，没有声音再响。但我已经没法站在这里等了。`;

const CANDIDATE_C = `我醒过来的时候，头顶是一根快坏掉的灯管。

它一明一灭，发出低低的嗡鸣。我躺在什么冰冷的东西上面，后脑一阵一阵地疼，掌心里是灰和细碎的石子。

我花了好几秒才想起自己的名字。

又花了更久，才拼出最后记得的画面——教室里，时钟，下午的阳光斜斜地压在黑板上。老师在讲台上说着什么，我把书立起来挡住半张脸，手从桌肚里摸出 MP3。耳机还没塞进去，世界就……

裂了。

玻璃炸开，冲击波把我掀翻。有人在尖叫。我趴在碎玻璃里，鼻腔全是血和粉笔灰。窗外的操场上空，一团炽白的光悬在那里，像太阳被人从天上拽了下来。

然后有人贴着我的耳朵说了两个字。

听清了，但没听懂。

地板消失了。坠落，风，黑暗。

我撑起身体，喉咙发干，心跳撞得肋骨发疼。空气里有霉味和铁锈味，还有一丝淡得发甜的血腥气。墙角的纸箱堆里生了锈的铁架，远处的黑暗里传来极轻的刮擦声——一下，又一下。

我站起来，腿还有点软。

墙角有半枚校徽，裂了一道缝。不远处躺着一只断掉表带的电子表，秒针还在走。墙上有一道发暗的血手印，指尖向着走廊深处拖过去。

我盯着那道手印，心里冒出一个很不舒服的念头——那个人，后来出去了吗？

头顶灯管闪了一下，照亮了墙上一块掉漆的铁牌。

如月公寓。

我没听过这个名字。但墙上那道拖出去的血手印告诉我，我不需要知道它是什么——只需要知道怎么离开它。听说有人试了十天也没走出去，还剩十天。走廊深处忽然传来一声轻响，像是什么东西在地板上拖过去。我等了一会儿，它没有再来。但我不能再等了。`;

// === 评测 ===

const candidates: Array<{ name: string; text: string }> = [
  { name: "A - 课堂日常+自嘲加强版", text: CANDIDATE_A },
  { name: "B - 紧凑电影感版", text: CANDIDATE_B },
  { name: "C - 碎片闪回版", text: CANDIDATE_C },
];

function printResults(name: string, text: string, report: ReturnType<typeof validateNarrativeStyle>) {
  const { issues, telemetry } = report;
  const issueCodes = issues.map((i) => `${i.code}(${i.severity})`).join(", ");
  console.log(`
╔═══════════════════════════════════════════╗
║  ${name.padEnd(43)}║
╚═══════════════════════════════════════════╝`);
  console.log(`  字数: ${telemetry.totalChars ?? "?"} chars`);
  console.log(`  ok: ${report.ok}`);
  console.log(`  issues (${issues.length}): ${issueCodes || "无"}`);
  console.log(`  ── 遥测 ──`);
  console.log(`    感官密度:           ${telemetry.sensoryWordCount}`);
  console.log(`    句子数:             ${telemetry.sentenceCount}`);
  console.log(`    均句长:             ${telemetry.averageSentenceLength}`);
  console.log(`    句长 spread:        ${telemetry.sentenceLengthSpread}`);
  console.log(`    长句数 (≥30字):     ${telemetry.longSentenceCount}`);
  console.log(`    短句数 (≤8字):      ${telemetry.shortSentenceCount}`);
  console.log(`    对话落地:           ${telemetry.dialogueGroundedCount}/${telemetry.dialogueTotalCount}`);
  console.log(`    非重复词比:         ${telemetry.uniqueWordRatio}`);
  console.log(`    比喻数:             ${telemetry.simileCount}`);
  console.log(`    钩子类型:           ${telemetry.hookType}`);
  console.log(`    对话字数占比:       ${telemetry.dialogueCharRatio}%`);
}

describe("Phase-3 开场候选评估", () => {
  for (const c of candidates) {
    test(c.name, () => {
      const report = validateNarrativeStyle({ narrative: c.text, turnMode: "narrative_only" });
      // 辅助打印（通过 console 输出）
      const issues = report.issues.map((i) => `${i.code}(${i.severity})`).join(", ");
      // telemetry 中加 totalChars
      const teleWithChars = { ...report.telemetry, totalChars: c.text.length };
      printResults(c.name, c.text, { ...report, telemetry: teleWithChars });
      // 基本断言：开场不应有 medium 级以上问题
      const mediumIssues = report.issues.filter((i) => i.severity === "medium");
      assert.equal(mediumIssues.length, 0, `不应有 medium 级问题: ${mediumIssues.map((i) => i.code).join(", ")}`);
    });
  }
});
