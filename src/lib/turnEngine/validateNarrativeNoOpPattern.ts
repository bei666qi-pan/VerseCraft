/**
 * narrative_no_op_pattern · 后置 validator
 *
 * 抓模型复读 safe_fallback 模板的"我什么也没做"叙事段。
 *
 * 历史 trace (probe3ch-zero-1787238357667) t10/t15/t18 的 narrative 末尾都会
 * 出现"我收住脚步，仍留在地下1层……。刚才的尝试没有把我带进新的房间、走廊或楼层；
 * 我重新确认脚下的位置和来路…" 这类段落。这是模型从 `commitTurn.ts` 公开的
 * `BLOCKED_CONFLICT_SAFE_NARRATIVE_ZH` / `noConfirmedMovement` 等 safe_fallback
 * 文案里学到的句式，AI 用它做"action 被 validator 拦截"的解释。
 *
 * 危害: dm_only_fact_leaked_in_narrative (内部 state 暴露) +
 * narrative_style_bridge (机械腔) + unsupported_new_fact (捏造了"尝试"的
 * 概念). 修法: 检测这种段落并 strip, 设 narrativeOverride.
 */

const NO_OP_FALLBACK_PATTERNS: ReadonlyArray<{ regex: RegExp; reason: string }> = [
  // 模型学"收住动作 / 收住脚步"的句式
  { regex: /我收住(脚步|动作|力道)/g, reason: "model_mimicked_safe_fallback_pause" },
  // 模型学"仍留在原处 / 仍留在地下1层 / 仍留在X走廊"
  { regex: /仍留在(原处|地下\d+层|\d+层|.{1,8}走廊|\S{1,12})/g, reason: "model_claimed_unmoved_with_location" },
  // 模型学"重新确认脚下的位置和来路"
  { regex: /重新确认(脚下|当前位置|位置|来路|脚下位置)/g, reason: "model_meta_position_check" },
  // 模型学"放轻呼吸，准备从可见痕迹/已有物品/已经走过的路线里选择下一步"
  { regex: /放轻呼吸[，,].{0,80}(选择|做出|采取|考虑|决定)下一步/g, reason: "model_safe_fallback_next_step_phrase" },
  // 模型学"可见痕迹、已有物品或已经走过的路线里"
  { regex: /可见痕迹[，,、]?已有物品|从可见痕迹.*选择/g, reason: "model_safe_fallback_options_phrase" },
  // 模型学"刚才的尝试没有把我带进新的房间、走廊或楼层"
  { regex: /刚才的(尝试|动作|决定)没有(把|让|使)?(我|自己)?(带|移|到|进入)/g, reason: "model_safe_fallback_attempt_narrative" },
  // 模型学"我不会把尚未发生的移动当成结果"
  { regex: /(我)?不会把(尚)?未发生(的)?(移动|变化|结果|进展)/g, reason: "model_safe_fallback_anti_claim" },
  // 模型 meta 自我引用 (历史 t16: "我记得自己叫陌生人" — player 实际叫"顾川",
  // 模型搞混自己身份, 报一个不存在的别名)
  { regex: /(我|自己)(?:被叫|叫|是|被称(为)?|名叫|名字是|名为)["']?陌生人["']?/g, reason: "model_self_reference_unknown_alias" },
  { regex: /我记得(自己|我的名字|我)叫["']?陌生人["']?/g, reason: "model_self_reference_unknown_alias_recall" },
  // 模型复读 SAFE_NARRATIVE_VARIANTS_ZH 整段 (历史 t15: "走廊深处的阴影里什么都没有。
  // 你再次确认——目前没有直接的危险。" 跟 commitTurn.ts safe_fallback 第 4 条逐字相同)
  { regex: /走廊(深处|尽头)的阴影里什么都没有/g, reason: "model_repeat_safe_fallback_variant_shadow_empty" },
  { regex: /你(再次|重新)?确认[——\-—]{1,3}(目前|现在)?(没有|不存在)直接的(危险|威胁|异常)/g, reason: "model_repeat_safe_fallback_variant_confirm_safe" },
  { regex: /(没有|不存在)(发现|确认)?明确的(威胁|异常|敌人|危险)/g, reason: "model_repeat_safe_fallback_variant_no_threat" },
  { regex: /走廊灯管闪了一下.*?(嗡鸣|嗡|老旧)/g, reason: "model_repeat_safe_fallback_variant_flicker" },
  { regex: /四周恢复了安静.*?(墙皮|一切如常)/g, reason: "model_repeat_safe_fallback_variant_quiet" },
  { regex: /(你)?的脚步在空荡的楼道里回响/g, reason: "model_repeat_safe_fallback_variant_echo" },
  { regex: /你停下动作.*?(侧耳倾听|水管|电梯|听)/g, reason: "model_repeat_safe_fallback_variant_listen" },
  // 历史 t2/t5: "我停在当前地点的门前...门锁只回了一声沉闷轻响，门缝没有扩大..."
  // 这是 authoredLocationMovementGuard.ts noConfirmedMovement 的延伸, 模型学到了句式
  { regex: /我(停|停住)在(当前地点|当前位置|原地)(的门前|门前)?/g, reason: "model_repeat_location_guard_pause" },
  { regex: /门锁只回了一声沉闷轻响.*?门缝没有扩大/g, reason: "model_repeat_location_guard_lock" },
  { regex: /沿着门框[、，,]锁舌和墙边逐一检查/g, reason: "model_repeat_location_guard_inspect" },
  { regex: /我不会把(尚)?未发生(的)?(移动|变化|结果|进展)当成结果/g, reason: "model_repeat_location_guard_anti_claim" },
  { regex: /我又退开半步.*?检查两侧/g, reason: "model_repeat_location_guard_recheck" },
  { regex: /(我)?把注意力(重新)?放回(能)?(实际)?核对的细节/g, reason: "model_repeat_location_guard_refocus" },
  // 模型自创的"方陌生人来"语法错误 (历史 t10/t11/t14: "方陌生人来一声金属闷响")
  // — 应是 "方向", 模型把 "方" 当修饰词连 "陌生人" 写出怪词.
  { regex: /方陌生人来/g, reason: "model_grammar_glitch_fang_moshengren" },
  { regex: /配电箱的方陌生人/g, reason: "model_grammar_glitch_dianlihe" },

  // ===== 2026-08-21: dm_only_fact_leaked_in_narrative 第二波 =====
  // 历史 trace (probe3ch-zero-1787272142187) t3/t4/t5/t18: 模型把"当前所在
  // 位置 / 当前状态"当 POV 描述写到 narrative 段尾, 触发了 extractFactKeywords
  // 命中 `地下1层` / `配电箱` / `位置` 等 LOW_SIGNAL_FACT_KEYWORD_PARTS. 12/23
  // (52%) 的 dm_only_fact_leaked 主要来自这类"我现在还在..."句式.
  //
  // 这些不是 fallback mimic 段, 是合法 POV — 但内嵌了不该在 narrative 暴露
  // 的内部 state (location/position). 修法: 命中后整句剥除, 让 narrative 留下
  // 真正的场景描写, 把 meta 描述丢掉.
  //
  // 优先级低于上面 25 条 (它们是 fallback mimic, 直接替换为系统消息);
  // 这三条只剥除命中句, 不替换为 system message.
  { regex: /我(还|仍|正|一直)?(在|站在|待在|处于|位于)(?:地下)?\d+层[^。\s]{0,8}(?:SafeZone|走廊|房间|大厅|广场|塔|门厅|厅|庭)/g, reason: "model_meta_location_leak_floor" },
  // 注: 用 [^。，\s]{1,12} 而不是 [^。\s] — 防止跨逗号贪婪匹配到远处位置词
  // (例: "我站在门前等了十分钟, 麟泽才从楼梯口" — 旧 pattern 会跨过逗号匹配到楼梯,
  //  误伤合法 POV 描写). 1-12 char window 限制在单个 phrase 内.
  // 关键: **强制要求 (正|还|仍|一直) qualifier** — meta-leak 的语义信号是"现在/还
  // 在/仍然/一直" 当前状态, 区别于合法 POV 描述 ("我站在门前等待"). 没 qualifier
  // 的 "我站在 X 前/里" 大多是场景描写, 不该误剥.
  { regex: /我(正|还|仍|一直)(在|站在|待在|处于|位于)[^。，\s]{1,12}(?:前|里|中|旁|上|边|内|走廊|房间|大厅|广场|塔|门厅|厅|庭|通道|楼梯|街|路|巷|楼|层|配电箱|配电间|配电柜|变压器|楼梯口)/g, reason: "model_meta_location_leak_typed" },
  { regex: /我(站在|待在|停在|待在)(原地|原处)/g, reason: "model_meta_state_stay_原地" },
  { regex: /我(没|没有|没怎么|几乎没|并未)?动(过)?(一下|一步)?/g, reason: "model_meta_state_unmoved" },

  // 元描述前缀: 模型把"角色描述/场景状态/判定/旁白"等元标签当 narrative 开头.
  // 这类不是 POI 描述, 是 model 在尝试结构化输出但漏了 schema. 直接剥除前缀.
  { regex: /^(角色描述|场景状态|场景描述|判定|判定结果|叙事|旁白|系统|提示|玩家视角|当前状态|内心独白)[:：]/g, reason: "model_meta_pov_prefix" },
];

// 命中后是否替换为占位 (而非整段 strip).
// 当整段 narrative 都是 mimic (e.g. "走廊深处的阴影里什么都没有..." 整段 safe_fallback
// 或 "走廊深处那只配电箱的方陌生人来..." 整段语法 glitch), strip 后剩余 < 10
// 字符就没意义. 这种情况把 matched 替换成中性占位, 保留上下文骨架.
const REWRITE_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // "方陌生人来" 是模型写错, 不是有意义的代称. 替换成"传来"
  { pattern: /方陌生人来/g, replacement: "传来" },
  { pattern: /配电箱的方陌生人/g, replacement: "配电箱" },
];

export type NarrativeNoOpPattern = {
  matchedPatterns: Array<{ reason: string; snippet: string; index: number; length: number }>;
  rewrittenNarrative: string | null;
  rewritten: boolean;
};

/**
 * 扫 narrative 找 "我什么也没做" 模板段落; 返回命中位置 + 剥离后的 narrative
 * (整段 "我收住脚步...没有变化。" 连续块作为一个 unit 删掉).
 */
export function detectAndStripNoOpPattern(narrative: string): NarrativeNoOpPattern {
  if (!narrative) {
    return { matchedPatterns: [], rewrittenNarrative: null, rewritten: false };
  }
  const matched: NarrativeNoOpPattern["matchedPatterns"] = [];
  for (const { regex, reason } of NO_OP_FALLBACK_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(narrative)) !== null) {
      matched.push({
        reason,
        snippet: m[0],
        index: m.index,
        length: m[0].length,
      });
    }
  }
  if (matched.length === 0) {
    return { matchedPatterns: [], rewrittenNarrative: null, rewritten: false };
  }

  // 找所有命中区域 + 它们的"自然段落"范围. 段落以中文句号/问号/感叹号/换行分界.
  // 把连续段 (sentence boundary 之间没有其他叙事内容) 整段剥离.
  const sentenceBoundary = /[。!?！？\n]/g;
  const boundaries: number[] = [-1];
  let sm: RegExpExecArray | null;
  while ((sm = sentenceBoundary.exec(narrative)) !== null) {
    boundaries.push(sm.index);
  }
  boundaries.push(narrative.length);

  const dropRanges: Array<[number, number]> = [];
  const sortedHits = [...matched].sort((a, b) => a.index - b.index);
  for (const hit of sortedHits) {
    // 找包含 hit.index 的最近 sentence boundary
    let start = 0;
    let end = narrative.length;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lo = boundaries[i];
      const hi = boundaries[i + 1];
      if (lo < hit.index && hit.index <= hi) {
        // sentence starts after lo, ends at hi+1 (含边界字符)
        start = lo + 1;
        end = hi + 1;
        break;
      }
    }
    // 范围向两边扩展到包含相邻的同模式句 (一段连续模板)
    // 简化: 仅合并到不重叠的相邻段
    if (dropRanges.length === 0) {
      dropRanges.push([start, end]);
      continue;
    }
    const last = dropRanges[dropRanges.length - 1];
    if (start <= last[1] + 1) {
      // 重叠或紧邻, 合并
      last[0] = Math.min(last[0], start);
      last[1] = Math.max(last[1], end);
    } else {
      dropRanges.push([start, end]);
    }
  }

  // 从后往前删, 保持 index
  let rewritten = narrative;
  for (let i = dropRanges.length - 1; i >= 0; i--) {
    const [s, e] = dropRanges[i];
    rewritten = rewritten.slice(0, s) + rewritten.slice(e);
  }
  // 清理连续空白 / 段首尾空格
  rewritten = rewritten
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "")
    .trim();

  // 阈值改为 10 字符: 早先 30 太严, 命中段落可能就是 narrative 全部内容
  // (例: t0 "我收住脚步，仍留在地下1层..." 整段都是 fallback mimic,
  //  剥离后只剩 "凉意先到..." 17 字符, 30 阈值会拒绝剥离).
  // 这里 10 是底线: 任何 narrative 至少留 1-2 句, 不至于让 user 看到空 narrative.
  if (rewritten.length >= 10) {
    return {
      matchedPatterns: matched,
      rewrittenNarrative: rewritten,
      rewritten: true,
    };
  }

  // 兜底: 整段 narrative 都命中 (剥离后太短), 用占位替换而非 strip.
  // 历史 t10/t11/t14: "走廊深处那只配电箱的方陌生人来..." 几乎全是 glitch.
  // 历史 t15: "走廊深处的阴影里什么都没有..." 整段 safe_fallback.
  // 替换比 strip 更好: 保留 narrative 骨架, 把不可信字串换成中性占位.
  let placeholderReplaced = narrative;
  let placeholderReplacedCount = 0;
  for (const { pattern, replacement } of REWRITE_REPLACEMENTS) {
    pattern.lastIndex = 0;
    if (pattern.test(placeholderReplaced)) {
      placeholderReplaced = placeholderReplaced.replace(pattern, replacement);
      placeholderReplacedCount += 1;
    }
  }
  if (placeholderReplaced !== narrative && placeholderReplaced.trim().length >= 5) {
    return {
      matchedPatterns: matched,
      rewrittenNarrative: placeholderReplaced,
      rewritten: true,
    };
  }

  // 末道兜底: 整段 narrative 都是 fallback mimic, 占位也救不了.
  // 历史上 t2/t5 (probe3ch-zero-1787245229245): "我停在当前地点的门前...门锁只回了一声沉闷轻响...
  //  沿着门框、锁舌和墙边逐一检查...我留在原处，放轻呼吸...选择下一步" — 整段 ~5 句
  //  全部是 authoredLocationMovementGuard / noConfirmedMovement / safe_fallback variants.
  //  模型没写任何 scene 内容, 只写了 meta 状态报告.
  // 此时不要再保留 narrative (让 user 看到模型胡话), 用诚实 system message 替换.
  return {
    matchedPatterns: matched,
    rewrittenNarrative: "（本回合 narrative 由模型复读 safe_fallback 模板, 已被后置 guard 抑制, 请重发行动）",
    rewritten: true,
  };
}
