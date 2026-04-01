# 状态层治理 v1（useGameStore 减耦）

## 现有问题（审计结论）

- `useGameStore` 同时承担 **UI 热状态**、**回合提交结果**、**剧情支撑引擎**、**持久化编排**，单文件与单类型负担过重。
- 字段边界虽有注释，但缺少可复用的分层入口，组件容易直接拿整块 store，造成耦合扩散。
- 新功能倾向继续把字段堆到 `GameState`，未来会加速“巨无霸 store”风险。
- 运行时字段（如冲突余音、快捷行动、叙事 cue）与持久化字段混排，认知成本高。

## 新分层结构

- **表层玩家状态（UI 直接驱动）**
  - `playerName` / `stats` / `time` / `originium` / `playerLocation`
  - `currentOptions` / `inputMode` / `isGameStarted`
  - `currentBgm` / `volume` / `activeMenu`
- **回合结果状态（短期提交与展示）**
  - `logs` / `tasks` / `journalClues`
  - `conflictTurnFeedback` / `securityFallback`
- **支撑层状态（导演、记忆、主线骨架）**
  - `memorySpine` / `storyDirector` / `incidentQueue`
  - `escapeMainline` / `professionState`
  - `mainThreatByFloor` / `codex`
- **持久化核心（真正入存档）**
  - 存档与身份：`currentSaveSlot` / `saveSlots` / `user` / `guestId` / `isGuest`
  - 世界与进度：`tasks` / `journalClues` / `playerLocation` / `dynamicNpcStates` / `mainThreatByFloor`
  - 长程支撑：`memorySpine` / `storyDirector` / `incidentQueue` / `escapeMainline` / `professionState`
- **纯运行时（不应入持久化）**
  - `isHydrated` / `recentOptions` / `intrusionFlashUntil`
  - `pendingClientAction` / `conflictTurnFeedback`
  - `professionNarrativeCues` / `combatSummariesV1` / `sceneNpcAppearanceLedger`

## 已完成拆分

1. 新增 `src/store/useGameStoreSelectors.ts`
   - `selectPlayerSurfaceState`
   - `selectTurnResultState`
   - `selectSupportPlaneState`
   - `selectPersistenceCoreState`
   - `selectRuntimeOnlyState`
   - 以及 `summarizePlaySurfaceDemand` / `projectPersistableShape` / `extractMainSlotSnapshot`
2. `GameState` 改为导出：`export interface GameState`，支持跨文件 selector/type 复用。
3. 组件接入示范：`PlayStoryScroll` 已改为通过 `selectTurnResultState` 获取 `conflictTurnFeedback`，降低对 store 内部字段布局的直接耦合。
4. 新增测试：`src/store/useGameStoreSelectors.test.ts`，保障分层 selector 可用性。

## 后续可继续下沉（不破坏主链路）

- **回合提交编排服务化**：把 `page.tsx` 中提交后对 store 的连续写入流程收敛到 `turnCommitService`（只保留 UI 触发）。
- **支撑层 reducer 下沉**
  - `memorySpine`、`storyDirector`、`escapeMainline` 的 action 聚合到独立 `domain service`，store 仅做状态托管。
- **持久化白名单单点化**
  - 将 `partialize` 字段表提取为单独常量模块，避免“新增字段时忘记分层”的隐性回归。
- **消费端统一 hook**
  - 增加 `usePlayerSurfaceState()` / `useTurnResultState()` 等 hook，避免组件继续写散落的匿名 selector。

---

本次治理遵循：**不重写 store、不改存档协议、不破游玩主链路**，先建立清晰分层入口，再逐步把后台编排职责外移。
