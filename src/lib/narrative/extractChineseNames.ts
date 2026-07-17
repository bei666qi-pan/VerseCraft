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

/**
 * Returns whether an unregistered candidate is sufficiently name-shaped to
 * justify replacing an otherwise valid turn.  The extractor deliberately has
 * high recall (it is also used for audit), but Chinese descriptive prose makes
 * that unsuitable as a destructive final-output gate: "陈旧的…" and "老旧…"
 * both begin with valid surname-like prefixes.
 *
 * A final gate therefore requires a person-like predicate immediately after
 * the token.  Lower-confidence matches remain available to telemetry and the
 * post-generation validator, without discarding the player's whole turn.
 */
export function isHighConfidenceUnregisteredPersonName(entry: ExtractedName): boolean {
  if (!entry.candidate || entry.registered || entry.token.length < 2) return false;

  const after = entry.contextAfter;
  const before = entry.contextBefore;
  const localContext = `${before}${entry.token}${after}`;
  // Labels, signatures and quoted object markings are explicit naming acts,
  // e.g. `胶布写着「7F-阿珍」`. They are high-confidence even when no verb
  // follows the token.
  if (/(?:写着|署名|签名|名叫|叫作|叫)[^。！？]{0,4}[「“\"]?$/.test(before)) return true;

  // `一张钉在铁丝网里的表格` can yield the surname-shaped sliding window
  // `张钉`. Here 张 is a measure word and 钉 is the following verb, not a
  // newly introduced character. Keep this narrow so genuine names such as
  // `张三走来` are still rejected by the final guard.
  if (entry.token.startsWith("张") && /[一二两三四五六七八九十几数]$/.test(before) && /^在/.test(after)) return false;

  // Sliding windows can start inside a stopword: `方向走过来` first skips
  // `方向`, then sees surname-prefixed `向走` and mistakes it for a person.
  // Treat navigation compounds as one semantic unit before applying the
  // surname+movement heuristic.
  if (/(?:方向|前方|后方|上方|下方|入口|出口)(?:走|来|去|看|望|传|伸|移|靠)/.test(localContext)) return false;
  if (/(?:然后|随后|接着|转身)?向(?:走廊|楼梯|门口|出口|入口|前方|后方|墙角|阴影)/.test(localContext)) return false;

  // Colloquial name prefixes become person references when used possessively
  // or as a destination (`阿珍的东西` / `从小李那儿`). Restrict this to
  // 老/阿/小 to avoid treating descriptive prose such as `陈旧的木门` as a name.
  if (/^[老阿小]/.test(entry.token) && /^(?:的|那儿|那里|家|房)/.test(after)) return true;
  // Possessive / attributive continuations are overwhelmingly prose such as
  // "陈旧的木门" rather than a person reference.
  if (/^[的地得]/.test(after)) return false;

  // Dialogue, movement, gaze and common subject predicates.  This intentionally
  // accepts "陈昆从楼梯走来" and "赵四海笑着说", while avoiding a destructive
  // decision for a bare surname-shaped fragment.
  return /^(?:说|问|答|道|喊|叫|回|笑|哭|走|来|去|站|坐|看|望|抬|低|抖|伸|抬手|转|朝|对|从|在|把|将|递|推|敲|拍|盯|跟|向|用|拿)/.test(after);
}

/** Replaces only high-confidence, unregistered names without discarding the turn. */
export function redactHighConfidenceUnregisteredPersonNames(
  narrative: string,
  entries: readonly ExtractedName[],
): string {
  const spans = entries
    .filter(isHighConfidenceUnregisteredPersonName)
    .map((entry) => entry.span)
    .sort((a, b) => b[0] - a[0]);

  let redacted = narrative;
  for (const [start, end] of spans) {
    redacted = `${redacted.slice(0, start)}陌生人${redacted.slice(end)}`;
  }
  return redacted
    .replace(/([他她])叫[「“\"]?陌生人[」”\"]?/g, "$1的名字还没有得到确认")
    .replace(/(?:画着|写着)陌生人问号/g, "画着一个问号")
    .replace(/惨陌生人/g, "惨白")
    .replace(/每陌生人/g, "每个人");
}

const CJK_RE = /[一-鿿]/;

function isCjkChar(ch: string): boolean {
  return CJK_RE.test(ch);
}

/**
 * 判断 [start, end) 子串是否仅含 CJK 字符且不含标点。
 */
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
