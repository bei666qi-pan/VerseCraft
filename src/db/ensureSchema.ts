import "server-only";

import { pool } from "@/db/index";
import { env } from "@/lib/env";

let ensured = false;

/**
 * Coolify/first-boot safety net.
 * If Drizzle migrations weren't applied yet, create the minimal tables used at runtime.
 * This is idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 */
export async function ensureRuntimeSchema(): Promise<void> {
  if (ensured) return;

  // Allow disabling in production if you manage migrations externally.
  if (env.runtimeSchemaEnsure === "0") {
    ensured = true;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        today_tokens_used INTEGER NOT NULL DEFAULT 0,
        play_time INTEGER NOT NULL DEFAULT 0,
        today_play_time INTEGER NOT NULL DEFAULT 0,
        last_data_reset TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (name);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        guest_id VARCHAR(128),
        content TEXT NOT NULL,
        kind VARCHAR(24) NOT NULL DEFAULT 'open',
        client_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // 兼容旧库：历史版本 feedbacks 可能缺少游客相关列。
    await client.query(`ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS guest_id VARCHAR(128);`);
    await client.query(`ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS kind VARCHAR(24) NOT NULL DEFAULT 'open';`);
    await client.query(`ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS client_meta JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await client.query(`CREATE INDEX IF NOT EXISTS feedbacks_user_id_idx ON feedbacks (user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS feedbacks_guest_id_idx ON feedbacks (guest_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS feedbacks_created_idx ON feedbacks (created_at);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE SET NULL,
        guest_id VARCHAR(128),
        survey_key VARCHAR(64) NOT NULL,
        survey_version VARCHAR(32) NOT NULL,
        source VARCHAR(64) NOT NULL DEFAULT 'home_modal',
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        free_text TEXT,
        overall_rating INTEGER,
        recommend_score INTEGER,
        contact_intent BOOLEAN NOT NULL DEFAULT FALSE,
        user_agreement BOOLEAN NOT NULL DEFAULT FALSE,
        privacy_policy BOOLEAN NOT NULL DEFAULT FALSE,
        client_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // 兼容旧库：历史版本 survey_responses 可能缺少 guest_id。
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS guest_id VARCHAR(128);`);
    // 注意顺序：必须先补列再建 guest_id 相关索引，避免旧库在建索引时报 42703。
    await client.query(`
      CREATE INDEX IF NOT EXISTS survey_responses_key_user_idx ON survey_responses (survey_key, user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS survey_responses_key_guest_idx ON survey_responses (survey_key, guest_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS survey_responses_created_idx ON survey_responses (created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_inquiries (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        topic VARCHAR(32) NOT NULL,
        contact_line VARCHAR(512),
        body TEXT NOT NULL,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE SET NULL,
        ip_hash VARCHAR(64),
        client_meta JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS compliance_inquiries_created_idx ON compliance_inquiries (created_at);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS compliance_inquiries_topic_idx ON compliance_inquiries (topic);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS compliance_inquiries_ip_created_idx ON compliance_inquiries (ip_hash, created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_records (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        killed_anomalies INTEGER NOT NULL DEFAULT 0,
        max_floor_score INTEGER NOT NULL DEFAULT 0,
        survival_time_seconds INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE game_records
      ALTER COLUMN survival_time_seconds TYPE INTEGER
      USING survival_time_seconds::integer;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_session_memory (
        user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plot_summary TEXT,
        player_status JSONB,
        npc_relationships JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_onboarding (
        user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        codex_first_view_done INTEGER NOT NULL DEFAULT 0,
        warehouse_first_view_done INTEGER NOT NULL DEFAULT 0,
        tasks_first_view_done INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users_quota (
        user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        daily_tokens INTEGER NOT NULL DEFAULT 0,
        daily_actions INTEGER NOT NULL DEFAULT 0,
        last_action_date DATE NOT NULL DEFAULT CURRENT_DATE,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS save_slots (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_id VARCHAR(64) NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS save_slots_user_slot_unique ON save_slots (user_id, slot_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_stats_snapshots (
        date DATE PRIMARY KEY,
        total_users INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        active_users INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ========= Analytics Data Foundation =========
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        event_id VARCHAR(191) PRIMARY KEY,
        user_id VARCHAR(191) NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(191) NOT NULL,
        event_name VARCHAR(64) NOT NULL,
        event_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        page TEXT NULL,
        source TEXT NULL,
        platform TEXT NULL,
        token_cost INTEGER NOT NULL DEFAULT 0,
        play_duration_delta_sec INTEGER NOT NULL DEFAULT 0,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key VARCHAR(191) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS analytics_events_user_event_time_idx ON analytics_events (user_id, event_time);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS analytics_events_event_name_event_time_idx ON analytics_events (event_name, event_time);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON analytics_events (session_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS analytics_events_page_time_idx ON analytics_events (page, event_time);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id VARCHAR(191) PRIMARY KEY,
        user_id VARCHAR(191) NULL REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_page TEXT NULL,
        total_token_cost INTEGER NOT NULL DEFAULT 0,
        total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
        chat_action_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ========= Admin guest aliases =========
    // Global stable mapping: guest_id -> 游客N
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_aliases (
        guest_id VARCHAR(128) PRIMARY KEY,
        guest_no BIGSERIAL NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS guest_aliases_guest_no_unique ON guest_aliases (guest_no);`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_sessions_user_last_seen_idx ON user_sessions (user_id, last_seen_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_daily_activity (
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_key DATE NOT NULL,
        first_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        chat_action_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date_key)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_daily_activity_date_key_idx ON user_daily_activity (date_key);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_daily_activity_user_idx ON user_daily_activity (user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_daily_tokens (
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_key DATE NOT NULL,
        daily_token_cost INTEGER NOT NULL DEFAULT 0,
        daily_play_duration_sec INTEGER NOT NULL DEFAULT 0,
        chat_action_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date_key)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_daily_tokens_date_key_idx ON user_daily_tokens (date_key);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_daily_tokens_user_idx ON user_daily_tokens (user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_metrics_daily (
        date_key DATE PRIMARY KEY,
        dau INTEGER NOT NULL DEFAULT 0,
        wau INTEGER NOT NULL DEFAULT 0,
        mau INTEGER NOT NULL DEFAULT 0,
        new_users INTEGER NOT NULL DEFAULT 0,
        total_token_cost INTEGER NOT NULL DEFAULT 0,
        total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
        chat_actions INTEGER NOT NULL DEFAULT 0,
        feedback_submitted_count INTEGER NOT NULL DEFAULT 0,
        game_completed_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS admin_metrics_daily_date_key_idx ON admin_metrics_daily (date_key);
    `);

    // ========= Safety audit events (append-only, minimal) =========
    await client.query(`
      CREATE TABLE IF NOT EXISTS safety_audit_events (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        trace_id VARCHAR(191) NOT NULL,
        scene VARCHAR(64) NOT NULL,
        stage VARCHAR(16) NOT NULL,
        decision VARCHAR(16) NOT NULL,
        risk_level VARCHAR(16) NOT NULL,
        reason_code VARCHAR(128) NOT NULL,
        content_fingerprint VARCHAR(64) NOT NULL,
        actor JSONB NOT NULL DEFAULT '{}'::jsonb,
        provider_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        whitelist JSONB NOT NULL DEFAULT '{}'::jsonb,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS safety_audit_events_created_idx ON safety_audit_events (created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS safety_audit_events_scene_created_idx ON safety_audit_events (scene, created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS safety_audit_events_trace_idx ON safety_audit_events (trace_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS safety_audit_events_fingerprint_idx ON safety_audit_events (content_fingerprint);`);

    // ========= KG / 语义缓存（pgvector + IVFFlat；无扩展时跳过，与 /api/chat 降级一致）=========
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_world_meta (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          world_revision BIGINT NOT NULL DEFAULT 0
        );
      `);
      await client.query(`
        INSERT INTO vc_world_meta (id, world_revision) VALUES (1, 0)
        ON CONFLICT (id) DO NOTHING;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_semantic_cache (
          id BIGSERIAL PRIMARY KEY,
          cache_scope TEXT NOT NULL,
          task TEXT NOT NULL,
          user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
          world_revision BIGINT NOT NULL,
          request_embedding vector(256) NOT NULL,
          request_norm TEXT,
          request_text_preview TEXT,
          request_hash TEXT NOT NULL UNIQUE,
          response_text TEXT NOT NULL,
          is_valid BOOLEAN NOT NULL DEFAULT TRUE,
          expires_at TIMESTAMPTZ NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0,
          last_hit_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_semantic_cache_ivfflat_global_codex
        ON vc_semantic_cache USING ivfflat (request_embedding vector_cosine_ops)
        WITH (lists = 100)
        WHERE cache_scope = 'global' AND is_valid = TRUE AND task = 'codex';
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_user_fact (
          id BIGSERIAL PRIMARY KEY,
          user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fact_text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_user_fact_user_id_idx ON vc_user_fact (user_id);
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_world_candidate (
          id BIGSERIAL PRIMARY KEY,
          proposer_user_id VARCHAR(191) REFERENCES users(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ghost',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_world_cluster (
          cluster_id BIGSERIAL PRIMARY KEY,
          centroid vector(256) NOT NULL,
          unique_user_count INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'open',
          promoted_fact_id BIGINT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_world_cluster_ivfflat_centroid
        ON vc_world_cluster USING ivfflat (centroid vector_cosine_ops)
        WITH (lists = 100)
        WHERE state = 'open';
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_world_fact (
          fact_id BIGSERIAL PRIMARY KEY,
          canonical_text TEXT NOT NULL,
          normalized_hash TEXT NOT NULL UNIQUE,
          embedding vector(256) NOT NULL,
          is_hot BOOLEAN NOT NULL DEFAULT TRUE,
          last_hit_at TIMESTAMPTZ,
          archived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_world_fact_ivfflat_hot
        ON vc_world_fact USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        WHERE is_hot = TRUE;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_cluster_observation (
          id BIGSERIAL PRIMARY KEY,
          cluster_id BIGINT NOT NULL REFERENCES vc_world_cluster(cluster_id) ON DELETE CASCADE,
          user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          candidate_id BIGINT REFERENCES vc_world_candidate(id) ON DELETE SET NULL,
          embedding vector(256) NOT NULL,
          similarity_to_centroid REAL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (cluster_id, user_id)
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_cluster_observation_cluster_idx ON vc_cluster_observation (cluster_id);
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS vc_jobs (
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS vc_jobs_claim_idx
        ON vc_jobs (status, run_at, priority DESC, job_id);
      `);

      const candAlters = [
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_status TEXT NOT NULL DEFAULT 'pending'",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS compliance_ok BOOLEAN",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS significance_score SMALLINT",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_action TEXT",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS canonical_text TEXT",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS normalized_text TEXT",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_violations JSONB",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_tags JSONB",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_model_meta JSONB",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS embedding vector(256)",
        "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS cluster_id BIGINT REFERENCES vc_world_cluster(cluster_id) ON DELETE SET NULL",
      ];
      for (const sql of candAlters) {
        try {
          await client.query(sql);
        } catch {
          /* 列已存在或类型冲突时跳过 */
        }
      }
    } catch {
      /* 无 vector 扩展或非 PG 时跳过；语义缓存模块对缺表静默 */
    }

    // keep KG reconcile at the end so runtime fallback stays aligned with migrate.js.
    await ensureKgSchema(client);

    // ========= World Knowledge（world_* tables）=========
    // These tables must not block app boot even if pgvector is missing.
    let hasVector = false;
    try {
      const r = await client.query<{ has_vector: boolean }>(
        `SELECT (to_regtype('vector') IS NOT NULL) AS has_vector`
      );
      hasVector = Boolean(r.rows?.[0]?.has_vector);
    } catch {
      hasVector = false;
    }

    const embeddingVectorType = hasVector ? "vector(256)" : "TEXT";

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_entities (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(32) NOT NULL,
        code VARCHAR(128) NOT NULL,
        canonical_name VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        summary TEXT,
        detail TEXT,
        scope VARCHAR(16) NOT NULL,
        owner_user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(32) NOT NULL,
        source_type VARCHAR(32) NOT NULL,
        source_ref TEXT,
        importance INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT world_entities_type_code_unique UNIQUE (entity_type, code)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS world_entities_code_idx ON world_entities (code);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entities_canonical_name_idx ON world_entities (canonical_name);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entities_scope_idx ON world_entities (scope);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entities_owner_scope_idx ON world_entities (owner_user_id, scope);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_entities_type_status_importance_idx ON world_entities (entity_type, status, importance);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_entity_tags (
        entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
        tag VARCHAR(128) NOT NULL,
        CONSTRAINT world_entity_tags_entity_tag_unique UNIQUE (entity_id, tag)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entity_tags_tag_idx ON world_entity_tags (tag);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_entity_edges (
        id SERIAL PRIMARY KEY,
        from_entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
        to_entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
        relation_type VARCHAR(32) NOT NULL,
        relation_label TEXT NOT NULL,
        strength INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT world_entity_edges_from_to_type_label_unique UNIQUE (from_entity_id, to_entity_id, relation_type, relation_label)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entity_edges_from_to_idx ON world_entity_edges (from_entity_id, to_entity_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_entity_edges_relation_type_idx ON world_entity_edges (relation_type);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_knowledge_chunks (
        id SERIAL PRIMARY KEY,
        entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_tsv TSVECTOR NOT NULL,
        token_estimate INTEGER NOT NULL DEFAULT 0,
        importance INTEGER NOT NULL DEFAULT 0,
        visibility_scope VARCHAR(16) NOT NULL,
        owner_user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        retrieval_key VARCHAR(256),
        embedding_model VARCHAR(64),
        embedding_status VARCHAR(32) NOT NULL DEFAULT 'pending',
        embedding_vector ${embeddingVectorType},
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT world_knowledge_chunks_entity_chunk_unique UNIQUE (entity_id, chunk_index)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_entity_idx ON world_knowledge_chunks (entity_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_visibility_scope_idx ON world_knowledge_chunks (visibility_scope);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_owner_scope_idx ON world_knowledge_chunks (owner_user_id, visibility_scope);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_retrieval_key_idx ON world_knowledge_chunks (retrieval_key);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_embedding_status_idx ON world_knowledge_chunks (embedding_status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_knowledge_chunks_content_tsv_gin ON world_knowledge_chunks USING GIN (content_tsv);`);

    if (hasVector) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS world_knowledge_chunks_embedding_ivfflat
        ON world_knowledge_chunks USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100)
        WHERE embedding_vector IS NOT NULL AND embedding_status = 'ready';
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_player_facts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(191) NOT NULL,
        fact_type VARCHAR(32) NOT NULL,
        entity_id INTEGER REFERENCES world_entities(id) ON DELETE SET NULL,
        normalized_fact TEXT NOT NULL,
        raw_fact TEXT NOT NULL,
        confidence INTEGER NOT NULL DEFAULT 0,
        conflict_status VARCHAR(64),
        approved_to_shared BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS world_player_facts_user_session_idx ON world_player_facts (user_id, session_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_player_facts_fact_type_idx ON world_player_facts (fact_type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS world_player_facts_entity_idx ON world_player_facts (entity_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_retrieval_cache_snapshots (
        cache_key VARCHAR(255) PRIMARY KEY,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_retrieval_cache_snapshots_expires_at_idx ON world_retrieval_cache_snapshots (expires_at);`
    );

    // ========= World Engine（离线 reasoner 产物）=========
    await client.query(`
      CREATE TABLE IF NOT EXISTS world_engine_runs (
        run_id SERIAL PRIMARY KEY,
        dedup_key VARCHAR(128) NOT NULL UNIQUE,
        request_id VARCHAR(191) NOT NULL,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(191) NOT NULL,
        trigger_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
        model_task VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        output_json JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_engine_runs_session_created_idx ON world_engine_runs (session_id, created_at);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_engine_runs_status_created_idx ON world_engine_runs (status, created_at);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_engine_event_queue (
        id SERIAL PRIMARY KEY,
        run_id INTEGER NOT NULL REFERENCES world_engine_runs(run_id) ON DELETE CASCADE,
        session_id VARCHAR(191) NOT NULL,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        event_code VARCHAR(128) NOT NULL,
        title TEXT NOT NULL,
        due_in_turns INTEGER NOT NULL DEFAULT 1,
        priority VARCHAR(16) NOT NULL DEFAULT 'low',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_engine_event_queue_session_status_due_idx
       ON world_engine_event_queue (session_id, status, due_in_turns);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_engine_event_queue_event_code_idx
       ON world_engine_event_queue (event_code);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS world_engine_agenda_snapshots (
        id SERIAL PRIMARY KEY,
        run_id INTEGER NOT NULL REFERENCES world_engine_runs(run_id) ON DELETE CASCADE,
        session_id VARCHAR(191) NOT NULL,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        agenda_revision INTEGER NOT NULL,
        snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT world_engine_agenda_session_revision_unique UNIQUE (session_id, agenda_revision)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS world_engine_agenda_session_created_idx
       ON world_engine_agenda_snapshots (session_id, created_at);`
    );

    // ========= AI 后台分析快照（admin + settlement）=========
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_analysis_snapshots (
        id SERIAL PRIMARY KEY,
        task VARCHAR(64) NOT NULL,
        scope_key VARCHAR(191) NOT NULL,
        input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        model_role VARCHAR(32) NOT NULL DEFAULT 'none',
        data_revision VARCHAR(128) NOT NULL DEFAULT '',
        stale_at TIMESTAMPTZ NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ai_analysis_task_scope_unique UNIQUE (task, scope_key)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS ai_analysis_stale_idx ON ai_analysis_snapshots (stale_at);`
    );

    ensured = true;
  } finally {
    client.release();
  }
}

async function ensureKgSchema(
  client: { query: (sql: string) => Promise<unknown> }
): Promise<void> {
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_world_meta (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        world_revision BIGINT NOT NULL DEFAULT 0
      );
    `);
    await client.query(`
      INSERT INTO vc_world_meta (id, world_revision) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_world_fact (
        fact_id BIGSERIAL PRIMARY KEY,
        canonical_text TEXT NOT NULL,
        normalized_hash TEXT NOT NULL UNIQUE,
        embedding vector(256) NOT NULL,
        is_hot BOOLEAN NOT NULL DEFAULT TRUE,
        last_hit_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_world_cluster (
        cluster_id BIGSERIAL PRIMARY KEY,
        centroid vector(256) NOT NULL,
        unique_user_count INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'open',
        promoted_fact_id BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_cluster_observation (
        id BIGSERIAL PRIMARY KEY,
        cluster_id BIGINT NOT NULL REFERENCES vc_world_cluster(cluster_id) ON DELETE CASCADE,
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        candidate_id BIGINT REFERENCES vc_world_candidate(id) ON DELETE SET NULL,
        embedding vector(256) NOT NULL,
        similarity_to_centroid REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (cluster_id, user_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_semantic_cache (
        id BIGSERIAL PRIMARY KEY,
        cache_scope TEXT NOT NULL,
        task TEXT NOT NULL,
        user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
        world_revision BIGINT NOT NULL,
        request_embedding vector(256) NOT NULL,
        request_norm TEXT,
        request_text_preview TEXT,
        request_hash TEXT NOT NULL UNIQUE,
        response_text TEXT NOT NULL,
        is_valid BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at TIMESTAMPTZ NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0,
        last_hit_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS vc_jobs (
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS vc_world_cluster_ivfflat_centroid
      ON vc_world_cluster USING ivfflat (centroid vector_cosine_ops)
      WITH (lists = 100)
      WHERE state = 'open';
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS vc_world_fact_ivfflat_hot
      ON vc_world_fact USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
      WHERE is_hot = TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS vc_semantic_cache_ivfflat_global_codex
      ON vc_semantic_cache USING ivfflat (request_embedding vector_cosine_ops)
      WITH (lists = 100)
      WHERE cache_scope = 'global' AND is_valid = TRUE AND task = 'codex';
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS vc_jobs_claim_idx
      ON vc_jobs (status, run_at, priority DESC, job_id);
    `);
  } catch (e) {
    console.warn("[ensureSchema] ensureKgSchema skipped:", e);
  }
}

