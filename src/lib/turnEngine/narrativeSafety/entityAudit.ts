import {
  NPC_CANONICAL_IDENTITY_BY_ID,
  getNpcCanonicalIdentity,
  isRegisteredCanonicalNpcId,
} from "@/lib/registry/npcCanon";
import { ITEMS } from "@/lib/registry/items";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { getWorldFactById } from "@/lib/worldFacts/worldFactRegistry";
import type {
  NarrativeSafetyEntityReference,
  NarrativeSafetyInput,
  NarrativeSafetyIssue,
  NarrativeSafetyIssueCode,
  SafetyInvariantCode,
} from "@/lib/turnEngine/narrativeSafety/types";

const NPC_ID_RE = /\bN-\d{3,6}\b/gi;
const LOCATION_ID_RE = /\b(?:LOC|L)-[A-Za-z0-9_-]{2,80}\b/g;
const ITEM_ID_RE = /\b(?:I|W)-[A-Za-z0-9_-]{2,80}\b/g;
const ITEM_ID_STRICT_RE = /^(?:I|W)-[A-Za-z0-9_-]{2,80}$/;
const RELATIONSHIP_ID_RE = /\b(?:REL|R)-[A-Za-z0-9_-]{2,80}\b/g;
const RELATIONSHIP_ID_STRICT_RE = /^(?:REL|R)-[A-Za-z0-9_-]{2,80}$/;
const MINIMAL_DM_KEYS = ["is_action_legal", "sanity_damage", "narrative", "is_death"] as const;
const ENTITY_INJECTION_RE =
  /(create|add|register|spawn|invent|ignore|override|rewrite).{0,24}(npc|character|location|item|faction|relationship|canon|setting)|(?:创建|新增|注册|生成|编造|添加|忽略|覆盖|改写).{0,12}(NPC|角色|地点|道具|阵营|关系|设定|真相)/i;
const STRONG_NPC_SURFACE_RE =
  /(?:^|[\s"'“”‘’（(，。！？；:：])([\p{Script=Han}·]{2,8})(?:推门进来|走进来|走了进来|站起来|出现在|忽然出现|开口|低声说|说道|说|问|喊|回答|递给)/gu;
const GENERIC_DIRECT_SPEECH_RE = /(?:^|[\s"'“”‘’（(，。！？；])(?:他|她|那人|对方)\s*(?:说|问|喊|回答|低声说)\s*[：:]/u;

const STRUCTURED_FIELDS = [
  "codex_updates",
  "relationship_updates",
  "npc_location_updates",
  "awarded_items",
  "awarded_warehouse_items",
  "new_tasks",
  "task_updates",
  "dm_change_set",
] as const;

const VISIBLE_OPTION_TEXT_KEYS = new Set(["text", "label", "title", "description", "action", "option", "content"]);

const COMMON_NPC_SURFACES = new Set([
  "老板",
  "女孩",
  "男孩",
  "女人",
  "男人",
  "老人",
  "小孩",
  "孩子",
  "住户",
  "居民",
  "店员",
  "保安",
  "医生",
  "老师",
  "邮差",
  "护士",
  "厨师",
  "电工",
  "那人",
  "对方",
  "他",
  "她",
]);
const PRONOUN_NARRATION_SURFACE_RE =
  /^(?:\u6211\u4eec|\u4f60\u4eec|\u4ed6\u4eec|\u5979\u4eec|\u5b83\u4eec|\u6211|\u4f60|\u4ed6|\u5979|\u5b83|\u5bf9\u65b9|\u90a3\u4eba|\u4e5f\u53ef\u4ee5|\u8fd8\u53ef\u4ee5)/u;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNpcId(value: unknown): string {
  const text = normalizeText(value);
  const match = text.match(/^(n)-(\d{3,6})$/i);
  if (match?.[2]) return `N-${match[2]}`;
  return text.toUpperCase();
}

function uniq(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const text = normalizeText(value);
    if (text) out.add(text);
  }
  return [...out];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isExplicitlyAllowed(id: string, input: NarrativeSafetyInput): boolean {
  const allowed = new Set([
    ...(input.allowedEntityIds ?? []),
    ...(input.sessionCommittedEntityIds ?? []),
    ...(input.serverAllowedGeneratedEntityIds ?? []),
  ]);
  return allowed.has(id);
}

function isSurfaceExplicitlyAllowed(surface: string, input: NarrativeSafetyInput): boolean {
  const text = normalizeText(surface);
  if (!text) return false;
  if (isExplicitlyAllowed(text, input)) return true;
  return (input.sessionCommittedEntityIds ?? []).some((value) => {
    const committed = normalizeText(value);
    const prefix = text.slice(0, 2);
    return (
      committed.length >= 2 &&
      (committed.includes(text) ||
        text.includes(committed) ||
        (prefix.length >= 2 && committed.includes(prefix)))
    );
  });
}

function canonicalNpcSurfaceMap(): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of Object.keys(NPC_CANONICAL_IDENTITY_BY_ID)) {
    const identity = getNpcCanonicalIdentity(id);
    const surfaces = [
      identity.canonicalName,
      identity.canonicalPublicRole,
    ];
    for (const surface of surfaces) {
      const text = normalizeText(surface);
      if (text.length >= 2 && text.length <= 18) out.set(text, id);
    }
  }
  return out;
}

function isKnownNpcSurface(surface: string): boolean {
  return canonicalNpcSurfaceMap().has(surface);
}

function looksLikePronounNarrationSurface(surface: string): boolean {
  return PRONOUN_NARRATION_SURFACE_RE.test(surface);
}

function isNpcIdRegistered(npcId: string, input: NarrativeSafetyInput): boolean {
  const id = normalizeNpcId(npcId);
  if (isExplicitlyAllowed(id, input)) return true;
  if (isRegisteredCanonicalNpcId(id)) return true;
  return new Set((input.registeredNpcIds ?? []).map(normalizeNpcId)).has(id);
}

function isItemIdRegistered(itemId: string, input: NarrativeSafetyInput): boolean {
  const id = normalizeText(itemId);
  if (!id) return true;
  if (isExplicitlyAllowed(id, input)) return true;
  if (new Set(input.registeredItemIds ?? []).has(id)) return true;
  if (findRegisteredItemById(id)) return true;
  if (WAREHOUSE_ITEMS.some((item) => item.id === id)) return true;
  const fact = getWorldFactById(id);
  return Boolean(fact && (fact.category === "item" || fact.category === "event" || fact.category === "task"));
}

function isRegisteredItemSurface(value: string, input: NarrativeSafetyInput): boolean {
  const text = normalizeText(value);
  if (!text) return true;
  if (isExplicitlyAllowed(text, input)) return true;
  if (isItemIdRegistered(text, input)) return true;
  return ITEMS.some((item) => item.name === text) || WAREHOUSE_ITEMS.some((item) => item.name === text);
}

function isRegisteredRelationshipId(relationshipId: string, input: NarrativeSafetyInput): boolean {
  const id = normalizeText(relationshipId);
  if (!id) return true;
  if (isExplicitlyAllowed(id, input)) return true;
  const fact = getWorldFactById(id);
  return Boolean(fact && fact.category === "relationship");
}

function extractNpcIdsFromText(text: string): string[] {
  return uniq([...String(text ?? "").matchAll(NPC_ID_RE)].map((match) => normalizeNpcId(match[0])));
}

export function extractNpcIdsFromNarrative(text: string): string[] {
  return extractNpcIdsFromText(text);
}

export function extractNpcIdsFromOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const ids: string[] = [];
  for (const option of options) {
    if (typeof option === "string") ids.push(...extractNpcIdsFromText(option));
    const record = asRecord(option);
    if (record) ids.push(...scanNpcIdsDeep(record));
  }
  return uniq(ids);
}

function scanNpcIdsDeep(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") return extractNpcIdsFromText(value);
  if (Array.isArray(value)) return uniq(value.flatMap((item) => scanNpcIdsDeep(item, depth + 1)));
  const record = asRecord(value);
  if (!record) return [];
  return uniq(Object.values(record).flatMap((item) => scanNpcIdsDeep(item, depth + 1)));
}

function scanItemIdsDeep(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") return uniq([...value.matchAll(ITEM_ID_RE)].map((match) => match[0]));
  if (Array.isArray(value)) return uniq(value.flatMap((item) => scanItemIdsDeep(item, depth + 1)));
  const record = asRecord(value);
  if (!record) return [];
  const ids: string[] = [];
  for (const [key, nested] of Object.entries(record)) {
    if (/^(item_id|itemId|required_item_ids|requiredItemIds|removeWeaponId|addEquippedWeaponId)$/i.test(key)) {
      if (typeof nested === "string") ids.push(nested);
      if (Array.isArray(nested)) ids.push(...nested.filter((item): item is string => typeof item === "string"));
    }
    if (/^id$/i.test(key) && typeof nested === "string" && ITEM_ID_STRICT_RE.test(nested)) {
      ids.push(nested);
    }
    ids.push(...scanItemIdsDeep(nested, depth + 1));
  }
  return uniq(ids);
}

function scanRelationshipIdsDeep(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") return uniq([...value.matchAll(RELATIONSHIP_ID_RE)].map((match) => match[0]));
  if (Array.isArray(value)) return uniq(value.flatMap((item) => scanRelationshipIdsDeep(item, depth + 1)));
  const record = asRecord(value);
  if (!record) return [];
  const ids: string[] = [];
  for (const [key, nested] of Object.entries(record)) {
    if (/^(relationship_id|relationshipId|relation_id|relationId|edge_id|edgeId)$/i.test(key)) {
      if (typeof nested === "string") ids.push(nested);
      if (Array.isArray(nested)) ids.push(...nested.filter((item): item is string => typeof item === "string"));
    }
    if (/^id$/i.test(key) && typeof nested === "string" && RELATIONSHIP_ID_STRICT_RE.test(nested)) {
      ids.push(nested);
    }
    ids.push(...scanRelationshipIdsDeep(nested, depth + 1));
  }
  return uniq(ids);
}

export function extractNpcIdsFromDmRecord(dmRecord: Record<string, unknown> | null | undefined): string[] {
  if (!dmRecord) return [];
  const ids: string[] = [];
  ids.push(...extractNpcIdsFromNarrative(normalizeText(dmRecord.narrative)));
  ids.push(...extractNpcIdsFromOptions(dmRecord.options));
  for (const field of STRUCTURED_FIELDS) {
    ids.push(...scanNpcIdsDeep(dmRecord[field]));
  }
  return uniq(ids);
}

export function extractEntitySurfacesConservatively(text: string): NarrativeSafetyEntityReference[] {
  const out: NarrativeSafetyEntityReference[] = [];
  for (const match of String(text ?? "").matchAll(STRONG_NPC_SURFACE_RE)) {
    const surface = normalizeText(match[1]);
    if (!surface) continue;
    if (COMMON_NPC_SURFACES.has(surface)) continue;
    if (looksLikePronounNarrationSurface(surface)) continue;
    if (surface.endsWith("女孩") || surface.endsWith("男孩") || surface.endsWith("女人") || surface.endsWith("男人")) {
      continue;
    }
    const knownNpcId = canonicalNpcSurfaceMap().get(surface);
    out.push({
      id: knownNpcId ?? `surface:npc:${surface}`,
      kind: "npc",
      registered: Boolean(knownNpcId),
      surface,
      source: "narrative",
    });
  }
  return out;
}

function extractSurfaceText(input: NarrativeSafetyInput): string {
  const dm = input.dmRecord;
  const narrative = normalizeText(input.narrative ?? dm?.narrative);
  const options = input.options ?? (Array.isArray(dm?.options) ? dm.options : []);
  const optionText = collectVisibleOptionText(options).join("\n");
  return [narrative, optionText].filter(Boolean).join("\n");
}

function collectVisibleOptionText(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectVisibleOptionText(item, depth + 1));
  const record = asRecord(value);
  if (!record) return [];
  const out: string[] = [];
  for (const [key, nested] of Object.entries(record)) {
    if (!VISIBLE_OPTION_TEXT_KEYS.has(key)) continue;
    out.push(...collectVisibleOptionText(nested, depth + 1));
  }
  return out;
}

function hasDirectSpeech(text: string, npcId: string): boolean {
  const id = escapeRegExp(normalizeNpcId(npcId));
  const directPrefix = new RegExp(`(?:^|[\\s\\n"'“”‘’（(])${id}\\s*[：:]`, "i");
  const speechVerb = new RegExp(
    `${id}.{0,10}(?:says|said|asks|asked|shouts|whispers|说|问|喊|开口|低声|回答)\\s*[：:"“”]?`,
    "i"
  );
  return directPrefix.test(text) || speechVerb.test(text);
}

function issue(args: {
  code: NarrativeSafetyIssueCode;
  invariant: SafetyInvariantCode;
  source: NarrativeSafetyIssue["source"];
  severity?: NarrativeSafetyIssue["severity"];
  detail?: string;
  anchor?: string;
}): NarrativeSafetyIssue {
  return {
    code: args.code,
    invariant: args.invariant,
    source: args.source,
    severity: args.severity ?? "high",
    ...(args.detail ? { detail: args.detail } : {}),
    ...(args.anchor ? { anchor: args.anchor } : {}),
  };
}

function pushUnknownNpcIssue(
  issues: NarrativeSafetyIssue[],
  npcId: string,
  source: NarrativeSafetyIssue["source"],
  detail: string
): void {
  issues.push(
    issue({
      code: "unregistered_npc_id",
      invariant: "unregistered_npc_id",
      source,
      detail,
      anchor: normalizeNpcId(npcId),
    })
  );
}

function collectSchemaIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  const dm = input.dmRecord;
  if (!dm) return [];
  const issues: NarrativeSafetyIssue[] = [];
  for (const key of MINIMAL_DM_KEYS) {
    if (!(key in dm)) {
      issues.push(
        issue({
          code: "schema_contract_violation",
          invariant: "schema_contract_violation",
          source: "schema",
          detail: `missing_dm_key=${key}`,
          anchor: key,
        })
      );
    }
  }
  return issues;
}

function collectStructuredWhitelistIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  const dm = input.dmRecord;
  if (!dm) return [];
  const issues: NarrativeSafetyIssue[] = [];
  const authority = input.npcSceneAuthorityPacket ?? null;
  const presentNpcIds = new Set((authority?.presentNpcIds ?? []).map(normalizeNpcId));

  for (const field of STRUCTURED_FIELDS) {
    const value = dm[field];
    for (const npcId of scanNpcIdsDeep(value)) {
      if (!isNpcIdRegistered(npcId, input)) {
        pushUnknownNpcIssue(issues, npcId, "entityAudit", `field=${field}|npc=${npcId}`);
        continue;
      }
      if (
        field === "npc_location_updates" &&
        authority &&
        !presentNpcIds.has(normalizeNpcId(npcId)) &&
        !isExplicitlyAllowed(normalizeNpcId(npcId), input)
      ) {
        issues.push(
          issue({
            code: "speaker_not_present",
            invariant: "speaker_not_present",
            source: "npcSceneAuthority",
            detail: `field=${field}|npc=${normalizeNpcId(npcId)}`,
            anchor: normalizeNpcId(npcId),
          })
        );
      }
    }
  }

  for (const field of ["codex_updates", "relationship_updates"] as const) {
    const rows = Array.isArray(dm[field]) ? dm[field] : [];
    for (const row of rows) {
      const record = asRecord(row);
      if (!record) continue;
      const type = normalizeText(record.type ?? record.kind);
      const name = normalizeText(record.name ?? record.npc_name ?? record.npcName);
      if (type.toLowerCase() === "npc" && name && !isKnownNpcSurface(name)) {
        issues.push(
          issue({
            code: "unknown_entity_surface",
            invariant: "unknown_entity_surface",
            source: "entityAudit",
            detail: `field=${field}|surface=${name}`,
            anchor: name,
          })
        );
      }
    }
  }

  const itemFields = ["awarded_items", "awarded_warehouse_items", "dm_change_set"] as const;
  for (const field of itemFields) {
    if (field === "awarded_items" || field === "awarded_warehouse_items") {
      const awards = Array.isArray(dm[field]) ? dm[field] : [];
      for (const award of awards) {
        const itemSurface =
          typeof award === "string"
            ? award
            : normalizeText(asRecord(award)?.id ?? asRecord(award)?.item_id ?? asRecord(award)?.itemId ?? asRecord(award)?.name);
        if (itemSurface && !isRegisteredItemSurface(itemSurface, input)) {
          issues.push(
            issue({
              code: "unknown_entity_surface",
              invariant: "unknown_entity_surface",
              source: "entityAudit",
              detail: `field=${field}|item=${itemSurface}`,
              anchor: itemSurface,
            })
          );
        }
      }
    }
    for (const itemId of scanItemIdsDeep(dm[field])) {
      if (isItemIdRegistered(itemId, input)) continue;
      issues.push(
        issue({
          code: "unknown_entity_surface",
          invariant: "unknown_entity_surface",
          source: "entityAudit",
          detail: `field=${field}|item=${itemId}`,
          anchor: itemId,
        })
      );
    }
  }

  const relationshipFields = ["relationship_updates", "dm_change_set"] as const;
  for (const field of relationshipFields) {
    for (const relationshipId of scanRelationshipIdsDeep(dm[field])) {
      if (isRegisteredRelationshipId(relationshipId, input)) continue;
      issues.push(
        issue({
          code: "unknown_entity_surface",
          invariant: "unknown_entity_surface",
          source: "entityAudit",
          detail: `field=${field}|relationship=${relationshipId}`,
          anchor: relationshipId,
        })
      );
    }
  }

  return issues;
}

function collectSurfaceWhitelistIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  const issues: NarrativeSafetyIssue[] = [];
  const surfaceText = extractSurfaceText(input);
  const authority = input.npcSceneAuthorityPacket ?? null;
  const presentNpcIds = new Set((authority?.presentNpcIds ?? []).map(normalizeNpcId));
  const offscreenNpcIds = new Set((authority?.offscreenNpcIds ?? []).map(normalizeNpcId));
  const mentionModes = authority?.npcMentionModes ?? {};
  const knownFromAuthority = new Set([
    ...(authority?.presentNpcIds ?? []),
    ...(authority?.offscreenNpcIds ?? []),
    ...Object.keys(mentionModes),
  ].map(normalizeNpcId));

  for (const ref of input.entityReferences ?? []) {
    if (ref.registered) continue;
    issues.push(
      issue({
        code: ref.kind === "npc" ? "unregistered_npc_id" : "unknown_entity_surface",
        invariant: ref.kind === "npc" ? "unregistered_npc_id" : "unknown_entity_surface",
        source: "entityAudit",
        detail: `kind=${ref.kind}|surface=${ref.surface ?? ref.id}|source=${ref.source ?? "external_validator"}`,
        anchor: ref.id,
      })
    );
  }

  for (const ref of extractEntitySurfacesConservatively(surfaceText)) {
    if (ref.registered) continue;
    if (isExplicitlyAllowed(ref.id, input) || (ref.surface && isSurfaceExplicitlyAllowed(ref.surface, input))) {
      continue;
    }
    issues.push(
      issue({
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        source: "entityAudit",
        detail: `kind=npc|surface=${ref.surface ?? ref.id}|context=strong_surface_action`,
        anchor: ref.id,
      })
    );
  }

  for (const npcId of extractNpcIdsFromText(surfaceText)) {
    const id = normalizeNpcId(npcId);
    const isRegistered = isNpcIdRegistered(id, input) || knownFromAuthority.has(id);
    if (!isRegistered) {
      pushUnknownNpcIssue(issues, id, "npcSceneAuthority", `surface_npc=${id}`);
      continue;
    }

    const directSpeech = hasDirectSpeech(surfaceText, id);
    const mode = mentionModes[id];
    if (directSpeech && (offscreenNpcIds.has(id) || mode === "heard_only" || mode === "memory_only")) {
      issues.push(
        issue({
          code: "offscreen_npc_direct_speech",
          invariant: "offscreen_npc_direct_speech",
          source: "npcSceneAuthority",
          detail: `npc=${id}|mode=${mode ?? "offscreen"}`,
          anchor: id,
        })
      );
    }
    if (directSpeech && mode === "forbidden") {
      issues.push(
        issue({
          code: "npc_status_forbidden_direct_speech",
          invariant: "npc_status_forbidden_direct_speech",
          source: "npcSceneAuthority",
          detail: `npc=${id}|mode=forbidden`,
          anchor: id,
        })
      );
    }
  }

  const speakerNpcId = normalizeNpcId(input.speakerNpcId);
  if (speakerNpcId) {
    const mode = mentionModes[speakerNpcId];
    if (authority && !presentNpcIds.has(speakerNpcId)) {
      issues.push(
        issue({
          code: "speaker_not_present",
          invariant: "speaker_not_present",
          source: "npcSceneAuthority",
          detail: `speaker=${speakerNpcId}|mode=${mode ?? "unknown"}`,
          anchor: speakerNpcId,
        })
      );
    }
    if (mode === "forbidden") {
      issues.push(
        issue({
          code: "npc_status_forbidden_direct_speech",
          invariant: "npc_status_forbidden_direct_speech",
          source: "npcSceneAuthority",
          detail: `speaker=${speakerNpcId}|mode=forbidden`,
          anchor: speakerNpcId,
        })
      );
    }
    if (
      (offscreenNpcIds.has(speakerNpcId) || mode === "heard_only" || mode === "memory_only") &&
      GENERIC_DIRECT_SPEECH_RE.test(surfaceText)
    ) {
      issues.push(
        issue({
          code: "offscreen_npc_direct_speech",
          invariant: "offscreen_npc_direct_speech",
          source: "npcSceneAuthority",
          detail: `speaker=${speakerNpcId}|generic_pronoun_direct_speech`,
          anchor: speakerNpcId,
        })
      );
    }
  }

  return issues;
}

function collectStateAndPacingIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  const issues: NarrativeSafetyIssue[] = [];
  const dm = input.dmRecord;
  const surfaceText = extractSurfaceText(input);
  const deltaLocation = normalizeText(input.stateDelta?.playerLocation);
  const dmLocation = normalizeText(dm?.player_location);

  if (deltaLocation && dmLocation && deltaLocation !== dmLocation && input.intent?.isSystemTransition !== true) {
    issues.push(
      issue({
        code: "narrative_state_delta_conflict",
        invariant: "narrative_state_delta_conflict",
        source: "stateDelta",
        severity: "medium",
        detail: `dm_location=${dmLocation}|delta_location=${deltaLocation}`,
        anchor: "player_location",
      })
    );
  }

  const locationIds = uniq([...String(dmLocation).matchAll(LOCATION_ID_RE)].map((match) => match[0]));
  for (const locationId of locationIds) {
    if (isExplicitlyAllowed(locationId, input) || getWorldFactById(locationId)) continue;
    issues.push(
      issue({
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        source: "entityAudit",
        detail: `field=player_location|location=${locationId}`,
        anchor: locationId,
      })
    );
  }

  if (input.pacingBudget?.maxNarrativeChars && surfaceText.length > input.pacingBudget.maxNarrativeChars) {
    issues.push(
      issue({
        code: "pacing_budget_breach",
        invariant: "pacing_budget_breach",
        source: "pacing",
        severity: surfaceText.length > input.pacingBudget.maxNarrativeChars * 2 ? "high" : "medium",
        detail: `chars=${surfaceText.length}|budget=${input.pacingBudget.maxNarrativeChars}`,
        anchor: "narrative",
      })
    );
  }

  const options = input.options ?? (Array.isArray(dm?.options) ? dm.options : null);
  if (input.pacingBudget?.maxOptions && Array.isArray(options) && options.length > input.pacingBudget.maxOptions) {
    issues.push(
      issue({
        code: "pacing_budget_breach",
        invariant: "pacing_budget_breach",
        source: "pacing",
        severity: "medium",
        detail: `options=${options.length}|budget=${input.pacingBudget.maxOptions}`,
        anchor: "options",
      })
    );
  }

  const intentText = [input.intent?.rawText, input.intent?.normalizedText].filter(Boolean).join("\n");
  if (ENTITY_INJECTION_RE.test(intentText)) {
    issues.push(
      issue({
        code: "prompt_injection_entity_creation_attempt",
        invariant: "prompt_injection_entity_creation_attempt",
        source: "normalizedPlayerIntent",
        detail: "intent_contains_entity_creation_or_setting_override",
        anchor: "intent",
      })
    );
  }

  return issues;
}

export function auditEntityWhitelist(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  return [
    ...collectSchemaIssues(input),
    ...collectStructuredWhitelistIssues(input),
    ...collectSurfaceWhitelistIssues(input),
    ...collectStateAndPacingIssues(input),
  ];
}

export function collectEntityAuditIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  return auditEntityWhitelist(input);
}
