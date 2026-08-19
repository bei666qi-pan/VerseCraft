import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "pg";
import type { WorldEngineTickPayload } from "./contracts";

const enabled = process.env.VERSECRAFT_RUN_DIRECTOR_PG_INTEGRATION === "1";

function assertDedicatedDatabase(rawUrl: string): void {
  const url = new URL(rawUrl);
  assert.ok(
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1",
    "Director PostgreSQL integration tests require a local database",
  );
  assert.equal(
    url.pathname.slice(1),
    "versecraft_director_integration",
    "Director PostgreSQL integration tests require the dedicated database",
  );
}

const legacyTablesSql = `
  CREATE TABLE vc_jobs (
    job_id BIGSERIAL PRIMARY KEY,
    job_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 8,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE world_engine_runs (
    run_id SERIAL PRIMARY KEY,
    dedup_key VARCHAR(128) NOT NULL,
    request_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191),
    session_id VARCHAR(191) NOT NULL,
    trigger_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_task VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    output_json JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX world_engine_runs_dedup_unique ON world_engine_runs (dedup_key);
  CREATE TABLE world_engine_event_queue (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES world_engine_runs(run_id) ON DELETE CASCADE,
    session_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191),
    event_code VARCHAR(128) NOT NULL,
    title TEXT NOT NULL,
    due_in_turns INTEGER NOT NULL DEFAULT 1,
    priority VARCHAR(16) NOT NULL DEFAULT 'low',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    due_turn_index INTEGER,
    ttl_turns INTEGER,
    expires_turn_index INTEGER,
    injected_turn_index INTEGER,
    resolved_turn_index INTEGER,
    salience INTEGER NOT NULL DEFAULT 0,
    agency_risk VARCHAR(16),
    continuity_risk VARCHAR(16),
    spoiler_risk VARCHAR(16),
    reveal_policy VARCHAR(24),
    injection_hint TEXT,
    agency_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
    forbidden_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
    dedup_key VARCHAR(191),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX world_engine_event_queue_director_dedup_unique
    ON world_engine_event_queue (session_id, event_code, dedup_key);
  CREATE TABLE world_engine_agenda_snapshots (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES world_engine_runs(run_id) ON DELETE CASCADE,
    session_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191),
    agenda_revision INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT world_engine_agenda_session_revision_unique UNIQUE (session_id, agenda_revision)
  );
  CREATE TABLE world_engine_director_state (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191),
    turn_index INTEGER NOT NULL DEFAULT 0,
    phase VARCHAR(24) NOT NULL DEFAULT 'quiet',
    pacing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recent_director_intent TEXT,
    world_revision BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX world_engine_director_state_session_unique
    ON world_engine_director_state (session_id);
  CREATE TABLE npc_agent_state (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(191) NOT NULL,
    user_id VARCHAR(191),
    npc_id VARCHAR(128) NOT NULL,
    state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(24) NOT NULL DEFAULT 'idle',
    last_active_turn INTEGER NOT NULL DEFAULT 0,
    next_eligible_turn INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX npc_agent_state_session_npc_unique
    ON npc_agent_state (session_id, npc_id);
`;

test("unified Director PostgreSQL integration", { skip: !enabled }, async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required");
  assertDedicatedDatabase(databaseUrl);

  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const legacySchema = `director_legacy_${process.pid}_${Date.now()}`;
  assert.match(legacySchema, /^[a-z0-9_]+$/);

  const [{ pool }, queueCore, jobs, contracts, validator, engine, hintRepository, writerConsumer] =
    await Promise.all([
      import("@/db/index"),
      import("./queueCore"),
      import("@/lib/kg/jobs"),
      import("./contracts"),
      import("./validator"),
      import("./engine"),
      import("./hintRepository"),
      import("./writerHintConsumer"),
    ]);

  await admin.query(
    `ALTER TABLE IF EXISTS public.world_engine_hint_envelopes
     DROP CONSTRAINT IF EXISTS director_integration_force_hint_failure`,
  );

  t.after(async () => {
    await admin.query(
      `ALTER TABLE IF EXISTS public.world_engine_hint_envelopes
       DROP CONSTRAINT IF EXISTS director_integration_force_hint_failure`,
    );
    await admin.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`);
    await admin.end();
    await pool.end();
  });

  await t.test("legacy scope migration is additive, Dark Moon-only, then finalized", async () => {
    await admin.query(`CREATE SCHEMA ${legacySchema}`);
    await admin.query(`SET search_path TO ${legacySchema}`);
    await admin.query(legacyTablesSql);
    const legacyRun = await admin.query<{ run_id: number }>(
      `INSERT INTO world_engine_runs
       (dedup_key, request_id, session_id, model_task, status)
       VALUES ('same-dedup', 'legacy-request', 'same-session', 'WORLDBUILD_OFFLINE', 'succeeded')
       RETURNING run_id`,
    );
    const runId = legacyRun.rows[0]!.run_id;
    await admin.query(
      `INSERT INTO world_engine_event_queue
       (run_id, session_id, event_code, title, dedup_key)
       VALUES ($1, 'same-session', 'EV_LEGACY', 'legacy', 'same-event-dedup')`,
      [runId],
    );
    await admin.query(
      `INSERT INTO world_engine_agenda_snapshots
       (run_id, session_id, agenda_revision) VALUES ($1, 'same-session', 1)`,
      [runId],
    );
    await admin.query(`INSERT INTO world_engine_director_state (session_id) VALUES ('same-session')`);
    await admin.query(
      `INSERT INTO npc_agent_state (session_id, npc_id) VALUES ('same-session', 'N-001')`,
    );

    await admin.query(readFileSync("drizzle/0020_unify_world_director_runtime.sql", "utf8"));
    for (const table of [
      "world_engine_runs",
      "world_engine_event_queue",
      "world_engine_agenda_snapshots",
      "world_engine_director_state",
      "npc_agent_state",
    ]) {
      const row = await admin.query<{ world_id: string; map_id: string }>(
        `SELECT world_id, map_id FROM ${table} LIMIT 1`,
      );
      assert.deepEqual(row.rows[0], {
        world_id: "dark_moon_prologue",
        map_id: "dark_moon_apartment",
      });
      const nullable = await admin.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'world_id'`,
        [legacySchema, table],
      );
      assert.equal(nullable.rows[0]?.is_nullable, "YES");
    }

    await admin.query(readFileSync("drizzle/0021_finalize_world_director_scope.sql", "utf8"));
    const finalized = await admin.query<{ nullable_count: string }>(
      `SELECT COUNT(*)::text AS nullable_count
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name IN (
           'world_engine_runs', 'world_engine_event_queue',
           'world_engine_agenda_snapshots', 'world_engine_director_state', 'npc_agent_state'
         )
         AND column_name IN ('world_id', 'map_id') AND is_nullable = 'YES'`,
      [legacySchema],
    );
    assert.equal(finalized.rows[0]?.nullable_count, "0");

    await admin.query(
      `INSERT INTO world_engine_runs
       (world_id, map_id, dedup_key, request_id, session_id, model_task, status)
       VALUES ('xingni_taichu', 'xingni_qingshi_county', 'same-dedup',
               'xingni-request', 'same-session', 'WORLDBUILD_OFFLINE', 'succeeded')`,
    );
    const count = await admin.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM world_engine_runs
       WHERE session_id = 'same-session' AND dedup_key = 'same-dedup'`,
    );
    assert.equal(count.rows[0]?.count, "2");
    await admin.query("SET search_path TO public");
  });

  await t.test("PostgreSQL owns queue dedup, reports insertion failure, and releases stale locks", async () => {
    const sessionId = `director-queue-${Date.now()}`;
    const payload = {
      version: 2 as const,
      requestId: `${sessionId}:request`,
      userId: null,
      sessionId,
      worldId: "dark_moon_prologue" as const,
      mapId: "dark_moon_apartment" as const,
      triggerSignals: ["key_story_node_hit" as const],
      controlRiskTags: [],
      playerLocationBefore: "3F_Room304",
      playerLocationAfter: "3F_Hallway",
      presentNpcIds: [],
      deadNpcIds: [],
      changedTaskIds: [],
      changedClueIds: [],
      pacingChapterSignals: {
        phase: "build_up" as const,
        tension: 0.4,
        chapterId: null,
        chapterIndex: 0,
        progress: 0.2,
      },
      worldStateSummary: {
        day: 1,
        timeSlot: "day" as const,
        danger: "medium" as const,
        stateCodes: [],
      },
      latestTurnSignals: {
        actionKinds: ["movement" as const],
        legal: true,
        death: false,
        riskTags: [],
      },
      npcLocationUpdateCount: 0,
      turnIndex: 12,
    };
    const persistJob = (
      jobPayload: WorldEngineTickPayload,
      dedupKey: string,
    ) => jobs.enqueueJob("WORLD_ENGINE_TICK", jobPayload, {
      priority: 4,
      idempotencyKey: dedupKey,
    });
    const first = await queueCore.enqueueWorldEngineTickWithDeps(payload, { persistJob });
    const duplicate = await queueCore.enqueueWorldEngineTickWithDeps(payload, { persistJob });
    assert.equal(first.enqueued, true);
    assert.equal(duplicate.enqueued, true);
    assert.equal(first.jobId, duplicate.jobId);
    const jobCount = await admin.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.vc_jobs
       WHERE job_type = 'WORLD_ENGINE_TICK' AND idempotency_key = $1`,
      [first.dedupKey],
    );
    assert.equal(jobCount.rows[0]?.count, "1");

    await admin.query("ALTER TABLE public.vc_jobs RENAME TO vc_jobs_integration_unavailable");
    try {
      const failed = await queueCore.enqueueWorldEngineTickWithDeps(
        { ...payload, turnIndex: 13 },
        { persistJob },
      );
      assert.equal(failed.enqueued, false);
      assert.equal(failed.jobId, null);
    } finally {
      await admin.query(
        "ALTER TABLE public.vc_jobs_integration_unavailable RENAME TO vc_jobs",
      );
    }

    await admin.query(
      `UPDATE public.vc_jobs
       SET status = 'running', locked_by = 'crashed-worker',
           locked_at = NOW() - interval '30 minutes', attempts = 2
       WHERE job_id = $1`,
      [first.jobId],
    );
    assert.equal(await jobs.releaseStaleRunningJobs(10), 1);
    const released = await admin.query<{
      status: string;
      locked_by: string | null;
      attempts: number;
    }>(
      `SELECT status, locked_by, attempts FROM public.vc_jobs WHERE job_id = $1`,
      [first.jobId],
    );
    assert.deepEqual(released.rows[0], {
      status: "pending",
      locked_by: null,
      attempts: 1,
    });
  });

  await t.test("same-session Writer hints stay world-scoped and fail open on deadline", async () => {
    await admin.query(
      `ALTER TABLE IF EXISTS public.world_engine_hint_envelopes
       DROP CONSTRAINT IF EXISTS director_integration_force_hint_failure`,
    );
    const sessionId = `director-hint-${Date.now()}`;
    const runRows = await admin.query<{ run_id: number; world_id: string }>(
      `INSERT INTO public.world_engine_runs
       (world_id, map_id, dedup_key, request_id, session_id,
        trigger_signals, model_task, status, output_json)
       VALUES
       ('dark_moon_prologue', 'dark_moon_apartment', $1, $2, $3,
        '[]'::jsonb, 'WORLDBUILD_OFFLINE', 'succeeded', '{"world_revision":"11"}'::jsonb),
       ('xingni_taichu', 'xingni_qingshi_county', $1, $4, $3,
        '[]'::jsonb, 'WORLDBUILD_OFFLINE', 'succeeded', '{"world_revision":"12"}'::jsonb)
       RETURNING run_id, world_id`,
      [`dedup-${sessionId}`, `dark-${sessionId}`, sessionId, `xingni-${sessionId}`],
    );
    const runByWorld = new Map(runRows.rows.map((row) => [row.world_id, row.run_id]));
    const client = await pool.connect();
    try {
      await hintRepository.insertDirectorHintEnvelope({
        hintId: `hint-dark-${sessionId}`,
        runId: runByWorld.get("dark_moon_prologue")!,
        worldId: "dark_moon_prologue",
        mapId: "dark_moon_apartment",
        sessionId,
        worldRevision: "11",
        validFromTurn: 13,
        validThroughTurn: 16,
        phase: "build_up",
        directions: ["只推进暗月走廊的可观察异常。"],
        must: [],
        should: [],
        may: ["让远处灯光短暂闪烁。"],
        forbid: ["不得出现青石县人物。"],
        factRefs: [],
        eventRefs: ["EV_DARK_TEST"],
        npcRefs: [],
        sources: ["world_director"],
        lifecycle: "active",
        createdAt: new Date().toISOString(),
      }, client);
      await hintRepository.insertDirectorHintEnvelope({
        hintId: `hint-xingni-${sessionId}`,
        runId: runByWorld.get("xingni_taichu")!,
        worldId: "xingni_taichu",
        mapId: "xingni_qingshi_county",
        sessionId,
        worldRevision: "12",
        validFromTurn: 13,
        validThroughTurn: 16,
        phase: "build_up",
        directions: ["只推进青石县集市的登记微事件。"],
        must: [],
        should: [],
        may: ["让药香随风掠过。"],
        forbid: ["不得出现暗月公寓人物。"],
        factRefs: [],
        eventRefs: ["XQ-EV01"],
        npcRefs: ["XQ-N006"],
        sources: ["world_director"],
        lifecycle: "active",
        createdAt: new Date().toISOString(),
      }, client);
    } finally {
      client.release();
    }

    const darkHint = await writerConsumer.loadCommittedDirectorHintForWriter({
      scope: {
        worldId: "dark_moon_prologue",
        mapId: "dark_moon_apartment",
        sessionId,
      },
      turnIndex: 13,
      timeoutMs: 80,
    });
    const xingniHint = await writerConsumer.loadCommittedDirectorHintForWriter({
      scope: {
        worldId: "xingni_taichu",
        mapId: "xingni_qingshi_county",
        sessionId,
      },
      turnIndex: 13,
      timeoutMs: 80,
    });
    assert.equal(darkHint?.envelope.hintId, `hint-dark-${sessionId}`);
    assert.equal(xingniHint?.envelope.hintId, `hint-xingni-${sessionId}`);
    assert.match(darkHint?.block ?? "", /暗月走廊/);
    assert.doesNotMatch(darkHint?.block ?? "", /青石县集市/);
    assert.match(xingniHint?.block ?? "", /青石县集市/);
    assert.doesNotMatch(xingniHint?.block ?? "", /暗月走廊/);

    const locker = new Client({ connectionString: databaseUrl });
    await locker.connect();
    await locker.query("BEGIN");
    await locker.query("LOCK TABLE public.world_engine_hint_envelopes IN ACCESS EXCLUSIVE MODE");
    const startedAt = Date.now();
    const timedOut = await writerConsumer.loadCommittedDirectorHintForWriter({
      scope: {
        worldId: "dark_moon_prologue",
        mapId: "dark_moon_apartment",
        sessionId,
      },
      turnIndex: 13,
      timeoutMs: 20,
    });
    const elapsedMs = Date.now() - startedAt;
    assert.equal(timedOut, null);
    assert.ok(elapsedMs < 300, `hint lookup should fail open, got ${elapsedMs}ms`);
    await locker.query("ROLLBACK");
    await locker.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  await t.test("output transaction rolls back completely and succeeded runs recover idempotently", async () => {
    const sessionId = `director-tx-${Date.now()}`;
    const dedupKey = `we:${sessionId}`;
    const run = await admin.query<{ run_id: number }>(
      `INSERT INTO public.world_engine_runs
       (world_id, map_id, dedup_key, request_id, session_id,
        trigger_signals, model_task, status)
       VALUES ('dark_moon_prologue', 'dark_moon_apartment', $1, $2, $3,
               '["key_story_node_hit"]'::jsonb, 'WORLDBUILD_OFFLINE', 'running')
       RETURNING run_id`,
      [dedupKey, `request-${sessionId}`, sessionId],
    );
    const runId = run.rows[0]!.run_id;
    const delta = contracts.parseWorldEngineDeltaJson(JSON.stringify({
      schema_version: "director_plan_v1",
      director_intent: "让走廊出现可观察且可拒绝的环境提示。",
      current_phase: "quiet",
      target_phase: "build_up",
      pacing_assessment: {
        tension: 0.4,
        mystery: 0.5,
        fatigue: 0.2,
        progress: 0.3,
        agency_health: 0.9,
        reveal_pressure: 0.2,
      },
      risk_assessment: {
        agency_risk: "low",
        continuity_risk: "low",
        spoiler_risk: "low",
        safety_risk: "low",
      },
      reveal_policy: "hold",
      npc_next_actions: [],
      world_events_to_schedule: [{
        event_code: "EV_TX_SAFE",
        title: "走廊灯光闪烁",
        due_in_turns: 1,
        ttl_turns: 4,
        priority: "low",
        salience: 0.4,
        trigger_conditions: ["玩家仍在走廊附近"],
        injection_hint: "远处灯光短暂闪烁，玩家可以观察，也可以直接离开。",
        agency_constraints: ["玩家可以忽略或离开"],
        forbidden_outcomes: ["不得强制玩家失败"],
        payload: {},
      }],
      story_branch_seeds: [],
      consistency_warnings: [],
      player_private_hooks: [],
    }));
    assert.ok(delta);
    const validation = validator.validateDirectorPlan(delta);
    assert.equal(validation.accepted, true);
    const payload: WorldEngineTickPayload = {
      version: 2,
      requestId: `request-${sessionId}`,
      userId: null,
      sessionId,
      worldId: "dark_moon_prologue",
      mapId: "dark_moon_apartment",
      triggerSignals: ["key_story_node_hit"],
      controlRiskTags: [],
      playerLocationBefore: "3F_Room304",
      playerLocationAfter: "3F_Hallway",
      presentNpcIds: [],
      deadNpcIds: [],
      changedTaskIds: [],
      changedClueIds: [],
      pacingChapterSignals: {
        phase: "build_up",
        tension: 0.4,
        chapterId: null,
        chapterIndex: 0,
        progress: 0.2,
      },
      worldStateSummary: {
        day: 1,
        timeSlot: "day",
        danger: "medium",
        stateCodes: [],
      },
      latestTurnSignals: {
        actionKinds: ["movement"],
        legal: true,
        death: false,
        riskTags: [],
      },
      npcLocationUpdateCount: 0,
      turnIndex: 12,
      dedupKey,
      enqueuedAt: new Date().toISOString(),
    };
    await admin.query(
      `INSERT INTO public.vc_world_meta (id, world_revision)
       VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
    );
    const beforeRevision = await admin.query<{ world_revision: string }>(
      "SELECT world_revision::text FROM public.vc_world_meta WHERE id = 1",
    );
    const args = {
      runId,
      mode: "soft" as const,
      payload,
      delta,
      validation,
      socialGmInput: null,
      socialTelemetry: {
        socialWorldMode: "off" as const,
        socialTickTriggered: false,
        socialActiveNpcCount: 0,
        socialEventsAccepted: 0,
        socialEventsRejected: 0,
        socialPromptChars: 0,
        socialQueryLatencyMs: 0,
        socialReasonerLatencyMs: 0,
        socialRejectedByCode: {},
        socialPendingEventCount: 0,
        socialTickSkippedReason: "off",
      },
      previousDirectorState: null,
    };
    await admin.query(
      `ALTER TABLE public.world_engine_hint_envelopes
       ADD CONSTRAINT director_integration_force_hint_failure CHECK (false) NOT VALID`,
    );
    try {
      await assert.rejects(engine.writeWorldEngineOutputs(args));
      for (const [table, predicate, value] of [
        ["world_engine_agenda_snapshots", "run_id = $1", runId],
        ["world_engine_event_queue", "run_id = $1", runId],
        ["world_engine_hint_envelopes", "run_id = $1", runId],
        ["world_engine_director_state", "session_id = $1", sessionId],
      ] as const) {
        const count = await admin.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.${table} WHERE ${predicate}`,
          [value],
        );
        assert.equal(count.rows[0]?.count, "0", `${table} must roll back`);
      }
      const afterFailedRevision = await admin.query<{ world_revision: string }>(
        "SELECT world_revision::text FROM public.vc_world_meta WHERE id = 1",
      );
      assert.equal(
        afterFailedRevision.rows[0]?.world_revision,
        beforeRevision.rows[0]?.world_revision,
      );
      const failedRun = await admin.query<{ status: string }>(
        "SELECT status FROM public.world_engine_runs WHERE run_id = $1",
        [runId],
      );
      assert.equal(failedRun.rows[0]?.status, "running");
    } finally {
      await admin.query(
        `ALTER TABLE public.world_engine_hint_envelopes
         DROP CONSTRAINT IF EXISTS director_integration_force_hint_failure`,
      );
    }
    const committed = await engine.writeWorldEngineOutputs(args);
    assert.equal(committed.runId, runId);
    assert.ok(committed.worldRevision > 0n);
    assert.equal(committed.agendaCreated, 1);

    const recovered = await engine.runWorldEngineTick(payload);
    assert.equal(recovered.ok, true);
    assert.equal("runId" in recovered ? recovered.runId : 0, runId);
    assert.equal(
      "worldRevision" in recovered ? recovered.worldRevision : 0n,
      committed.worldRevision,
    );
    const persisted = await admin.query<{ snapshots: string; hints: string; agenda: string }>(
      `SELECT
         (SELECT COUNT(*) FROM public.world_engine_agenda_snapshots WHERE run_id = $1)::text AS snapshots,
         (SELECT COUNT(*) FROM public.world_engine_hint_envelopes WHERE run_id = $1)::text AS hints,
         (SELECT COUNT(*) FROM public.world_engine_event_queue WHERE run_id = $1)::text AS agenda`,
      [runId],
    );
    assert.deepEqual(persisted.rows[0], { snapshots: "1", hints: "1", agenda: "1" });
  });
});
