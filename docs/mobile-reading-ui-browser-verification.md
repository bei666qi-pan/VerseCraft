# Mobile Reading UI Browser Verification

本文用于后续阶段记录 `/play` 移动端阅读壳层的浏览器验证结果。结构改动后不要只看截图相似度，也要确认稳定选择器、交互和旧入口裁剪没有回归。

## 验证对象

- 页面：`/play`
- 主目录：`src/features/play/mobileReading/`
- 最小视口：
  - `390×844`
  - `393×852`
  - `430×932`

## 必查状态

默认阅读态：

- `mobile-reading-shell` 可见。
- `mobile-reading-header` 可见，并包含 `VerseCraft` 与 `第六章：雾港来信`。
- `mobile-story-viewport` 可见。
- `mobile-action-dock` 可见。
- `manual-action-input` 可见。
- `options-toggle-button` 可见。
- `send-action-button` 可见。
- `mobile-bottom-nav` 可见。
- `mobile-options-dropdown` 默认不可见。

选项展开态：

- 点击 `options-toggle-button` 后，`mobile-options-dropdown` 可见。
- `mobile-option-item` 数量为 4。
- 不产生横向滚动。

底部导航：

- `bottom-nav-character` 可见，但现阶段不得跳转、不得打开旧任务 / 指南 / 手记 / 仓库 / 成就 / 武器面板。
- `bottom-nav-story` 只回到剧情阅读态。
- `bottom-nav-codex` 打开现有 `UnifiedMenuModal` 的图鉴。
- `bottom-nav-settings` 打开现有 `UnifiedMenuModal` 的设置。

## 禁止回归

页面上不得重新出现这些主动 UI 入口：

- 任务栏
- 游戏指南
- 灵感手记
- 仓库
- 成就
- 武器

## 记录模板

后续补验证结果时按此格式追加：

```text
日期：
提交：
环境：
验证方式：Browser Use / Playwright
视口：
结果：
截图路径：
异常 / 噪声：
```

## 当前状态

本文件先建立验证口径；后续视觉或交互阶段在完成浏览器验证后继续追加具体结果。

```text
日期：2026-04-25
提交：本地结构重排阶段，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright
视口：390×844、393×852、430×932
结果：e2e/play-mobile-reading-ui.spec.ts 3 passed；e2e/play.spec.ts + e2e/ui-pruning-browser-verification.spec.ts + e2e/play-mobile-reading-ui.spec.ts 14 passed
截图路径：本阶段未保存正式截图
异常 / 噪声：本地 PostgreSQL 未启动导致 presence / analytics ECONNREFUSED 日志；不影响该 E2E 断言。Browser Use 已按插件流程尝试，但 node_repl 指向 D:\node\node.exe v22.17.1，低于插件要求的 >=22.22.0，因此本阶段用 Playwright 浏览器验证兜底。
```

```text
日期：2026-04-25
提交：阶段 2 本地视觉系统改造，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932
结果：e2e/play-mobile-reading-ui.spec.ts 3 passed；折叠态隐藏选项，展开态显示 4 个选项且无横向滚动。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，不影响断言通过。
```

```text
日期：2026-04-25
提交：手机端主壳层贴底布局阶段，提交号待定
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932、1200×900、844×390
结果：e2e/play-mobile-reading-ui.spec.ts 5 passed；移动端折叠态隐藏选项，展开态显示 4 个选项且无横向滚动；桌面端手机宽度壳层居中；横屏核心控件仍可见。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，不影响断言通过。
```

```text
日期：2026-04-25
提交：阶段 4 业务链路接入验证记录
环境：Windows / Next dev via Playwright webServer
验证方式：Playwright；Browser Use 已尝试但 runtime 不满足版本要求
视口：390×844、393×852、430×932、1200×900、844×390
结果：e2e/play-mobile-reading-ui.spec.ts 8 passed；追加 e2e/play.spec.ts + e2e/ui-pruning-browser-verification.spec.ts 后合计 19 passed；音量按钮 aria 状态随现有 mute 状态切换；生命汇源天赋走 useTalent 后进入冷却；手动输入和选项点击均触发 /api/chat；图鉴 / 设置走 UnifiedMenuModal 并高亮底栏；角色入口 no-op 且不跳转。
截图路径：本阶段未保存正式截图
异常 / 噪声：Browser Use 初始化失败，原因是 node_repl 解析到 D:\node\node.exe v22.17.1，插件要求 >=22.22.0；Playwright webServer 期间仍有本地 PostgreSQL 未启动导致的 presence / analytics ECONNREFUSED 日志，以及 Next.js middleware 弃用提示，不影响断言通过。
```
