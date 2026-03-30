/**
 * 高魅力 NPC 校源面分层揭露阶梯（结构化真源）。
 * surface / fracture 禁止答案型校籍名词；deep_reveal_payload 仅在高档位由 foreshadow packet 受控注入。
 */
import { REVEAL_TIER_RANK, type RevealTierRank } from "./revealTierRank";
import type { MajorNpcId } from "./majorNpcDeepCanon";
import { MAJOR_NPC_IDS } from "./majorNpcDeepCanon";

export type VerificationGate =
  | { kind: "task_title_any"; substrings: readonly string[] }
  | { kind: "location_any"; substrings: readonly string[] }
  | { kind: "world_flag_any"; substrings: readonly string[] }
  | { kind: "hot_threat" };

export type MajorNpcVerificationFragment = {
  text: string;
  /** 至少达到该 reveal 档才可能展示 */
  minRevealRank: RevealTierRank;
  /** 与关系/任务/场景相关的验证门槛（AND）；空=仅受 minRevealRank 约束 */
  gates: readonly VerificationGate[];
};

export type MajorNpcForeshadowCaps = {
  surfaceMax: number;
  fractureMax: number;
  verifyMax: number;
  deepMax: number;
};

export type MajorNpcSchoolRevealLadder = {
  npcId: MajorNpcId;
  /** 设计轴：供文档/调试，不进 packet */
  flavorAxis: string;
  caps: MajorNpcForeshadowCaps;
  /** 写入 profile.surfaceSecrets[1] 的单一异常行（无明示校名/社团职务） */
  profileSurfaceAnomalyLine: string;
  surface_behavior_hints: readonly string[];
  fracture_signals: readonly string[];
  verification_fragments: readonly MajorNpcVerificationFragment[];
  /** 仅 deep+ 由 runtime foreshadow 注入；完整校源确认句（可含专名） */
  deep_reveal_payload: string;
  /** 文案层提醒：何类词绝不可在 surface/fracture 出现 */
  neverLeakBeforeDeep: readonly string[];
};

const G = (x: readonly VerificationGate[]): readonly VerificationGate[] => x;

export const MAJOR_NPC_SCHOOL_REVEAL_LADDERS: Record<MajorNpcId, MajorNpcSchoolRevealLadder> = {
  "N-015": {
    npcId: "N-015",
    flavorAxis: "边界·次序·巡守肌肉记忆·越界校正",
    caps: { surfaceMax: 2, fractureMax: 2, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：他对「先踏哪一块砖、谁先开口」异常执着；有人越界时他会先卡位再说话，像重复过太多次的流程。",
    surface_behavior_hints: [
      "风口里他站得像两层皮之间的缝，外头安静，里头发紧。",
      "雨停后仍下意识抹披肩水痕，仿佛还在户外站岗。",
      "听见某些词会喉结一动立刻收口（不提具体词，让玩家体感「有禁区」）。",
      "巡逻停点固定得像刻度尺量过。",
    ],
    fracture_signals: [
      "你复活后第一步落地，他的视线会比话先到位，又强行装作没事。",
      "矛盾：嘴上说别麻烦他，脚却先挡在越界线前。",
      "同一裂口的风从两头灌进来，他却只承认这一头。",
    ],
    verification_fragments: [
      {
        text: "补给日志或巡线记录里出现同一套「封线—放行—封线」笔迹，与他声称的「只是物业」对不上。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["边界", "誓约", "巡视", "anchor", "border"] }]),
      },
      {
        text: "危机时他不先安慰，而是先把秩序拉回可审计：像旧日集体演练留下的反射。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "hot_threat" }]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里风纪协作序列残留节拍；多轮循环后仍按封线—放行—封线行动；对主锚复活后的第一步有肌肉记忆式残响（辅锚边界相位）。校侧碎片与楼侧碎片实为同一【空间】权柄的不同投影。",
    neverLeakBeforeDeep: ["耶里", "风纪", "辅锚", "七人", "校源徘徊者"],
  },
  "N-020": {
    npcId: "N-020",
    flavorAxis: "节奏·播报感·安抚语气·空白半拍·声纹违和",
    caps: { surfaceMax: 2, fractureMax: 2, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：句尾总上扬像哄小孩，却会在某个节拍突然空白半拍；你走得近时她会无意识按住心口。",
    surface_behavior_hints: [
      "递水前会先看门口方向，像习惯月初又有人摔进来。",
      "安慰话术像念过稿，甜得发腻又挑不出错。",
      "安静下来时眼神会先空一下，再重新挂上笑。",
      "对楼道广播/电流噪声异常敏感。",
    ],
    fracture_signals: [
      "你步频稍快，她会跟着乱一拍呼吸，又立刻用玩笑盖住。",
      "矛盾：说「我不记得」时语气太平，像在按提示音读。",
    ],
    verification_fragments: [
      {
        text: "ribbon 或信物类任务推进后，她会对「被听见」与「被消费」产生明显摇摆，话里出现播报式断句。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["ribbon", "补给", "记忆", "灵伤"] }]),
      },
      {
        text: "B1 背景噪声被压低时，她反而更不安，像在找一层熟悉的「底噪」。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([
          { kind: "location_any", substrings: ["B1_Storage", "B1_SafeZone"] },
          { kind: "task_title_any", substrings: ["ribbon", "补给", "记忆", "灵伤"] },
        ]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里广播社残留；声纹曾被泡层采样作稳定剂；对主锚步频有心悸式残响，故不立刻跟队（辅锚人性缓冲）。校侧与楼侧异常同源：同一空间权柄的不同泡层投影。",
    neverLeakBeforeDeep: ["耶里", "广播社", "泡层", "声纹", "辅锚"],
  },
  "N-010": {
    npcId: "N-010",
    flavorAxis: "名单·登记·拒代选·记录冲动·失败影子",
    caps: { surfaceMax: 1, fractureMax: 1, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：表格与登记表是她的壳；会先问你要去哪，却像在核对一份看不见的名单；最怕你让她替你选后果。",
    surface_behavior_hints: [
      "你犹豫时，她目光会落在你没说完的半句话上，像提前读过错题。",
      "月初新脸孔出现时，她会把登记表推近半寸，像怕这一行写歪。",
      "填表时指节会压平纸边，禁止涂改似的强迫症。",
    ],
    fracture_signals: [
      "矛盾：嘴上说「你自己选」，眼神却在等你吐出某个她期待的词。",
      "提到「替身/顶替」类词会收笑，仍礼貌但像关闸。",
      "熟悉感落在「缺角」而不是名字：她知道不对，却不说哪里不对。",
    ],
    verification_fragments: [
      {
        text: "转职登记或路线类任务推进后，她会给半步地图却绝不给终点；名单边缘常有撕痕感描写可验证。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["登记", "转职", "路线", "物业", "preview", "register"] }]),
      },
      {
        text: "与夜读账簿或交换节点同场时，她的「记录权」会被无形顶一下，话变短。",
        minRevealRank: REVEAL_TIER_RANK.deep,
        gates: G([{ kind: "world_flag_any", substrings: ["truth", "merchant", "conspiracy"] }]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里学生会档案干事残留；握有不完整情感记忆与旧闭环牵引——第一牵引点；先验你不是顶替记账位的替身（辅锚之三）。登记与名单所对的裂口：校泡与楼泡是同一空间权柄的两张皮。",
    neverLeakBeforeDeep: ["耶里", "学生会", "档案", "七人", "闭环", "辅锚", "牵引点"],
  },
  "N-018": {
    npcId: "N-018",
    flavorAxis: "交易·账本·价码·货流·审计口吻",
    caps: { surfaceMax: 2, fractureMax: 2, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：玩笑很亮，但每句都留退路；谈信任前先谈价；货物来源说得越模糊越像心里有账。",
    surface_behavior_hints: [
      "摸口袋像摸账本，习惯把「债」说成玩笑。",
      "对「无偿」「顺便」反应过敏，会立刻把话拉回交换。",
    ],
    fracture_signals: [
      "你一提白拿，他笑还在，价码先变硬。",
      "矛盾：说「我不欠谁」时停顿半拍，像在翻旧页。",
    ],
    verification_fragments: [
      {
        text: "碎片交易或merchant类任务推进后，会出现「互助券/欠条」式措辞，与公寓小商贩身份不完全贴合。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["交易", "碎片", "merchant", "委托", "债"] }]),
      },
      {
        text: "危机后他先锁交易再动，像怕人情破坏规则。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "hot_threat" }]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里外联与二手市集组织者残留；行走碎片流通边缘；与主锚有欠条式残响，只认审计过的债（辅锚交换路由）。流通的碎片与公寓消化链共享同一空间权柄根。",
    neverLeakBeforeDeep: ["耶里", "外联", "市集", "辅锚"],
  },
  "N-013": {
    npcId: "N-013",
    flavorAxis: "替身感·改稿·剧本腔·诱导·耻感壳",
    caps: { surfaceMax: 2, fractureMax: 2, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：先软后推责；话里常有「这一幕你该…」的台词感；笑时眼尾冷一拍，像在等导演喊 cut。",
    surface_behavior_hints: [
      "示弱时手势像在递剧本给你接。",
      "被夸「可靠」会别扭，更像怕被换掉。",
    ],
    fracture_signals: [
      "矛盾：嘴上说靠你，脚步却在收网。",
      "你按他写的「赢法」走，他会短暂失神像认错场次。",
    ],
    verification_fragments: [
      {
        text: "701 诱导或 false_rescue 类任务推进后，替身/改稿隐喻可验证，但仍不点名校籍。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["701", "诱导", "救援", "cleanse", "false"] }]),
      },
      {
        text: "与画室/镜像话题同现时，他会刻意换频道，耻感外壳裂开一条缝。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["画", "镜像", "叶", "草案"] }]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里戏剧社残留；曾把主锚写进替身梗；循环后梗成真，耻感与生存欲拧成刃（辅锚诱导）。剧本与楼内诱导共用同一空间权柄的叙事渗出。",
    neverLeakBeforeDeep: ["耶里", "戏剧社", "替身梗", "辅锚"],
  },
  "N-007": {
    npcId: "N-007",
    flavorAxis: "轮廓·草案·删改·镜像·保护性回避",
    caps: { surfaceMax: 2, fractureMax: 2, verifyMax: 1, deepMax: 1 },
    profileSurfaceAnomalyLine:
      "异常感：冷淡像门；会偷看你侧脸线条又像烫到；禁止公开拿她和七层少年比较。",
    surface_behavior_hints: [
      "抱臂站位像在挡一张看不见的画。",
      "说话短促，偶尔会冒出幼稚尾音不像她。",
    ],
    fracture_signals: [
      "矛盾：骂你最凶时，手却先挡异常。",
      "你轮廓与某张「草案」描述重叠时，她会失语半秒。",
    ],
    verification_fragments: [
      {
        text: "sibling/mirror 类任务推进后，可验证她与另一人共享「未公开改稿」式默契，仍不点名校籍。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "task_title_any", substrings: ["镜像", "兄妹", "sibling", "mirror", "画室"] }]),
      },
      {
        text: "5F 画室门槛内，她允许半步真相；门外立刻缩回职能壳。",
        minRevealRank: REVEAL_TIER_RANK.fracture,
        gates: G([{ kind: "location_any", substrings: ["5F", "Studio503", "画室"] }]),
      },
    ],
    deep_reveal_payload:
      "校源确认：耶里美术社残留；与枫同锁旧草案；主锚轮廓触发保护欲违和（辅锚镜像反制）。镜像线与画室庇护同属空间权柄在轮廓层的投影。",
    neverLeakBeforeDeep: ["耶里", "美术社", "辅锚", "草案"],
  },
};

export function getSchoolRevealLadder(npcId: string): MajorNpcSchoolRevealLadder | null {
  return MAJOR_NPC_IDS.includes(npcId as MajorNpcId) ? MAJOR_NPC_SCHOOL_REVEAL_LADDERS[npcId as MajorNpcId] : null;
}

export function getProfileSurfaceAnomalyLine(id: MajorNpcId): string {
  return MAJOR_NPC_SCHOOL_REVEAL_LADDERS[id].profileSurfaceAnomalyLine;
}

/** bootstrap lore：仅公寓职能句 + 异常伏笔句，不拼接 deep payload */
export function majorNpcBootstrapLoreFromProfile(apartmentLine: string, npcId: MajorNpcId): string {
  const ladder = MAJOR_NPC_SCHOOL_REVEAL_LADDERS[npcId];
  if (!ladder) return apartmentLine;
  return `${apartmentLine}；${ladder.profileSurfaceAnomalyLine}`;
}

function gateSatisfied(gate: VerificationGate, ctx: ForeshadowGateContext): boolean {
  switch (gate.kind) {
    case "task_title_any":
      return gate.substrings.some((s) =>
        ctx.activeTaskTitles.some((t) => t.toLowerCase().includes(s.toLowerCase()))
      );
    case "location_any":
      return gate.substrings.some((s) => (ctx.locationNode ?? "").includes(s));
    case "world_flag_any":
      return gate.substrings.some((s) => ctx.worldFlags.some((f) => f.includes(s)));
    case "hot_threat":
      return ctx.hotThreatPresent;
    default:
      return false;
  }
}

function allGatesSatisfied(gates: readonly VerificationGate[], ctx: ForeshadowGateContext): boolean {
  if (gates.length === 0) return true;
  return gates.every((g) => gateSatisfied(g, ctx));
}

export type ForeshadowGateContext = {
  activeTaskTitles: readonly string[];
  worldFlags: readonly string[];
  locationNode: string | null;
  hotThreatPresent: boolean;
};

export type ForeshadowRow = {
  id: MajorNpcId;
  layer: "surface" | "fracture" | "verify" | "deep";
  hint: string;
};

function clip(s: string, n: number): string {
  const t = String(s ?? "").trim();
  return t.length <= n ? t : t.slice(0, n);
}

/**
 * 按档位与门槛生成紧凑 foreshadow 行（不含 lore dump）。
 */
export function selectMajorNpcForeshadowRows(args: {
  npcId: MajorNpcId;
  maxRevealRank: RevealTierRank;
  /** 用于表面层轮换 */
  day: number;
  ctx: ForeshadowGateContext;
}): ForeshadowRow[] {
  const ladder = MAJOR_NPC_SCHOOL_REVEAL_LADDERS[args.npcId];
  const { maxRevealRank, day, ctx } = args;
  const rows: ForeshadowRow[] = [];
  const { caps } = ladder;
  const id = args.npcId;

  const nSurf = Math.min(caps.surfaceMax, ladder.surface_behavior_hints.length);
  const off = ladder.surface_behavior_hints.length ? day % ladder.surface_behavior_hints.length : 0;
  for (let i = 0; i < nSurf; i++) {
    const hi = ladder.surface_behavior_hints[(off + i) % ladder.surface_behavior_hints.length];
    rows.push({ id, layer: "surface", hint: clip(hi, 80) });
  }

  if (maxRevealRank >= REVEAL_TIER_RANK.fracture) {
    const nFrac = Math.min(caps.fractureMax, ladder.fracture_signals.length);
    for (let i = 0; i < nFrac; i++) {
      rows.push({ id, layer: "fracture", hint: clip(ladder.fracture_signals[i], 80) });
    }
  }

  if (maxRevealRank >= REVEAL_TIER_RANK.fracture) {
    let vz = 0;
    for (const frag of ladder.verification_fragments) {
      if (vz >= caps.verifyMax) break;
      if (maxRevealRank < frag.minRevealRank) continue;
      if (!allGatesSatisfied(frag.gates, ctx)) continue;
      rows.push({ id, layer: "verify", hint: clip(frag.text, 88) });
      vz++;
    }
  }

  if (maxRevealRank >= REVEAL_TIER_RANK.deep && caps.deepMax > 0) {
    rows.push({ id, layer: "deep", hint: clip(ladder.deep_reveal_payload, 96) });
  }

  return rows;
}

/** 单元测试：surface/fracture 行不得含禁止词（deep 除外） */
export function assertNoEarlyIdentityLeak(text: string, forbidden: readonly string[]): string | null {
  for (const w of forbidden) {
    if (w && text.includes(w)) return w;
  }
  return null;
}
