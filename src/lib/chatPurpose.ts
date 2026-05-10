export const VERSECRAFT_CHAT_PURPOSE_HEADER = "X-VerseCraft-Chat-Purpose";
export const VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY = "options_regen_only";

export type VerseCraftChatPurpose = typeof VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY;
export type ChatRateLimitBucket = "main" | "options_regen_only";

export function normalizeVerseCraftChatPurpose(value: unknown): VerseCraftChatPurpose | null {
  return value === VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY ? VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY : null;
}

export function readVerseCraftChatPurpose(headers: Pick<Headers, "get">): VerseCraftChatPurpose | null {
  return normalizeVerseCraftChatPurpose(headers.get(VERSECRAFT_CHAT_PURPOSE_HEADER));
}

export function getChatRateLimitBucketForHeaders(headers: Pick<Headers, "get">): ChatRateLimitBucket {
  return readVerseCraftChatPurpose(headers) === VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY
    ? "options_regen_only"
    : "main";
}

export function isChatPurposeHeaderConsistent(args: {
  headers: Pick<Headers, "get">;
  clientPurpose: "normal" | "options_regen_only";
}): boolean {
  const headerPurpose = readVerseCraftChatPurpose(args.headers);
  return headerPurpose === null || headerPurpose === args.clientPurpose;
}
