import { test } from '@playwright/test';
test('reproduce play error with active game state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  
  // Go to a simple page first to set up storage
  await page.goto('https://versecraft.cn', { timeout: 15000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Inject game state directly into idb-keyval's default database
  await page.evaluate(async () => {
    const DB_KEY = 'versecraft-storage';
    const state = {
      isGameStarted: true,
      isHydrated: false,
      playerName: '测试玩家',
      gender: '男',
      stats: { sanity: 50, agility: 5, luck: 5, charm: 5, origin: 5 },
      historicalMaxSanity: 50,
      talent: '时间回溯',
      talentCooldowns: {},
      inventory: [],
      logs: [{ role: 'user', content: '测试行动' }, { role: 'assistant', content: '测试叙述' }],
      currentOptions: ['继续探索', '查看四周'],
      time: { day: 1, hour: 0 },
      playerLocation: 'B1_SafeZone',
      dialogueCount: 1,
      isGuest: true,
      guestId: 'test-guest-id',
      codex: {},
      viewedCodexIds: {},
      tasks: [],
      currentSaveSlot: 'main_slot',
      saveSlots: {},
      storageMode: 'normal',
      volume: 50,
      language: 'zh-CN',
      readingPreferences: {},
      chapterState: {
        activeChapterId: 'chapter-1',
        reviewChapterId: null,
        pendingChapterEndId: null,
        unlockedChapterIds: ['chapter-1'],
        completedChapterIds: [],
        progressByChapterId: { 'chapter-1': { turnCount: 1, totalChars: 200, keyChoices: 1, lastTurnAt: Date.now() } },
        summariesByChapterId: {},
      },
      endingState: null,
      professionState: null,
      hasMetProfessionCertifier: false,
      originium: 0,
      currentBgm: 'bgm_b1_daily',
      dynamicNpcStates: {},
      mainThreatByFloor: {},
      memorySpine: null,
      escapeMainline: null,
      activeMenu: null,
      _taskUnviewedCount: 0,
      _taskPanelFirstOpen: true,
      pendingHourProgress: 0,
      inputMode: 'options',
      recentOptions: [],
      pendingClientAction: null,
    };
    
    const payload = JSON.stringify({ state, version: 0 });
    
    return new Promise((resolve) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          store.put(payload, DB_KEY);
          tx.oncomplete = () => resolve('stored');
          tx.onerror = () => resolve('tx error: ' + tx.error);
        } catch(e) {
          resolve('error: ' + String(e));
        }
      };
      req.onerror = () => {
        // DB doesn't exist, create it
        const req2 = indexedDB.open('keyval-store', 1);
        req2.onupgradeneeded = () => {
          req2.result.createObjectStore('keyval');
        };
        req2.onsuccess = () => {
          const db = req2.result;
          const tx = db.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          store.put(payload, DB_KEY);
          tx.oncomplete = () => resolve('created and stored');
          tx.onerror = () => resolve('tx error2: ' + tx.error);
        };
      };
    });
  });
  
  console.log('MOCK STATE INJECTED into keyval-store');
  
  // Now visit play page
  await page.goto('https://versecraft.cn/play', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(15000);
  
  console.log('FINAL URL:', page.url());
  
  const errorEl = page.locator('[data-testid="play-error-boundary"]');
  const hasError = (await errorEl.count()) > 0;
  console.log('PLAY ERROR BOUNDARY:', hasError);
  
  if (hasError) {
    const dataError = await errorEl.getAttribute('data-error');
    console.log('DATA-ERROR:', dataError);
    const text = await errorEl.textContent();
    console.log('ERROR TEXT:', text?.slice(0, 500));
  }
  
  const routeError = page.locator('h1:text("游戏加载出错")');
  console.log('ROUTE ERROR:', (await routeError.count()) > 0);
  
  console.log('PAGE ERRORS:', errors.slice(0, 5));
  
  const visible = await page.locator('body').innerText();
  console.log('VISIBLE (first 400):', visible?.slice(0, 400));
});
