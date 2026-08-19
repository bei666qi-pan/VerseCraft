function clamp(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export function buildPovPacketBlock(args: { maxChars?: number }): string {
  const packet = {
    schema: "pov_packet_v1",
    narrative_pov: "first_person",
    protagonist_reference: "我",
    narration_second_person_forbidden: true,
    npc_dialogue_second_person_allowed: true,
    reminder:
      "叙事描述层只能用“我”写玩家动作与感受；引号对白里允许出现“你”。若不确定，一律按第一人称续写上一段。",
  };
  const text = `## 【pov_packet】\n${JSON.stringify(packet)}`;
  const max = Math.max(160, Math.min(800, args.maxChars ?? 420));
  return text.length <= max ? text : `${clamp(text, max - 1)}…`;
}

export function buildThirdPersonLimitedPovPacketBlock(args: { maxChars?: number }): string {
  const packet = {
    schema: "pov_packet_v1",
    narrative_pov: "third_person_limited",
    protagonist_reference: "角色姓名或他/她",
    first_person_protagonist_forbidden: true,
    npc_inner_mind_forbidden: true,
    reminder: "只写主角能够观察、感受或合理推断的信息；不得切入 NPC 内心，不得把未揭露动机写成事实。",
  };
  const text = `## 【pov_packet】\n${JSON.stringify(packet)}`;
  const max = Math.max(160, Math.min(800, args.maxChars ?? 420));
  return text.length <= max ? text : `${clamp(text, max - 1)}…`;
}
