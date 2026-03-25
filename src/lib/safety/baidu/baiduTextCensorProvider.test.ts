import test from "node:test";
import assert from "node:assert/strict";
import { BaiduSinanTextProvider } from "@/lib/safety/baidu/baiduTextCensorProvider";
import type { BaiduSinanConfig } from "@/lib/safety/baidu/env";

function makeResponse(jsonData: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => jsonData,
  } as unknown as Response;
}

function buildCfg(overrides?: Partial<BaiduSinanConfig>): BaiduSinanConfig {
  return {
    enabled: true,
    provider: "baidu_text_censor",
    apiKey: "ak",
    secretKey: "sk",
    authMode: "oauth_access_token",
    tokenUrl: "https://aip.baidubce.com/oauth/2.0/token",
    textCensorUrl: "https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined",
    timeoutMs: 2500,
    connectTimeoutMs: 1200,
    inputEnabled: true,
    outputEnabled: true,
    publicContentEnabled: true,
    failModePrivate: "fail_soft",
    failModePublic: "fail_closed",
    logRawText: false,
    hashSalt: "salt",
    strictnessProfile: "balanced",
    ...(overrides ?? {}),
  };
}

test("conclusionType=1 => allow", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(makeResponse({ conclusionType: 1, conclusion: "合规" }));
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg(), { fetchImpl });
  const r = await provider.moderateText({ text: "hello", scene: "chat", stage: "input" });

  assert.equal(r.decision, "allow");
  assert.equal(r.riskLevel, "normal");
  assert.deepEqual(r.categories, ["none"]);
  assert.equal(r.reasonCode, "baidu_conclusion_allow");
});

test("conclusionType=2 => block (category mapping)", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(
        makeResponse({
          conclusionType: 2,
          conclusion: "不合规",
          data: [
            { type: 33, subType: 0, conclusionType: 2, msg: "存在色情内容", hits: [{ datasetName: "x", probability: 1.0 }] },
          ],
        })
      );
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg(), { fetchImpl });
  const r = await provider.moderateText({ text: "xxx", scene: "chat", stage: "output" });

  assert.equal(r.decision, "block");
  assert.equal(r.riskLevel, "black");
  assert.ok(r.categories.includes("sexual"), `categories=${r.categories.join(",")}`);
});

test("conclusionType=3 => review", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(makeResponse({ conclusionType: 3, conclusion: "疑似" }));
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg(), { fetchImpl });
  const r = await provider.moderateText({ text: "maybe", scene: "chat", stage: "input" });
  assert.equal(r.decision, "review");
  assert.equal(r.riskLevel, "gray");
});

test("conclusionType=4 => stage input uses fail_soft => allow", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(makeResponse({ conclusionType: 4, conclusion: "审核失败", error_msg: "x" }));
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg({ failModePrivate: "fail_soft", failModePublic: "fail_closed" }), { fetchImpl });
  const r = await provider.moderateText({ text: "any", scene: "chat", stage: "input" });
  assert.equal(r.decision, "allow");
  assert.equal(r.reasonCode, "baidu_audit_failed_fail_soft");
});

test("conclusionType=4 => stage public uses fail_closed => block", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(makeResponse({ conclusionType: 4, conclusion: "审核失败", error_msg: "x" }));
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg({ failModePrivate: "fail_soft", failModePublic: "fail_closed" }), { fetchImpl });
  const r = await provider.moderateText({ text: "any", scene: "public", stage: "public" });
  assert.equal(r.decision, "block");
  assert.equal(r.reasonCode, "baidu_audit_failed_fail_closed");
});

test("response missing conclusionType => structure error respects fail mode", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      return Promise.resolve(makeResponse({ access_token: "t", expires_in: 3600 }));
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      return Promise.resolve(makeResponse({ conclusion: "合规" }));
    }
    throw new Error("unexpected_url");
  };

  const provider = new BaiduSinanTextProvider(buildCfg({ failModePublic: "fail_closed" }), { fetchImpl });
  const r = await provider.moderateText({ text: "any", scene: "public", stage: "public" });
  assert.equal(r.decision, "block");
  assert.equal(r.reasonCode, "baidu_response_structure_error");
});

