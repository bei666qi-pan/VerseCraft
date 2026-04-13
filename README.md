<p align="center">
  <img src="./public/logo.svg" width="92" alt="VerseCraft logo" />
</p>

<h1 align="center">文界工坊 VerseCraft</h1>

<p align="center">
  <strong>AI 启动的互动小说游戏平台</strong>
</p>

<p align="center">
  不是把小说塞进聊天框。<br>
  是把 <strong>世界观、规则、选择、后果</strong> 交给 AI 在你眼前实时运行。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Product-AI%20Interactive%20Novel%20Platform-111111?style=flat-square" alt="Product badge" />
  <img src="https://img.shields.io/badge/Current%20World-%E5%BA%8F%E7%AB%A0%C2%B7%E6%9A%97%E6%9C%88-222222?style=flat-square" alt="Current world badge" />
  <img src="https://img.shields.io/badge/Language-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-333333?style=flat-square" alt="Language badge" />
  <img src="https://img.shields.io/badge/Status-Playable%20Prototype-444444?style=flat-square" alt="Status badge" />
</p>

<p align="center">
  <a href="https://versecraft.cn"><strong>在线演示：versecraft.cn</strong></a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="#什么是-versecraft">什么是 VerseCraft</a> ·
  <a href="#为什么它有开创性">为什么它有开创性</a> ·
  <a href="#在线演示">在线演示</a> ·
  <a href="#当前示例世界">当前示例</a> ·
  <a href="#30-秒玩法说明">玩法说明</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#给开发者">给开发者</a>
</p>

> **一句话定义：** VerseCraft 想做的不是一部 AI 小说，而是一种让 AI 启动、承接、扩展互动小说世界的游戏平台。

## 什么是 VerseCraft

VerseCraft 是一个面向互动叙事的 AI 平台原型。

在这里，AI 不只是负责“续写一段文案”，而是负责把一个世界真正跑起来：

- 它接住玩家输入的一句话动作。
- 它理解当前场景、世界规则、角色状态和时间推进。
- 它决定这句话会引发什么后果。
- 它把结果继续变成新的叙事、新的选择、新的压力。

换句话说，**玩家不是在读小说，而是在进入一部被 AI 实时点亮的互动小说。**

## 为什么它有开创性

- **它的目标是平台，不是单一故事页面**：同一套互动叙事底座可以承载悬疑、校园、科幻、末日、现实、历史、奇幻等不同题材。
- **AI 在这里是“故事运行时”**：不是聊天陪玩，而是负责推进剧情、执行规则、制造后果。
- **互动不是点选题，而是自然语言行动**：你可以像真的身在现场一样，直接说“我要做什么”。
- **世界观是可持续扩展的**：每一个新世界都可以拥有自己的规则、角色、检定方式和叙事节奏。
- **它不是传统文字游戏的复刻**：更像互动小说、规则系统和 AI 叙事引擎的结合体。

如果说很多 AI 项目在做“更聪明的聊天”，VerseCraft 想做的是 **“更像活着的故事世界”**。

## 在线演示

演示网址：[versecraft.cn](https://versecraft.cn)

## 当前示例世界

目前 VerseCraft 先提供一个可游玩的起始世界，用来验证平台能力：

### 序章·暗月

你会进入一个由 AI 主笔承接的互动叙事场景。

它不是 VerseCraft 的题材边界，只是第一块内容样板：

- 用来验证自然语言行动如何被 AI 承接。
- 用来验证世界状态、角色状态和时间推进如何协同。
- 用来验证一套平台能力能否持续孵化不同类型的互动故事。
- 后续世界可以是完全不同的题材、节奏和玩法目标。

换句话说，「序章·暗月」是第一扇门，不是 VerseCraft 被绑定的唯一素材类型。

## 30 秒玩法说明

1. 先创建角色，分配属性，选定你的起始倾向。
2. 进入当前世界，阅读 AI 给你的场景描述。
3. 输入一句自然语言动作，比如：

> 我先别出声，贴着墙往前走。<br>
> 我敲门三下，然后立刻后退。<br>
> 我不进去，先把手电照向走廊尽头。

4. AI 会结合世界规则、角色属性和时间变化，给出即时后果。
5. 你继续行动，故事继续分叉，直到活下来、失败，或摸到真相的一角。

## 你会感受到的，不只是“能聊天”

- **压迫感**：危险不是写在背景里的，而是会实时追上来的。
- **参与感**：你的输入不是装饰，它真的改变故事走向。
- **未知感**：同一句行动，在不同时间点、不同状态下，可能完全不同。
- **沉浸感**：它更像你在经历一场小说，而不是在围观一场小说。

## 它适合谁

- 喜欢互动小说、分支叙事、角色扮演和文本冒险的人。
- 喜欢“我的选择会改变结果”而不是只读剧情的人。
- 对 AI 原生内容形态感兴趣，想看“小说平台”能不能被重新定义的人。
- 想体验中文语境下、由 AI 驱动的单机叙事系统的人。

## 快速开始

```bash
pnpm install
pnpm dev
```

先把 `.env.example` 复制为 `.env.local` 并按模板填好配置。默认会在 `http://localhost:666` 启动，进入「铸造角色」后就可以直接开局。

## 平台想去哪里

VerseCraft 的野心不是只做完某一个示例世界。

它真正想验证的是：

- AI 能不能成为互动小说的平台层。
- 一个仓库里能不能持续孵化多个可游玩的世界。
- 世界观、规则系统、状态流转和叙事生成，能不能被做成可扩展的内容基础设施。

你现在看到的是第一扇门，不是最后一层楼。

## 给开发者

<details>
<summary><b>展开查看开发说明</b></summary>

### 项目定位

VerseCraft 是一个单机、浏览器内运行的中文互动叙事项目。它目前以「序章·暗月」为起始演示世界，围绕 AI 叙事推进、规则检定、世界知识检索和客户端持久化来搭建通用平台原型。

### 技术栈

- Next.js 16 + React 19
- Tailwind CSS v4
- Zustand 5
- PostgreSQL + Drizzle
- IndexedDB（`idb-keyval`）做客户端持久化

### 本地开发常用命令

```bash
pnpm dev
pnpm build
pnpm test:unit
pnpm test:e2e:chat
pnpm run ship -- "feat: your message"
```

### 环境变量

复制 `.env.example` 为 `.env.local`，然后按模板填写。常见必需项包括：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- `AI_MODEL_MAIN`
- `AI_MODEL_CONTROL`
- `AI_MODEL_ENHANCE`
- `AI_MODEL_REASONER`

更多说明见：

- `docs/environment.md`
- `docs/ai-architecture.md`
- `docs/local-development.md`
- `docs/deployment-coolify.md`

### 项目结构

```text
src/
├── app/           # 页面与 API 路由
├── components/    # 通用界面组件
├── features/      # 玩法与流式交互逻辑
├── lib/           # 配置、AI、世界知识与服务端能力
└── store/         # 游戏状态
```

</details>

## License

Private.
