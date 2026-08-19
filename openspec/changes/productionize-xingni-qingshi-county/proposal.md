## Why

「星逆·太初」目前只具备青石县最小纵切：玩家可以移动、修炼、完成三种凭证中的两种并通过升仙试，但缺少足以支撑真实玩家 3–5 小时体验的任务节奏、NPC 日程、经济风险、失败恢复、确定性事件与生产验收。需要在不开放第二张地图、不污染暗月世界的前提下，把该纵切生产化为稳定、可恢复、可测试的完整首图。

## What Changes

- 将青石县补全为五章、十四个权威阶段的主线，并登记三条凭证任务链、八条 NPC 支线、四类重复委托和十二个确定性微事件。
- 扩充八名固定 NPC 的四时段日程、关系阈值、服务、知识范围和四级 reveal 事实；AI 仍只负责表演。
- 将星逆状态升级为兼容版本，加入生命、体力、伤势、气海修复、突破准备、材料、装备、任务、关系、日期时段、失败恢复与幂等记录。
- 引入统一登记行动协议，以及修炼、交易、炼丹、炼器、战斗、撤退、升仙试和重伤恢复的结构化裁决；采用硬核资源风险但不永久死亡。
- 为青木、赤火、玄水提供同主线多解法优势，不锁死任何凭证或通关路径。
- 升级星逆专属 prompt/runtime packet、内容 seed、地图面板、世界作用域图鉴和目标/风险反馈；青云渡继续只解锁不开放。
- 为八名固定 NPC 提供与青石县身份、职业和日程一致的专属玄幻图鉴立绘，禁止复用暗月 NPC、异常目录或暗月恐怖画风。
- 补齐内容、unit、property、golden、contract、E2E、性能、迁移和 PostgreSQL seed 验证，并以原灰度开关控制开放。

## Capabilities

### New Capabilities

- `xingni-qingshi-quest-runtime`: 青石县五章主线、凭证链、NPC 支线、重复委托、确定性事件及统一登记行动状态机。
- `xingni-qingshi-survival-economy`: 星逆生命体力、伤势、时间、交易、资源风险、失败恢复、反软锁与灵根差异化规则。

### Modified Capabilities

- `xingni-taichu-qingshi-content`: 从九节点最小内容包扩展为带 NPC 日程、知识、服务、敌人、物品、配方和事件的生产内容包。
- `xingni-taichu-progression`: 从最小修为/凭证裁决扩展为版本化状态、任务进程、硬核失败和幂等权威行动。
- `world-scoped-narrative-style`: 星逆 prompt/runtime packet 增加当前任务、日程、可见事实、伤势和合法行动，同时保持 POV 与跨世界隔离。
- `world-scoped-save-and-knowledge`: 星逆旧状态迁移到新版并 seed 全部固定内容，保持暗月与星逆存档、知识严格隔离。

## Impact

- 主要影响 `src/lib/worlds/xingni/*`、星逆移动端面板、唯一 Zustand store 的兼容迁移、world knowledge seed、chat 世界 guard 与对应测试；不建立第二条聊天 API 或第二个 store。
- `/api/chat` 继续返回既有 SSE status/final 控制帧，DM 最低字段和 `resolveDmTurn` 权威提交不变；仅扩展可选星逆 `world_delta` 候选与兼容 digest。
- analytics 事件名、核心 payload 键和 append-only/idempotency 语义不变；只允许在现有摘要中加入世界、任务、行动与恢复结果。
- 数据库不新增破坏性表结构；新增内容通过已有 `world_id + map_id` 作用域幂等 seed。旧暗月数据和存档不迁移为星逆。
- 星逆 stable prompt 版本升级，动态 packet 受限以避免显著增加 TTFT；裁决器保持纯函数，DB、评测和 world tick 不进入首字前路径。
- 使用现有 `VERSECRAFT_ENABLE_XINGNI_TAICHU_WORLD` 灰度。关闭时保留存档并拒绝进入；回滚不删除数据。

## Non-Goals

- 不制作青云渡或任何第二张可游玩地图，不实现宗门、洞府、灵宠、拍卖、飞行或多人系统。
- 不重构暗月专属玩法，不改变 SSE 控制帧、DM 最低字段、analytics 事件名或单一 store 原则。
- 不让 AI 创建权威地点、NPC、出口、物品、配方、任务阶段、奖励或剧情真相。
