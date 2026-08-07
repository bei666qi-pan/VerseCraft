import { test } from '@playwright/test';
test('final play page check', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto('https://versecraft.cn/play', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(12000);
  
  const errorEl = page.locator('[data-testid="play-error-boundary"]');
  const hasPlayError = (await errorEl.count()) > 0;
  const routeError = page.locator('h1:text("游戏加载出错")');
  const hasRouteError = (await routeError.count()) > 0;
  
  console.log('FINAL URL:', page.url());
  console.log('PLAY ERROR BOUNDARY:', hasPlayError);
  console.log('ROUTE ERROR:', hasRouteError);
  console.log('PAGE ERRORS:', errors.slice(0, 5));
  
  if (page.url().includes('/create')) {
    console.log('OK - redirected to /create (no active game)');
  } else if (page.url().includes('/play') && !hasPlayError && !hasRouteError) {
    console.log('OK - play page loaded without errors');
  } else {
    console.log('UNEXPECTED STATE');
  }
});
