import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcEpistemicProfile } from "./builders";
import { XINLAN_NPC_ID } from "./policy";
import type { EpistemicAnomalyResult, KnowledgeFact } from "./types";
import { applyEpistemicPostGenerationValidation } from "./validator";

const iso = "2026-03-28T00:00:00.000Z";

function mkFact(
  id: string,
  content: string,
  scope: KnowledgeFact["scope"],
  extra?: Partial<KnowledgeFact>
): KnowledgeFact {
  return {
    id,
    content,
    scope,
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: iso,
    ...extra,
  };
}

const emptyAnomaly = (npcId: string): EpistemicAnomalyResult => ({
  anomaly: false,
  npcId,
  severity: "low",
  reactionStyle: "confused",
  triggerFactIds: [],
  requiredBehaviorTags: [],
  forbiddenResponseTags: [],
  mustInclude: [],
  mustAvoid: [],
});

test("普通 NPC 复述禁止的轮回/世界事实 → 拦截并改写或擦洗 narrative", () => {
  const secret = "第十七周目轮回档案室秘密协议永不解密这是系统底层设定";
  const facts = [mkFact("w1", secret, "world", { sourceType: "system_canon" })];
  const actor = "N-888";
  const dm: Record<string, unknown> = {
    narrative: `档案员低声说：${secret}。`,
    options: ["追问", "离开"],
  };
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: dm,
    actorNpcId: actor,
    presentNpcIds: [actor],
    allFacts: facts,
    profile: buildNpcEpistemicProfile(actor),
    anomalyResult: emptyAnomaly(actor),
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, true);
  assert.equal(telemetry.rewriteTriggered, true);
  assert.ok(["world_truth_premature", "private_fact_leak"].includes(telemetry.leakType));
  assert.ok(!String(dmRecord.narrative).includes(secret.replace(/\s+/g, "")));
  assert.ok(dmRecord.security_meta != null);
});

test("preflight 异常但叙事缺少迟疑语气 → 追加轻微软化（不把话说死）", () => {
  const actor = "N-888";
  const narrative = "我听了，只是点点头，顺着他的话接了下去。";
  const anomaly: EpistemicAnomalyResult = {
    ...emptyAnomaly(actor),
    anomaly: true,
    severity: "high",
  };
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: { narrative, options: ["点头", "追问"] },
    actorNpcId: actor,
    presentNpcIds: [actor],
    allFacts: [],
    profile: buildNpcEpistemicProfile(actor),
    anomalyResult: anomaly,
    nowIso: iso,
  });
  assert.equal(telemetry.rewriteReason, "anomaly_soft_hedge");
  assert.equal(telemetry.leakType, "overconfident_confirmation");
  assert.ok(String(dmRecord.narrative).includes("没有把话说死"));
});

test("欣蓝：世界/系统正史类禁止表被放宽，不应因 world 子串误杀", () => {
  const canon = "星港学院学制循环与观测者在档案中的签名规则属于系统正史条目";
  const facts = [mkFact("w2", canon, "world", { sourceType: "system_canon" })];
  const profile = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  assert.equal(profile.isXinlanException, true);
  const dm: Record<string, unknown> = {
    narrative: `她平静地补充：${canon}`,
    options: ["记下", "换话题"],
  };
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: dm,
    actorNpcId: XINLAN_NPC_ID,
    presentNpcIds: [XINLAN_NPC_ID],
    allFacts: facts,
    profile,
    anomalyResult: emptyAnomaly(XINLAN_NPC_ID),
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, false);
  assert.equal(String(dmRecord.narrative), String(dm.narrative));
});

test("公共信息可引用 → 无触发、无 security_meta 补丁", () => {
  const pub = "图书馆今日仍对外开放供师生自习";
  const facts = [mkFact("p1", pub, "public")];
  const actor = "N-888";
  const dm: Record<string, unknown> = {
    narrative: `路人提到：${pub}`,
    options: ["去图书馆", "算了"],
  };
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: dm,
    actorNpcId: actor,
    presentNpcIds: [actor],
    allFacts: facts,
    profile: buildNpcEpistemicProfile(actor),
    anomalyResult: emptyAnomaly(actor),
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, false);
  assert.equal(telemetry.leakType, "none");
  assert.equal(dmRecord.security_meta, undefined);
});

test("仅结构化字段泄露时擦洗 codex/task，不破坏数组形态；无 narrative 命中时仍稳定", () => {
  const line = "玩家代号夜鸫的真实姓名仅保存在加密档案室终端";
  const facts = [mkFact("pl", line, "player")];
  const actor = "N-888";
  const dm: Record<string, unknown> = {
    narrative: "你好，今天天气不错。",
    options: ["寒暄", "告辞"],
    codex_updates: [{ name: "档案", detail: `补充：${line}` }],
    task_updates: [{ title: "侧写", detail: line }],
  };
  const beforeCodex = JSON.stringify(dm.codex_updates);
  const { dmRecord, telemetry } = applyEpistemicPostGenerationValidation({
    dmRecord: { ...dm },
    actorNpcId: actor,
    presentNpcIds: [actor],
    allFacts: facts,
    profile: buildNpcEpistemicProfile(actor),
    anomalyResult: emptyAnomaly(actor),
    nowIso: iso,
  });
  assert.equal(telemetry.validatorTriggered, true);
  assert.equal(Array.isArray(dmRecord.codex_updates), true);
  assert.equal(Array.isArray(dmRecord.task_updates), true);
  assert.notEqual(JSON.stringify(dmRecord.codex_updates), beforeCodex);
  assert.ok(!String(JSON.stringify(dmRecord.codex_updates)).includes(line.replace(/\s+/g, "")));
  assert.equal(dmRecord.narrative, dm.narrative);
});
