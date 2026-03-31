/**
 * 世界生活流钩子（一期·最小可感知增强）
 * - 只提供“表层生活底噪/协作/避让”的可演出线索，不讲课、不泄底。
 */

export function buildWorldFeelHooks(args: {
  locationId: string;
  safeZone: boolean;
  weaponNeedsMaintenance: boolean;
  hasHotThreat: boolean;
  promiseCount: number;
}): string[] {
  const lines: string[] = [];
  if (args.safeZone) {
    lines.push("安全区不是免费：补给、维修、洗衣、传话都在互相记账。");
  } else {
    lines.push("这栋楼一直在运转：你只是又一个被迫学会规矩的人。");
  }
  if (args.weaponNeedsMaintenance) {
    lines.push("有人在配电间边修边骂：灯要亮，代价就得有人付。");
  }
  if (args.hasHotThreat) {
    lines.push("楼层的节律变紧了：远处的声响不再像偶然。");
  }
  if (args.promiseCount > 0) {
    lines.push("口头约定也算债：欠下的句子会在下一次停电时找你算账。");
  }
  // 克制：最多 3 句
  return lines.slice(0, 3);
}

