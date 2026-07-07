/**
 * SAFE_FALLBACK_NARRATIVE — narrative 全链路人名白名单的兜底文案
 *
 * 用途：当 route.ts final guard 检测到 narrative 残留未注册人名时，
 * 用此文案替换。特点：
 * - 无任何具体人名
 * - 不含世界观真相词（龙/七锚/校源/辅锚/学制/职业链/暗月/相位）
 * - 不含 NPC 私事、情报、任务
 * - 不承诺剧情方向，留给玩家下一步自由输入
 */
export const SAFE_FALLBACK_NARRATIVE =
  "你停下脚步，环顾四周。空气里有种说不清的安静，像有人在看着你，又像是错觉。你决定先做下一步。" as const;