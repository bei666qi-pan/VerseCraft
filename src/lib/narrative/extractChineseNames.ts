/**
 * extractChineseNames — 从 narrative 文本中抽取可能的人名 token
 *
 * v4 全链路人名白名单基础。原作者意图：
 * 1. 贪心 longest-first 匹配 NPCS.name + NPC_ALIASES 全集
 * 2. 对未匹配段做 1-4 字 CJK 滑动窗口
 * 3. 过滤 NAME_STOPWORDS
 * 4. 单字"叶""枫"从 SINGLE_CHAR_REGISTRY_TOKENS 比对
 *    + 上下文场景词判别
 * 5. 结果按 span 排序，标注 candidate 标志
 *
 * 不依赖任何 LLM，纯字符串操作；运行在 route.ts final guard 之前。
 */

import {
  NAME_STOPWORDS,
  SINGLE_CHAR_REGISTRY_TOKENS,
  SINGLE_CHAR_SCENE_CONTEXT,
} from "./nameStopwords";

export interface ExtractedName {
  /** 原始 token */
  readonly token: string;
  /** narrative 中的 [start, end) 偏移 */
  readonly span: readonly [number, number];
  /** 是否命中 alias（如"老王"）或真名（如"陈婆婆"） */
  readonly isAlias: boolean;
  /** 前 6 字上下文 */
  readonly contextBefore: string;
  /** 后 6 字上下文 */
  readonly contextAfter: string;
  /** 是否"看起来像"未注册人名 */
  readonly candidate: boolean;
  /** 是否已注册（命中 NPCS.name 或 alias） */
  readonly registered: boolean;
}

export interface ExtractChineseNamesOptions {
  /** 已注册的真名集合（含 alias） */
  readonly registeredNames: ReadonlySet<string>;
  /** alias 子集（用于 isAlias 标记） */
  readonly aliases: ReadonlySet<string>;
}

const CJK_RE = /[一-鿿]/;

function isCjkChar(ch: string): boolean {
  return CJK_RE.test(ch);
}

/**
 * 判断 [start, end) 子串是否仅含 CJK 字符且不含标点。
 */
function isCjkRun(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    const ch = text.charAt(i);
    if (!isCjkChar(ch)) return false;
  }
  return true;
}

function sliceContext(text: string, span: readonly [number, number]): {
  before: string;
  after: string;
} {
  const [s, e] = span;
  return {
    before: text.slice(Math.max(0, s - 6), s),
    after: text.slice(e, Math.min(text.length, e + 6)),
  };
}

function containsAny(haystack: string, needles: ReadonlySet<string>): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

export function extractChineseNames(
  narrative: string,
  options: ExtractChineseNamesOptions,
): ExtractedName[] {
  if (!narrative) return [];
  const text = narrative;
  const { registeredNames, aliases } = options;
  const out: ExtractedName[] = [];
  const occupied = new Array<boolean>(text.length).fill(false);

  // 阶段 1：贪心 longest-first 匹配已注册的真名 + alias
  const allRegistered = Array.from(registeredNames).sort(
    (a, b) => b.length - a.length,
  );
  for (const name of allRegistered) {
    if (name.length === 0) continue;
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(name, from);
      if (idx < 0) break;
      const end = idx + name.length;
      if (!occupied.slice(idx, end).some(Boolean)) {
        // 标记占用
        for (let i = idx; i < end; i += 1) occupied[i] = true;
        const ctx = sliceContext(text, [idx, end]);
        out.push({
          token: name,
          span: [idx, end],
          isAlias: aliases.has(name),
          contextBefore: ctx.before,
          contextAfter: ctx.after,
          candidate: false,
          registered: true,
        });
        from = end;
      } else {
        from = idx + 1;
      }
    }
  }

  // 阶段 2：对未匹配段做 1-4 字 CJK 滑动窗口
  // 收集所有未占用的 CJK run
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < text.length) {
    if (!isCjkChar(text.charAt(i)) || occupied[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (
      j < text.length &&
      isCjkChar(text.charAt(j)) &&
      !occupied[j]
    ) {
      j += 1;
    }
    if (j > i) runs.push([i, j]);
    i = j;
  }

  // 阶段 2：寻找"看起来像人名"的 2-3 字 token。
  // 关键约束：必须落在强名物共现上下文中，否则跳过（避免"你贴着墙""远处传来"误报）。
  // 强上下文 = 紧邻"对…说"/"的…说"/"走过来"/"走向"/"拍了拍"/"点了点头"/"微笑"等
  //   名物主语 / 动作主语 标志。
  // 这里我们用更简单更稳的"姓氏式前缀"启发式：
  //   2-3 字 token 必须以下列前缀开头才视为候选：
  //     老/阿/小/大/老/陈/林/张/王/李/赵/刘/杨/黄/周/吴/徐/孙/马/朱/胡/郭/何/高/罗/郑/梁/谢/宋/唐/许/韩/冯/邓/曹/彭/曾/肖/田/董/袁/潘/于/蒋/蔡/余/杜/叶/程/苏/魏/吕/丁/任/沈/姚/卢/姜/崔/钟/谭/陆/汪/范/金/石/廖/贾/夏/韦/付/方/白/邹/孟/熊/秦/邱/江/尹/薛/闫/段/雷/侯/龙/史/陶/黎/贺/顾/毛/郝/龚/邵/万/钱/严/覃/武/戴/莫/孔/向/汤
  // 这些覆盖了汉语最常见 100+ 姓氏 + 老/阿/小 等口语前缀。
  const NAME_PREFIX_RE = /^[老阿小大陈林张王李赵刘杨黄周吴徐孙马朱胡郭何高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤]/;

  const VERB_TAIL_RE = /[走来说到笑看听点头摇头抬伸转缩皱眯睁闭盯望敲碰推拉按踢踩拾捡放撕扯握握紧松开坐下站起转身回头迈步跨步伸手和与从往外里上下出入并顾四周在八方]/;
  for (const [rs, re] of runs) {
    const runText = text.slice(rs, re);
    let k = 0;
    while (k + 2 <= runText.length) {
      // 第一步：尝试 w=3（更长优先）。仅当 3 字 token 第三字不是动词后缀/虚词时，
      //   才视为 3 字真名候选（如"赵四海"）。否则视为 2 字真名 + 后续虚词。
      let consumed = 0;
      if (k + 3 <= runText.length) {
        const c3 = runText.slice(k, k + 3);
        const c3ThirdIsVerbTail = VERB_TAIL_RE.test(c3.charAt(2));
        const c3FirstTwoIsStopword = NAME_STOPWORDS.has(c3.slice(0, 2));
        if (
          !registeredNames.has(c3) &&
          !NAME_STOPWORDS.has(c3) &&
          NAME_PREFIX_RE.test(c3) &&
          !c3ThirdIsVerbTail &&
          !c3FirstTwoIsStopword
        ) {
          const span3: [number, number] = [rs + k, rs + k + 3];
          const ctx3 = sliceContext(text, span3);
          out.push({
            token: c3,
            span: span3,
            isAlias: false,
            contextBefore: ctx3.before,
            contextAfter: ctx3.after,
            candidate: true,
            registered: false,
          });
          k += 3;
          consumed = 1;
        }
      }
      if (consumed === 1) continue;

      const c2 = runText.slice(k, k + 2);
      // 若 c2 起点的左侧 1 字 + c2 第 1 字 = stopword（如"环顾"配"顾四"），跳过
      if (k >= 1 && k + 2 <= runText.length && NAME_STOPWORDS.has(runText.slice(k - 1, k + 1))) {
        k += 1;
        continue;
      }
      if (
        !registeredNames.has(c2) &&
        !NAME_STOPWORDS.has(c2) &&
        NAME_PREFIX_RE.test(c2)
      ) {
        const c3 = runText.slice(k, k + 3);
        const lastCharVerb =
          c3.length === 3 &&
          (NAME_STOPWORDS.has(c3.slice(0, 2)) || VERB_TAIL_RE.test(c3.charAt(2)));
        const span: [number, number] = [rs + k, rs + k + 2];
        const ctx = sliceContext(text, span);
        out.push({
          token: c2,
          span,
          isAlias: false,
          contextBefore: ctx.before,
          contextAfter: ctx.after,
          candidate: true,
          registered: false,
        });
        k += lastCharVerb ? 3 : 2;
        continue;
      }
      k += 1;
    }
  }

  // 按 span 排序
  out.sort((a, b) => a.span[0] - b.span[0]);
  return out;
}