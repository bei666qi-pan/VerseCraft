import { test } from '@playwright/test';
test('capture console errors and page state', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto('https://versecraft.cn/play', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(12000);
  
  // Check for PlayErrorBoundary
  const errorEl = page.locator('[data-testid="play-error-boundary"]');
  const hasError = (await errorEl.count()) > 0;
  console.log('HAS PLAY ERROR BOUNDARY:', hasError);
  
  if (hasError) {
    const dataError = await errorEl.getAttribute('data-error');
    console.log('DATA-ERROR:', dataError);
    const text = await errorEl.textContent();
    console.log('ERROR TEXT:', text?.slice(0, 500));
  }
  
  // Check for Route error boundary (dark theme)
  const routeError = page.locator('main:has(h1:text("游戏加载出错"))');
  const hasRouteError = (await routeError.count()) > 0;
  console.log('HAS ROUTE ERROR:', hasRouteError);
  if (hasRouteError) {
    const text = await routeError.textContent();
    console.log('ROUTE ERROR TEXT:', text?.slice(0, 500));
  }
  
  // Check for Root error boundary
  const rootError = page.locator('h1:text("页面加载出错"), h1:text("页面版本已更新")');
  const hasRootError = (await rootError.count()) > 0;
  console.log('HAS ROOT ERROR:', hasRootError);
  
  // Console errors
  console.log('CONSOLE ERRORS:', errors.slice(0, 10));
  
  // URL
  console.log('FINAL URL:', page.url());
  
  // Body text visible
  const visible = await page.locator('body').innerText();
  console.log('VISIBLE TEXT (first 500):', visible?.slice(0, 500));
});
