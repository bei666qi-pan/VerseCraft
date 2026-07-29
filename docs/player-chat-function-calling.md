# PLAYER_CHAT Function Calling 架构

## 目标

VerseCraft 的在线回合采用 **terminal Function Calling**，而不是传统 Agent 工具循环：

```text
服务端预计算权威状态
  → 单次 PLAYER_CHAT API
  → 模型必须调用 submit_player_turn
  → tool arguments 投影回原有 DM JSON 流
  → normalize / validator / 状态机 / commit guard
```

这项升级解决的是“模型怎样提交一回合”的结构约束，不把任务、职业、NPC 权限等真实裁决交给模型。

## 为什么仍然只调用一次模型 API

`submit_player_turn` 是终端输出函数，不存在 handler 执行和 tool result 回灌：

- 不进行第二轮模型调用；
- 不允许模型选择其他工具；
- 函数参数就是本回合最终候选 DM JSON；
- 流式 `tool_calls[].function.arguments` 会在传输层映射为原有 `delta.content`；
- `/api/chat` 后续链路不需要改变。

因此它与 `runToolLoop.ts` 的离线可执行工具循环是两套不同机制。在线主回合仍坚持 workflow-over-agent。

## 约束边界

Function Calling 能增强：

- 强制模型通过唯一的 `submit_player_turn` 提交；
- 用 PLAYER_DM_JSON_SCHEMA 描述参数字段、类型和枚举；
- 减少正文夹杂 Markdown、解释文字或多个 JSON 对象；
- 保持流式输出和现有 SSE 合同。

Function Calling 不能替代：

- 任务状态机和非法状态转移拦截；
- 职业资格、试炼完成和认证 NPC 见证；
- NPC 可知/禁知事实过滤；
- 地点、在场 NPC、装备、武器和死亡连续性守卫；
- 生成后叙事与结构化字段擦洗。

模型仍然只能提交候选变化，代码仍然负责裁决和落库。

## 配置

环境变量：

```bash
AI_PLAYER_CHAT_FUNCTION_CALLING_MODE=prefer
```

可选值：

| 值 | 行为 |
|---|---|
| `off` | 关闭 Function Calling，恢复原有 `response_format: json_object/json_schema` |
| `prefer` | 默认值。强制调用终端函数；若网关明确返回工具参数不兼容的 400/404/422/501，则同角色立即回退一次 `json_object` |
| `required` | 强制终端函数，网关不兼容时直接进入原有错误/模型回退链，不静默降级 |

`prefer` 的兼容回退只发生在工具能力被网关明确拒绝时。正常成功回合仍只有一次模型 API 调用。

## Provider 兼容

请求采用 OpenAI-compatible 格式：

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "submit_player_turn",
        "description": "...",
        "parameters": { "type": "object", "properties": {} }
      }
    }
  ],
  "tool_choice": {
    "type": "function",
    "function": { "name": "submit_player_turn" }
  }
}
```

当前不启用 provider strict schema：PLAYER_DM_JSON_SCHEMA 仍为兼容历史 DMJson 字段的宽松 schema，最终字段安全继续由本地 normalizer 和 validators 保证。

## 回归测试

重点测试覆盖：

- 网关是否注入唯一命名函数并移除冲突的 `response_format`；
- `off` 模式是否完整恢复旧请求；
- 非流式 `message.tool_calls` 参数投影；
- 流式 `delta.tool_calls` 跨分片拼接；
- `tool_calls` finish reason 转换；
- `prefer` 兼容降级与 `required` 禁止降级；
- 原有显式离线 tools 不被 PLAYER_CHAT 终端工具覆盖。
