# VCDT-D03 应用验证与浏览器闭环审计

> Audit date: 2026-07-24 | Auditor: Lead Orchestrator
> Scope: UI/API/SSE/store/存档验证现状、Browser/Playwright/Codex handoff 边界、黑盒测试覆盖

## 1. 当前验证手段全景

### 1.1 测试层次与覆盖

| 层次 | 工具 | 覆盖范围 | 真实程度 |
|------|------|----------|----------|
| Unit | `tsx --test` | 纯函数、validator、parser、turn engine | 完全离线 |
| Contract | `tsx --test` + Playwright | DM JSON 形状、SSE 帧结构 | mock / keys_missing |
| E2E | Playwright | 浏览器 UI 交互 | mock / keys_missing / live (opt-in) |
| Playthrough | `HttpSutAdapter` (API直连) | 多回合 /api/chat | mock / live |
| Browser Playthrough | Playwright driver | 真实浏览器 + UI + SSE | live (E2E_AI_LIVE=1) |
| Codex Handoff | Playwright + 文件握手 | 外部 AI 玩家决策 | live (E2E_CODEX_PLAYTEST=1) |

### 1.2 E2E 测试文件清单（42 个 spec 文件）

按验证目标分组：

| 分组 | 文件 | 验证内容 | 模式 |
|------|------|----------|------|
| **SSE 契约** | `chat-sse-contract.spec.ts` | SSE 帧结构、`__VERSECRAFT_FINAL__` | keys_missing |
| **延迟预算** | `chat-latency-budget.spec.ts` | TTFT、status frame | keys_missing |
| **游玩流程** | `play.spec.ts` (21K) | 完整游玩交互 | keys_missing |
| **移动 UI** | `mobile-reading-ui.spec.ts` (65K) | 移动端阅读壳层 | keys_missing |
| **章节** | `chapter-flow.spec.ts` (20K) | 章节推进流程 | keys_missing |
| **首页/创建** | `home-create-reference-ui.spec.ts` | 首页 + 角色创建 | keys_missing |
| **存档** | `idb-hydration.spec.ts` | IndexedDB 持久化 | keys_missing |
| **在线状态** | `online-status.spec.ts` | 网络状态检测 | keys_missing |
| **admin** | `admin-api.spec.ts`, `admin-performance.spec.ts` | 管理后台 | degraded |
| **浏览器 playthrough** | `browser-playthrough.spec.ts` | 浏览器多回合 | mock |
| **Codex playthrough** | `codex-browser-playthrough.spec.ts` | Codex 文件握手 | opt-in |
| **Live 闭环** | `live-playthrough-closed-loop.spec.ts` | 真实网关 | E2E_AI_LIVE=1 |
| **Mock 闭环** | `mock-playthrough-closed-loop.spec.ts` (14K) | mock 模式闭环 | mock |

## 2. "只验证渲染，不验证后果"分析

### 2.1 典型问题模式

通过代码审查识别的模式：

| 测试模式 | 示例 | 问题 |
|----------|------|------|
| `expect(page.locator(...)).toBeVisible()` | 大量存在于移动 UI 测试 | 验证元素存在但不验证交互后果 |
| 等待固定时间而非等待状态变化 | `page.waitForTimeout(2000)` | 可能因时序问题误绿 |
| 断言 DOM 内容包含某文本 | `expect(text).toContain("行动")` | 不验证后端状态是否真的变化 |

### 2.2 有实质后果验证的测试

| 测试 | 后果验证 | 评估 |
|------|----------|------|
| `chat-sse-contract.spec.ts` | 验证 SSE 帧结构 + `__VERSECRAFT_FINAL__` + 具体 JSON 字段 | ✅ 强 |
| `idb-hydration.spec.ts` | 验证 IndexedDB 写入 + 刷新后读取 | ✅ 强 |
| `chapter-flow.spec.ts` | 验证章节 UI 切换 + 多回合推进 | ✅ 中 |
| `play.spec.ts` | 验证输入提交 + 选项选择 + 叙事显示 | ✅ 中 |
| `live-playthrough-closed-loop.spec.ts` | 验证多回合 SSE + 状态连续 | ✅ 强 |

### 2.3 缺乏的验证类型

| 缺失类型 | 影响 | 优先级 |
|----------|------|--------|
| **错误恢复路径** | SSE 中断后恢复、半截 JSON 处理 | 高 |
| **并发操作** | 快速连续点击、同时多个请求 | 高 |
| **空状态/边界** | 空选项列表、空叙事、零理智 | 中 |
| **权限边界** | 未登录访问 /play、过期 session | 中 |
| **网络降级** | 慢网络、超时、网关 500 | 高 |

## 3. Browser/IAB vs Playwright vs Codex Handoff 边界

### 3.1 当前分工

| 工具 | 适用场景 | 优势 | 劣势 |
|------|----------|------|------|
| **Playwright** | 自动化 E2E、CI | 可复现、快速、确定性强 | 只能验证预定义路径 |
| **Browser Use (IAB)** | 视觉验证、探索性测试 | 真实渲染、截图证据 | 速度慢、不稳定 |
| **Codex Handoff** | 智能玩家决策 | 类人探索行为 | 依赖外部 agent、成本高 |

### 3.2 边界建议

```
Playwright:     契约验证、回归测试、CI 必跑门
Browser Use:    视觉回归、移动端截图对比、预发布手动验证
Codex Handoff:  探索性 playtest、盲测玩家模拟
Live Gateway:   仅 opt-in (E2E_AI_LIVE=1)，有配额预算时
```

## 4. 黑盒、边界与恢复测试覆盖

### 4.1 黑盒测试

| 能力 | 状态 | 证据 |
|------|------|------|
| 通过 UI 操作（不读 store） | ✅ 存在 | `play.spec.ts` 使用 testid 和可见文本 |
| 验证 UI 可见后果 | ⚠️ 部分 | 多数测试只验证元素出现，不验证状态一致性 |
| 不依赖内部 packet | ✅ 设计正确 | E2E 不 import 任何 src/ 模块 |

### 4.2 边界测试

| 场景 | 覆盖 | 文件 |
|------|------|------|
| 空输入提交 | ❓ 需验证 | — |
| 超长输入 | ❌ | — |
| 特殊字符/emoji | ❓ | — |
| 极快连续点击 | ❌ | — |
| 页面刷新中提交 | ❌ | — |

### 4.3 恢复测试

| 场景 | 覆盖 | 文件 |
|------|------|------|
| 刷新后状态恢复 | ✅ | `idb-hydration.spec.ts` |
| SSE 中断后恢复 | ❌ | — |
| AI 返回错误后重试 | ❌ | — |
| 网络断开后重连 | ❌ | — |

## 5. Playthrough 驱动闭环

### 5.1 HttpSutAdapter (API 直连)

`src/lib/evals/playthrough/` 中的 playthrough harness：
- 通过 HTTP 直接调用 `/api/chat`
- 不经过浏览器、不测试 UI
- 支持 4 personas × 3 runs
- **缺陷：无法验证 hydration、IndexedDB、视觉等待**

### 5.2 Browser Playthrough Driver

`openspec/changes/add-browser-playthrough-driver/` 设计：
- 从 `/intro → /create → /play` 真实路径
- 使用 testid 和可见文本操作
- 每回合保存 observation、final JSON、截图
- **尚未全面实施**（仍在 OpenSpec change 阶段）

### 5.3 Codex File Handoff

- 文件握手协议：request.json → decision.json
- 支持 developer 和 blind 两种模式
- 每回合独立 ticket 防止误提交
- **仍为 opt-in，不入 CI**

## 6. 同一 AI 完成应用验证的可行性

### 6.1 当前障碍

| 障碍 | 描述 |
|------|------|
| 无统一入口 | 42 个 E2E spec + 多个 playthrough 脚本，新 AI 不知道先跑哪个 |
| 环境依赖 | 需要 .env、数据库、AI gateway 配置 |
| mock vs live 切换不透明 | 不同脚本默认模式不同 |
| 证据收集分散 | 结果散落在 .runtime-data/、terminal output、截图 |

### 6.2 建议方案

统一 Worker 的应用验证路径：
1. `pnpm dev` 启动应用
2. 按风险级别选择 focused E2E
3. 至少执行一个黑盒操作路径
4. 验证交互后的可见后果
5. 对 /api/chat 周边改动额外验证 SSE contract
6. 记录命令、退出码、截图路径

## 7. 关键发现汇总

1. **E2E 测试数量充足（42 spec）但覆盖率不均** — SSE 契约和移动 UI 覆盖好，错误恢复和边界覆盖差
2. **绝大多数 E2E 跑在 keys_missing 降级模式** — 验证降级路径，不验证真实 AI 行为
3. **Browser playthrough driver 尚未全面落地** — 设计完备但仍在 OpenSpec change
4. **HttpSutAdapter 绕过浏览器** — 无法验证 hydration、视觉等待、IndexedDB
5. **Codex handoff 是智能玩家决策的唯一路径** — 但 opt-in 且不入 CI
6. **黑盒约束在 E2E 层面做得较好** — Playwright 测试不 import src/
7. **边界测试几乎空白** — 空输入、超长、快速点击、并发、错误恢复
8. **缺乏统一的 app test 启动器** — 42 个 spec 没有按风险分组的快捷入口
9. **Live gateway 验证完全依赖 secrets** — 本地开发者可能从未跑过真实网关测试

