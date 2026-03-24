export const GENDER_OPTIONS = ["男", "女"] as const;
export type GenderOption = (typeof GENDER_OPTIONS)[number];

