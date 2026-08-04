## 1. 独立资产清理

- [x] 1.1 删除目标世界的内容 registry、导演、turn engine、prompt packet 与专属测试
- [x] 1.2 删除目标世界的 UI 组件、E2E、benchmark、设计/提示文档和旧 OpenSpec changes

## 2. 共享入口收敛

- [x] 2.1 将开场与角色创建收敛为暗月单世界并更新相关测试
- [x] 2.2 从 `/play`、移动阅读壳层和样式中移除目标世界 UI 接线
- [x] 2.3 从 `useGameStore`、快照、任务与 DM envelope/schema 中移除目标世界状态
- [x] 2.4 从 `/api/chat`、prompt 组装、normalize 与安全校验中移除目标世界分支

## 3. 验证与规范收口

- [x] 3.1 执行全仓残留扫描并人工复核允许保留的暗月防误写文本
- [x] 3.2 运行相关 unit/contract 测试、`npx eslint .` 与构建/类型验证
  - 聚焦测试 105/105 通过（含最终人格校验器清理后的 23 条回归），`pnpm build` 通过，`git diff --check` 通过。
  - `npx eslint .` 仅剩本次变更前已存在的 `scripts/self-improve/supervise.ts:120` `no-require-imports` 错误；全量 `tsc --noEmit` 仍受原工作树既有类型错误阻塞，改动路径未发现已删除模块或字段的残留引用。
- [x] 3.3 在 390×844、393×852、430×932 验证暗月 `/play` 移动端流程
  - `/intro`、`/create` 与 `/play` 均未出现目标世界或相关系统文案；暗月角色创建、开卷与正文壳层可达，三个视口均无横向溢出。
- [x] 3.4 同步 `dark-moon-only-world` delta spec 并记录验证结果
  - 已创建并同步 `openspec/specs/dark-moon-only-world/spec.md`；change 保持未归档，等待后续 PR/用户明确收口。
