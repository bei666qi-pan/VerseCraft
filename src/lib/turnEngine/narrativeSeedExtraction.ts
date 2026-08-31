/**
 * 叙事→结构化提取（narrativeSeedExtraction）
 *
 * 目的：模型在主叙事里描述了具体可记录的事物（NPC 出现、门内对话、门把手偏移、
 * 铁门、墙痕、拖痕、胶带等具象物件），但忘了把它们写进 `codex_updates`/
 * `npc_location_updates`/`new_tasks`/`awarded_items`——这正是 judge 报告里的
 * `narrative_vacuum`。
 *
 * 这层是补救层，不是知识库层：只提取**确定性高、可由一句话复现**的具象细节。
 * 凡是"看起来可能虽然不肯定"的细节宁可不提取，避免反方向污染线索库。
 *
 * 设计原则：
 * 1. narrative 永远不直接变状态。提取结果只走 `clue_updates`（unverified 来源），
 *    后续 commit 阶段才会进入 journal；玩家后续行动可以验证/失效它。
 * 2. 已经在 `clue_updates`/`new_tasks` 里包含同主题的，必须跳过（避免重复注入）。
 * 3. 不能伪造敌人 ID / 已注册 NPC ID / 物品 ID。所有提取物都是"未确认"线索。
 * 4. 触发条件是"叙事中具体名词 + 强动词/强描述"，缺一项就跳过。
 * 5. 单回合最多注入 4 条，避免线索爆量。
 */

import { stableClueIdFromContent, normalizeClueDraft } from "@/lib/domain/clueMerge";
import type { ClueEntry, ClueKind } from "@/lib/domain/narrativeDomain";

// === 提取信号 ========================================================

/** 门内传出具体声音/对话（"门缝里传出声音 / 门后传来他说话"） */
const VOICE_THROUGH_DOOR_RE = /门[缝里后板内底][^\n。]{0,30}?(?:说话|开口|回.{0,6}话|应答|问|喊|叫|哼|回答|低语|喃喃|哼了一声|出声|椅子|脚步|敲击|呼喊|敲打|声音|嗓音|人声|动静|响动|声响)/u;

/** 门内具体台词（带引号或破折号） */
const QUOTED_DOOR_DIALOGUE_RE = /门[缝里后板内底][^「"\n]{0,80}?[「"][^」"]{2,40}[」"]/u;

/** 门缝里的可视线索（光线、影子、动作） */
const DOOR_CRACK_VISUAL_RE = /门[缝里底][^\n。]{0,12}?(?:透出|透进来|渗出|漏出|晃[了一]?下|动[了一]?下|渗进来|送出一股)/u;

/** 穿衣服的具象人物 */
const CLOTHED_PERSON_RE = /穿.{1,12}?(?:外套|夹克|衬衫|大衣|风衣|卫衣|制服|工服|病号服|校服|西装|牛仔|毛衣|汗衫|裤子|裙子|外套|衣服|袍|披风|斗篷|羽绒|棉袄).{0,6}?(?:男青年|女青年|男子|女子|男人|女人|老人|小孩|少年|少女|大叔|阿姨|陌生人|邻居|住户|同行|同伴|来者|身影|人影|孩子|男孩|女孩|住户|租户|管理员)/u;

/** 蹲/站在墙角的具象人物 */
const CROUCHED_PERSON_RE = /(?:蹲|站|坐|靠|倚|立|卧|躺|背)[着在][^\n。]{0,8}?(?:墙|墙根|墙角|角落|门边|门洞|走廊|通道|扶手|楼梯|门前|门框|门后|对面)/u;

/** 生锈/铁/可疑门 */
const IRON_DOOR_RE = /(?:铁门|锈门|逃生门|铁门剪影|生锈的[门铁]|铁皮门|防火门|消防门|金属门|栅栏门|铁栅门)/u;

/** 门把手位置异常 */
const HANDLE_OFFSET_RE = /门把[手柄][^\n。]{0,40}?(?:偏移|错位|偏了|歪了|不在|偏差|拧|松动|空转|回不正|对不上)/u;

/** 走廊/通道几何异常 */
const CORRIDOR_ANOMALY_RE = /走廊[^\n。]{0,18}?(?:弧度|弯曲|拐[了]?个|改向|变形|倾斜|不符|偏差|变窄|变宽|尽头不一致|尽头对不上|接不上|不对称)/u;

/** 墙面破损痕迹 */
const WALL_DAMAGE_RE = /墙[^\n。]{0,6}?(?:裂缝|凹陷|剥落|破损|脱皮|裂开|裂痕|色差|霉斑|水渍|血痕|缺口|破洞)/u;

/** 地面物理痕迹 */
const FLOOR_TRACE_RE = /(?:拖痕|抓痕|擦痕|划痕|刮痕|刻痕|凹槽|血痕|脚印|足印|指纹|掌纹|指痕)/u;

/** 胶带/包扎/缠裹 */
const TAPE_OR_WRAP_RE = /(?:胶带|绷带|纱布|包扎|缠着|缠绕|捆着|裹着|绑着|一层.{0,4}(?:胶带|绷带))/u;

/** 持有物品（"手里攥着X" / "握着X"） */
const HOLDING_ITEM_RE = /手[里中][^\n。]{0,8}?(?:攥|握|持|拿|捏|提|拎|举|举着|挂着|佩着)[^\n。]{0,4}?([一-龥]{2,6})/u;

/** 远处有人蹬脚/站起身 */
const FIGURE_MOVING_RE = /(?:有人|人影|身影|那个人|对方)[^\n。]{0,8}?(?:起身|坐下|蹲下|跑来|走过|挤进|穿[过一]?去|缩回去|倒)[^\n。]{0,6}?[，。]/u;

// === 提取器 ===========================================================

type SeedDefinition = {
  kind: ClueKind;
  title: string;
  detailTemplate: (match: RegExpExecArray) => string;
  importance: 1 | 2 | 3;
  pattern: RegExp;
};

const SEED_DEFINITIONS: SeedDefinition[] = [
  {
    kind: "npc_anomaly",
    title: "门内有人声",
    detailTemplate: (m) => `叙事中提到${m[0].replace(/^[「"]/,"").replace(/[」"]$/,"")}——门后有具象人物但未注册。`,
    importance: 3,
    pattern: VOICE_THROUGH_DOOR_RE,
  },
  {
    kind: "rumor",
    title: "门内不明台词",
    detailTemplate: (m) => `叙事中门后出现具体对白：「${m[0]}」，但未注册这位说话者。`,
    importance: 2,
    pattern: QUOTED_DOOR_DIALOGUE_RE,
  },
  {
    kind: "trace",
    title: "门缝光影变化",
    detailTemplate: (m) => `叙事中门缝/门底出现可视线索：${m[0]}。`,
    importance: 1,
    pattern: DOOR_CRACK_VISUAL_RE,
  },
  {
    kind: "npc_anomaly",
    title: "具象人物出现",
    detailTemplate: (m) => `叙事中出现具象人物：${m[0]}，未与任何已注册 NPC 对应。`,
    importance: 3,
    pattern: CLOTHED_PERSON_RE,
  },
  {
    kind: "npc_anomaly",
    title: "有人蹲在墙角",
    detailTemplate: (m) => `叙事中描述有人在${m[0]}附近——未注册身份。`,
    importance: 2,
    pattern: CROUCHED_PERSON_RE,
  },
  {
    kind: "place_anomaly",
    title: "可疑门",
    detailTemplate: (m) => `叙事中提到${m[0]}——未登记为可进入地点。`,
    importance: 3,
    pattern: IRON_DOOR_RE,
  },
  {
    kind: "place_anomaly",
    title: "门把手位置异常",
    detailTemplate: (m) => `叙事中门把手位置${m[0]}——结构异常线索。`,
    importance: 2,
    pattern: HANDLE_OFFSET_RE,
  },
  {
    kind: "place_anomaly",
    title: "走廊几何异常",
    detailTemplate: (m) => `叙事中走廊出现${m[0]}——结构异常线索。`,
    importance: 2,
    pattern: CORRIDOR_ANOMALY_RE,
  },
  {
    kind: "trace",
    title: "墙面破损",
    detailTemplate: (m) => `叙事中出现${m[0]}——环境痕迹。`,
    importance: 1,
    pattern: WALL_DAMAGE_RE,
  },
  {
    kind: "trace",
    title: "地面物理痕迹",
    detailTemplate: (m) => `叙事中出现${m[0]}——可追踪的环境痕迹。`,
    importance: 2,
    pattern: FLOOR_TRACE_RE,
  },
  {
    kind: "trace",
    title: "胶带/包扎痕迹",
    detailTemplate: (m) => `叙事中出现${m[0]}——可能的物品/痕迹线索。`,
    importance: 1,
    pattern: TAPE_OR_WRAP_RE,
  },
  {
    kind: "trace",
    title: "持有物品",
    detailTemplate: (m) => `叙事中持有物${m[0]}——未确认归属。`,
    importance: 1,
    pattern: HOLDING_ITEM_RE,
  },
  {
    kind: "npc_anomaly",
    title: "远处人物动作",
    detailTemplate: (m) => `叙事中远处人物${m[0]}——未注册身份。`,
    importance: 2,
    pattern: FIGURE_MOVING_RE,
  },
];

const MAX_SEEDS_PER_TURN = 6;

/**
 * 从叙事中提取可结构化的“线索种子”。返回的条目 schema 与 ClueEntry 兼容，
 * 但 `triggerSource` 标记为 `narrative_seed_extraction`，便于后续审计/拒绝。
 */
export function extractNarrativeSeeds(args: {
  narrative: string;
  existingClueTitles?: ReadonlyArray<string>;
  existingClueIds?: ReadonlyArray<string>;
  existingTaskTitles?: ReadonlyArray<string>;
  nowIso: string;
}): ClueEntry[] {
  const narrative = String(args.narrative ?? "");
  if (!narrative) return [];
  const existingTitles = new Set((args.existingClueTitles ?? []).map((s) => s.trim().toLowerCase()));
  const existingClueIds = new Set((args.existingClueIds ?? []).map((s) => s.trim()));
  const existingTaskTitles = new Set((args.existingTaskTitles ?? []).map((s) => s.trim().toLowerCase()));

  const out: ClueEntry[] = [];
  const seenDetail = new Set<string>();

  for (const def of SEED_DEFINITIONS) {
    if (out.length >= MAX_SEEDS_PER_TURN) break;
    def.pattern.lastIndex = 0;
    const match = def.pattern.exec(narrative);
    if (!match) continue;

    const titleLower = def.title.toLowerCase();
    if (existingTitles.has(titleLower) || existingTaskTitles.has(titleLower)) continue;

    const detail = def.detailTemplate(match);
    if (seenDetail.has(detail)) continue;
    seenDetail.add(detail);

    const draftId = stableClueIdFromContent(def.title, detail);
    if (existingClueIds.has(draftId)) continue;

    const draft = normalizeClueDraft({
      id: draftId,
      title: def.title,
      detail,
      kind: def.kind,
      status: "unverified",
      source: "dm",
      visibility: "hidden",
      importance: def.importance,
      acquisitionSource: "narrative_seed_extraction",
      triggerSource: "narrative_seed_extraction",
      createdAt: args.nowIso,
      updatedAt: args.nowIso,
    }, args.nowIso);

    if (draft) out.push(draft);
  }

  return out;
}
