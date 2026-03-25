import test from "node:test";
import assert from "node:assert/strict";
import { submitCommentDraft } from "@/app/actions/commentDraft";

test("submitCommentDraft rejects empty", async () => {
  const r = await submitCommentDraft({ text: " " });
  assert.equal(r.ok, false);
});

test("submitCommentDraft accepts normal comment", async () => {
  const r = await submitCommentDraft({ text: "我觉得这个设定很有压迫感，但很有趣。" });
  assert.equal(r.ok, true);
});

