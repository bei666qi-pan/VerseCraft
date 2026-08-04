## Context

仓库现有 `openspec/config.yaml`、根 `AGENTS.md` 和 `.codex/skills/openspec-*`。其中根说明的自动分流文字和 OpenSpec 配置上下文都以 Codex 为叙述主体；`CLAUDE.md`、Cursor rules 和 Kimi Code 的项目目录没有可发现的等效入口。OpenSpec CLI 1.6.0 原生支持为 Codex、Claude、Cursor 和 Kimi CLI 安装项目级 adapter：前三者有 skill 与 slash command，Kimi 有 skill，且 Kimi Code 同时读取项目根 `AGENTS.md`。

这是一项开发工具链治理变更，不改变 VerseCraft 的应用运行时代码或部署产物。根 `AGENTS.md` 继续承担跨工具的规范事实源，具体客户端只保存由 OpenSpec CLI 生成的适配器或极短的本地补充规则。

## Goals / Non-Goals

**Goals:**

- 让 Codex、Claude Code、Cursor、Kimi Code 对同一类任务做相同的 OpenSpec 自动分流。
- 让上述客户端在项目克隆后可发现其支持的 OpenSpec skill/命令，而不依赖用户级安装。
- 保留现有轻量任务的直接执行路径，避免把纯问答和无行为单文件修正变成无谓流程负担。
- 让未知或未来客户端至少能通过根 `AGENTS.md` 与仓库内 `openspec` CLI 遵循同一流程。

**Non-Goals:**

- 不强制所有客户端安装同一种 IDE、插件、用户级配置或模型。
- 不把每个任务都强制创建 change；直接执行的明确例外继续有效。
- 不改变应用 API、SSE/JSON、数据库、analytics、状态或部署运行时。
- 不把 agent 的自动提交、推送或部署作为 OpenSpec 工作流的一部分。

## Decisions

### 1. 根 `AGENTS.md` 是工具无关的工作流事实源

将现有“后续 Codex”表述替换成“所有编码代理”，并在自动分流中使用 OpenSpec CLI 术语而不是只指向 `.codex/skills`。这与 Kimi Code 对根 `AGENTS.md` 的项目级加载方式兼容，也让支持该约定的其他客户端无需维护重复版本。

不选择把完整规则复制到每个客户端配置中，因为多个长副本必然漂移，并且仓库已经以 `AGENTS.md` 承载架构红线。

### 2. 用 OpenSpec CLI 生成受支持客户端的 adapter

运行 `openspec init . --tools codex,kimi,claude,cursor --force`，由 CLI 安装/更新 `.codex`、`.claude`、`.cursor`、`.kimi` 下的 OpenSpec skills 和可用 slash commands。继续由 OpenSpec CLI 管理这些生成文件，避免手工维护 skill 内容而与 CLI 版本脱节。

不使用 `--tools all`：它会为未在此仓库使用的几十种客户端创建配置噪声。新的客户端可按 `openspec init --tools <tool>` 显式添加；仍会先读取根 `AGENTS.md`。

### 3. 只为客户端差异增加薄适配层

`CLAUDE.md` 增加与根规则一致的自动分流，并明确在实施前按现有 change 复用、完成后同步 specs。Cursor 增加 `alwaysApply` 的 OpenSpec 工作流 rule。Kimi Code 不复制完整策略：其 OpenSpec skills 和根 `AGENTS.md` 已是官方支持的项目发现路径。

不以 Kimi 的用户级 `~/.kimi-code` 配置实现此规则，因为它不能随仓库克隆、审查和版本化。

### 4. 取消 Cursor 的自动发布默认行为

现有 Cursor workflow rule 要求任务完成后自动运行 ship，这与根 `AGENTS.md` 和安全操作边界冲突，也会绕过 OpenSpec 变更的验证/同步收口。该规则改为只在用户明确要求提交或发布时执行现有发布命令，并把 OpenSpec 验证放在实现完成后的必要步骤中。

不保留“完成即部署”的例外，因为它会在任何普通 agent 任务中造成不可逆的外部变更。

## Risks / Trade-offs

- [部分客户端不加载项目级 skill] → 根 `AGENTS.md` 明确 CLI 的默认流程；文档给出一次性 adapter 安装命令。
- [CLI 生成的 adapter 随 OpenSpec 版本变化] → 记录 `openspec update` 的更新入口，且只生成已确认使用的四个客户端。
- [Kimi 没有 OpenSpec slash command] → 通过自动加载的项目 skills 和自然语言/CLI 流程触发，不假设不存在的 slash command。
- [根规则与客户端私有规则再次漂移] → 客户端文件只声明分流和指向根规则，不复制完整的架构或契约清单。

## Migration Plan

1. 先将根和客户端规则改为工具无关的默认分流。
2. 用 OpenSpec CLI 为 Codex、Kimi、Claude 和 Cursor 更新项目 adapter。
3. 通过文件存在性、`openspec status`、`openspec validate` 和差异检查验证安装结果。
4. 若某个客户端 adapter 不兼容，可删除该客户端生成目录并保留根 `AGENTS.md`；不会影响应用运行或其他客户端。

## Open Questions

- 无。未来确实采用其他客户端时，再以 `openspec init --tools <tool>` 增加其 adapter，避免预生成未使用配置。
