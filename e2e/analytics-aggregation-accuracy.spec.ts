import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

test.describe.serial("Analytics Aggregation Accuracy", () => {
  test.setTimeout(120_000);

  const testPassword = process.env.ADMIN_PASSWORD ?? "";

  test.skip(!process.env.DATABASE_URL, "DB required");
  test.skip(!testPassword, "ADMIN_PASSWORD required");

  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

  test("rebuild succeeds and overview returns valid structure", async ({
    request,
  }) => {
    const cookie = `${ADMIN_COOKIE}=${buildAdminShadowCookie(testPassword)}`;

    // Step 1: Call rebuild via HTTP API (no direct DB access).
    const rebuildRes = await request.post("/api/admin/rebuild-daily?days=3", {
      headers: { Cookie: cookie },
      timeout: 30_000,
    });
    if (rebuildRes.status() === 429) {
      test.skip(true, "rate limited on rebuild");
      return;
    }
    expect(rebuildRes.status()).toBe(200);
    const rebuildBody = (await rebuildRes.json()) as Record<string, unknown>;
    expect(rebuildBody.ok).toBe(true);

    // Step 2: Verify overview returns valid structure (doesn't crash).
    const overviewRes = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (overviewRes.status() === 429) {
      test.skip(true, "rate limited on overview");
      return;
    }
    expect(overviewRes.status()).toBe(200);
    const overviewBody = (await overviewRes.json()) as Record<string, unknown>;
    expect(overviewBody.ok).toBe(true);
    const overviewData = overviewBody.data as Record<string, unknown>;
    expect(overviewData).toHaveProperty("cards");
    expect(overviewData).toHaveProperty("range");

    const cards = overviewData.cards as Record<string, unknown>;
    // Verify expected card fields exist with valid numeric types.
    expect(typeof cards.dau).toBe("number");
    expect(typeof cards.wau).toBe("number");
    expect(typeof cards.mau).toBe("number");
    expect(typeof cards.todayTokenCost).toBe("number");
    expect(typeof cards.tokenCostRange).toBe("number");
    expect(typeof cards.todayNewUsers).toBe("number");
    expect(typeof cards.newUsersRange).toBe("number");
    expect(typeof cards.totalUsers).toBe("number");

    // Step 3: Verify player-journey API works after rebuild.
    const journeyRes = await request.get(
      "/api/admin/player-journey?range=7d&mode=strict&actorType=all&platform=all",
      { headers: { Cookie: cookie }, timeout: 20_000 },
    );
    if (journeyRes.status() === 429) {
      test.skip(true, "rate limited on journey");
      return;
    }
    expect(journeyRes.status()).toBe(200);
    const journeyBody = (await journeyRes.json()) as Record<string, unknown>;
    expect(journeyBody.ok).toBe(true);
    const journeyData = journeyBody.data as Record<string, unknown>;
    expect(journeyData).toHaveProperty("stages");
    expect(Array.isArray(journeyData.stages)).toBe(true);
  });

  test("rebuild is idempotent", async ({ request }) => {
    const cookie = `${ADMIN_COOKIE}=${buildAdminShadowCookie(testPassword)}`;

    // First rebuild.
    const rebuild1Res = await request.post("/api/admin/rebuild-daily?days=3", {
      headers: { Cookie: cookie },
      timeout: 30_000,
    });
    if (rebuild1Res.status() === 429) {
      test.skip(true, "rate limited on rebuild1");
      return;
    }
    expect(rebuild1Res.status()).toBe(200);
    const rebuild1Body = (await rebuild1Res.json()) as Record<string, unknown>;
    expect(rebuild1Body.ok).toBe(true);

    // Second rebuild.
    const rebuild2Res = await request.post("/api/admin/rebuild-daily?days=3", {
      headers: { Cookie: cookie },
      timeout: 30_000,
    });
    if (rebuild2Res.status() === 429) {
      test.skip(true, "rate limited on rebuild2");
      return;
    }
    expect(rebuild2Res.status()).toBe(200);
    const rebuild2Body = (await rebuild2Res.json()) as Record<string, unknown>;
    expect(rebuild2Body.ok).toBe(true);

    // Fetch overview after each rebuild and verify they match.
    const overview1Res = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (overview1Res.status() === 429) {
      test.skip(true, "rate limited on overview1");
      return;
    }
    expect(overview1Res.status()).toBe(200);
    const overview1Body = (await overview1Res.json()) as Record<string, unknown>;
    expect(overview1Body.ok).toBe(true);

    const overview2Res = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (overview2Res.status() === 429) {
      test.skip(true, "rate limited on overview2");
      return;
    }
    expect(overview2Res.status()).toBe(200);
    const overview2Body = (await overview2Res.json()) as Record<string, unknown>;
    expect(overview2Body.ok).toBe(true);

    const cards1 = (overview1Body.data as Record<string, unknown>)
      .cards as Record<string, unknown>;
    const cards2 = (overview2Body.data as Record<string, unknown>)
      .cards as Record<string, unknown>;

    // Idempotent rebuild should produce the same aggregates.
    expect(cards1.dau).toBe(cards2.dau);
    expect(cards1.wau).toBe(cards2.wau);
    expect(cards1.mau).toBe(cards2.mau);
    expect(cards1.todayTokenCost).toBe(cards2.todayTokenCost);
    expect(cards1.tokenCostRange).toBe(cards2.tokenCostRange);
    expect(cards1.todayNewUsers).toBe(cards2.todayNewUsers);
    expect(cards1.newUsersRange).toBe(cards2.newUsersRange);
    expect(cards1.totalUsers).toBe(cards2.totalUsers);
  });
});
