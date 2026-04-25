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
