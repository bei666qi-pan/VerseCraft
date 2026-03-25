import test from "node:test";
import assert from "node:assert/strict";
import { submitPublicPublishDraft } from "@/app/actions/publicPublish";

test("submitPublicPublishDraft rejects empty", async () => {
  const r = await submitPublicPublishDraft({ text: "   " });
  assert.equal(r.ok, false);
});

test("submitPublicPublishDraft accepts normal text", async () => {
  const r = await submitPublicPublishDraft({ text: "一段正常的公开内容。" });
  assert.equal(r.ok, true);
});

