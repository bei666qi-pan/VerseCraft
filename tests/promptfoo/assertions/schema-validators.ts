/**
 * Promptfoo 自定义断言/校验器
 *
 * 这些是确定性断言函数，不需要调 LLM，免费且秒出结果。
 * 用于验证 AI 输出是否满足 Schema 和规则一致性约束。
 *
 * 用法（在 promptfooconfig.yaml 中）：
 * assert:
 *   - type: javascript
 *     value: file://tests/promptfoo/assertions/schema-validators.ts
 */

// === 武器 Schema 校验 ===

/** 合法的武器阶级 */
export const VALID_WEAPON_TIERS = ["S", "A", "B", "C"] as const;

/** 合法的灌注类型 */
export const VALID_INFUSIONS = [
  "fire", "ice", "lightning", "void",
  "seal", "anchor", "purify",
] as const;

/** 合法的模块槽位 */
export const VALID_MOD_SLOTS = ["core", "surface", "counter", "anchor"] as const;

/** 合法的装备槽位 */
export const VALID_EQUIP_SLOTS = ["weapon_main"] as const;

/**
 * 验证武器更新对象的结构合法性
 * @returns 错误信息数组，空数组表示通过
 */
export function validateWeaponUpdates(wu: unknown): string[] {
  const errors: string[] = [];
  if (!wu || typeof wu !== "object") return errors;

  const updates = wu as Record<string, unknown>;

  // stability: 必须是 0-100 的数字
  if ("stability" in updates) {
    const s = updates.stability;
    if (typeof s !== "number" || s < 0 || s > 100) {
      errors.push(`weapon_updates.stability must be number 0-100, got ${JSON.stringify(s)}`);
    }
  }

  // contamination: 必须是 0-100 的数字
  if ("contamination" in updates) {
    const c = updates.contamination;
    if (typeof c !== "number" || c < 0 || c > 100) {
      errors.push(`weapon_updates.contamination must be number 0-100, got ${JSON.stringify(c)}`);
    }
  }

  // tier: 必须在合法枚举内
  if ("tier" in updates) {
    const t = updates.tier;
    if (typeof t === "string" && !VALID_WEAPON_TIERS.includes(t as typeof VALID_WEAPON_TIERS[number])) {
      errors.push(`weapon_updates.tier must be one of ${VALID_WEAPON_TIERS.join(", ")}, got ${t}`);
    }
  }

  // infusion: 必须在合法枚举内（允许 null/undefined）
  if ("infusion" in updates && updates.infusion !== null && updates.infusion !== undefined) {
    const inf = updates.infusion;
    if (typeof inf === "string" && !VALID_INFUSIONS.includes(inf as typeof VALID_INFUSIONS[number])) {
      errors.push(`weapon_updates.infusion must be one of ${VALID_INFUSIONS.join(", ")}, got ${inf}`);
    }
  }

  // mod_type: 必须在合法枚举内
  if ("mod_type" in updates && updates.mod_type !== null && updates.mod_type !== undefined) {
    const mt = updates.mod_type;
    if (typeof mt === "string" && !VALID_MOD_SLOTS.includes(mt as typeof VALID_MOD_SLOTS[number])) {
      errors.push(`weapon_updates.mod_type must be one of ${VALID_MOD_SLOTS.join(", ")}, got ${mt}`);
    }
  }

  // counter: 必须是字符串（如果存在）
  if ("counter" in updates) {
    const ct = updates.counter;
    if (ct !== null && ct !== undefined && (typeof ct !== "string" || ct.length === 0)) {
      errors.push(`weapon_updates.counter must be non-empty string, got ${JSON.stringify(ct)}`);
    }
  }

  return errors;
}

// === 职业规则校验 ===

/** 职业 ID 到技能名的映射 */
export const PROFESSION_SKILL_MAP: Record<string, string> = {
  "守灯人": "稳心定灯",
  "巡迹客": "疾行断压",
  "觅兆者": "征兆聚焦",
  "齐日角": "缓锋陈词",
  "溯源师": "断链重组",
};

/** 每个职业的 excludeSystems */
export const PROFESSION_EXCLUDED_SYSTEMS: Record<string, string[]> = {
  "守灯人": ["weapon_damage", "attribute_override", "threat_counter_bypass"],
  "巡迹客": ["threat_immunity", "free_unlimited_actions", "attribute_override"],
  "觅兆者": ["auto_solve_threat", "full_auto_hint", "attribute_override"],
  "齐日角": ["force_persuade_all", "relationship_auto_win", "attribute_override"],
  "溯源师": ["truth_full_unlock", "forge_free_upgrade", "attribute_override"],
};

/**
 * 验证给定职业的输出是否包含其他职业的技能名
 * @returns 错误信息数组
 */
export function validateProfessionSkillExclusivity(
  output: Record<string, unknown>,
  currentProfession: string
): string[] {
  const errors: string[] = [];
  if (!currentProfession) return errors;

  const text = JSON.stringify(output);

  for (const [prof, skill] of Object.entries(PROFESSION_SKILL_MAP)) {
    if (prof === currentProfession) continue;
    if (text.includes(skill)) {
      errors.push(
        `${currentProfession}的输出中出现了${prof}的技能名「${skill}」`
      );
    }
  }

  return errors;
}

/**
 * 验证输出是否违反了职业的 excludeSystems 约束
 * @returns 错误信息数组
 */
export function validateProfessionExcludedSystems(
  output: Record<string, unknown>,
  currentProfession: string
): string[] {
  const errors: string[] = [];
  if (!currentProfession) return errors;

  const excluded = PROFESSION_EXCLUDED_SYSTEMS[currentProfession];
  if (!excluded) return errors;

  const text = JSON.stringify(output).toLowerCase();

  // 排除系统的语义映射
  const exclusionPatterns: Record<string, RegExp[]> = {
    "weapon_damage": [/武器.*伤害.*加成/, /damage.boost/, /damageBoost/],
    "attribute_override": [/属性.*(?:翻倍|暴涨|提升50|直逼)/, /全属性\+/],
    "threat_counter_bypass": [/绕过.*威胁.*反制/, /counter_bypass/],
    "threat_immunity": [/威胁.*免疫/, /threat.*immune/],
    "free_unlimited_actions": [/免费.*无限.*行动/, /不限.*回合/],
    "auto_solve_threat": [/自动.*破解.*威胁/, /自动.*消除.*威胁/],
    "full_auto_hint": [/完全.*自动.*提示/, /auto.*hint.*full/],
    "force_persuade_all": [/强制.*说服/, /不可拒绝/],
    "relationship_auto_win": [/关系.*自动.*成功/, /auto.*win.*relation/],
    "truth_full_unlock": [/真相.*完全.*解锁/, /full.*unlock.*truth/],
    "forge_free_upgrade": [/免费.*锻造.*升级/, /free.*forge.*upgrade/],
  };

  for (const system of excluded) {
    const patterns = exclusionPatterns[system] ?? [];
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        errors.push(
          `输出违反了${currentProfession}的excludeSystem约束「${system}」`
        );
        break; // 每个 system 只报一次
      }
    }
  }

  return errors;
}

// === DM JSON Schema 校验 ===

/**
 * 验证 DM JSON 的必填字段完整性
 */
export function validateDmJsonRequiredFields(output: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ["narrative", "is_action_legal", "sanity_damage", "is_death"];

  for (const field of required) {
    if (!(field in output)) {
      errors.push(`缺少必填字段: ${field}`);
    }
  }

  // 类型校验
  if (typeof output.narrative !== "string" || output.narrative.length < 50) {
    errors.push(`narrative 必须是至少50字符的字符串`);
  }
  if (typeof output.is_action_legal !== "boolean") {
    errors.push(`is_action_legal 必须是 boolean`);
  }
  if (typeof output.sanity_damage !== "number" || output.sanity_damage < 0) {
    errors.push(`sanity_damage 必须是 >=0 的数字`);
  }
  if (typeof output.is_death !== "boolean") {
    errors.push(`is_death 必须是 boolean`);
  }

  return errors;
}

/**
 * 验证 options 数组
 */
export function validateOptions(options: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(options)) {
    errors.push("options 必须是数组");
    return errors;
  }

  if (options.length < 2 || options.length > 4) {
    errors.push(`options 数组长度必须在 2-4 之间，当前 ${options.length}`);
  }

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (typeof opt !== "string" || opt.length === 0) {
      errors.push(`options[${i}] 必须是非空字符串`);
    }
  }

  return errors;
}

// === 扩展字段校验（v3 升级补齐） ===

/** 合法的 currency_change 类型 */
export const VALID_CURRENCY_CHANGE_KEYS = ["originium", "currency", "sanity", "stability"] as const;

/** 合法的 task_update status */
export const VALID_TASK_STATUS = ["active", "completed", "failed", "abandoned"] as const;

/** 合法的 codex entry type */
export const VALID_CODEX_TYPES = ["npc", "location", "threat", "item", "lore", "faction"] as const;

/** 合法的 relationship 变化范围 */
export const VALID_RELATIONSHIP_RANGE = [-100, 100] as const;

/** 单次 currency_change 边界（不允许单步变化超过 50） */
export const CURRENCY_CHANGE_LIMIT = 50;

/**
 * 验证 currency_change 字段
 * 不允许：
 * - 凭空出现非正整数 / 非负整数
 * - 单步变化超过 50（防破坏经济系统）
 */
export function validateCurrencyChange(change: unknown): string[] {
  const errors: string[] = [];
  if (change === null || change === undefined) return errors;
  if (typeof change !== "object") {
    errors.push("currency_change 必须是对象");
    return errors;
  }

  const c = change as Record<string, unknown>;
  for (const [key, value] of Object.entries(c)) {
    if (!VALID_CURRENCY_CHANGE_KEYS.includes(key as typeof VALID_CURRENCY_CHANGE_KEYS[number])) {
      errors.push(`currency_change.${key} 不是合法字段`);
    }
    if (typeof value !== "number") {
      errors.push(`currency_change.${key} 必须是数字`);
      continue;
    }
    if (Math.abs(value) > CURRENCY_CHANGE_LIMIT) {
      errors.push(`currency_change.${key} 单步变化 ${value} 超过上限 ${CURRENCY_CHANGE_LIMIT}（防经济破坏）`);
    }
  }

  return errors;
}

/**
 * 验证 task_updates 字段
 * 必填：task_id
 * 可选：status(enum), progress(0-100), description
 */
export function validateTaskUpdates(updates: unknown): string[] {
  const errors: string[] = [];
  if (updates === null || updates === undefined) return errors;
  if (!Array.isArray(updates)) {
    errors.push("task_updates 必须是数组");
    return errors;
  }

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!u || typeof u !== "object") {
      errors.push(`task_updates[${i}] 必须是对象`);
      continue;
    }
    const task = u as Record<string, unknown>;
    if (typeof task.task_id !== "string" || task.task_id.length === 0) {
      errors.push(`task_updates[${i}].task_id 必须是非空字符串`);
    }
    if (task.status !== undefined && task.status !== null) {
      if (typeof task.status !== "string" || !VALID_TASK_STATUS.includes(task.status as typeof VALID_TASK_STATUS[number])) {
        errors.push(`task_updates[${i}].status 必须是 ${VALID_TASK_STATUS.join(", ")} 之一`);
      }
    }
    if (task.progress !== undefined && task.progress !== null) {
      if (typeof task.progress !== "number" || task.progress < 0 || task.progress > 100) {
        errors.push(`task_updates[${i}].progress 必须是 0-100 的数字`);
      }
    }
  }

  return errors;
}

/**
 * 验证 codex_updates 字段
 * 必填：entry_id, type
 * 不允许类型不在合法枚举内
 */
export function validateCodexUpdates(updates: unknown): string[] {
  const errors: string[] = [];
  if (updates === null || updates === undefined) return errors;
  if (!Array.isArray(updates)) {
    errors.push("codex_updates 必须是数组");
    return errors;
  }

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!u || typeof u !== "object") {
      errors.push(`codex_updates[${i}] 必须是对象`);
      continue;
    }
    const entry = u as Record<string, unknown>;
    if (typeof entry.entry_id !== "string" || entry.entry_id.length === 0) {
      errors.push(`codex_updates[${i}].entry_id 必须是非空字符串`);
    }
    if (typeof entry.type !== "string" || !VALID_CODEX_TYPES.includes(entry.type as typeof VALID_CODEX_TYPES[number])) {
      errors.push(`codex_updates[${i}].type 必须是 ${VALID_CODEX_TYPES.join(", ")} 之一`);
    }
  }

  return errors;
}

/**
 * 验证 relationship_updates 字段
 * delta 必须在 [-100, 100]，单步变化不超过 30
 */
export function validateRelationshipUpdates(updates: unknown): string[] {
  const errors: string[] = [];
  if (updates === null || updates === undefined) return errors;
  if (!Array.isArray(updates)) {
    errors.push("relationship_updates 必须是数组");
    return errors;
  }

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!u || typeof u !== "object") {
      errors.push(`relationship_updates[${i}] 必须是对象`);
      continue;
    }
    const rel = u as Record<string, unknown>;
    if (typeof rel.npc_id !== "string" || rel.npc_id.length === 0) {
      errors.push(`relationship_updates[${i}].npc_id 必须是非空字符串`);
    }
    if (rel.delta !== undefined && rel.delta !== null) {
      if (typeof rel.delta !== "number") {
        errors.push(`relationship_updates[${i}].delta 必须是数字`);
      } else if (rel.delta < VALID_RELATIONSHIP_RANGE[0] || rel.delta > VALID_RELATIONSHIP_RANGE[1]) {
        errors.push(`relationship_updates[${i}].delta 必须在 ${VALID_RELATIONSHIP_RANGE[0]}-${VALID_RELATIONSHIP_RANGE[1]} 之间`);
      } else if (Math.abs(rel.delta) > 30) {
        errors.push(`relationship_updates[${i}].delta 单步变化 ${rel.delta} 超过 30（防关系系统破坏）`);
      }
    }
  }

  return errors;
}

/**
 * 验证 consumed_items 字段
 * 必填：item_id, quantity
 * quantity 必须是正整数，单次消耗不超过 10
 */
export function validateConsumedItems(items: unknown): string[] {
  const errors: string[] = [];
  if (items === null || items === undefined) return errors;
  if (!Array.isArray(items)) {
    errors.push("consumed_items 必须是数组");
    return errors;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") {
      errors.push(`consumed_items[${i}] 必须是对象`);
      continue;
    }
    const item = it as Record<string, unknown>;
    if (typeof item.item_id !== "string" || item.item_id.length === 0) {
      errors.push(`consumed_items[${i}].item_id 必须是非空字符串`);
    }
    if (typeof item.quantity !== "number" || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      errors.push(`consumed_items[${i}].quantity 必须是正整数`);
    } else if (item.quantity > 10) {
      errors.push(`consumed_items[${i}].quantity ${item.quantity} 单次消耗超过 10（防物品破坏）`);
    }
  }

  return errors;
}

/**
 * 验证 player_location 字段
 * 必须是字符串，包含合法楼层或场景关键词
 */
export function validatePlayerLocation(location: unknown): string[] {
  const errors: string[] = [];
  if (location === null || location === undefined) return errors;
  if (typeof location !== "string") {
    errors.push("player_location 必须是字符串");
    return errors;
  }

  // 防"瞬移"作弊：拒绝包含"瞬移""穿越""凭空"等可疑词
  const suspiciousPatterns = [/瞬移到/i, /突然出现在/i, /穿越到/i];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(location)) {
      errors.push(`player_location 包含可疑表述: ${pattern.source}`);
    }
  }

  return errors;
}

/**
 * 验证 awarded_items 字段
 * - 数量不超过 5（防物品凭空出现）
 * - 每个物品必须有非空 id 和 name
 * - id 长度不超过 64
 */
export const MAX_AWARDED_ITEMS_PER_STEP = 5;
export const MAX_ITEM_ID_LENGTH = 64;

export function validateAwardedItems(items: unknown): string[] {
  const errors: string[] = [];
  if (items === null || items === undefined) return errors;
  if (!Array.isArray(items)) {
    errors.push("awarded_items 必须是数组");
    return errors;
  }

  if (items.length > MAX_AWARDED_ITEMS_PER_STEP) {
    errors.push(`awarded_items=${items.length} 单步超过 ${MAX_AWARDED_ITEMS_PER_STEP}`);
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") {
      errors.push(`awarded_items[${i}] 必须是对象`);
      continue;
    }
    const item = it as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.length === 0) {
      errors.push(`awarded_items[${i}].id 必须是非空字符串`);
    } else if (item.id.length > MAX_ITEM_ID_LENGTH) {
      errors.push(`awarded_items[${i}].id 长度 ${item.id.length} 超过 ${MAX_ITEM_ID_LENGTH}`);
    }
    if (typeof item.name !== "string" || item.name.length === 0) {
      errors.push(`awarded_items[${i}].name 必须是非空字符串`);
    }
  }

  return errors;
}

// === 组合校验：完整 DM JSON ===

/**
 * 一次性校验所有扩展字段
 */
export function validateFullDmJson(output: Record<string, unknown>): {
  required: string[];
  weapons: string[];
  options: string[];
  extensions: {
    currency: string[];
    tasks: string[];
    codex: string[];
    relationships: string[];
    consumed: string[];
    location: string[];
  };
} {
  return {
    required: validateDmJsonRequiredFields(output),
    weapons: validateWeaponUpdates(output.weapon_updates),
    options: validateOptions(output.options),
    extensions: {
      currency: validateCurrencyChange(output.currency_change),
      tasks: validateTaskUpdates(output.task_updates),
      codex: validateCodexUpdates(output.codex_updates),
      relationships: validateRelationshipUpdates(output.relationship_updates),
      consumed: validateConsumedItems(output.consumed_items),
      location: validatePlayerLocation(output.player_location),
    },
  };
}

/**
 * 汇总错误（空 = 通过）
 */
export function collectAllErrors(report: ReturnType<typeof validateFullDmJson>): string[] {
  return [
    ...report.required.map((e) => `[required] ${e}`),
    ...report.weapons.map((e) => `[weapon] ${e}`),
    ...report.options.map((e) => `[options] ${e}`),
    ...report.extensions.currency.map((e) => `[currency] ${e}`),
    ...report.extensions.tasks.map((e) => `[tasks] ${e}`),
    ...report.extensions.codex.map((e) => `[codex] ${e}`),
    ...report.extensions.relationships.map((e) => `[relations] ${e}`),
    ...report.extensions.consumed.map((e) => `[consumed] ${e}`),
    ...report.extensions.location.map((e) => `[location] ${e}`),
  ];
}
