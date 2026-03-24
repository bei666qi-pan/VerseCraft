type DmRecord = Record<string, unknown>;

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

function asObjectArray(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
}

function itemIdFromUnknown(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const id = (v as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim().length > 0) return id.trim();
  }
  return null;
}

/**
 * Stage-2 settlement precedence guard:
 * 1) Illegal/death turns cannot mutate economy/inventory/system-state packets.
 * 2) `consumed_items` takes precedence over `awarded_items` on same id in one turn.
 */
export function applyStage2SettlementGuard(dmRecord: DmRecord): DmRecord {
  const next = { ...dmRecord };
  const isActionLegal = next.is_action_legal === true;
  const isDeath = next.is_death === true;

  const securityMeta =
    next.security_meta && typeof next.security_meta === "object" && !Array.isArray(next.security_meta)
      ? { ...(next.security_meta as Record<string, unknown>) }
      : {};

  if (!isActionLegal || isDeath) {
    next.consumed_items = [];
    next.awarded_items = [];
    next.awarded_warehouse_items = [];
    next.currency_change = 0;
    next.new_tasks = [];
    next.task_updates = [];
    next.main_threat_updates = [];
    next.weapon_updates = [];
    next.npc_location_updates = [];
    next.security_meta = {
      ...securityMeta,
      settlement_guard: "stage2_freeze_on_illegal_or_death",
    };
    return next;
  }

  const consumed = asStringArray(next.consumed_items);
  const consumedIdSet = new Set(consumed);

  const awardedRaw = Array.isArray(next.awarded_items) ? next.awarded_items : [];
  const awardedFiltered = awardedRaw.filter((x) => {
    const id = itemIdFromUnknown(x);
    if (!id) return true;
    return !consumedIdSet.has(id);
  });
  const prunedCount = Math.max(0, awardedRaw.length - awardedFiltered.length);

  next.consumed_items = consumed;
  next.awarded_items = awardedFiltered;
  next.awarded_warehouse_items = asObjectArray(next.awarded_warehouse_items);
  next.main_threat_updates = asObjectArray(next.main_threat_updates);
  next.weapon_updates = asObjectArray(next.weapon_updates);

  next.security_meta = {
    ...securityMeta,
    settlement_guard: "stage2_ordered_resolution",
    settlement_award_pruned: prunedCount,
  };
  return next;
}

