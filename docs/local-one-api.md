# 本地将 VerseCraft 接到 one-api（傻瓜步骤）

本文说明如何在**本机**让 VerseCraft 通过 **OpenAI 兼容网关**（习惯称 one-api / New API 等）访问大模型。完整变量说明仍以 [`ai-gateway.md`](ai-gateway.md) 为准。

## 你要完成什么

让浏览器里的 VerseCraft（`pnpm dev` 默认 **666** 端口）能把对话请求发到**本机或局域网**上的网关，且网关里配置的**模型名字符串**与 VerseCraft 的 `AI_MODEL_*` **完全一致**。

## 架构（对接成功后）

```mermaid
sequenceDiagram
  participant Browser
  participant Next as VerseCraft
  participant Gateway as one_api_compatible
  participant Vendor as upstream_vendor

  Browser->>Next: POST /api/chat SSE
  Next->>Gateway: POST .../v1/chat/completions
  Gateway->>Vendor: 按渠道转发
  Vendor-->>Gateway: 流式或 JSON
  Gateway-->>Next: OpenAI 形态响应
  Next-->>Browser: text/event-stream
```

## 端口约定（避免冲突）

| 服务 | 典型端口 | 说明 |
|------|----------|------|
| VerseCraft | **666** | `package.json` 中 `pnpm dev` |
| one-api | **3000**（示例） | 以你实际启动为准；勿与 666 混用同一端口 |

VerseCraft 里填：`AI_GATEWAY_BASE_URL=http://127.0.0.1:3000`（无尾斜杠即可，应用会自动补 `/v1/chat/completions`）。

## 共用 PostgreSQL：Docker Desktop + 分库（versecraft / oneapi）

与线上「**一台 PostgreSQL 实例、多个独立 database**」对齐：本机用 **一个** Postgres 容器，映射 **宿主机 5432 → 容器 5432**；游戏与网关各用**不同库名**，避免元数据与业务表混在同一 `database` 里。

```mermaid
flowchart TB
  subgraph host [宿主机]
    VC[VerseCraft_pnpm_dev]
    SB[Cursor_Simple_Browser_或系统浏览器]
  end
  subgraph dd [Docker_Desktop]
    PG[(PostgreSQL)]
    OA[one-api_可选容器]
  end
  VC -->|"DATABASE_URL_127.0.0.1:5432/versecraft"| PG
  SB -->|"http://127.0.0.1:网关端口"| OA
  OA -->|"SQL_DSN_见下表"| PG
```

### 1）启动 Postgres 并映射 5432

前提：**Docker Desktop 已运行**；本机 **5432 未被其他服务占用**。若已被占用，可改用例如 `-p 5433:5432`，并把下文所有连接串里的端口改为 `5433`。

**示例**（密码请自行替换；镜像标签可按团队规范改为 `postgres:16` 等）。整行复制即可（PowerShell / cmd / Git Bash 均可）：

```bash
docker run -d --name versecraft-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=change_me -p 5432:5432 postgres:16-alpine
```

### 2）在同一实例上创建两个库

进入容器执行 `psql`（将容器名与密码与上一步一致）：

```bash
docker exec -it versecraft-pg psql -U postgres -c "CREATE DATABASE versecraft;"
docker exec -it versecraft-pg psql -U postgres -c "CREATE DATABASE oneapi;"
```

若你**本机已有**跑在 5432 的 PostgreSQL，则**不必**再起容器，只需在该实例上执行上述两条 `CREATE DATABASE`（用户需有 `CREATEDB` 或等价权限）。

### 3）VerseCraft 连接串（宿主机进程 → 映射端口）

在 `.env.local` 中 `DATABASE_URL` 指向 **`versecraft`** 库，与 [`.env.example`](../.env.example) 形态一致，例如：

```env
DATABASE_URL="postgresql://postgres:change_me@127.0.0.1:5432/versecraft"
```

然后按 [`local-development.md`](local-development.md) 执行 `pnpm dev`、迁移等；**不要**把游戏库指到 `oneapi`。

### 4）one-api 的 `SQL_DSN`（必须指向 `oneapi` 库）

按你所用 **one-api / New API 发行版文档** 配置数据库连接变量（常见名为 `SQL_DSN` 或等价项）。**库名必须是 `oneapi`**，不要误填 `versecraft`。

**主机名怎么写（关键）**：

| one-api 运行位置 | 连接 Docker 内 Postgres 的写法 |
|------------------|--------------------------------|
| **宿主机**（二进制 / 本机进程） | `postgresql://用户:密码@127.0.0.1:5432/oneapi` |
| **Docker 容器**，与 Postgres **同一 compose 网络** | 主机名用 **服务名**，如 `postgresql://用户:密码@postgres:5432/oneapi` |
| **Docker 容器**，Postgres 仅映射到宿主机、网络未互通 | Windows 上常用 **`host.docker.internal`**：`postgresql://用户:密码@host.docker.internal:5432/oneapi` |

具体变量名与连接串格式以发行版为准；若启动报错「连不上库」，优先核对：**库名**、**主机名（宿主机 vs 容器）**、**端口是否与映射一致**。

### 5）启动 one-api 后在 Cursor 打开管理后台

1. 看 one-api 日志确认监听端口（常见 **3000**）。  
2. 在 Cursor：**Ctrl+Shift+P** → 输入 **Simple Browser: Show** → 地址填 `http://127.0.0.1:3000`（端口以实际为准）。  
3. 若 Simple Browser 登录异常（Cookie/跳转），改用 **系统默认浏览器** 打开同一地址即可。

### 6）全链路最小核对清单

| 检查项 | 期望 |
|--------|------|
| Postgres | 容器运行中，宿主机 `5432`（或你映射的端口）可连 |
| `versecraft` 库 | `DATABASE_URL` 路径为该库；`pnpm dev` 无数据库连接失败 |
| `oneapi` 库 | one-api 的 `SQL_DSN`（或等价配置）指向该库，网关能完成初始化/迁移 |
| VerseCraft AI | `AI_GATEWAY_BASE_URL` 指向 one-api 根地址；`AI_GATEWAY_API_KEY` 与令牌一致 |
| 验证命令 | `pnpm verify:ai-gateway`；可选 `pnpm probe:ai-gateway` |

### 7）本节相关排障

| 现象 | 处理 |
|------|------|
| 端口已被占用 | 改 `-p 5433:5432` 或停掉本机其他 Postgres；同步修改所有连接串端口 |
| one-api 无法建表/连库 | 是否误用了 `versecraft` 库；容器场景是否该用 `host.docker.internal` 或服务名 |
| VerseCraft 连库失败 | `DATABASE_URL` 用户/密码/库名是否与 Docker `POSTGRES_*` 一致 |

---

## 方案对比（选一种即可）

| 维度 | 方案甲：自己装 one-api + 改 `.env.local`（**推荐**） | 方案乙：Docker Compose 一体起网关 |
|------|----------------------------------|--------------------------------|
| 操作量 | 较少：装网关 + 控制台配渠道 + 填环境变量 | 中等：还要维护 compose 与镜像版本 |
| 仓库维护 | 无 | 高（镜像升级、环境变量变更） |
| 适用 | 绝大多数本地开发者 | 团队强制统一本地拓扑时 |

**本仓库默认采用方案甲**；方案乙仅在你已有团队级 `docker-compose` 时自行套用，不在此仓库维护官方 compose 片段（避免与上游 breaking change 绑定）。

---

## 方案甲：推荐路径（逐步做）

### 第 0 步：安装并启动 one-api

请按你所使用的 **one-api / New API 发行版官方文档**安装（常见为 Docker 或二进制）。启动后应能在浏览器打开管理界面（例如 `http://127.0.0.1:3000`，**以实际为准**）。

若希望 **VerseCraft 与 one-api 共用本机一个 PostgreSQL 实例、分库隔离**，先完成上文 **「共用 PostgreSQL：Docker Desktop + 分库（versecraft / oneapi）」** 一节，再启动 one-api 并将其数据库指向 **`oneapi`** 库。

> VerseCraft **不会**替你安装或配置 one-api；以下步骤均在 **one-api 控制台**完成。

### 第 1 步：创建访问令牌

1. 登录 one-api 管理后台。  
2. 找到 **令牌 / API Key / 访问密钥** 一类菜单，**新建令牌**。  
3. 复制生成的字符串 → 写入 VerseCraft 的 **`AI_GATEWAY_API_KEY`**（仅服务端，勿写 `NEXT_PUBLIC_*`）。

### 第 2 步：配置至少一条上游渠道

1. 在后台找到 **渠道 / Channel**（名称因版本略有不同）。  
2. 新增渠道：选择你的上游类型（如 OpenAI 兼容、各云厂商等），填入**上游地址与上游密钥**（密钥留在 one-api，不要写进 VerseCraft）。  
3. 保存并确认渠道状态为可用（部分控制台有「测试」按钮）。

### 第 3 步：让「模型名」与 VerseCraft 对齐（最关键）

VerseCraft 只把 **字符串** 发给网关，例如 `AI_MODEL_MAIN=vc-main`，则 one-api 中必须存在名为 **`vc-main`** 的部署/模型映射（名称与大小写**一致**），并指向第 2 步的渠道。

建议四个逻辑角色各对应一个模型 id（可与 `.env.example` 一致，也可自定义，但 **四处必须一致**）：

| VerseCraft 环境变量 | 示例值 | one-api 中需存在的同名模型 |
|---------------------|--------|----------------------------|
| `AI_MODEL_MAIN` | `vc-main` | `vc-main` |
| `AI_MODEL_CONTROL` | `vc-control` | `vc-control` |
| `AI_MODEL_ENHANCE` | `vc-enhance` | `vc-enhance` |
| `AI_MODEL_REASONER` | `vc-reasoner` | `vc-reasoner` |

若你暂时只配一条上游，可让四个名字在 one-api 里**都映射到同一渠道**（具体菜单名称依控制台为准）。

### 第 4 步：填写 VerseCraft `.env.local`

1. 若还没有：从模板复制  
   `cp .env.example .env.local`  
2. 至少配置（可与 [`../.env.local.oneapi.example`](../.env.local.oneapi.example) 对照复制）：

```env
AI_GATEWAY_PROVIDER="oneapi"
AI_GATEWAY_BASE_URL="http://127.0.0.1:3000"
AI_GATEWAY_API_KEY="你在第1步复制的令牌"
AI_MODEL_MAIN="vc-main"
AI_MODEL_CONTROL="vc-control"
AI_MODEL_ENHANCE="vc-enhance"
AI_MODEL_REASONER="vc-reasoner"
```

3. 同时保证 `DATABASE_URL`、`AUTH_SECRET` 等本地必填项已按 [`local-development.md`](local-development.md) 填写。

**减负方式（可选）**：在仓库根目录执行 `pnpm patch:env-local-ai`，按提示输入网关地址与令牌（会先提示备份 `.env.local`）。

### 第 5 步：终端验证（不启动游戏也能查错）

在 **VerseCraft 仓库根目录**执行：

```bash
pnpm verify:ai-gateway
```

- 若缺项，按终端提示补全变量。  
- 需要 CI 式严格失败：`VERIFY_AI_GATEWAY_STRICT=1 pnpm verify:ai-gateway`

可选（会发起**极小**真实请求，可能产生微量费用）：

```bash
pnpm probe:ai-gateway
```

### 第 6 步：启动游戏并试一句

```bash
pnpm dev
```

浏览器打开 **http://localhost:666**（或 http://127.0.0.1:666），进入游玩流程，发送一句对话。若仍走降级文案，见下文排障表。

---

## 开发者专属环节小结（必须人工时只看这段）

1. **令牌** → `AI_GATEWAY_API_KEY`  
2. **渠道 + 上游密钥** → 只在 one-api 后台  
3. **模型名字符串** → one-api 与 `AI_MODEL_*` **逐字相同**  
4. **验证** → `pnpm verify:ai-gateway` → `pnpm probe:ai-gateway` → `pnpm dev`

---

## 常见故障（对照查）

| 现象 | 处理 |
|------|------|
| `pnpm verify:ai-gateway` 显示网关或 MAIN 缺失 | 检查 `.env.local` 是否在**仓库根目录**；键名是否与 `.env.example` 完全一致 |
| 连接被拒绝 / fetch failed | one-api 是否已启动；`AI_GATEWAY_BASE_URL` 端口是否与实际一致；可本机 `curl` 网关根路径试连通 |
| 401 / 403 | 令牌错误或未生效；在 one-api 重新生成令牌并更新 `AI_GATEWAY_API_KEY` |
| 模型不存在 / model not found | one-api 中模型 id 与 `AI_MODEL_*` 不一致；或渠道未绑定到该模型 |
| 游戏内长期「未配置大模型」降级 | `anyAiProviderConfigured` 为 false：缺 URL、Key、`AI_MODEL_MAIN` 之一 |
| 有输出但 JSON/SSE 异常 | 上游是否支持流式或 `json_object`；见 [`troubleshooting-ai.md`](troubleshooting-ai.md) |

---

## 相关链接

- 网关与切模型：[`ai-gateway.md`](ai-gateway.md)  
- 本地通用开发：[`local-development.md`](local-development.md)  
- 环境变量总表：[`environment.md`](environment.md)  
- 共用 Postgres 分库与 `SQL_DSN`：见本文 **「共用 PostgreSQL：Docker Desktop + 分库」** 一节
