export type GameTimeLite = { day: number; hour: number };

export function isNightHour(hour: number): boolean {
  const h = Number(hour);
  if (!Number.isFinite(h)) return false;
  // 夜晚：18:00–24:00；本项目 hour 为 0–23，因此判断为 >=18。
  return h >= 18 && h <= 23;
}

export function isEndgameMoment(t: GameTimeLite): boolean {
  return (t?.day ?? 0) === 10 && (t?.hour ?? 0) === 0;
}

export const ENDGAME_ONLY_OPTION = "迎接终焉" as const;

const ENDGAME_LOCAL_TAIL = [
  "",
  "你终于明白：这栋楼不是囚笼，也不是迷宫。",
  "它只是一个把每一次犹豫、每一次侥幸、每一次自我欺骗都照得无处可藏的镜面。",
  "门不会为你打开，规则也不会为你解释；它们只会安静地等待——等待你承认：你已经走到了故事的尽头。",
].join("");

export function ensureMinChars(text: string, minChars: number): string {
  const base = String(text ?? "");
  if (base.length >= minChars) return base;
  const need = Math.max(0, minChars - base.length);
  const pad = (ENDGAME_LOCAL_TAIL.repeat(Math.ceil((need + 1) / Math.max(1, ENDGAME_LOCAL_TAIL.length)))).slice(0, need + 1);
  return base + pad;
}

