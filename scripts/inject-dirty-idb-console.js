/**
 * 脏数据注入脚本 - 在浏览器 Console 中运行
 * 用途：模拟 beiqi 等老账号的旧版/损坏 IDB 数据，验证 Hydration 修复
 *
 * 使用步骤：
 * 1. 打开应用 (http://localhost:3000 或生产地址)
 * 2. 如需测试 /play，请先登录
 * 3. 打开 DevTools Console，粘贴并执行本脚本
 * 4. 脚本会注入脏数据并刷新页面
 * 5. 观察："读取世界线中..." 应瞬间消失，控制台可能出现 Rehydration error 警告
 */

(function injectDirtyIdb() {
  const DB_NAME = "keyval-store";
  const STORE_NAME = "keyval";
  const KEY_MAIN = "versecraft-storage";
  const KEY_PERSIST = "versecraft-game-state";

  // 场景 A：version: 0 的旧结构（缺少 dynamicNpcStates、tasks 等新字段）
  const dirtyStateV0 = {
    state: {
      currentSaveSlot: "slot_1",
      saveSlots: {},
      user: { name: "beiqi" },
      playerName: "beiqi",
      inventory: [{ id: "old-item", name: "旧道具" }], // 旧物品结构
      logs: [{ role: "user", content: "test" }],
      // 故意缺少 dynamicNpcStates, tasks, warehouse, originium 等新字段
    },
    version: 0,
  };

  // 场景 B：非字符串脏数据（模拟 idb 返回 Object 污染）
  const injectObject = (resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => {
      console.error("[inject-dirty-idb] IDB open failed");
      resolve(false);
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(dirtyStateV0, KEY_MAIN); // 存 Object 而非 string，触发 resilientStorage 的脏数据检测
      tx.oncomplete = () => {
        db.close();
        console.log("[inject-dirty-idb] Injected Object (non-string) into versecraft-storage");
        resolve(true);
      };
    };
  };

  // 场景 C：残缺 JSON 字符串（会触发 JSON.parse 异常 -> onRehydrateStorage error）
  const injectMalformedJson = (resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => {
      console.error("[inject-dirty-idb] IDB open failed");
      resolve(false);
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put('{"state":{"truncated":true,"version":0}', KEY_MAIN); // 缺闭合括号，version 错位
      tx.oncomplete = () => {
        db.close();
        console.log("[inject-dirty-idb] Injected malformed JSON string");
        resolve(true);
      };
    };
  };

  const run = (scenario) => {
    const inject = scenario === "object" ? injectObject : injectMalformedJson;
    new Promise(inject).then((ok) => {
      if (ok) {
        console.log("[inject-dirty-idb] Refresh in 1s...");
        setTimeout(() => location.reload(), 1000);
      }
    });
  };

  console.log("Usage: injectDirtyIdb('object') or injectDirtyIdb('json')");
  window.injectDirtyIdb = run;
  run("object"); // 默认执行 object 场景
})();
