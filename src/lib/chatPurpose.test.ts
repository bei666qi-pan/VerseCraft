import assert from "node:assert/strict";
import test from "node:test";
import {
  getChatRateLimitBucketForHeaders,
  isChatPurposeHeaderConsistent,
  VERSECRAFT_CHAT_PURPOSE_HEADER,
  VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
} from "./chatPurpose";

test("chat purpose: options-only header selects independent rate limit bucket", () => {
  const headers = new Headers({
    [VERSECRAFT_CHAT_PURPOSE_HEADER]: VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
  });

  assert.equal(getChatRateLimitBucketForHeaders(headers), "options_regen_only");
});

test("chat purpose: missing or unknown header stays on the main bucket", () => {
  assert.equal(getChatRateLimitBucketForHeaders(new Headers()), "main");
  assert.equal(getChatRateLimitBucketForHeaders(new Headers({ [VERSECRAFT_CHAT_PURPOSE_HEADER]: "normal" })), "main");
});

test("chat purpose: header cannot claim options-only for a normal turn body", () => {
  const headers = new Headers({
    [VERSECRAFT_CHAT_PURPOSE_HEADER]: VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
  });

  assert.equal(isChatPurposeHeaderConsistent({ headers, clientPurpose: "normal" }), false);
  assert.equal(isChatPurposeHeaderConsistent({ headers, clientPurpose: "options_regen_only" }), true);
  assert.equal(isChatPurposeHeaderConsistent({ headers: new Headers(), clientPurpose: "options_regen_only" }), true);
});
