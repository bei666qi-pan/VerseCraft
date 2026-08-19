type RecordLike = Record<string, unknown>;

function floorTokens(text: string): Set<string> {
  return new Set(text.match(/(?:B[12]|[1-7]F|[一二三四五六七](?:楼|层))/gi)?.map((x) => x.toUpperCase()) ?? []);
}

/** Normalise floor token to canonical digit form: "3F", "B1", etc. */
function normaliseFloor(token: string): string {
  const s = token.toUpperCase();
  if (/^(?:B[12]|[1-7])F$/.test(s)) return s;
  const CN: Record<string, string> = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7' };
  const m = s.match(/^([一二三四五六七])(?:楼|层)$/);
  if (m) return `${CN[m[1]!] ?? m[1]}F`;
  return s;
}

/** Extract floor from a full location id like "3F_Hallway" or "B1_PowerRoom". */
function floorFromLocation(loc: string): string {
  if (!loc) return "";
  const parts = loc.split("_");
  const first = parts[0] ?? "";
  return /^(?:B[12]|)\d*F?$/.test(first) ? first.replace(/(\d)F?$/, "$1F") : "";
}

function claimsCompletedCrossFloorTravel(text: string): boolean {
  const crossFloor = /(?:上楼|下楼|爬楼|下到|上到|继续(?:往)?[上下]|往[上下](?:走|冲|跑)|冲下楼梯|跑下楼梯|走下楼梯|踏上楼梯)/.test(text);
  if (!crossFloor) return false;
  const explicitlyBlocked = /(?:没能|未能|无法|不能|被.{0,12}(?:拦|挡|堵|锁)|(?:却|但|可是).{0,18}(?:停|退|回|拦|挡|堵|锁)|仍(?:然)?(?:留|停|站)在|正要|试图|尝试)/.test(text);
  return !explicitlyBlocked;
}

function claimsCompletedAreaTransition(text: string): boolean {
  const completed = /(?:跨过|跨进|迈过|迈进|踏进|踏入|走进|进入|穿过).{0,16}(?:门槛|门内|门后|房间|楼梯间|大厅|大堂|平台)|(?:走进|进入|踏入|来到|抵达).{0,16}(?:另一|新的|陌生的|更狭窄的).{0,10}(?:走廊|通道|区域|空间)|(?:门在身后|身后的门).{0,16}(?:合拢|关上|关闭)/u.test(text);
  if (!completed) return false;
  const explicitlyBlocked = /(?:没能|未能|无法|不能|被.{0,12}(?:拦|挡|堵|锁)|(?:却|但|可是).{0,18}(?:停|退|回|拦|挡|堵|锁)|仍(?:然)?(?:留|停|站)在|正要|试图|尝试)/u.test(text);
  return !explicitlyBlocked;
}

function readableLocation(location: string): string {
  if (!location || location === "原地") return "原处";
  return location
    .replace(/^B(\d+)_/i, "地下$1层")
    .replace(/^(\d+)F_/i, "$1F")
    .replace(/_/g, "")
    .replace(/Hallway/gi, "走廊")
    .replace(/Corridor/gi, "走廊")
    .replace(/Stairwell/gi, "楼梯间")
    .replace(/Lobby/gi, "大厅")
    .replace(/Room/gi, "房间");
}

function safeNarrativePrefix(narrative: string, floorConflict = false): string {
  const transitionPatterns = [
    /(?:上楼|下楼|爬楼|下到|上到|继续(?:往)?[上下]|往[上下](?:走|冲|跑)|冲下楼梯|跑下楼梯|走下楼梯|踏上楼梯)/u,
    /(?:跨过|跨进|迈过|迈进|踏进|踏入|走进|进入|穿过).{0,16}(?:门槛|门内|门后|房间|楼梯间|大厅|大堂|平台)/u,
    /(?:走进|进入|踏入|来到|抵达).{0,16}(?:另一|新的|陌生的|更狭窄的).{0,10}(?:走廊|通道|区域|空间)/u,
    /(?:门在身后|身后的门).{0,16}(?:合拢|关上|关闭)/u,
  ];
  if (floorConflict) transitionPatterns.push(/(?:B[12]|[1-7]F|[一二三四五六七](?:楼|层))/iu);
  const unsafeIndex = transitionPatterns.reduce((earliest, pattern) => {
    const index = narrative.search(pattern);
    return index >= 0 && (earliest < 0 || index < earliest) ? index : earliest;
  }, -1);
  if (unsafeIndex < 0) return "";
  const sentenceStart = Math.max(
    narrative.lastIndexOf("。", unsafeIndex - 1),
    narrative.lastIndexOf("！", unsafeIndex - 1),
    narrative.lastIndexOf("？", unsafeIndex - 1),
    narrative.lastIndexOf("\n", unsafeIndex - 1),
  ) + 1;
  return narrative.slice(0, sentenceStart).trim();
}

function blockedMovementNarrative(args: {
  narrative: string;
  location: string;
  floorConflict: boolean;
}): string {
  const prefix = safeNarrativePrefix(args.narrative, args.floorConflict);
  const lead = prefix ? `${prefix}\n\n` : "";
  return `${lead}我收住脚步，仍留在${readableLocation(args.location)}。刚才的尝试没有把我带进新的房间、走廊或楼层；我重新确认脚下的位置和来路，把注意力放回眼前能够触及的范围。周围仍有细节可供观察，但在找到确实可行的通路前，我不会把尚未发生的移动当成结果。`;
}

/**
 * Blocks prose-only cross-floor travel when no authoritative location delta
 * survived. Narrative may be inspected for contradiction, but never converted
 * into player_location.
 */
export function applyLocationNarrativeConsistencyGuard(args: {
  dmRecord: RecordLike;
  clientState?: { playerLocation?: string } | null;
}): RecordLike {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  if (!narrative) return args.dmRecord;
  const currentLoc = String(args.clientState?.playerLocation ?? "");
  const resolvedLoc = typeof args.dmRecord.player_location === "string"
    ? args.dmRecord.player_location.trim()
    : "";
  const currentFloorNorm = normaliseFloor(floorFromLocation(currentLoc));
  const resolvedFloorNorm = normaliseFloor(floorFromLocation(resolvedLoc));
  const narrativeFloorNorms = new Set([...floorTokens(narrative)].map(normaliseFloor));
  if (resolvedLoc && (!currentLoc || resolvedLoc !== currentLoc)) {
    const allowedTransitionFloors = new Set([currentFloorNorm, resolvedFloorNorm].filter(Boolean));
    const claimsArrivalAtNamedFloor = /(?:抵达|到达|来到|进入|走到|站在|踏入)/.test(narrative);
    const contradictsResolvedTransition = narrativeFloorNorms.size > 0 && (
      [...narrativeFloorNorms].some((floor) => !allowedTransitionFloors.has(floor)) ||
      (claimsArrivalAtNamedFloor && Boolean(resolvedFloorNorm) && !narrativeFloorNorms.has(resolvedFloorNorm))
    );
    if (!contradictsResolvedTransition) return args.dmRecord;
    const flags = Array.isArray(args.dmRecord._commit_flags)
      ? args.dmRecord._commit_flags.filter((f): f is string => typeof f === "string")
      : [];
    return {
      ...args.dmRecord,
      narrative: `我沿相连的通路继续前进，抵达${readableLocation(resolvedLoc)}。脚步在这里停下，我先确认身边能够看清的细节，再决定下一步往哪里走。`,
      _commit_flags: [...new Set([...flags, "narrative_location_conflict_repaired_v1"])],
    };
  }
  const travel = /(?:上楼|下楼|爬楼|下到|上到|上去|下来|穿过|继续下|走进|踏入|来到|站在|走去|走向|踏上|往上|往下|往上走|往下走)/.test(narrative);
  const completedCrossFloorTravel = claimsCompletedCrossFloorTravel(narrative);
  const completedAreaTransition = claimsCompletedAreaTransition(narrative);
  // Also detect floor change when narrative mentions a floor token that normalises
  // to a different floor than the current location.
  const hasFloorChange = travel || (
    narrativeFloorNorms.size > 0  &&
    currentFloorNorm &&
    !narrativeFloorNorms.has(currentFloorNorm)
  );
  if (!hasFloorChange && !completedAreaTransition) return args.dmRecord;

  const contradictsCurrentFloor = narrativeFloorNorms.size > 0
    && currentFloorNorm.length > 0
    && (!narrativeFloorNorms.has(currentFloorNorm) || narrativeFloorNorms.size > 1);
  if (completedCrossFloorTravel || completedAreaTransition || contradictsCurrentFloor || (travel && narrativeFloorNorms.size > 1)) {
    const flags = Array.isArray(args.dmRecord._commit_flags)
      ? args.dmRecord._commit_flags.filter((f): f is string => typeof f === "string")
      : [];
    const loc = args.clientState?.playerLocation ?? "原地";
    return {
      ...args.dmRecord,
      is_action_legal: false,
      consumes_time: false,
      narrative: blockedMovementNarrative({
        narrative,
        location: loc,
        floorConflict: contradictsCurrentFloor,
      }),
      _commit_flags: [...new Set([...flags, completedAreaTransition
        ? "prose_only_area_transition_blocked_v1"
        : "prose_only_cross_floor_travel_blocked_v2"])],
    };
  }

  return args.dmRecord;
}
