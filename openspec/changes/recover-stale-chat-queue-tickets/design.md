## Context

`/play` 在排队等待时将待执行行动暂存到本地，并在重载后轮询同一个 ticket。queue store 的 TTL、终态清理和客户端轮询之间存在竞态；真实浏览器验证还发现 queue store 降级/恢复边界可让刚获准的 ticket 在执行 claim 时缺失。两种情况都会在模型/SSE 开始前返回 409。

## Goals / Non-Goals

**Goals:**

- 把任一已持 queue ticket 的可识别失效 409 转换为一次新的正常 admission。
- 清理持久化 ticket，避免重载后重复触发相同错误。
- 以纯函数确定是否可恢复，并用客户端测试覆盖。

**Non-Goals:**

- 不改变服务端 ticket TTL、队列公平性、SSE/DM JSON 或模型路由。
- 不对模型失败、内容校验失败、未知 409 或已发送的模型回合重试。

## Decisions

- 在客户端非 SSE 错误收口识别 `status=409` 且 reason 属于 ticket 终态/不存在类别；这是唯一有完整 UI 恢复上下文的位置。
- 恢复前清除 pending ticket；使用一次性参数/引用防止递归或双重提交。
- 重新调用现有 queue admission，而不是直接略过 queue，以保留限流、公平和身份校验。

## Risks / Trade-offs

- [错误分类过宽导致重复行动] → 仅接受明确 ticket reason、要求本次请求实际携带 queue ticket、严格一次；409 出现在模型/SSE 前。
- [用户看不到失败原因] → 新 admission 失败时回落现有可见失败语义，并恢复输入。
- [增加首包等待] → 恢复只发生于 409 之后，正常回合不增加任何首字前工作。
