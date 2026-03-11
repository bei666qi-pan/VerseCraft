/**
 * Diagnose play page client-side errors.
 * Run: npx tsx scripts/diagnose-play-error.ts
 * Optional: DIAG_USER=xxx DIAG_PASS=yyy for login; BASE_URL for server.
 */
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3005";
const DIAG_USER = process.env.DIAG_USER;
const DIAG_PASS = process.env.DIAG_PASS;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const errors: string[] = [];
  const consoleLogs: { type: string; text: string }[] = [];

  context.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    consoleLogs.push({ type, text });
    if (type === "error") errors.push(`[CONSOLE] ${text}`);
  });

  const page = await context.newPage();
  page.on("pageerror", (err) => {
    errors.push(`[PAGE] ${err.message}\n${err.stack ?? ""}`);
  });

  try {
    if (DIAG_USER && DIAG_PASS) {
      console.log("Logging in...");
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.fill('input[name="name"]', DIAG_USER);
      await page.fill('input[name="password"]', DIAG_PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    console.log(`Navigating to ${BASE_URL}/play ...`);
    const res = await page.goto(`${BASE_URL}/play`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    console.log("Status:", res?.status(), "Final URL:", page.url());

    await page.waitForTimeout(5000);

    const bodyText = await page.locator("body").innerText();
    const hasError = bodyText.includes("Application error") || bodyText.includes("client-side exception");
    console.log("Has error overlay:", hasError);
    if (hasError) console.log("Body snippet:", bodyText.slice(0, 600));

    if (errors.length > 0) {
      console.log("\n=== CAPTURED ERRORS ===");
      errors.forEach((e) => console.log(e));
    }
    const errLogs = consoleLogs.filter((c) => c.type === "error");
    if (errLogs.length > 0) {
      console.log("\n=== CONSOLE ERRORS ===");
      errLogs.forEach((c) => console.log(c.text));
    }

    // Exit 1 only on client-side exception overlay; 500/server errors are logged but non-fatal
    process.exit(hasError ? 1 : 0);
  } catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
