## Why

仓库虽已配置 OpenSpec 和 Codex skill，但默认工作流仍以 Codex 为中心；Claude Code、Cursor、Kimi Code 以及其他会读取项目说明的代理没有同一套明确的自动分流规则和本地 OpenSpec 能力入口。这会让相同需求因使用的客户端不同而绕过 proposal、design、tasks 和验证记录。

## What Changes

- 将根目录 `AGENTS.md` 的 OpenSpec 自动分流改为工具无关的仓库默认：所有编码代理先按同一规则判断直接执行、轻量变更或强制变更。
- 为已在仓库使用或明确支持的 Codex、Claude Code、Cursor 和 Kimi Code 安装/更新 OpenSpec 的项目级 skill 与命令适配入口；Kimi Code 通过其项目 skill 发现和根 `AGENTS.md` 自动获得同一工作流。
- 在 Claude Code 与 Cursor 的本地指令中补充默认 OpenSpec 分流，并消除与仓库安全发布规则相冲突的 Cursor 自动部署说明。
- 记录支持范围、触发规则和升级方式，使其他支持 `AGENTS.md` 或 OpenSpec skill 的客户端也以根目录规则为单一事实源。

## Capabilities

### New Capabilities

- `cross-agent-openspec-workflow`: 为多个编码代理提供一致、可发现且默认启用的 OpenSpec 任务分流与项目级工具入口。

### Modified Capabilities

- 无。

## Impact

- 影响仓库级开发者说明、Codex/Claude/Cursor/Kimi 的项目配置和 `openspec/` 工作流产物；不影响应用运行时代码。
- 不修改 `/api/chat` SSE/JSON、客户端状态、analytics、数据库 schema 或后台 world tick，也没有首包、TTFT、降级策略或灰度开关影响。
- 不新增应用依赖；依赖已安装的 `openspec` CLI。未识别本地技能的客户端仍可通过根 `AGENTS.md` 和 `openspec` CLI 执行同一流程。
