/**
 * Immediate, non-authoritative prose shown while the Writer is starting.
 *
 * It may describe only the player's attempt. World facts and outcomes remain
 * the responsibility of the generated candidate and the unique Finalizer.
 */
export function buildTurnNarrativePrelude(userInput: string, _worldId: string): string {
  const input = userInput.trim();

  if (/环顾|观察|查看|打量|确认|留意|寻找|检查/u.test(input)) {
    return "你放慢动作，让目光从近处逐一掠过，开始确认眼前实际存在的人与物。";
  }
  if (/询问|打听|交谈|开口|说|问/u.test(input)) {
    return "你朝眼前的人开口，把问题清楚地询问出来，等着对方回应。";
  }
  if (/前进|走|探索|靠近|进入|离开|沿着/u.test(input)) {
    return "你迈开脚步，沿眼前可通行的位置谨慎前进，同时留意近处的变化。";
  }
  if (/整理|回顾|回想|梳理|区分/u.test(input)) {
    return "你停下脚步，把亲眼所见、听来的消息与自己的推测逐条分开。";
  }

  return "你开始执行刚才的行动，先观察眼前最直接的反馈。";
}

/** Partial JSON uses the existing candidate-preview protocol. */
export function buildTurnNarrativePreludeFrame(prelude: string): string {
  const encoded = JSON.stringify(prelude);
  return `{"narrative":${encoded.slice(0, -1)}`;
}
