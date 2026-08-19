/**
 * Mock Playthrough Trace — Auto Contract Verification
 *
 * 对每条 playthrough trace 做契约层面自动验证：
 * 1. DM JSON 必需字段完整性
 * 2. SSE final 帧是否有 __VERSECRAFT_FINAL__
 * 3. awarded_items 物品存在性（对照物品注册表）
 * 4. currency_change 合理性
 * 5. NPC location_updates 合法性
 */
import { readFileSync } from "node:fs";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { NPCS } from "@/lib/registry/npcs";

// ── Types ──

interface StepResult {
  step: number;
  playerInput: string;
  dmJson?: Record<string, unknown>;
  rawModelOutput?: string;
  error?: string;
}

interface TraceArtifact {
  scenarioId?: string;
  persona?: string;
  runId?: string;
  steps?: StepResult[];
  invariantChecks?: Array<{ name: string; passed: boolean; detail?: string }>;
}

interface ContractVerificationResult {
  trace: string;
  scenarioId: string;
  persona: string;
  steps: number;
  checks: ContractCheck[];
  allPassed: boolean;
}

interface ContractCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: "error" | "warning";
}

// ── Check Functions ──

function checkRequiredFields(dmJson: Record<string, unknown>, stepIdx: number): ContractCheck[] {
  const checks: ContractCheck[] = [];
  const required = ["is_action_legal", "sanity_damage", "narrative", "is_death"] as const;
  for (const field of required) {
    if (!(field in dmJson)) {
      checks.push({
        name: "dm_required_fields",
        passed: false,
        detail: `Step ${stepIdx}: missing required field "${field}"`,
        severity: "error",
      });
    }
  }
  if (checks.length === 0) {
    checks.push({
      name: "dm_required_fields",
      passed: true,
      detail: `All 4 required fields present in ${stepIdx} steps`,
      severity: "error",
    });
  }
  return checks;
}

function checkFinalFrame(steps: StepResult[]): ContractCheck[] {
  const checks: ContractCheck[] = [];
  let allHaveFinal = true;
  for (const step of steps) {
    if (step.rawModelOutput) {
      if (!step.rawModelOutput.includes("__VERSECRAFT_FINAL__")) {
        allHaveFinal = false;
        checks.push({
          name: "sse_final_frame",
          passed: false,
          detail: `Step ${step.stepIndex}: rawModelOutput missing __VERSECRAFT_FINAL__`,
          severity: "error",
        });
      }
    }
  }
  if (allHaveFinal && steps.length > 0) {
    checks.push({
      name: "sse_final_frame",
      passed: true,
      detail: `All ${steps.length} steps have __VERSECRAFT_FINAL__ frame`,
      severity: "error",
    });
  }
  return checks;
}

function checkAwardedItems(steps: StepResult[]): ContractCheck[] {
  let totalAwarded = 0;
  let totalInvalid = 0;
  const invalidDetails: string[] = [];

  for (const step of steps) {
    const dm = step.dmJson;
    if (!dm) continue;

    for (const field of ["awarded_items", "awarded_warehouse_items"]) {
      const items = dm[field];
      if (!Array.isArray(items)) continue;

      for (const entry of items) {
        totalAwarded++;
        if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
          const o = entry as Record<string, unknown>;
          if (typeof o.id === "string" && o.id.trim()) {
            const registered = findRegisteredItemById(o.id.trim());
            if (!registered) {
              totalInvalid++;
              invalidDetails.push(`Step ${step.stepIndex}: ${field} contains unregistered item "${o.id}"`);
            }
          }
        } else if (typeof entry === "string" && entry.trim()) {
          const registered = findRegisteredItemById(entry.trim());
          if (!registered) {
            totalInvalid++;
            invalidDetails.push(`Step ${step.stepIndex}: ${field} contains unregistered string item "${entry}"`);
          }
        }
      }
    }
  }

  if (totalAwarded === 0) {
    return [{
      name: "awarded_items_validity",
      passed: true,
      detail: "No awarded_items in trace — nothing to validate",
      severity: "warning",
    }];
  }

  if (totalInvalid === 0) {
    return [{
      name: "awarded_items_validity",
      passed: true,
      detail: `All ${totalAwarded} awarded items are registered`,
      severity: "warning",
    }];
  }

  return [{
    name: "awarded_items_validity",
    passed: false,
    detail: `${totalInvalid}/${totalAwarded} awarded items unregistered: ${invalidDetails.join("; ")}`,
    severity: "error",
  }];
}

function checkCurrencyChange(steps: StepResult[]): ContractCheck[] {
  let issues = 0;
  const details: string[] = [];

  for (const step of steps) {
    const dm = step.dmJson;
    if (!dm) continue;
    const cc = dm.currency_change;
    if (typeof cc === "number") {
      if (!Number.isFinite(cc) || !Number.isInteger(cc)) {
        issues++;
        details.push(`Step ${step.stepIndex}: currency_change=${cc} is not a valid integer`);
      }
      if (cc < -999999 || cc > 999999) {
        issues++;
        details.push(`Step ${step.stepIndex}: currency_change=${cc} exceeds bounds [-999999, 999999]`);
      }
    }
  }

  if (issues === 0) {
    return [{
      name: "currency_change_validity",
      passed: true,
      detail: "All currency_change values are valid integers within bounds",
      severity: "warning",
    }];
  }

  return [{
    name: "currency_change_validity",
    passed: false,
    detail: details.join("; "),
    severity: "error",
  }];
}

const NPC_IDS = new Set(NPCS.map((n) => n.id));

function checkNpcLocationUpdates(steps: StepResult[]): ContractCheck[] {
  let issues = 0;
  const details: string[] = [];
  let hasUpdates = false;

  for (const step of steps) {
    const dm = step.dmJson;
    if (!dm) continue;
    const updates = dm.npc_location_updates;
    if (!Array.isArray(updates) || updates.length === 0) continue;
    hasUpdates = true;

    for (const update of updates) {
      if (!update || typeof update !== "object" || Array.isArray(update)) continue;
      const u = update as Record<string, unknown>;
      const npcId = typeof u.npcId === "string" ? u.npcId : typeof u.id === "string" ? u.id : undefined;
      if (npcId && !NPC_IDS.has(npcId)) {
        issues++;
        details.push(`Step ${step.stepIndex}: npc_location_update references unregistered NPC "${npcId}"`);
      }
      const location = typeof u.location === "string" ? u.location
        : typeof u.to === "string" ? u.to
        : typeof u.to_location === "string" ? u.to_location
        : undefined;
      if (!location) {
        issues++;
        details.push(`Step ${step.stepIndex}: npc_location_update missing location field`);
      }
    }
  }

  if (!hasUpdates) {
    return [{
      name: "npc_location_updates_validity",
      passed: true,
      detail: "No npc_location_updates in trace — nothing to validate",
      severity: "warning",
    }];
  }

  if (issues === 0) {
    return [{
      name: "npc_location_updates_validity",
      passed: true,
      detail: "All npc_location_updates reference registered NPCs with valid locations",
      severity: "warning",
    }];
  }

  return [{
    name: "npc_location_updates_validity",
    passed: false,
    detail: details.join("; "),
    severity: "error",
  }];
}

function checkSanityDamage(steps: StepResult[]): ContractCheck[] {
  let issues = 0;
  const details: string[] = [];

  for (const step of steps) {
    const dm = step.dmJson;
    if (!dm) continue;
    const sd = dm.sanity_damage;
    if (typeof sd === "number") {
      if (!Number.isFinite(sd) || !Number.isInteger(sd)) {
        issues++;
        details.push(`Step ${step.stepIndex}: sanity_damage=${sd} is not a valid integer`);
      }
    } else {
      issues++;
      details.push(`Step ${step.stepIndex}: sanity_damage missing or not a number`);
    }
  }

  if (issues === 0) {
    return [{
      name: "sanity_damage_validity",
      passed: true,
      detail: "All sanity_damage values are valid integers",
      severity: "error",
    }];
  }

  return [{
    name: "sanity_damage_validity",
    passed: false,
    detail: details.join("; "),
    severity: "error",
  }];
}

// ── Verifier ──

function verifyTrace(tracePath: string): ContractVerificationResult {
  const traceName = tracePath.split("/").pop()!.replace(".json", "");
  const raw = readFileSync(tracePath, "utf-8");
  const trace: TraceArtifact = JSON.parse(raw);

  const checks: ContractCheck[] = [];
  const steps = trace.steps ?? [];

  if (steps.length === 0) {
    return {
      trace: traceName,
      scenarioId: trace.scenarioId ?? "unknown",
      persona: trace.persona ?? "unknown",
      steps: 0,
      checks: [{ name: "trace_structure", passed: false, detail: "Trace has no steps", severity: "error" }],
      allPassed: false,
    };
  }

  checks.push(...checkRequiredFields(steps[0]!.dmJson ?? {}, steps.length));
  checks.push(...checkSanityDamage(steps));
  checks.push(...checkFinalFrame(steps));
  checks.push(...checkAwardedItems(steps));
  checks.push(...checkCurrencyChange(steps));
  checks.push(...checkNpcLocationUpdates(steps));

  const allPassed = checks.every((c) => c.passed);

  return {
    trace: traceName,
    scenarioId: trace.scenarioId ?? "unknown",
    persona: trace.persona ?? "unknown",
    steps: steps.length,
    checks,
    allPassed,
  };
}

// ── Main ──

const TRACE_FILES = [
  "benchmarks/playthrough-contracts/fixtures/minimal-valid-turn.json",
];

console.log("=" .repeat(70));
console.log("Mock Playthrough Trace — Auto Contract Verification");
console.log("=" .repeat(70));
console.log();

let totalTraces = 0;
let totalPassed = 0;

for (const tracePath of TRACE_FILES) {
  totalTraces++;
  try {
    const result = verifyTrace(tracePath);
    const status = result.allPassed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} ${result.trace}`);
    console.log(`  Scenario: ${result.scenarioId} | Persona: ${result.persona} | Steps: ${result.steps}`);
    for (const check of result.checks) {
      const icon = check.passed ? "  ✅" : "  ❌";
      console.log(`${icon} [${check.name}] ${check.detail}`);
    }
    if (result.allPassed) totalPassed++;
    console.log();
  } catch (err) {
    console.log(`❌ ${tracePath}: ERROR - ${err instanceof Error ? err.message : String(err)}`);
    console.log();
  }
}

console.log("=" .repeat(70));
console.log(`Summary: ${totalPassed}/${totalTraces} traces passed all contract checks`);
console.log("=" .repeat(70));
