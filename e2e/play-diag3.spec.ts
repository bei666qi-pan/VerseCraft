import { test } from '@playwright/test';
test('reproduce with mock game state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  
  // Inject data before navigation using addInitScript
  await page.addInitScript(() => {
    const DB_KEY = 'versecraft-storage';
    const mockState = {
      state: {
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
        hasCheckedCodex: false,
        _taskUnviewedCount: 0,
        _taskPanelFirstOpen: true,
        pendingHourProgress: 0,
        inputMode: 'options',
        recentOptions: [],
        pendingClientAction: null,
        weaponBag: [],
        combatSummariesV1: null,
        conflictTurnFeedback: null,
        equippedWeapon: null,
        warehouse: [],
        playTimeSeconds: 0,
        visitCount: 1,
        hasShownGuestSoftNudge: false,
        hasCompletedNewPlayerGuideBefore: false,
        height: '',
        personality: '',
        user: null,
      },
      version: 0,
    };
    
    const jsonStr = JSON.stringify(mockState);
    
    // Override IndexedDB open to inject our data
    const origOpen = indexedDB.open;
    indexedDB.open = function(name: string, version?: number) {
      const req = origOpen.call(indexedDB, name, version);
      if (name === 'versecraft-storage-db' || name.includes('versecraft')) {
        const origOnsuccess = Object.getOwnPropertyDescriptor(req, 'onsuccess');
        req.addEventListener('success', function() {
          try {
            const db = (req as any).result;
            if (db && db.objectStoreNames.contains('keyval')) {
              const tx = db.transaction('keyval', 'readwrite');
              const store = tx.objectStore('keyval');
              store.put(jsonStr, DB_KEY);
            }
          } catch(e) {}
        });
      }
      return req;
    };
  });
  
  await page.goto('https://versecraft.cn/play', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(15000);
  
  console.log('FINAL URL:', page.url());
  
  const errorEl = page.locator('[data-testid="play-error-boundary"]');
  const hasError = (await errorEl.count()) > 0;
  console.log('HAS PLAY ERROR BOUNDARY:', hasError);
  if (hasError) {
    const dataError = await errorEl.getAttribute('data-error');
    console.log('DATA-ERROR:', dataError);
    const text = await errorEl.textContent();
    console.log('ERROR TEXT:', text?.slice(0, 500));
  }
  
  console.log('CONSOLE ERRORS:', errors.slice(0, 10));
  
  const visible = await page.locator('body').innerText();
  console.log('VISIBLE TEXT (first 300):', visible?.slice(0, 300));
});
