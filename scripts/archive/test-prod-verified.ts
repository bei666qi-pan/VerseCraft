/**
 * 生产环境验证测试 - 使用正确的 data-testid 选择器走完整 intro→create→play 流程
 * 验证 AI 叙事质量、选项生成、导演系统
 */
import { chromium } from "playwright";

const BASE = "https://versecraft.cn";

// 安装 fetch 拦截来捕获 SSE 响应体
const FETCH_INTERCEPTOR = `
window.__capturedSse = [];
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const resp = await origFetch.apply(this, args);
  const url = typeof args[0] === "string" ? args[0] : args[0].url;
  if (url.includes("/api/chat")) {
    const clone = resp.clone();
    clone.text().then(body => {
      window.__capturedSse.push({ url, status: resp.status, body, time: Date.now() });
    }).catch(() => {});
  }
  return resp;
};
`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 注入 fetch 拦截器
  await page.addInitScript(FETCH_INTERCEPTOR);

  // ── Phase 1: Intro ──
  console.log("=== 生产环境真实 AI 游玩验证 ===\n");
  console.log("▶ Phase 1: Intro 页面");

  const introResp = await page.goto(BASE + "/intro", { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(`   HTTP ${introResp?.status()}`);

  // 等待 intro-start-create 按钮
  try {
    const startBtn = page.getByTestId("intro-start-create");
    await startBtn.waitFor({ state: "visible", timeout: 60000 });
    console.log("   ✅ intro-start-create 可见");

    // 检查 intro 叙事
    const introNarrative = await page.evaluate(() => {
      const main = document.querySelector("main, [data-testid='intro-narrative']");
      return main?.textContent?.substring(0, 400) ?? document.body.innerText.substring(0, 400);
    });
    console.log(`   叙事预览: ${introNarrative?.substring(0, 200) ?? "N/A"}...`);

    await startBtn.click();
    console.log("   点击开始 → /create");
  } catch (e: any) {
    console.log(`   ⚠️ intro-start-create 未出现: ${e.message}`);
  }

  // ── Phase 2: Create ──
  console.log("\n▶ Phase 2: Create 页面");
  try {
    await page.waitForURL(/\/create/, { timeout: 30000 });
    console.log(`   URL: ${page.url()}`);

    // quick-create-character
    const quickCreate = page.getByTestId("quick-create-character");
    await quickCreate.waitFor({ state: "visible", timeout: 30000 });
    console.log("   ✅ quick-create-character 可见");
    await quickCreate.click();

    // create-submit-button
    const submit = page.getByTestId("create-submit-button");
    await submit.waitFor({ state: "visible", timeout: 10000 });
    console.log("   ✅ create-submit-button 可见");
    await submit.click();

    await page.waitForURL(/\/play/, { timeout: 60000 });
    console.log(`   → /play: ${page.url()}`);
  } catch (e: any) {
    console.log(`   ⚠️ Create 流程失败: ${e.message}`);
  }

  // ── Phase 3: Play ──
  console.log("\n▶ Phase 3: Play 页面");
  try {
    // 等待手动输入框可用
    const input = page.getByTestId("manual-action-input");
    await input.waitFor({ state: "visible", timeout: 60000 });

    // 等待没有进行中的 chat 请求
    await page.waitForTimeout(5000);

    // 检查初始选项
    const initOptions = await page.getByTestId("mobile-option-item").all();
    console.log(`   初始选项: ${initOptions.length} 个`);
    for (let i = 0; i < Math.min(initOptions.length, 5); i++) {
      console.log(`     ${i + 1}. ${await initOptions[i].textContent()}`);
    }

    // 检查初始叙事
    const initNarrative = await page.evaluate(() => {
      const main = document.querySelector("main, [data-testid='narrative-container']");
      return main?.textContent?.substring(0, 400) ?? "N/A";
    });
    console.log(`   初始叙事: ${initNarrative?.substring(0, 200) ?? "N/A"}...`);

    // ── Phase 4: 发送行动 ──
    console.log("\n▶ Phase 4: 发送行动");

    const action = "我环顾四周，仔细观察周围的环境和细节。";
    await input.fill(action);
    console.log(`   输入: ${action}`);

    const sendBtn = page.getByTestId("send-action-button");
    await sendBtn.click();
    console.log("   点击发送，等待 AI 响应...");

    // 等待响应 (通过检查 SSE 捕获或 UI 更新)
    await page.waitForTimeout(30000);

    // 检查捕获的 SSE
    const captured = await page.evaluate(() => (window as any).__capturedSse || []);
    console.log(`   捕获 SSE 响应: ${captured.length} 个`);

    for (let i = 0; i < captured.length; i++) {
      const cap = captured[i];
      const body = cap.body as string;
      const lines = body.split("\n");
      const finalLine = lines.find((l: string) => l.startsWith("data: __VERSECRAFT_FINAL__:"));

      if (finalLine) {
        const jsonStr = finalLine.replace("data: __VERSECRAFT_FINAL__:", "").trim();
        let dm: any = null;
        try { dm = JSON.parse(jsonStr); } catch(e) {}

        if (dm) {
          const narrative = dm.narrative ?? "";
          const degraded = narrative.includes("暂时无法完成");
          console.log(`\n   === DM 回合结果 ===`);
          console.log(`   is_action_legal: ${dm.is_action_legal}`);
          console.log(`   sanity_damage: ${dm.sanity_damage}`);
          console.log(`   叙事 (${narrative.length} 字符): ${degraded ? "⚠️ 降级" : "✅ 真实AI"}`);
          console.log(`   ${narrative.substring(0, 300)}`);

          const options = dm.current_options ?? dm.options ?? [];
          console.log(`   选项 (${options.length} 个):`);
          options.forEach((o: string, j: number) => console.log(`     ${j + 1}. ${o}`));
        }
      }
    }

    // 检查 UI 更新后的选项
    await page.waitForTimeout(3000);
    const finalOptions = await page.getByTestId("mobile-option-item").all();
    console.log(`\n   UI 最终选项: ${finalOptions.length} 个`);
  } catch (e: any) {
    console.log(`   ⚠️ Play 流程失败: ${e.message}`);
  }

  console.log(`\n📊 页面错误: ${errors.length > 0 ? errors.join("; ") : "无"}`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
