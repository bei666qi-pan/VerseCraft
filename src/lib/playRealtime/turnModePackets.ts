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
      // The product goal: “默认长叙事，关键节点才给选择”
      default_narrative_chars_target: "800-1400",
      narrative_style: "更像小说段落的连续推进；不要每句话都停下来等玩家。",
      protagonist_anchor: "主角身份绝对锚定；禁止私自编造新背景、新职业、新过往、新关系。",
      epistemic_consistency: "NPC/玩家的知情边界必须符合 packet；越界时 NPC 必须表现出反应（惊疑/回避/追问/否认），不得无反应承认。",
      constraints_must_bind: "叙事必须受当前地点/在场NPC/时间/主威胁/手记线索/任务状态约束。",
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

