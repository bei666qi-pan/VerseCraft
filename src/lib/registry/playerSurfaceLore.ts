/**
 * 叙事表层：适合早期、低揭露层向玩家侧自然流露的短句（非完整真相）。
 * DM 应结合 reveal tier 选用，避免一上来念设定。
 */

export const PLAYER_SURFACE_LORE = {
  arrival:
    "住户们见怪不怪：每到月初，总有穿学生气的人从底下冒出来，慌的慌、冲的冲，像同一道裂口又吐了一批人。水放一夜会变味，告示一式两份还互相打架——新来的先学会别把自己当唯一的主角。",
  b1_safe:
    "地下一层灯管永远嗡嗡响，但这里的人坚持「把这层当家」——坏了就修，脏了就洗。",
  rules_rumor:
    "规则有一半是真的保命，另一半像物业故意漏印一行字；没人说得清哪一半。",
  originium_rumor:
    "原石像硬糖，又像盐块：含一会儿会清醒，但你会更饿，更渴红柱灯下的东西。",
  exit_rumor:
    "有人声称见过地下二层的门，但带回故事的人越来越少声音越来越像在背书。",
} as const;

export type PlayerSurfaceLoreKey = keyof typeof PLAYER_SURFACE_LORE;
