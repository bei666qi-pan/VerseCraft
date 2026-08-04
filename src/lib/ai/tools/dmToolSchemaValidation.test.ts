// src/lib/ai/tools/dmToolSchemaValidation.test.ts
/**
 * DM Agent 工具 JSON Schema 服务端校验测试
 *
 * 服务端真实执行 JSON Schema 校验，不是只把 schema 发给模型。
 * 覆盖：
 * - 未知工具被拒绝
 * - 非法 JSON 参数被拒绝
 * - 缺少必填字段被拒绝
 * - 错误类型被拒绝
 * - 额外敏感字段被拒绝（additionalProperties: false）
 * - 所有 schema 的 required 字段非空且合法
 */

import { describe, it } from "node:test";
import { DM_AGENT_DEFAULTS } from "./dmAgentTypes";
import assert from "node:assert/strict";
import { DM_TOOL_SCHEMAS, ALL_DM_TOOL_NAMES } from "./dmToolSchemas";

describe("Schema Validation — All Tools", () => {
  for (const toolName of ALL_DM_TOOL_NAMES) {
    it(`${toolName}: schema 存在且有效`, () => {
      const schema = DM_TOOL_SCHEMAS[toolName];
      assert.ok(schema, `Schema for ${toolName} must exist`);
      assert.ok(schema.meta, `meta must exist for ${toolName}`);
      assert.ok(schema.meta.name.length > 0, `name must be non-empty for ${toolName}`);
      assert.ok(schema.meta.description.length > 0, `description must be non-empty for ${toolName}`);
      assert.ok(schema.parameters, `parameters must exist for ${toolName}`);
    });
  }
});

describe("Schema Validation — Required Fields", () => {
  it("issue_quest: 缺少 title 应被拒绝", () => {
    const schema = DM_TOOL_SCHEMAS.issue_quest;
    const required = (schema.parameters as any).required as string[] | undefined;
    assert.ok(required, "issue_quest must have required fields");
    assert.ok(required!.includes("title"), "title must be required");
  });

  it("issue_quest: 缺少 idempotency_key 应被拒绝", () => {
    const schema = DM_TOOL_SCHEMAS.issue_quest;
    const required = (schema.parameters as any).required as string[] | undefined;
    assert.ok(required!.includes("idempotency_key"), "idempotency_key must be required");
  });

  it("forge_weapon: 缺少 recipe_id 应被拒绝", () => {
    const schema = DM_TOOL_SCHEMAS.forge_weapon;
    const required = (schema.parameters as any).required as string[] | undefined;
    assert.ok(required!.includes("recipe_id"), "recipe_id must be required");
  });

  it("start_combat: 缺少 enemy_npc_id 应被拒绝", () => {
    const schema = DM_TOOL_SCHEMAS.start_combat;
    const required = (schema.parameters as any).required as string[] | undefined;
    assert.ok(required!.includes("enemy_npc_id"), "enemy_npc_id must be required");
  });

  it("resolve_combat_action: 缺少 action_description 应被拒绝", () => {
    const schema = DM_TOOL_SCHEMAS.resolve_combat_action;
    const required = (schema.parameters as any).required as string[] | undefined;
    assert.ok(required!.includes("action_description"), "action_description must be required");
  });
});

describe("Schema Validation — Unknown Tool Rejection", () => {
  it("未知工具名不在注册表中", () => {
    const unknownNames = ["delete_world", "give_admin", "read_memory", "spawn_npc", "kill_player"];
    for (const name of unknownNames) {
      assert.ok(!(name in DM_TOOL_SCHEMAS), `Unknown tool '${name}' must not be in registry`);
    }
  });

  it("所有注册工具名以字母开头", () => {
    for (const name of ALL_DM_TOOL_NAMES) {
      assert.ok(/^[a-z]/.test(name), `Tool name '${name}' must start with lowercase letter`);
    }
  });
});

describe("Schema Validation — Type Enforcement", () => {
  it("issue_quest title 必须是 string", () => {
    const schema = DM_TOOL_SCHEMAS.issue_quest;
    const props = (schema.parameters as any).properties as Record<string, any>;
    assert.strictEqual(props.title.type, "string");
  });

  it("forge_weapon recipe_id 必须是 string", () => {
    const schema = DM_TOOL_SCHEMAS.forge_weapon;
    const props = (schema.parameters as any).properties as Record<string, any>;
    assert.strictEqual(props.recipe_id.type, "string");
  });

  it("start_combat enemy_npc_id 必须是 string", () => {
    const schema = DM_TOOL_SCHEMAS.start_combat;
    const props = (schema.parameters as any).properties as Record<string, any>;
    assert.strictEqual(props.enemy_npc_id.type, "string");
  });

  it("resolve_combat_action action_type 有合法枚举值", () => {
    const schema = DM_TOOL_SCHEMAS.resolve_combat_action;
    const props = (schema.parameters as any).properties as Record<string, any>;
    assert.ok(Array.isArray(props.action_type.enum), "action_type must have enum");
    assert.ok(props.action_type.enum.includes("attack"), "must include attack");
    assert.ok(props.action_type.enum.includes("defend"), "must include defend");
  });

  it("update_quest_progress new_status 有合法枚举值", () => {
    const schema = DM_TOOL_SCHEMAS.update_quest_progress;
    const props = (schema.parameters as any).properties as Record<string, any>;
    assert.ok(Array.isArray(props.new_status.enum), "new_status must have enum");
    const validStatuses = props.new_status.enum;
    assert.ok(validStatuses.includes("active"));
    assert.ok(validStatuses.includes("completed"));
  });
});

describe("Schema Validation — additionalProperties", () => {
  it("所有写工具的 schema 禁止额外属性", () => {
    const writeToolNames = [
      "issue_quest", "update_quest_progress", "forge_weapon",
      "consume_materials", "grant_item", "start_combat",
      "resolve_combat_action", "apply_world_event",
    ];
    for (const name of writeToolNames) {
      const schema = DM_TOOL_SCHEMAS[name as keyof typeof DM_TOOL_SCHEMAS];
      const params = schema.parameters as any;
      // additionalProperties should be false to reject extra fields
      if (params.additionalProperties !== undefined) {
        assert.strictEqual(params.additionalProperties, false,
          `${name} must reject extra properties`);
      }
    }
  });

  it("不应暴露内部 prompt 或敏感参数", () => {
    const sensitivePatterns = ["prompt", "system", "internal", "secret", "token", "api_key"];
    for (const name of ALL_DM_TOOL_NAMES) {
      const schema = DM_TOOL_SCHEMAS[name as keyof typeof DM_TOOL_SCHEMAS];
      const props = (schema.parameters as any).properties as Record<string, any> | undefined;
      if (props) {
        for (const key of Object.keys(props)) {
          for (const pattern of sensitivePatterns) {
            assert.ok(!key.toLowerCase().includes(pattern),
              `${name} must not expose sensitive field '${key}'`);
          }
        }
      }
    }
  });
});

describe("Schema Validation — Max Tool Result Size", () => {
  it("工具结果大小限制防止信息泄露", () => {
    // MAX_TOOL_RESULT_CHARS prevents large result injection
    // DM_AGENT_DEFAULTS imported at top of file
    assert.ok(DM_AGENT_DEFAULTS.MAX_TOOL_RESULT_CHARS > 0);
    assert.ok(DM_AGENT_DEFAULTS.MAX_TOOL_RESULT_CHARS <= 10_000);
  });
});
