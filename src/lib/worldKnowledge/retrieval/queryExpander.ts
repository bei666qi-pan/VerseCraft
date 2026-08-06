// src/lib/worldKnowledge/retrieval/queryExpander.ts
// Query Understanding & Expansion for world knowledge retrieval.
//
// Takes raw player input and produces expanded query variants for each
// retrieval layer (FTS, vector, tag matching). Operates entirely
// heuristically — no LLM on critical path. Designed for <5ms latency.
//
// Key techniques:
// 1. CJK-aware segmentation (character n-gram + dictionary lookup)
// 2. Synonym expansion from curated domain dictionary
// 3. Entity/action/location extraction for structured queries
// 4. Multi-query generation: separate entity query + action query + composite

import { NPCS } from "@/lib/registry/npcs";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { MAP_ROOMS } from "@/lib/registry/world";
import { APARTMENT_RULES } from "@/lib/registry/rules";

// ── Domain synonym dictionary ───────────────────────────

const VERB_SYNONYMS: Record<string, string[]> = {
  "探索": ["搜查", "调查", "检查", "寻找", "查看"],
  "寻找": ["搜索", "搜寻", "查找", "发现"],
  "对话": ["交谈", "询问", "打听", "问话", "搭话"],
  "攻击": ["战斗", "对抗", "袭击", "打架", "动手"],
  "使用": ["借助", "利用", "动用", "拿起", "掏出"],
  "移动": ["前往", "走去", "到达", "进入", "靠近"],
  "观察": ["查看", "审视", "打量", "扫视", "环顾"],
  "打开": ["推开", "拉开", "开启", "解锁"],
  "躲藏": ["避开", "藏匿", "隐藏", "躲避"],
  "锻造": ["制作", "打造", "铸造", "合成", "修理"],
};

const NOUN_SYNONYMS: Record<string, string[]> = {
  "公寓": ["住宅", "楼房", "大楼", "宿舍"],
  "走廊": ["过道", "通道", "长廊"],
  "房间": ["屋子", "隔间", "居室"],
  "楼梯": ["台阶", "阶梯"],
  "电梯": ["升降机"],
  "地下室": ["地窖", "地下层"],
  "钥匙": ["门卡", "通行证", "锁匙"],
  "武器": ["兵器", "家伙", "装备"],
  "怪物": ["诡异", "畸变体", "异常", "异形"],
  "日记": ["笔记", "记录", "手札", "日志"],
  "规则": ["守则", "禁忌", "条例", "规矩"],
  "居民": ["住户", "住客", "居住者", "房客"],
  "诡异": ["异常", "怪事", "不祥", "不对劲"],
  "血迹": ["血痕", "血渍", "血斑"],
  "尸体": ["遗骸", "遗体", "死者"],
  "符号": ["标记", "烙印", "印记", "符文"],
};

const LOCATION_SYNONYMS: Record<string, string[]> = {
  "b1": ["地下1层", "地下一层", "负一层", "B1"],
  "b2": ["地下2层", "地下二层", "负二层", "B2"],
  "1楼": ["一楼", "首层", "一层", "大厅层", "1F"],
  "2楼": ["二楼", "二层", "2F"],
  "3楼": ["三楼", "三层", "3F"],
  "4楼": ["四楼", "四层", "4F"],
  "5楼": ["五楼", "五层", "5F"],
  "6楼": ["六楼", "六层", "6F"],
  "7楼": ["七楼", "七层", "7F"],
};

// ── CJK segmentation (lightweight, no dictionary needed) ─

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]+/g;
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都",
  "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会",
  "着", "没有", "看", "好", "自己", "这", "他", "她", "它", "们",
  "那个", "这个", "什么", "怎么", "哪", "哪里", "吗", "吧", "呢",
  "可以", "能", "想", "想要", "想用", "想找", "找到", "看到",
  "应该", "觉得", "知道", "可能", "一下", "一些", "有点", "一些",
]);

function segmentCJK(text: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
   
  while ((match = CJK_RE.exec(text)) !== null) {
    const word = match[0];
    // 2-char bigrams for search granularity
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) tokens.push(bigram);
    }
    // Also keep the full word if it's long enough
    if (word.length >= 3 && !STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }
  return [...new Set(tokens)];
}

// ── Domain entity detection ─────────────────────────────

interface ExtractedEntities {
  npcs: string[];
  anomalies: string[];
  rooms: string[];
  rules: string[];
  floors: string[];
  verbs: string[];
  nouns: string[];
  rawTokens: string[];
}

function extractEntities(input: string): ExtractedEntities {
  const lower = input.toLowerCase();
  const npcs: string[] = [];
  const anomalies: string[] = [];
  const rooms: string[] = [];
  const rules: string[] = [];
  const floors: string[] = [];
  const verbs: string[] = [];
  const nouns: string[] = [];

  // Match NPCs
  for (const npc of NPCS) {
    if (lower.includes(npc.name.toLowerCase()) || lower.includes(npc.id.toLowerCase())) {
      npcs.push(npc.name);
    }
  }

  // Match anomalies
  for (const a of ANOMALIES) {
    if (lower.includes(a.name.toLowerCase()) || lower.includes(a.id.toLowerCase())) {
      anomalies.push(a.name);
    }
  }

  // Match rooms
  for (const roomsList of Object.values(MAP_ROOMS)) {
    for (const room of roomsList) {
      if (lower.includes(room.toLowerCase())) {
        rooms.push(room);
      }
    }
  }

  // Match floors
  for (const [floor, synonyms] of Object.entries(LOCATION_SYNONYMS)) {
    for (const s of [floor, ...synonyms]) {
      if (lower.includes(s.toLowerCase())) {
        floors.push(floor);
        break;
      }
    }
  }

  // Match rules
  for (const rule of APARTMENT_RULES) {
    const kw = rule.slice(0, 6).toLowerCase();
    if (lower.includes(kw)) {
      rules.push(kw);
    }
  }

  // Extract verbs
  for (const [verb, synonyms] of Object.entries(VERB_SYNONYMS)) {
    for (const v of [verb, ...synonyms]) {
      if (lower.includes(v)) {
        verbs.push(v);
        break;
      }
    }
  }

  // Extract domain nouns
  for (const [noun, synonyms] of Object.entries(NOUN_SYNONYMS)) {
    for (const n of [noun, ...synonyms]) {
      if (lower.includes(n)) {
        nouns.push(n);
        break;
      }
    }
  }

  // CJK tokens
  const rawTokens = segmentCJK(input);

  return { npcs, anomalies, rooms, rules, floors, verbs, nouns, rawTokens };
}

// ── Query variant generation ────────────────────────────

interface ExpandedQueries {
  /** Primary FTS query with synonym expansion (max 512 chars) */
  ftsQuery: string;
  /** Structured entity-only query for exact/keyword match layer */
  entityQuery: string;
  /** Action-focused query for vector semantic search */
  semanticQuery: string;
  /** Fallback composite query */
  compositeQuery: string;
  /** Raw CJK tokens for tag expansion */
  tagTokens: string[];
  /** Debug: expansion summary */
  _meta: {
    originalInput: string;
    expandedTokens: number;
    entityCount: number;
    variantCount: number;
  };
}

export function expandQuery(rawInput: string): ExpandedQueries {
  const entities = extractEntities(rawInput);

  // ── Build expanded FTS query ──
  const ftsParts: string[] = [];

  // Add expanded verbs with synonyms
  for (const verb of entities.verbs) {
    const synonyms = VERB_SYNONYMS[verb] ?? [];
    ftsParts.push([verb, ...synonyms.slice(0, 2)].join(" "));
  }

  // Add expanded nouns with synonyms
  for (const noun of entities.nouns) {
    const synonyms = NOUN_SYNONYMS[noun] ?? [];
    ftsParts.push([noun, ...synonyms.slice(0, 2)].join(" "));
  }

  // Add floor expansions
  for (const floor of entities.floors) {
    const synonyms = LOCATION_SYNONYMS[floor] ?? [];
    ftsParts.push([floor, ...synonyms.slice(0, 2)].join(" "));
  }

  // Add raw tokens (filtered to domain-relevant ones)
  for (const token of entities.rawTokens) {
    if (token.length >= 2 && !STOP_WORDS.has(token)) {
      ftsParts.push(token);
    }
  }

  // Add NPC/anomaly names
  ftsParts.push(...entities.npcs, ...entities.anomalies);

  // Deduplicate and join
  const ftsQuery = [...new Set(ftsParts)]
    .join(" ")
    .slice(0, 512);

  // ── Build entity query (for exact match layer) ──
  const entityParts: string[] = [];
  entityParts.push(...entities.npcs, ...entities.anomalies, ...entities.rooms);
  if (entities.floors.length > 0) entityParts.push(...entities.floors);
  const entityQuery = entityParts.join(" ");

  // ── Build semantic query (for vector search) ──
  // Keep this close to the player's natural language intent
  // but strip filler words and add domain context
  const semanticParts: string[] = [];
  const fullCJK = (rawInput.match(CJK_RE) ?? []).join("");
  if (fullCJK.length > 0) semanticParts.push(fullCJK);
  // Append key entities for context
  if (entities.npcs.length > 0) semanticParts.push(entities.npcs.join(" "));
  if (entities.rooms.length > 0) semanticParts.push(`地点:${entities.rooms.join(",")}`);
  if (entities.floors.length > 0) semanticParts.push(entities.floors.join(" "));
  const semanticQuery = semanticParts.join(" ").slice(0, 512);

  // ── Composite fallback ──
  const compositeParts: string[] = [];
  if (entities.verbs.length > 0) compositeParts.push(entities.verbs.join(""));
  if (entities.nouns.length > 0) compositeParts.push(entities.nouns.join(""));
  if (entities.npcs.length > 0) compositeParts.push(entities.npcs.join(""));
  compositeParts.push(...entities.rawTokens.slice(0, 10));
  const compositeQuery = compositeParts.join(" ").slice(0, 384);

  // ── Tag tokens (for label matching) ──
  const tagTokens = [
    ...entities.rawTokens.filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
    ...entities.nouns,
    ...entities.floors.map((f) => f.replace(/[楼楼Ff]/g, "")),
  ];

  return {
    ftsQuery: ftsQuery || rawInput.slice(0, 512),
    entityQuery: entityQuery || rawInput.slice(0, 256),
    semanticQuery: semanticQuery || rawInput.slice(0, 512),
    compositeQuery: compositeQuery || rawInput.slice(0, 384),
    tagTokens: [...new Set(tagTokens)],
    _meta: {
      originalInput: rawInput,
      expandedTokens: ftsParts.length,
      entityCount: entities.npcs.length + entities.anomalies.length + entities.rooms.length,
      variantCount: (ftsQuery.length > 0 ? 1 : 0) + (entityQuery.length > 0 ? 1 : 0) + (semanticQuery.length > 0 ? 1 : 0),
    },
  };
}
