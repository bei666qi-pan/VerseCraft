/**
 * T2（技术改良）：PLAYER_CHAT 结构化输出 schema。
 *
 * 背景：VerseCraft 调研报告（docs/improvement-research-2026-07.md）指出，
 * 当前 DM JSON 输出可靠性完全依赖 system prompt 文字指令
 * （"请严格以JSON格式输出"）+ `responseFormatJsonObject`（仅约束合法 JSON
 * 语法，不约束字段/类型），真正的字段校验发生在下游
 * `normalizePlayerDmJson.ts`。OpenAI 官方数据显示，纯 prompting 复杂 schema
 * 遵循率 <40%，而 provider 级 schema 约束（json_schema response_format）
 * 可达 100%（见调研报告 2.4 节）。
 *
 * 本文件把 `src/features/play/stream/types.ts` 里的 `DMJson`（/api/chat
 * 对外契约的权威 TS 定义）**手工镜像**为 JSON Schema，供
 * `responseFormatJsonSchema`（见 providers/types.ts）使用。
 *
 * 【重要：当前只是"非 strict"模式，不是完整约束解码】
 * - `strict: false`：本 schema 是"结构提示"，不是 OpenAI 约束解码意义上的
 *   硬约束。原因：OpenAI strict 模式要求每层 `additionalProperties: false`
 *   且每个属性必须出现在 `required` 中（可选字段需建模为可空类型），这意味着
 *   schema 必须**逐字段**与 DMJson 完全对齐，一处遗漏就会导致模型物理上无法
 *   输出该字段——这是一次很容易"看起来修好了、实际悄悄砍掉某个玩法字段"的
 *   高风险改动。在没有真实网关/模型联调验证的前提下，本次改造刻意不启用
 *   strict:true，而是先提供 schema 引导 + 保持 additionalProperties:true
 *   的宽松兜底。
 * - 要升级到 strict:true，需要：① 逐字段核对本 schema 与 DMJson 完全一致
 *   （尤其 new_tasks/task_updates/reward 的嵌套结构）；② 把所有可选字段
 *   显式建模为 nullable 并加入 required；③ 在真实网关下用
 *   pnpm test:e2e:chat / pnpm test:e2e:contract 做实测，确认目标 provider
 *   真的支持 strict 约束解码（不是所有 OpenAI 兼容网关背后的模型都支持）。
 *
 * 默认关闭：见 `aiGatewayJsonSchemaEnabled`（src/lib/ai/config/envCore.ts，
 * 环境变量 `AI_GATEWAY_JSON_SCHEMA_ENABLED`）。开启前请先确认网关/模型支持
 * `response_format: {type:"json_schema", ...}`，否则可能收到网关 4xx 而不是
 * 优雅降级。
 */

const rewardSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    originium: { type: "number" },
    items: { type: "array", items: { type: "string" } },
    warehouseItems: { type: "array", items: { type: "string" } },
    unlocks: { type: "array", items: { type: "string" } },
    relationshipChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          npcId: { type: "string" },
          delta: { type: "string" },
          value: { type: "number" },
        },
      },
    },
  },
} as const;

const taskStatusEnum = ["active", "completed", "failed", "hidden", "available"] as const;
const guidanceLevelEnum = ["none", "light", "standard", "strong"] as const;

/**
 * PLAYER_CHAT DM JSON 的非 strict json_schema。与
 * `src/features/play/stream/types.ts` 的 `DMJson` 手工保持同步——修改
 * DMJson 字段时，请同步检查本文件（参见 CLAUDE.md 5.2 节的字段兼容检查清单）。
 */
export const PLAYER_DM_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: true,
  required: ["is_action_legal", "sanity_damage", "narrative", "is_death"],
  properties: {
    is_action_legal: { type: "boolean" },
    sanity_damage: { type: "number" },
    narrative: { type: "string" },
    is_death: { type: "boolean" },
    consumes_time: { type: "boolean" },
    time_cost: { type: "string", enum: ["free", "light", "standard", "heavy", "dangerous"] },
    risk_source: { type: "string" },
    damage_source: { type: "string" },
    turn_mode: { type: "string", enum: ["narrative_only", "decision_required", "system_transition"] },
    narrative_goal: { type: "string" },
    narrative_density: { type: "string", enum: ["low", "medium", "high"] },
    decision_required: { type: "boolean" },
    decision_options: { type: "array", items: { type: "string" } },
    decision_required_strict: { type: "boolean" },
    auto_continue_hint: { type: ["string", "null"] },
    protagonist_anchor: { type: "string" },
    world_consistency_flags: { type: "array", items: { type: "string" } },
    consumed_items: { type: "array", items: { type: "string" } },
    awarded_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          tier: { type: "string" },
          description: { type: "string" },
          tags: { type: "string" },
          statBonus: { type: "object", additionalProperties: { type: "number" } },
        },
      },
    },
    awarded_warehouse_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: { id: { type: "string" } },
      },
    },
    codex_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id", "name", "type"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["npc", "anomaly"] },
          known_info: { type: "string" },
          observation: { type: "string" },
          observations: { type: "array", items: { type: "string" } },
          favorability: { type: "number" },
          trust: { type: "number" },
          fear: { type: "number" },
          debt: { type: "number" },
          affection: { type: "number" },
          desire: { type: "number" },
          romanceEligible: { type: "boolean" },
          romanceStage: { type: "string", enum: ["none", "hint", "bonded", "committed"] },
          betrayalFlags: { type: "array", items: { type: "string" } },
          combatPower: { type: "number" },
          combatPowerDisplay: { type: "string" },
          personality: { type: "string" },
          traits: { type: "string" },
          rules_discovered: { type: "string" },
          weakness: { type: "string" },
        },
      },
    },
    relationship_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["npcId"],
        properties: {
          npcId: { type: "string" },
          favorability: { type: "number" },
          trust: { type: "number" },
          fear: { type: "number" },
          debt: { type: "number" },
          affection: { type: "number" },
          desire: { type: "number" },
          romanceEligible: { type: "boolean" },
          romanceStage: { type: "string", enum: ["none", "hint", "bonded", "committed"] },
          betrayalFlagAdd: { type: "string" },
        },
      },
    },
    main_threat_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          floorId: { type: "string" },
          threatId: { type: "string" },
          phase: { type: "string", enum: ["idle", "active", "suppressed", "breached"] },
          suppressionProgress: { type: "number" },
          lastResolvedAtHour: { type: "number" },
          counterHintsUsed: { type: "array", items: { type: "string" } },
        },
      },
    },
    weapon_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          weaponId: { type: "string" },
          stability: { type: "number" },
          calibratedThreatId: { type: ["string", "null"] },
          currentMods: { type: "array", items: { type: "string" } },
          currentInfusions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                threatTag: { type: "string" },
                turnsLeft: { type: "number" },
              },
            },
          },
          contamination: { type: "number" },
          repairable: { type: "boolean" },
        },
      },
    },
    options: { type: "array", items: { type: "string" } },
    currency_change: { type: "number" },
    new_tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id", "title"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          desc: { type: "string" },
          issuer: { type: "string" },
          reward: { anyOf: [{ type: "string" }, rewardSchema] },
          type: { type: "string", enum: ["main", "floor", "character", "conspiracy"] },
          issuerId: { type: "string" },
          issuerName: { type: "string" },
          floorTier: { type: "string" },
          guidanceLevel: { type: "string", enum: [...guidanceLevelEnum] },
          status: { type: "string", enum: [...taskStatusEnum] },
          expiresAt: { type: ["string", "null"] },
          betrayalPossible: { type: "boolean" },
          hiddenOutcome: { type: "string" },
          hiddenTriggerConditions: { type: "array", items: { type: "string" } },
          claimMode: { type: "string", enum: ["auto", "manual", "npc_grant"] },
          npcProactiveGrant: {
            type: "object",
            additionalProperties: true,
            properties: {
              enabled: { type: "boolean" },
              npcId: { type: "string" },
              minFavorability: { type: "number" },
              preferredLocations: { type: "array", items: { type: "string" } },
              cooldownHours: { type: "number" },
            },
          },
          nextHint: { type: "string" },
          worldConsequences: { type: "array", items: { type: "string" } },
          highRiskHighReward: { type: "boolean" },
        },
      },
    },
    task_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: [...taskStatusEnum] },
          nextHint: { type: "string" },
          hiddenOutcome: { type: "string" },
          expiresAt: { type: ["string", "null"] },
          worldConsequences: { type: "array", items: { type: "string" } },
          guidanceLevel: { type: "string", enum: [...guidanceLevelEnum] },
          reward: rewardSchema,
          betrayalPossible: { type: "boolean" },
          highRiskHighReward: { type: "boolean" },
        },
      },
    },
    player_location: { type: "string" },
    npc_location_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id", "to_location"],
        properties: {
          id: { type: "string" },
          to_location: { type: "string" },
        },
      },
    },
    bgm_track: { type: "string" },
    next_chapter_title_candidate: { type: "string" },
    security_meta: {
      type: "object",
      additionalProperties: true,
      properties: {
        action: { type: "string", enum: ["allow", "review", "degrade", "terminate", "block"] },
        stage: { type: "string", enum: ["pre_input", "post_model", "final_output", "risk_control"] },
        risk_level: { type: "string", enum: ["normal", "gray", "black"] },
        request_id: { type: "string" },
        reason: { type: "string" },
      },
    },
    anti_cheat_meta: { type: "object", additionalProperties: true },
  },
};

export const PLAYER_DM_JSON_SCHEMA_NAME = "versecraft_player_dm_json_v1";

/**
 * 构造传给 provider 的 `responseFormatJsonSchema`。调用方（execute.ts）应仅在
 * `aiGatewayJsonSchemaEnabled` 为 true 且当前任务是 PLAYER_CHAT 时使用。
 */
export function buildPlayerDmJsonSchemaRequest(): {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} {
  return {
    name: PLAYER_DM_JSON_SCHEMA_NAME,
    // 见文件头注释：当前刻意不使用 strict:true。
    strict: false,
    schema: PLAYER_DM_JSON_SCHEMA,
  };
}
