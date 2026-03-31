export type PlayerActionType =
  | "dialogue"
  | "investigate"
  | "combat"
  | "move"
  | "use_item"
  | "meta"
  | "other";

export type DialogueIntent =
  | "ask"
  | "request"
  | "threaten"
  | "apologize"
  | "explain"
  | "bargain"
  | "greet"
  | "comfort"
  | "provoke"
  | "unknown";

export type EmotionalTone =
  | "calm"
  | "tense"
  | "angry"
  | "fearful"
  | "sad"
  | "urgent"
  | "cold"
  | "warm"
  | "unknown";

export type PlayerActionIntent = {
  action_type: PlayerActionType;
  dialogue_intent?: DialogueIntent;
  target?: string;
  emotional_tone?: EmotionalTone;
  desired_effect?: string;
  // A short, lossy paraphrase to reduce verbatim echo.
  speech_hint?: string;
  // Keep raw extremely short; never put the full player text here.
  raw_snippet?: string;
};

function clamp(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function pickTone(s: string): EmotionalTone {
  const t = s.replace(/\s+/g, "");
  if (/低声|轻声|压低/.test(t)) return "tense";
  if (/急|立刻|快|马上|求你|拜托/.test(t)) return "urgent";
  if (/愤怒|怒|吼|咆哮|拍桌|砸/.test(t)) return "angry";
  if (/害怕|恐惧|发抖|不敢|别杀/.test(t)) return "fearful";
  if (/冷笑|冷冷|漠然|不屑/.test(t)) return "cold";
  if (/安慰|别怕|没事|我在/.test(t)) return "warm";
  if (/叹|难过|抱歉|对不起/.test(t)) return "sad";
  if (/平静|镇定|缓缓/.test(t)) return "calm";
  return "unknown";
}

function inferActionType(raw: string): PlayerActionType {
  const t = raw.replace(/\s+/g, "");
  if (!t) return "other";
  if (/^(保存|读档|回档|设置|帮助|退出|重开|暂停|继续)$/.test(t) || /(背包|任务|属性|菜单|静音|音量)/.test(t)) {
    return "meta";
  }
  if (/^(我)?使用了道具[:：]/.test(t) || /^(我)?(使用|服用|喝下|喝|吃下|吃|装备|点燃|注射)/.test(t)) {
    return "use_item";
  }
  if (/^(查看|观察|调查|搜索|检查|翻找)/.test(t)) return "investigate";
  if (/(攻击|砍|刺|射击|开火|格挡|闪避|躲开|反击)/.test(t)) return "combat";
  if (/^(我)?(去|前往|走向|进入|回到|返回)/.test(t) || /^(探索|移动到)/.test(t)) return "move";
  if (/[:：]|“|”/.test(raw) || /^(我)?对.+(说|问|喊|解释|回答|道歉|打招呼)/.test(t) || /^(我)?(询问|请求|交谈|沟通)/.test(t)) {
    return "dialogue";
  }
  return "other";
}

function inferDialogueIntent(raw: string): DialogueIntent {
  const t = raw.replace(/\s+/g, "");
  if (/道歉|对不起|抱歉/.test(t)) return "apologize";
  if (/威胁|不然|否则|我会杀|让你付出/.test(t)) return "threaten";
  if (/解释|说明|我不是|误会/.test(t)) return "explain";
  if (/谈条件|交易|换|价码|条件/.test(t)) return "bargain";
  if (/打招呼|你好|早上好|晚上好/.test(t)) return "greet";
  if (/安慰|别怕|别哭|我在/.test(t)) return "comfort";
  if (/挑衅|激你|嘲讽|你敢/.test(t)) return "provoke";
  if (/请求|拜托|求你|麻烦/.test(t)) return "request";
  if (/问|询问|\?$|？$/.test(t)) return "ask";
  return "unknown";
}

function inferTarget(raw: string): string {
  const t = raw.replace(/\s+/g, "");
  const m1 = t.match(/(?:对|向)([^：:，。！？]{1,12})(?:说|问|喊|解释|道歉|请求)/);
  if (m1?.[1]) return m1[1];
  const m2 = t.match(/问([^：:，。！？]{1,12})[:：]/);
  if (m2?.[1]) return m2[1];
  return "";
}

function inferDesiredEffect(raw: string, type: PlayerActionType, di: DialogueIntent): string {
  const t = raw.replace(/\s+/g, "");
  if (type === "investigate") return "获得线索/确认异常";
  if (type === "combat") return "压制威胁/争取生存窗口";
  if (type === "move") return "靠近目标/脱离危险";
  if (type === "use_item") return "借助道具改变局面";
  if (type === "dialogue") {
    if (di === "ask") return "获取信息/确认对方立场";
    if (di === "request") return "争取协助/交换条件";
    if (di === "threaten") return "迫使让步/制造心理压力";
    if (di === "apologize") return "缓和冲突/修复关系";
    if (di === "explain") return "澄清误会/争取信任";
    if (di === "bargain") return "达成交易/降低代价";
    if (di === "comfort") return "稳定对方情绪/避免失控";
    if (di === "provoke") return "试探底线/引出破绽";
    if (/求饶|别杀|别开枪/.test(t)) return "避免伤害/争取停火";
    return "推进对话并获得即时反应";
  }
  return "推进局势";
}

function speechHint(raw: string): string {
  const t = raw
    .replace(/^【[^】]{1,20}】/g, "")
    .replace(/^\s*(玩家行动|玩家输入|用户输入|动作)\s*[:：]\s*/i, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  // Remove leading "我/你" to reduce direct echo.
  const soft = t.replace(/^(我|你)\s*/g, "");
  // Only keep a short paraphrase.
  return clamp(soft, 22);
}

export function buildPlayerActionIntent(rawAction: string): PlayerActionIntent {
  const raw = String(rawAction ?? "").trim();
  const action_type = inferActionType(raw);
  const emotional_tone = pickTone(raw);
  const target = inferTarget(raw);
  const dialogue_intent = action_type === "dialogue" ? inferDialogueIntent(raw) : undefined;
  const desired_effect = inferDesiredEffect(raw, action_type, dialogue_intent ?? "unknown");
  const hint = action_type === "dialogue" ? speechHint(raw) : "";
  return {
    action_type,
    ...(dialogue_intent ? { dialogue_intent } : {}),
    ...(target ? { target } : {}),
    ...(emotional_tone !== "unknown" ? { emotional_tone } : {}),
    ...(desired_effect ? { desired_effect } : {}),
    ...(hint ? { speech_hint: hint } : {}),
    ...(raw ? { raw_snippet: clamp(raw, 18) } : {}),
  };
}

export function shapeUserActionForModelV2(rawAction: string): string {
  const raw = String(rawAction ?? "").trim();
  if (!raw) return "";
  const intent = buildPlayerActionIntent(raw);
  // Single compact line: low TTFT impact, high absorption.
  return `【玩家叙事意图】${JSON.stringify(intent)}\n【玩家当下行动】请把上面意图吸收进叙事，不要复述原句；用“后果先行+即时反应+中文引号对白”。`;
}

