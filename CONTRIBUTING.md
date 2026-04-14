# Contributing to VerseCraft / 贡献指南

[English](#english) | [中文](#中文)

---

## English

Thank you for your interest in contributing to VerseCraft!

### How to Contribute

1. **Fork** this repository.
2. **Create a branch** for your change: `git checkout -b feat/your-feature`.
3. **Develop** your changes locally — see [Quick Start](#quick-start) below.
4. **Commit** with a clear message describing what you changed and why.
5. **Open a Pull Request** against `main` and describe your changes.

### Quick Start

```bash
# Install dependencies
pnpm install

# Copy env template and fill in required values
cp .env.example .env.local

# Start the dev server (http://localhost:666)
pnpm dev
```

### Development Commands

```bash
pnpm dev              # Start development server
pnpm build            # Production build
pnpm test:unit        # Run unit tests
pnpm test:e2e:chat    # Run E2E tests (chat SSE contract)
pnpm lint             # Run ESLint
```

### Guidelines

- **Code style**: Follow the existing patterns in the codebase. TypeScript strict mode is enabled.
- **Tests**: Add or update tests when changing behavior. Run `pnpm test:unit` before submitting.
- **Commits**: Write concise, descriptive commit messages. Prefer one logical change per commit.
- **Scope**: Keep PRs focused. One feature or fix per PR is easier to review.
- **Language**: Code comments and variable names follow the project's existing conventions (Chinese for user-facing strings, English for code identifiers).

### Reporting Issues

- Use [GitHub Issues](https://github.com/bei666qi-pan/VerseCraft/issues) to report bugs or request features.
- Include steps to reproduce, expected behavior, and actual behavior.
- Screenshots or logs are always helpful.

### Code of Conduct

Be respectful, constructive, and welcoming. We are building something together.

---

## 中文

感谢你对 VerseCraft 的关注！

### 如何贡献

1. **Fork** 本仓库。
2. **新建分支**：`git checkout -b feat/your-feature`。
3. **本地开发** — 参见下方 [快速开始](#快速开始)。
4. **提交** 时写清楚你改了什么、为什么改。
5. 向 `main` 分支 **发起 Pull Request**，并描述你的改动。

### 快速开始

```bash
# 安装依赖
pnpm install

# 复制环境变量模板并填写必需值
cp .env.example .env.local

# 启动开发服务器 (http://localhost:666)
pnpm dev
```

### 开发命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 生产构建
pnpm test:unit        # 运行单元测试
pnpm test:e2e:chat    # 运行 E2E 测试
pnpm lint             # 运行 ESLint
```

### 规范

- **代码风格**：遵循项目现有的编码习惯。TypeScript 开启了严格模式。
- **测试**：改动行为时请添加或更新测试。提交前运行 `pnpm test:unit`。
- **提交信息**：简洁清晰，一次提交对应一个逻辑改动。
- **PR 范围**：保持聚焦，一个 PR 只做一件事，方便审阅。
- **语言**：面向用户的字符串使用中文，代码标识符使用英文，与项目现有约定一致。

### 报告问题

- 使用 [GitHub Issues](https://github.com/bei666qi-pan/VerseCraft/issues) 报告 Bug 或提出功能建议。
- 请附上复现步骤、预期行为和实际行为。
- 截图或日志会很有帮助。

### 行为准则

尊重、建设性、包容。我们在一起构建一个项目。
