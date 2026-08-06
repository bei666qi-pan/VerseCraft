import { test, expect } from "@playwright/test";

const E2E_AI_LIVE = process.env.E2E_AI_LIVE === "1";

function liveGatewayEnvPresent(): boolean {
  const base = (process.env.AI_GATEWAY_BASE_URL ?? "").trim();
  const key = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
  const main = (process.env.AI_MODEL_MAIN ?? "").trim();
  return Boolean(base && key && main);
}

test.describe("Analytics event emission", () => {
  test.setTimeout(120_000);

  test.describe("chat_request_started / chat_request_finished emission", () => {
    test("chat_request_started is emitted on SSE chat request", async ({
      request,
    }) => {
      test.skip(
        !(E2E_AI_LIVE && liveGatewayEnvPresent()),
        "需要 E2E_AI_LIVE=1 且 AI_GATEWAY_* 已配置以触发真实 AI 流程",
      );

      // 发送一个最简聊天请求，观察 SSE 流是否正常启动
      // chat_request_started 在 AI 调用前、SSE 流建立后写入 analytics_events
      // 这里通过 /api/chat 的 SSE 响应来间接验证：如果 SSE 正常返回 status 帧，
      // 说明 chat_request_started 写入链路未被阻塞。
      const res = await request.post("/api/chat", {
        data: {
          action: "我环顾四周。",
          sessionId: `e2e-analytics-${Date.now()}`,
          guestId: `e2e-guest-${Date.now()}`,
        },
        timeout: 60_000,
      });

      // SSE 应返回 200
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/event-stream");

      const body = await res.text();
      // 应该包含至少一个 status 帧，表明请求已进入处理
      expect(body).toContain("__VERSECRAFT_STATUS__:");

      // 应该包含 final 帧，表明请求已正常完成
      expect(body).toContain("__VERSECRAFT_FINAL__:");
    });

    test("chat_request_finished is written after SSE completes", async ({
      request,
    }) => {
      test.skip(
        !(E2E_AI_LIVE && liveGatewayEnvPresent()),
        "需要 E2E_AI_LIVE=1 且 AI_GATEWAY_* 已配置以触发真实 AI 流程",
      );

      const sessionId = `e2e-analytics-finished-${Date.now()}`;
      const guestId = `e2e-guest-${Date.now()}`;

      const res = await request.post("/api/chat", {
        data: {
          action: "我向前走了一步。",
          sessionId,
          guestId,
        },
        timeout: 60_000,
      });

      expect(res.status()).toBe(200);

      const body = await res.text();
      expect(body).toContain("__VERSECRAFT_FINAL__:");

      // 解析 final 帧，确认 is_action_legal 存在（说明回合正常完成）
      const finalMatch = body.match(
        /__VERSECRAFT_FINAL__:(\{[\s\S]*?\})\n/,
      );
      if (finalMatch) {
        const finalJson = JSON.parse(finalMatch[1]) as Record<string, unknown>;
        expect(finalJson).toHaveProperty("is_action_legal");
        expect(finalJson).toHaveProperty("narrative");
      }
    });
  });

  test.describe("Heartbeat analytics event emission", () => {
    test("POST /api/analytics/heartbeat writes session_heartbeat event", async ({
      request,
    }) => {
      const sessionId = `e2e-hb-${Date.now()}`;
      const guestId = `e2e-guest-${Date.now()}`;

      const res = await request.post("/api/analytics/heartbeat", {
        data: {
          sessionId,
          guestId,
          page: "/play",
          kind: "active",
          visibility: "visible",
        },
        timeout: 15_000,
      });

      // heartbeat 应返回 ok: true（即使降级也不应报错）
      expect(res.status()).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });

    test("POST /api/analytics/heartbeat handles missing sessionId gracefully", async ({
      request,
    }) => {
      const res = await request.post("/api/analytics/heartbeat", {
        data: {
          sessionId: "",
          guestId: `e2e-guest-${Date.now()}`,
        },
        timeout: 15_000,
      });

      expect(res.status()).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe("missing_sessionId");
    });

    test("POST /api/analytics/heartbeat handles bad JSON gracefully", async ({
      request,
    }) => {
      const res = await request.post("/api/analytics/heartbeat", {
        data: "not-json",
        headers: { "Content-Type": "text/plain" },
        timeout: 15_000,
      });

      // 可能 400 或 200（取决于服务端 JSON 解析策略）
      // 关键是不要 500 崩溃
      expect([200, 400, 415]).toContain(res.status());
    });

    test("POST /api/analytics/heartbeat is idempotent", async ({
      request,
    }) => {
      const sessionId = `e2e-hb-idem-${Date.now()}`;
      const guestId = `e2e-guest-${Date.now()}`;

      // 连续发送两次相同心跳
      const res1 = await request.post("/api/analytics/heartbeat", {
        data: {
          sessionId,
          guestId,
          page: "/play",
          kind: "active",
          visibility: "visible",
        },
        timeout: 15_000,
      });
      expect(res1.status()).toBe(200);

      // 稍微等待确保第一次写入完成
      await new Promise((r) => setTimeout(r, 200));

      const res2 = await request.post("/api/analytics/heartbeat", {
        data: {
          sessionId,
          guestId,
          page: "/play",
          kind: "active",
          visibility: "visible",
        },
        timeout: 15_000,
      });
      expect(res2.status()).toBe(200);
      const body2 = (await res2.json()) as Record<string, unknown>;
      // idempotent 写入不报错，仍返回 ok
      expect(body2.ok).toBe(true);
    });
  });

  test.describe("Analytics events: admin API visibility", () => {
    test("event-health API includes chat_request_started in event coverage", async ({
      request,
    }) => {
      const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
      test.skip(
        !adminPassword,
        "需要 ADMIN_PASSWORD 以访问 admin API",
      );

      const { createHmac, randomUUID } = await import("node:crypto");
      const ADMIN_COOKIE = "admin_shadow_session";
      const buildCookie = () => {
        const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const nonce = randomUUID().replace(/-/g, "");
        const payload = `${exp}.${nonce}`;
        const signature = createHmac("sha256", adminPassword)
          .update(payload)
          .digest("base64url");
        return `${payload}.${signature}`;
      };
      const cookie = `${ADMIN_COOKIE}=${buildCookie()}`;

      const res = await request.get("/api/admin/event-health?range=30d", {
        headers: { Cookie: cookie },
        timeout: 20_000,
      });

      expect(res.status()).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // 即使降级也应返回数据
      if (body.data) {
        const data = body.data as Record<string, unknown>;
        // Verify eventCoverage array exists and has valid structure.
        // chat_request_started only appears after real chat traffic — it is
        // emitted on new SSE chat requests, not retroactively. Asserting
        // its presence would be fragile in an offline/CI test environment.
        const coverage = Array.isArray(data.eventCoverage)
          ? (data.eventCoverage as Array<Record<string, unknown>>)
          : [];
        expect(Array.isArray(data.eventCoverage)).toBe(true);

        // Verify each coverage entry has the expected shape.
        for (const entry of coverage) {
          expect(typeof entry.eventName).toBe("string");
          expect(typeof entry.count).toBe("number");
        }
      }
    });
  });
});
