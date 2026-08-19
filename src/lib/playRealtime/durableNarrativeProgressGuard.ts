type RecordLike = Record<string, unknown>;

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasWrittenEvidence(record: RecordLike): boolean {
  return [
    record.clue_updates,
    record.codex_updates,
    record.foreshadow_ops,
    record.new_tasks,
    record.task_updates,
  ].some(hasEntries);
}

function hasUnlockEvidence(
  record: RecordLike,
  currentLocation: string,
): boolean {
  const resolvedLocation = typeof record.player_location === "string"
    ? record.player_location.trim()
    : "";
  const committedMovement = Boolean(
    resolvedLocation && (!currentLocation || resolvedLocation !== currentLocation),
  );
  return committedMovement || [
    record.clue_updates,
    record.foreshadow_ops,
    record.new_tasks,
    record.task_updates,
  ].some(hasEntries);
}

const WRITTEN_SOURCE = /(?:登记簿|日记|笔记|练习册|课本|书页|纸页|纸条|档案|记录册|信件|信纸|墙上文字|刻字)/u;
const DEFINITE_WRITTEN_REVEAL = /(?:翻到|读到|看到|写着|写有|记着|记录着|目光落到).{0,80}(?:[“「『"]|(?:出口|路线|真相|秘密|密码|钥匙|别走|不要|必须|会动))/u;
const DEFINITE_UNLOCK = /(?:(?:锁头|锁芯|门锁|链条|门闩).{0,72}(?:弹开|解开|打开|断开|脱落|垂落|让开|松开|开了|没撑过|撑不过|崩开|撞开|砸开|踹开|破开)|(?:门|铁门).{0,24}(?:自行|自己|已经|终于|被)?(?:打开|开启|开了|敞开|推开|滑开|撞开|砸开|踹开|破开)|(?:推开|滑开).{0,12}(?:门|铁门)|(?:门|门板)[^。！？\n]{0,32}[。！？]\s*(?:推开|拉开|撞开|踹开)的瞬间)/u;
const FAILED_OR_ATTEMPTED = /(?:没能|未能|无法|不能|纹丝不动|仍(?:然)?(?:锁|关)|没有打开|尚未打开|试图|尝试|正要)/u;
const UNLOCK_EXPLICIT_SUCCESS = /(?:门|门缝).{0,40}(?:自己|自行|终于|随即|随后|却).{0,20}(?:打开|开启|开了|敞开|虚掩)|(?:自己|自行|终于|随即|随后).{0,40}(?:门|门锁|锁芯).{0,20}(?:打开|开启|开了|敞开)/u;
const FORCE_OPEN_ACTION = /(?:(?:强行|用力|试着|尝试|撞|砸|踹|撬).{0,16}(?:打开|推开|撞开|砸开|踹开|撬开|破开).{0,10}(?:门|锁)|(?:强行打开|撬门|撞门|踹门|砸门))/u;
const ENTERED_BEYOND_DOOR = /(?:门后(?:不是|是|出现|通向)|门缝里(?:漏出|涌出|灌进).{0,40}(?:风|光|气味)|进入(?:另一|新的).{0,12}(?:走廊|房间|楼层))/u;
const DEFINITE_HIDDEN_PASSAGE = /(?:(?:墙板|墙面|墙砖|砖块|木板|暗门).{0,120}(?:露出|显出|打开|凹陷|翘起).{0,60}(?:入口|通道|台阶|阶梯|窄梯|暗梯|楼梯|梯级)|(?:地毯|木板).{0,200}(?:掀起|撬开|松动).{0,120}(?:阶梯|入口|通道|窄梯|暗梯|楼梯|向下)|(?:这|那|眼前|似乎).{0,24}(?:隐藏的?通道|秘密通道|暗门|隐蔽入口))/u;
const HIDDEN_PASSAGE_EXPLICIT_SUCCESS = /(?:(?:终于|随即|随后|下方|下面).{0,100}(?:露出|出现|通向|阶梯|入口|通道)|(?:木板|地毯).{0,100}(?:被)?掀起(?:一角)?)/u;

type UnsupportedProgressKind = "written" | "hidden" | "unlock";

function safePrefixBeforeProgress(
  narrative: string,
  pattern: RegExp,
): string {
  const match = narrative.match(pattern);
  if (match?.index == null || match.index < 40) return "";
  const before = narrative.slice(0, match.index);
  const boundary = Math.max(
    before.lastIndexOf("。"),
    before.lastIndexOf("！"),
    before.lastIndexOf("？"),
    before.lastIndexOf("\n"),
  );
  const prefix = before.slice(0, boundary >= 0 ? boundary + 1 : match.index).trim();
  return prefix.length >= 32 ? prefix.slice(0, 320).trim() : "";
}

function buildAuditedSafeProgressNarrative(args: {
  kind: UnsupportedProgressKind;
  originalNarrative: string;
  currentLocation: string;
}): string {
  const scene = /(?:hallway|corridor|走廊)/i.test(args.currentLocation)
    ? "走廊"
    : "当前地点";
  const pattern = args.kind === "written"
    ? DEFINITE_WRITTEN_REVEAL
    : args.kind === "hidden"
      ? DEFINITE_HIDDEN_PASSAGE
      : DEFINITE_UNLOCK;
  const safePrefix = safePrefixBeforeProgress(args.originalNarrative, pattern);
  const safeEnding = args.kind === "written"
    ? `我把眼前的书面记录重新从头核对了一遍。纸页、墨迹和磨损都真实存在，但其中没有足以确认新路线、密码或真相的完整内容；零散字句仍可能有多种解释。我没有把猜测当成答案，只记下它所在的位置和可见特征，随后合上记录，留在${scene}继续观察。灯影沿墙根轻轻晃动，远处的细碎声响时断时续，我准备从已经看见的痕迹和已知路线里选择下一步。`
    : args.kind === "hidden"
      ? `我沿着${scene}的墙面、地板接缝和松动边缘逐寸检查。灰尘被指尖推开，缝隙里只有冷空气和陈旧材料的气味；没有入口真正显露，也没有可供通行的落脚处或暗道。我收回手，确认自己仍站在原处，没有跨进未知空间。灯光贴着墙根扫过，远处的动静隔着结构传来，方向难辨。我放轻呼吸，准备改查可见痕迹、已有物品或确实相连的通路。`
      : `我停在${scene}的门前，手掌压上冰冷的门板。门锁只回了一声沉闷轻响，门缝没有扩大，脚下也没有越过门槛。我收回力道，沿着门框、锁舌和墙边逐一检查，只确认眼前仍是一道关着的门。灯影在墙根轻晃，远处的细碎动静隔着墙面传来，方向难辨；我留在原处，放轻呼吸，准备从可见痕迹、已有物品或已经走过的路线里选择下一步。`;
  const groundedClose = `我又退开半步，让视线越过刚才触碰的位置检查两侧，却不把阴影、回声或气味解释成已经发生的变化。周围仍保持原样，脚下没有出现可确认的新去向，手边也没有多出任何东西。我把注意力重新放回能实际核对的细节：光线落在哪里、声音从哪个方向传来、哪一段路确实走过。下一次行动可以继续观察、询问，或沿熟悉的通路谨慎移动。`;
  return [safePrefix, safeEnding, groundedClose].filter(Boolean).join("\n\n").slice(0, 700);
}

/**
 * Prevent durable plot progress from existing only in prose. The guard never
 * derives a clue, door state, task, or location from narrative; unsupported
 * success claims are reduced to an auditable attempt with no invented delta.
 */
export function applyDurableNarrativeProgressGuard(args: {
  dmRecord: RecordLike;
  latestUserInput?: string;
  clientState?: { playerLocation?: string } | null;
}): RecordLike {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  if (!narrative) return args.dmRecord;

  const unsupportedWrittenReveal = WRITTEN_SOURCE.test(narrative)
    && DEFINITE_WRITTEN_REVEAL.test(narrative)
    && !hasWrittenEvidence(args.dmRecord);
  const forcedDoorTraversalClaim = FORCE_OPEN_ACTION.test(String(args.latestUserInput ?? ""))
    && ENTERED_BEYOND_DOOR.test(narrative);
  const unsupportedUnlock = (DEFINITE_UNLOCK.test(narrative) || forcedDoorTraversalClaim)
    && (!FAILED_OR_ATTEMPTED.test(narrative) || UNLOCK_EXPLICIT_SUCCESS.test(narrative))
    && !hasUnlockEvidence(args.dmRecord, String(args.clientState?.playerLocation ?? ""));
  const unsupportedHiddenPassage = DEFINITE_HIDDEN_PASSAGE.test(narrative)
    && (!FAILED_OR_ATTEMPTED.test(narrative) || HIDDEN_PASSAGE_EXPLICIT_SUCCESS.test(narrative))
    && !hasUnlockEvidence(args.dmRecord, String(args.clientState?.playerLocation ?? ""));
  if (!unsupportedWrittenReveal && !unsupportedUnlock && !unsupportedHiddenPassage) return args.dmRecord;

  const earliestUnsupportedProgress = [
    unsupportedWrittenReveal
      ? { kind: "written" as const, pattern: DEFINITE_WRITTEN_REVEAL, flag: "unsupported_written_clue_progress_downgraded_v1" }
      : null,
    unsupportedUnlock
      ? { kind: "unlock" as const, pattern: DEFINITE_UNLOCK, flag: "unsupported_unlock_progress_downgraded_v1" }
      : null,
    unsupportedHiddenPassage
      ? { kind: "hidden" as const, pattern: DEFINITE_HIDDEN_PASSAGE, flag: "unsupported_hidden_passage_progress_downgraded_v1" }
      : null,
  ]
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ ...entry, index: narrative.search(entry.pattern) }))
    .sort((left, right) => left.index - right.index)[0]!;

  const flags = Array.isArray(args.dmRecord._commit_flags)
    ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const flag = earliestUnsupportedProgress.flag;
  const securityMeta = args.dmRecord.security_meta && typeof args.dmRecord.security_meta === "object" && !Array.isArray(args.dmRecord.security_meta)
    ? args.dmRecord.security_meta as RecordLike
    : {};
  const kind: UnsupportedProgressKind = earliestUnsupportedProgress.kind;

  return {
    ...args.dmRecord,
    narrative: buildAuditedSafeProgressNarrative({
      kind,
      originalNarrative: narrative,
      currentLocation: String(args.clientState?.playerLocation ?? ""),
    }),
    is_action_legal: false,
    consumes_time: false,
    options: [],
    decision_options: [],
    decision_required: false,
    turn_mode: "narrative_only",
    security_meta: {
      ...securityMeta,
      consistency_warning: flag,
    },
    _commit_flags: [...new Set([...flags, flag])],
  };
}
