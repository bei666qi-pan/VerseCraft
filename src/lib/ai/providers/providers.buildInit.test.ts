import test from "node:test";
import assert from "node:assert/strict";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";

test("openaiCompatibleGateway sets Authorization and json_object when requested", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "vc-main-upstream",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    maxTokens: 10,
    responseFormatJsonObject: true,
    streamIncludeUsage: false,
  });
  assert.equal(init.method, "POST");
  const body = JSON.parse(String(init.body)) as { model: string; response_format?: { type: string } };
  assert.equal(body.model, "vc-main-upstream");
  assert.equal(body.response_format?.type, "json_object");
});

test("openaiCompatibleGateway enables stream_options when streaming", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "m",
    messages: [{ role: "user", content: "x" }],
    stream: true,
    maxTokens: 8,
    responseFormatJsonObject: false,
    streamIncludeUsage: true,
  });
  const body = JSON.parse(String(init.body)) as { stream_options?: { include_usage: boolean } };
  assert.equal(body.stream_options?.include_usage, true);
});

test("openaiCompatibleGateway shallow-merges extraBody without overriding reserved keys", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "m",
    messages: [{ role: "user", content: "x" }],
    stream: false,
    maxTokens: 8,
    extraBody: {
      user: "versecraft-test",
      model: "evil-override",
      messages: [{ role: "system", content: "nope" }],
    },
  });
  const body = JSON.parse(String(init.body)) as {
    model: string;
    messages: unknown[];
    user?: string;
  };
  assert.equal(body.model, "m");
  assert.equal(body.messages.length, 1);
  assert.equal(body.user, "versecraft-test");
});
