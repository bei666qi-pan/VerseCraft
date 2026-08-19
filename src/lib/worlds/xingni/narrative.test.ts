import test from "node:test";
import assert from "node:assert/strict";
import {
  applyXingniNpcFactBoundary,
  applyWorldNarrativeBoundary,
  buildXingniRuntimePacket,
  getXingniStablePlayerDmSystemPrefix,
  validateWorldNarrativeBoundary,
} from "./narrative";
import { createInitialXingniState } from "./progression";

test("Xingni stable prompt is third-person and free of Dark Moon facts", () => {
  const prompt = getXingniStablePlayerDmSystemPrefix();
  assert.match(prompt, /第三人称限知/);
  assert.match(prompt, /请严格以 JSON 格式输出/);
  assert.doesNotMatch(prompt, /欣蓝|老刘|如月公寓的异常楼层/);
});

test("world narrative boundary scans pollution in both directions", () => {
  assert.equal(validateWorldNarrativeBoundary("xingni_taichu", "他在青石县捡到一枚原石。").ok, false);
  assert.equal(validateWorldNarrativeBoundary("xingni_taichu", "走廊灯管闪了一下，远处传来电梯声。").ok, false);
  assert.equal(validateWorldNarrativeBoundary("dark_moon_prologue", "我在B1运转灵根突破炼气。").ok, false);
});

test("Xingni boundary rejects first person narration and NPC inner mind", () => {
  const report = validateWorldNarrativeBoundary("xingni_taichu", "我抬手推门。沈清禾心中暗道此人可用。");
  assert.deepEqual(report.povViolations, ["first_person_protagonist", "npc_inner_mind"]);
});

test("boundary rewrite preserves envelope fields and records an audit flag", () => {
  const resolved = applyWorldNarrativeBoundary({
    worldId: "xingni_taichu",
    dmRecord: { narrative: "他走进B1。", is_action_legal: true, sanity_damage: 0 },
  });
  assert.equal(resolved.is_action_legal, true);
  assert.match(String(resolved.narrative), /青石县/);
  assert.ok((resolved._commit_flags as string[]).includes("world_narrative_boundary_rewritten_v1"));
});

test("production runtime packet exposes current objective and public facts without sealed facts", () => {
  const packet = buildXingniRuntimePacket({ playerLocation: "QS_GUOYAN_INN", worldStateDigest: createInitialXingniState(), presentNpcIds: [] });
  assert.match(packet, /xingni_qingshi_runtime_v2/);
  assert.match(packet, /在归雁客栈检查气海与行囊/);
  assert.match(packet, /柳三娘/);
  assert.doesNotMatch(packet, /陈砚害怕再次没能把同行者带回来/);
  assert.doesNotMatch(packet, /顾玄岳准备将灵脉异动记录带往青云渡复核/);
});

test("production runtime packet accepts pacing-only director projection", () => {
  const packet = buildXingniRuntimePacket({
    playerLocation: "QS_GUOYAN_INN",
    worldStateDigest: createInitialXingniState(),
    directorPacing: {
      phase: "build_up",
      tension: 0.42,
      fatigue: 0.18,
      progress: 0.27,
      revealPressure: 0.31,
      turnIndex: 7,
    },
  });
  assert.match(packet, /"authority":"pacing_only_no_world_facts"/);
  assert.match(packet, /"phase":"build_up"/);
  assert.match(packet, /"tension":0\.42/);
  assert.doesNotMatch(packet, /director_intent|world_events_to_schedule|story_branch_seeds/);
  assert.doesNotMatch(packet, /如月公寓|原石|污染|复活锚/);
});

test("production stable prompt forbids permanent death and unadjudicated rewards", () => {
  const prompt = getXingniStablePlayerDmSystemPrefix();
  assert.match(prompt, /没有永久死亡/);
  assert.match(prompt, /不得跳过前置/);
  assert.match(prompt, /一至三个当前合法方向/);
});

test("Xingni NPC fact boundary rewrites invented registration prices and procedures", () => {
  const resolvedState = createInitialXingniState();
  const guarded = applyXingniNpcFactBoundary({
    narrative: "柳三娘道：\"镇邪司登记须交两块下品灵石，还要验灵根、过阵门。\"",
    world_delta: {
      action: { type: "talk", targetId: "XQ-N005" },
      resolvedState,
    },
  });
  assert.match(String(guarded.narrative), /客栈提供休整、治疗和无钱散修的救济差事/);
  assert.doesNotMatch(String(guarded.narrative), /两块下品灵石|过阵门/);
  assert.ok((guarded._commit_flags as string[]).includes("xingni_npc_fact_boundary_rewritten_v1"));
});

test("Xingni NPC fact boundary preserves claims anchored by revealable authored facts", () => {
  const resolvedState = createInitialXingniState();
  const narrative = "韩铸沉声道：\"修复残锋需要玄铁与三枚灵石，材料不足便不开炉。\"";
  const guarded = applyXingniNpcFactBoundary({
    narrative,
    world_delta: {
      action: { type: "talk", targetId: "XQ-N003" },
      resolvedState,
    },
  });
  assert.equal(guarded.narrative, narrative);
  assert.equal(guarded._commit_flags, undefined);
});

test("Xingni NPC fact boundary still grounds a visible named NPC when the model omits world_delta", () => {
  const guarded = applyXingniNpcFactBoundary({
    narrative: "柳三娘道：\"先过青石县的灵力核验，再验道途来历，听说还要交一笔不小的定银。\"",
  }, {
    latestUserInput: "他向柳三娘询问镇邪司登记散修的规矩。",
    presentNpcIds: ["XQ-N005"],
    worldStateDigest: createInitialXingniState(),
  });
  assert.match(String(guarded.narrative), /客栈提供休整、治疗和无钱散修的救济差事/);
  assert.doesNotMatch(String(guarded.narrative), /灵力核验|道途来历|定银/);
});
