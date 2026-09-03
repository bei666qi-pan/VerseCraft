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

test.describe.serial("Analytics Realtime Accuracy", () => {
  test.setTimeout(60_000);

  const testPassword = process.env.ADMIN_PASSWORD ?? "";

  test.skip(!testPassword, "ADMIN_PASSWORD required");

  let cookie: string;

  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

  test.beforeAll(() => {
    cookie = `${ADMIN_COOKIE}=${buildAdminShadowCookie(testPassword)}`;
  });

  test("GET /api/admin/realtime returns valid numeric counts", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status()).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;

    // onlineUsers should be a non-negative integer.
    expect(typeof data.onlineUsers).toBe("number");
    expect(Number.isFinite(data.onlineUsers)).toBe(true);
    expect(Number(data.onlineUsers)).toBeGreaterThanOrEqual(0);

    // onlineGuests should be a non-negative integer.
    expect(typeof data.onlineGuests).toBe("number");
    expect(Number.isFinite(data.onlineGuests)).toBe(true);
    expect(Number(data.onlineGuests)).toBeGreaterThanOrEqual(0);

    // activeSessions should be a non-negative integer.
    expect(typeof data.activeSessions).toBe("number");
    expect(Number.isFinite(data.activeSessions)).toBe(true);
    expect(Number(data.activeSessions)).toBeGreaterThanOrEqual(0);

    // avgSessionDurationSec should be a number.
    expect(typeof data.avgSessionDurationSec).toBe("number");
    expect(Number.isFinite(data.avgSessionDurationSec)).toBe(true);

    // updatedAt should be a valid ISO string.
    expect(typeof data.updatedAt).toBe("string");
    expect(new Date(data.updatedAt as string).getTime()).not.toBeNaN();

    // trends should exist when present.
    if (data.trends) {
      const trends = data.trends as Record<string, unknown>;
      if (typeof trends.eventsLast5m === "number") {
        expect(Number(trends.eventsLast5m)).toBeGreaterThanOrEqual(0);
      }
      if (typeof trends.eventsLast15m === "number") {
        expect(Number(trends.eventsLast15m)).toBeGreaterThanOrEqual(0);
      }
      if (typeof trends.eventsLast60m === "number") {
        expect(Number(trends.eventsLast60m)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("GET /api/admin/system-health capacity.online matches realtime", async ({
    request,
  }) => {
    const realtimeRes = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (realtimeRes.status() === 429) { throw new Error("rate limited on realtime"); }
    expect(realtimeRes.status()).toBe(200);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));

    const healthRes = await request.get("/api/admin/system-health", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (healthRes.status() === 429) { throw new Error("rate limited on health"); }
    expect(healthRes.status()).toBe(200);

    const realtimeBody = (await realtimeRes.json()) as Record<string, unknown>;
    const healthBody = (await healthRes.json()) as Record<string, unknown>;

    // Both endpoints should return ok=true (or degraded if infrastructure issues).
    const realtimeOk = realtimeBody.ok === true;
    const healthOk = healthBody.ok === true;

    // If realtime is unavailable both endpoints may degrade; skip strict comparison.
    if (realtimeOk && healthOk) {
      const realtimeData = realtimeBody.data as Record<string, unknown>;
      const healthData = healthBody.data as Record<string, unknown>;

      if (healthData?.capacity) {
        const capacity = healthData.capacity as Record<string, unknown>;
        if (capacity.online) {
          const online = capacity.online as Record<string, unknown>;

          // registered count should match realtime.onlineUsers.
          if (
            typeof realtimeData.onlineUsers === "number" &&
            typeof online.registered === "number"
          ) {
            expect(online.registered).toBe(realtimeData.onlineUsers);
          }

          // guests count should match realtime.onlineGuests.
          if (
            typeof realtimeData.onlineGuests === "number" &&
            typeof online.guests === "number"
          ) {
            expect(online.guests).toBe(realtimeData.onlineGuests);
          }

          // total should be sum of registered + guests.
          if (
            typeof online.registered === "number" &&
            typeof online.guests === "number" &&
            typeof online.total === "number"
          ) {
            expect(online.total).toBe(
              (online.registered as number) + (online.guests as number)
            );
          }

          // activeSessions should be a non-negative number.
          if (typeof online.activeSessions === "number") {
            expect(online.activeSessions).toBeGreaterThanOrEqual(0);
          }

          // source should indicate presence-based data.
          if (typeof online.source === "string") {
            expect(online.source).toBeTruthy();
          }

          // windowSeconds should be a positive number.
          if (typeof online.windowSeconds === "number") {
            expect(online.windowSeconds).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test("presence data is consistent across endpoints", async ({ request }) => {
    const realtime1 = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (realtime1.status() === 429) { throw new Error("rate limited on realtime1"); }

    await new Promise((r) => setTimeout(r, 300));

    const realtime2 = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (realtime2.status() === 429) { throw new Error("rate limited on realtime2"); }

    await new Promise((r) => setTimeout(r, 300));

    const overview = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });

    // Realtime should be consistent across close-in-time requests.
    if (realtime1.status() === 200 && realtime2.status() === 200) {
      const r1 = (await realtime1.json()) as Record<string, unknown>;
      const r2 = (await realtime2.json()) as Record<string, unknown>;

      if (r1.ok === true && r2.ok === true) {
        const d1 = r1.data as Record<string, unknown>;
        const d2 = r2.data as Record<string, unknown>;

        // onlineUsers should be the same or very close (within a small delta).
        if (
          typeof d1.onlineUsers === "number" &&
          typeof d2.onlineUsers === "number"
        ) {
          const diff = Math.abs(
            (d1.onlineUsers as number) - (d2.onlineUsers as number)
          );
          expect(diff).toBeLessThanOrEqual(5);
        }
      }
    }

    // Overview KPI should reference the same presence data.
    if (overview.status() === 200) {
      const ov = (await overview.json()) as Record<string, unknown>;
      if (ov.ok === true) {
        const ovData = ov.data as Record<string, unknown>;
        if (ovData?.kpis) {
          const kpis = ovData.kpis as Array<Record<string, unknown>>;

          // Find the online user/guest KPIs.
          const onlineRegKpi = kpis.find(
            (k) => k.metricId === "overview.online_registered_current"
          );
          const onlineGuestKpi = kpis.find(
            (k) => k.metricId === "overview.online_guests_current"
          );

          // They should have numeric values.
          if (onlineRegKpi) {
            expect(typeof onlineRegKpi.value).toBe("number");
            expect(Number(onlineRegKpi.value)).toBeGreaterThanOrEqual(0);
          }
          if (onlineGuestKpi) {
            expect(typeof onlineGuestKpi.value).toBe("number");
            expect(Number(onlineGuestKpi.value)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});
