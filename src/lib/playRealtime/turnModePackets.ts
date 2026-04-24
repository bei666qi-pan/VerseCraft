import type { TurnMode } from "@/features/play/turnCommit/turnEnvelope";

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export function buildTurnModePolicyPacketBlock(args: {
  plannedMode: TurnMode;
  reason: string;
  maxChars?: number;
}): string {
  const packet = {
    schema: "turn_mode_policy_v1",
    planned_turn_mode: args.plannedMode,
    reason: clampText(args.reason, 120),
    generation_principles: {
      // 情景自适应·动态裁决：关键节点戛然而止（详参 stable【叙事长度·情景自适应】）
      narrative_length_policy: "adaptive",
      narrative_length_hint: "由模型按情景实时裁决长短；关键节点戛然而止；每句须带新信息；禁止匀速长叙事与凑字数续写。",
      narrative_style: "短句错落、多感官、节奏不均；关键节点收束制造悬念钩子，让玩家有继续的冲动。",
      protagonist_anchor: "主角身份锚定；禁止私自新增背景/职业/过往/关系。",
      epistemic_consistency: "NPC/玩家知情边界须符合 packet；越界时 NPC 须有反应（惊疑/回避/追问/否认），不得无反应承认。",
      constraints_must_bind: "叙事受当前地点/在场NPC/时间/主威胁/手记线索/任务状态约束。",
    },
    output_contract: {
      // Important: front-end is still legacy options UI; server may clear options for narrative_only.
      when_narrative_only: [
        "turn_mode 必须为 narrative_only。",
        "除非系统明确要求，否则不要输出 options（留空数组或省略都可，服务端会容错）。",
        "可以输出 auto_continue_hint（例如：继续/等待/压下呼吸）。",
      ],
      when_decision_required: [
        "turn_mode 必须为 decision_required。",
        "必须输出 decision_options，且 2–4 条，必须真正分叉后果，不得换皮同义。",
        "为兼容旧 UI，你也可以同步输出 legacy options（2–4 条）。",
      ],
      when_system_transition: [
        "turn_mode 必须为 system_transition。",
        "不得输出普通 options（避免误触发）。如需引导，请用 narrative + auto_continue_hint。",
      ],
    },
  };
  const text = `## 【turn_mode_policy_packet】\n${JSON.stringify(packet)}`;
  const maxChars = Math.max(260, Math.min(1400, args.maxChars ?? 780));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

