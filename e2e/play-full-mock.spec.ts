import { test } from '@playwright/test';
test('full mock game state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  
  await page.goto('https://versecraft.cn', { timeout: 15000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  await page.evaluate(async () => {
    const DB_KEY = 'versecraft-storage';
    const state = {
      isGameStarted: true,
      isHydrated: false,
      playerName: '测试',
      gender: '男',
      stats: { sanity: 35, agility: 8, luck: 6, charm: 4, origin: 7 },
      historicalMaxSanity: 50,
      talent: '主角光环',
      talentCooldowns: { '主角光环': Date.now() - 3600000 },
      inventory: [
        { id: 'item_001', name: '碎镜片', quantity: 1, description: '一面破碎的镜子' },
        { id: 'item_002', name: '旧钥匙', quantity: 1, description: '一把生锈的钥匙' }
      ],
      warehouse: [],
      logs: [
        { role: 'system', content: '游戏开始' },
        { role: 'user', content: '我环顾四周，观察这个房间' },
        { role: 'assistant', content: '你睁开眼，发现自己躺在一间昏暗的公寓里。墙上的时钟指向凌晨两点，窗外月光透过积灰的玻璃洒在地上。空气中有股淡淡的霉味，混合着某种说不清的甜腻气息。房间不大，一张床、一个衣柜、一张书桌，角落里堆着几个纸箱。书桌上有一面破碎的镜子，碎片中映出你模糊的倒影。' },
        { role: 'user', content: '我去检查书桌上的镜子' },
        { role: 'assistant', content: '你走近书桌，小心地拿起一片镜子碎片。镜面冰凉，你的倒影在其中扭曲变形。就在你要放下碎片时，镜中倒影的眼睛——你自己的眼睛——突然眨了一下，而你的眼睛并没有动。一股寒意从脊椎升起。' }
      ],
      currentOptions: ['继续检查镜子', '离开房间', '检查衣柜', '看看窗外'],
      recentOptions: ['继续检查镜子', '离开房间', '检查衣柜', '看看窗外'],
      time: { day: 1, hour: 2 },
      playerLocation: 'B1_SafeZone',
      dialogueCount: 3,
      isGuest: true,
      guestId: 'real-guest-001',
      codex: {
        'npc-elder': { id: 'npc-elder', name: '夜读老人', category: 'npc', description: '住在隔壁的老人', discovered: true, entries: ['首次见面'] },
        'anomaly-mirror': { id: 'anomaly-mirror', name: '异化之镜', category: 'anomaly', description: '会自行活动的镜子', discovered: true, entries: ['镜子里的倒影动了'] }
      },
      viewedCodexIds: { 'npc-elder': true, 'anomaly-mirror': true },
      tasks: [
        { id: 'task-001', title: '探索公寓', description: '调查公寓中的异常现象', status: 'active', progress: 2, maxProgress: 5, rewards: [], category: 'main' },
        { id: 'task-002', title: '寻找出口', description: '找到离开公寓的方法', status: 'active', progress: 0, maxProgress: 3, rewards: [], category: 'main' }
      ],
      currentSaveSlot: 'main_slot',
      saveSlots: {
        'main_slot': { id: 'main_slot', label: '自动存档', savedAt: Date.now() - 60000, runId: 'run-001' }
      },
      storageMode: 'normal',
      volume: 70,
      language: 'zh-CN',
      readingPreferences: { fontSize: 'medium', lineHeight: 'relaxed' },
      chapterState: {
        activeChapterId: 'chapter-1',
        reviewChapterId: null,
        pendingChapterEndId: null,
        unlockedChapterIds: ['chapter-1'],
        completedChapterIds: [],
        progressByChapterId: {
          'chapter-1': { turnCount: 3, totalChars: 850, keyChoices: 2, lastTurnAt: Date.now() }
        },
        summariesByChapterId: {},
      },
      endingState: null,
      professionState: null,
      hasMetProfessionCertifier: false,
      originium: 15,
      currentBgm: 'bgm_b1_daily',
      dynamicNpcStates: {},
      mainThreatByFloor: {},
      memorySpine: { entries: [], lastPrunedAt: null },
      escapeMainline: null,
      storyDirector: null,
      incidentQueue: null,
      activeMenu: null,
      _taskUnviewedCount: 1,
      _taskPanelFirstOpen: false,
      pendingHourProgress: 0,
      inputMode: 'options',
      pendingClientAction: null,
      combatSummariesV1: null,
      conflictTurnFeedback: null,
      equippedWeapon: null,
      weaponBag: [],
      hasCheckedCodex: false,
      hasCompletedNewPlayerGuideBefore: true,
      hasShownGuestSoftNudge: true,
      playTimeSeconds: 1200,
      visitCount: 3,
      height: '175cm',
      personality: '谨慎',
      user: null,
    };
    
    const payload = JSON.stringify({ state, version: 0 });
    return new Promise((resolve) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(payload, DB_KEY);
        tx.oncomplete = () => resolve('ok');
      };
      req.onerror = () => {
        const req2 = indexedDB.open('keyval-store', 1);
        req2.onupgradeneeded = () => req2.result.createObjectStore('keyval');
        req2.onsuccess = () => {
          const db = req2.result;
          const tx = db.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(payload, DB_KEY);
          tx.oncomplete = () => resolve('created');
        };
      };
    });
  });
  
  await page.goto('https://versecraft.cn/play', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(15000);
  
  const errorEl = page.locator('[data-testid="play-error-boundary"]');
  const hasPlayError = (await errorEl.count()) > 0;
  const routeError = page.locator('h1:text("游戏加载出错")');
  const hasRouteError = (await routeError.count()) > 0;
  
  console.log('URL:', page.url());
  console.log('PLAY ERROR:', hasPlayError);
  console.log('ROUTE ERROR:', hasRouteError);
  console.log('ERRORS:', errors.slice(0, 5));
  
  if (hasPlayError) {
    const de = await errorEl.getAttribute('data-error');
    console.log('DATA-ERROR:', de);
    console.log('TEXT:', (await errorEl.textContent())?.slice(0, 400));
  }
  
  // Check what the page shows
  const body = await page.locator('body').innerText();
  const lines = body.split('\n').filter(l => l.trim()).slice(0, 15);
  console.log('PAGE:', lines.join(' | '));
});
