CREATE TABLE IF NOT EXISTS ai_service_connections (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(96) NOT NULL, base_url VARCHAR(1024) NOT NULL,
  transport VARCHAR(32) NOT NULL DEFAULT 'openai_compatible', encrypted_api_key TEXT NOT NULL,
  key_last_four VARCHAR(8) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_test_status VARCHAR(24), last_tested_at TIMESTAMPTZ, last_test_message VARCHAR(191),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_service_connections_active_idx ON ai_service_connections(enabled, deleted_at);

CREATE TABLE IF NOT EXISTS ai_service_models (
  id VARCHAR(64) PRIMARY KEY, service_id VARCHAR(64) NOT NULL REFERENCES ai_service_connections(id) ON DELETE CASCADE,
  name VARCHAR(96) NOT NULL, upstream_model VARCHAR(191) NOT NULL,
  capability VARCHAR(24) NOT NULL DEFAULT 'generation', embedding_dimension INTEGER,
  input_price_cny_fen_per_million INTEGER, output_price_cny_fen_per_million INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ,
  UNIQUE(service_id, upstream_model)
);
CREATE INDEX IF NOT EXISTS ai_service_models_service_idx ON ai_service_models(service_id, enabled);

CREATE TABLE IF NOT EXISTS ai_route_assignments (
  id BIGSERIAL PRIMARY KEY, purpose VARCHAR(32) NOT NULL,
  model_id VARCHAR(64) NOT NULL REFERENCES ai_service_models(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(purpose, priority), UNIQUE(purpose, model_id)
);
CREATE TABLE IF NOT EXISTS ai_config_state (id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO ai_config_state(id, version) VALUES(1,0) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGSERIAL PRIMARY KEY, idempotency_key VARCHAR(191) NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, request_id VARCHAR(191) NOT NULL,
  purpose VARCHAR(32) NOT NULL, task VARCHAR(64) NOT NULL, service_id VARCHAR(64), service_name VARCHAR(96) NOT NULL,
  model_id VARCHAR(64), model_name VARCHAR(191) NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0, cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0, usage_estimated BOOLEAN NOT NULL DEFAULT FALSE,
  cost_cny_micros BIGINT, input_price_cny_fen_per_million INTEGER, output_price_cny_fen_per_million INTEGER,
  latency_ms INTEGER, outcome VARCHAR(24) NOT NULL, error_category VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS ai_usage_events_occurred_idx ON ai_usage_events(occurred_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_purpose_occurred_idx ON ai_usage_events(purpose, occurred_at);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  date_key DATE NOT NULL, purpose VARCHAR(32) NOT NULL, service_id VARCHAR(64) NOT NULL DEFAULT 'deleted',
  service_name VARCHAR(96) NOT NULL, model_id VARCHAR(64) NOT NULL DEFAULT 'deleted', model_name VARCHAR(191) NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, estimated_count INTEGER NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0, output_tokens BIGINT NOT NULL DEFAULT 0, cached_input_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0, cost_cny_micros BIGINT, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date_key, purpose, service_id, model_id)
);
CREATE INDEX IF NOT EXISTS ai_usage_daily_date_idx ON ai_usage_daily(date_key);
