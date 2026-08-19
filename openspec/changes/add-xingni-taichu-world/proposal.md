## Why

VerseCraft 当前虽然有世界选择外观和部分 `worldId` analytics，但运行时、存档、prompt 与确定性规则仍将「序章·暗月」视为唯一世界，无法安全承载第二套不相干的世界事实。现在需要先建立严格的世界/地图作用域，再以「星逆·太初」的首张开放地图「青石县」交付一段可玩的东方玄幻纵切，避免仅更换文案造成跨世界状态与叙事污染。

## What Changes

- **BREAKING**：将“暗月是唯一可用世界”改为“暗月与星逆·太初并存且隔离”，并要求每个新存档显式携带 `worldId` 与 `mapId`；旧存档兼容迁移为暗月。
- 新增世界目录、地图目录和世界运行时适配器；入口、角色创建、在线回合、确定性移动、NPC/地点事实、prompt、存档和后台任务均按世界作用域分流。
- 新增「星逆·太初」内容包与首图「青石县」：固定地点图、固定 NPC、固定战力上限、落魄散修开局以及修炼、炼丹、炼器、战斗、升仙试的最小结构化闭环。
- 扩展 `/api/chat` 的兼容请求上下文与候选 DM JSON，增加世界/地图标识和可选 `world_delta`；最低必填字段、SSE status/final 帧、`keys_missing` 降级和 `resolveDmTurn` 权威收口保持不变。
- 为世界知识增加世界/地图作用域，历史数据回填为暗月，检索和事实审计禁止跨世界命中。
- 新增 `VERSECRAFT_ENABLE_XINGNI_TAICHU_WORLD` 灰度开关；关闭后保留存档并明确显示不可进入，不回退到暗月。
- 星逆·太初使用独立的第三人称贴身玄幻文风契约与校验，不引用或仿写具体作品；暗月继续使用现有第一人称悬疑契约。
- 非目标：本 change 不制作第二张可游玩地图，不补全宗门、完整功法树、洞府、拍卖、灵宠、飞行或多人系统，不改 AI 供应商路由，不更名 analytics 事件，不删除暗月兼容层。

## Capabilities

### New Capabilities

- `multi-world-runtime`: 世界/地图目录、运行时分流、灰度开关、请求边界与跨世界隔离。
- `xingni-taichu-qingshi-content`: 星逆·太初世界身份、青石县确定性地图、固定 NPC/敌人与首图解锁规则。
- `xingni-taichu-progression`: 修为、灵根、灵石、炼丹、炼器、战斗凭证和升仙试的结构化玩法闭环。
- `world-scoped-save-and-knowledge`: 世界作用域存档迁移、云端兼容与世界知识检索隔离。
- `world-scoped-narrative-style`: 按世界选择 stable prompt、叙事视角、样例与防污染校验。

### Modified Capabilities

- `dark-moon-only-world`: 将暗月唯一世界要求改为暗月作为独立、持续兼容的可选世界，并禁止星逆·太初内容进入其运行时。

## Impact

- 高风险入口：`src/app/api/chat/route.ts`、`src/app/play/page.tsx`、`src/store/useGameStore.ts`、`src/lib/playRealtime/playerChatSystemPrompt.ts`、`src/features/play/turnCommit/resolveDmTurn.ts`、`src/db/schema.ts` 和世界知识检索链。
- UI：世界选择、角色创建、移动阅读壳层和角色/地图面板；暗月既有可见行为和 E2E test id 保持兼容。
- 数据：快照与 save slot 增加兼容字段；`world_knowledge_chunks` 增加 `world_id`/`map_id` 与索引，需迁移、暗月回填和 seed 更新；analytics 事件名不变，只补齐既有 payload 的世界字段。
- 性能：世界选择和确定性规则为内存查表，不向首字前路径加入 DB 写入、reasoner 或重型任务；星逆专属动态包按世界条件加载。网关缺失和未知/关闭地图均继续快速返回可解析 SSE final。
- 验证：相关 unit/golden、内容校验、chat contract、移动端 E2E、mock latency benchmark、叙事安全 eval、lint、build 与 PostgreSQL 迁移检查。
