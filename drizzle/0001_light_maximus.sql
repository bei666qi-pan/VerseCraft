ALTER TABLE "world_engine_agenda_snapshots" DROP CONSTRAINT "world_engine_agenda_snapshots_run_id_world_engine_runs_run_id_f";
--> statement-breakpoint
DROP INDEX "actor_daily_tokens_actor_date_unique";--> statement-breakpoint
DROP INDEX "actor_daily_tokens_actor_idx";--> statement-breakpoint
DROP INDEX "actor_daily_tokens_date_idx";--> statement-breakpoint
DROP INDEX "actor_daily_tokens_guest_idx";--> statement-breakpoint
DROP INDEX "actor_sessions_actor_last_seen_idx";--> statement-breakpoint
DROP INDEX "actor_sessions_guest_last_seen_idx";--> statement-breakpoint
DROP INDEX "actor_sessions_user_last_seen_idx";--> statement-breakpoint
DROP INDEX "analytics_actors_actor_type_idx";--> statement-breakpoint
DROP INDEX "analytics_actors_guest_id_idx";--> statement-breakpoint
DROP INDEX "analytics_actors_last_seen_idx";--> statement-breakpoint
DROP INDEX "analytics_actors_user_id_idx";--> statement-breakpoint
DROP INDEX "admin_audit_logs_action_created_idx";--> statement-breakpoint
DROP INDEX "admin_audit_logs_actor_created_idx";--> statement-breakpoint
DROP INDEX "admin_audit_logs_created_idx";--> statement-breakpoint
DROP INDEX "admin_metrics_daily_date_key_idx";--> statement-breakpoint
DROP INDEX "ai_analysis_stale_idx";--> statement-breakpoint
DROP INDEX "ai_analysis_task_scope_unique";--> statement-breakpoint
DROP INDEX "analytics_events_actor_event_time_idx";--> statement-breakpoint
DROP INDEX "analytics_events_event_name_time_idx";--> statement-breakpoint
DROP INDEX "analytics_events_guest_event_time_idx";--> statement-breakpoint
DROP INDEX "analytics_events_idempotency_unique";--> statement-breakpoint
DROP INDEX "analytics_events_page_time_idx";--> statement-breakpoint
DROP INDEX "analytics_events_session_event_time_idx";--> statement-breakpoint
DROP INDEX "analytics_events_session_id_idx";--> statement-breakpoint
DROP INDEX "analytics_events_user_event_time_idx";--> statement-breakpoint
DROP INDEX "compliance_inquiries_created_idx";--> statement-breakpoint
DROP INDEX "compliance_inquiries_ip_created_idx";--> statement-breakpoint
DROP INDEX "compliance_inquiries_topic_idx";--> statement-breakpoint
DROP INDEX "feedbacks_created_idx";--> statement-breakpoint
DROP INDEX "feedbacks_guest_id_idx";--> statement-breakpoint
DROP INDEX "feedbacks_user_id_idx";--> statement-breakpoint
DROP INDEX "actor_daily_activity_actor_date_unique";--> statement-breakpoint
DROP INDEX "actor_daily_activity_actor_idx";--> statement-breakpoint
DROP INDEX "actor_daily_activity_date_idx";--> statement-breakpoint
DROP INDEX "actor_daily_activity_guest_idx";--> statement-breakpoint
ALTER TABLE "world_engine_agenda_snapshots" ADD CONSTRAINT "world_engine_agenda_snapshots_run_id_world_engine_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."world_engine_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_payload_world_id_time_idx" ON "analytics_events" USING btree ((payload->>'worldId'),"event_time");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_aliases_guest_no_unique" ON "guest_aliases" USING btree ("guest_no");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_daily_activity_pk" ON "guest_daily_activity" USING btree ("guest_id","date_key");--> statement-breakpoint
CREATE INDEX "guest_daily_activity_date_key_idx" ON "guest_daily_activity" USING btree ("date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_daily_tokens_pk" ON "guest_daily_tokens" USING btree ("guest_id","date_key");--> statement-breakpoint
CREATE INDEX "guest_daily_tokens_date_key_idx" ON "guest_daily_tokens" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "guest_registry_last_seen_at_idx" ON "guest_registry" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "narrative_foreshadow_ledger_session_status_idx" ON "narrative_foreshadow_ledger" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "narrative_foreshadow_ledger_session_due_idx" ON "narrative_foreshadow_ledger" USING btree ("session_id","status","deadline_turn");--> statement-breakpoint
CREATE UNIQUE INDEX "npc_agent_state_session_npc_unique" ON "npc_agent_state" USING btree ("session_id","npc_id");--> statement-breakpoint
CREATE INDEX "npc_agent_state_session_status_eligible_idx" ON "npc_agent_state" USING btree ("session_id","status","next_eligible_turn");--> statement-breakpoint
CREATE INDEX "npc_agent_state_user_updated_idx" ON "npc_agent_state" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "npc_memory_entries_npc_session_idx" ON "npc_memory_entries" USING btree ("npc_id","session_id");--> statement-breakpoint
CREATE INDEX "npc_memory_entries_user_npc_idx" ON "npc_memory_entries" USING btree ("user_id","npc_id");--> statement-breakpoint
CREATE INDEX "npc_memory_entries_salience_idx" ON "npc_memory_entries" USING btree ("salience");--> statement-breakpoint
CREATE INDEX "npc_memory_entries_updated_idx" ON "npc_memory_entries" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "npc_relation_edges_session_edge_unique" ON "npc_relation_edges" USING btree ("session_id","from_npc_id","to_npc_id");--> statement-breakpoint
CREATE INDEX "npc_relation_edges_session_from_idx" ON "npc_relation_edges" USING btree ("session_id","from_npc_id");--> statement-breakpoint
CREATE INDEX "npc_relation_edges_session_to_idx" ON "npc_relation_edges" USING btree ("session_id","to_npc_id");--> statement-breakpoint
CREATE INDEX "player_echo_events_user_created_idx" ON "player_echo_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "player_echo_events_target_idx" ON "player_echo_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "narrative_pacing_ledger_session_turn_idx" ON "narrative_pacing_ledger" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX "narrative_runs_request_unique" ON "narrative_runs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "narrative_runs_session_turn_idx" ON "narrative_runs" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE INDEX "narrative_runs_created_idx" ON "narrative_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safety_audit_events_created_idx" ON "safety_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safety_audit_events_scene_created_idx" ON "safety_audit_events" USING btree ("scene","created_at");--> statement-breakpoint
CREATE INDEX "safety_audit_events_trace_idx" ON "safety_audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "safety_audit_events_fingerprint_idx" ON "safety_audit_events" USING btree ("content_fingerprint");--> statement-breakpoint
CREATE INDEX "settlement_histories_user_created_idx" ON "settlement_histories" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_event_ledger_dedup_unique" ON "social_event_ledger" USING btree ("session_id","event_type","actor_key","target_key","dedup_key");--> statement-breakpoint
CREATE INDEX "social_event_ledger_prompt_due_idx" ON "social_event_ledger" USING btree ("session_id","status","visibility","player_relevance","due_turn_index");--> statement-breakpoint
CREATE INDEX "social_event_ledger_session_event_idx" ON "social_event_ledger" USING btree ("session_id","event_id");--> statement-breakpoint
CREATE INDEX "social_event_ledger_session_expires_idx" ON "social_event_ledger" USING btree ("session_id","status","expires_turn_index");--> statement-breakpoint
CREATE INDEX "story_events_session_turn_idx" ON "story_events" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE INDEX "story_events_user_created_idx" ON "story_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "story_events_actor_idx" ON "story_events" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "story_events_event_type_idx" ON "story_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "save_slots_user_slot_unique" ON "save_slots" USING btree ("user_id","slot_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_last_seen_idx" ON "user_sessions" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "user_sessions_last_seen_at_idx" ON "user_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_name_unique" ON "users" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "world_engine_agenda_session_revision_unique" ON "world_engine_agenda_snapshots" USING btree ("session_id","agenda_revision");--> statement-breakpoint
CREATE INDEX "world_engine_agenda_session_created_idx" ON "world_engine_agenda_snapshots" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_entities_type_code_unique" ON "world_entities" USING btree ("entity_type","code");--> statement-breakpoint
CREATE INDEX "world_entities_code_idx" ON "world_entities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "world_entities_canonical_name_idx" ON "world_entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "world_entities_scope_idx" ON "world_entities" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "world_entities_owner_scope_idx" ON "world_entities" USING btree ("owner_user_id","scope");--> statement-breakpoint
CREATE INDEX "world_entities_type_status_importance_idx" ON "world_entities" USING btree ("entity_type","status","importance");--> statement-breakpoint
CREATE UNIQUE INDEX "world_engine_director_state_session_unique" ON "world_engine_director_state" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "world_engine_director_state_user_updated_idx" ON "world_engine_director_state" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_entity_edges_from_to_type_label_unique" ON "world_entity_edges" USING btree ("from_entity_id","to_entity_id","relation_type","relation_label");--> statement-breakpoint
CREATE INDEX "world_entity_edges_from_to_idx" ON "world_entity_edges" USING btree ("from_entity_id","to_entity_id");--> statement-breakpoint
CREATE INDEX "world_entity_edges_relation_type_idx" ON "world_entity_edges" USING btree ("relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "world_entity_tags_entity_tag_unique" ON "world_entity_tags" USING btree ("entity_id","tag");--> statement-breakpoint
CREATE INDEX "world_entity_tags_tag_idx" ON "world_entity_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "world_player_facts_user_session_idx" ON "world_player_facts" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "world_player_facts_fact_type_idx" ON "world_player_facts" USING btree ("fact_type");--> statement-breakpoint
CREATE INDEX "world_player_facts_entity_idx" ON "world_player_facts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "world_retrieval_cache_snapshots_expires_at_idx" ON "world_retrieval_cache_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "survey_responses_key_user_idx" ON "survey_responses" USING btree ("survey_key","user_id");--> statement-breakpoint
CREATE INDEX "survey_responses_key_guest_idx" ON "survey_responses" USING btree ("survey_key","guest_id");--> statement-breakpoint
CREATE INDEX "survey_responses_created_idx" ON "survey_responses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "survey_responses_created_key_idx" ON "survey_responses" USING btree ("created_at","survey_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_activity_user_date_unique" ON "user_daily_activity" USING btree ("user_id","date_key");--> statement-breakpoint
CREATE INDEX "user_daily_activity_date_key_idx" ON "user_daily_activity" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "user_daily_activity_user_idx" ON "user_daily_activity" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_tokens_user_date_unique" ON "user_daily_tokens" USING btree ("user_id","date_key");--> statement-breakpoint
CREATE INDEX "user_daily_tokens_date_key_idx" ON "user_daily_tokens" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "user_daily_tokens_user_idx" ON "user_daily_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_engine_runs_dedup_unique" ON "world_engine_runs" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "world_engine_runs_session_created_idx" ON "world_engine_runs" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "world_engine_runs_status_created_idx" ON "world_engine_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "world_engine_event_queue_session_status_due_idx" ON "world_engine_event_queue" USING btree ("session_id","status","due_in_turns");--> statement-breakpoint
CREATE INDEX "world_engine_event_queue_event_code_idx" ON "world_engine_event_queue" USING btree ("event_code");--> statement-breakpoint
CREATE INDEX "world_engine_event_queue_director_due_idx" ON "world_engine_event_queue" USING btree ("session_id","status","due_turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX "world_engine_event_queue_director_dedup_unique" ON "world_engine_event_queue" USING btree ("session_id","event_code","dedup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "world_knowledge_chunks_entity_chunk_unique" ON "world_knowledge_chunks" USING btree ("entity_id","chunk_index");--> statement-breakpoint
CREATE INDEX "world_knowledge_chunks_entity_idx" ON "world_knowledge_chunks" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "world_knowledge_chunks_visibility_scope_idx" ON "world_knowledge_chunks" USING btree ("visibility_scope");--> statement-breakpoint
CREATE INDEX "world_knowledge_chunks_owner_scope_idx" ON "world_knowledge_chunks" USING btree ("owner_user_id","visibility_scope");--> statement-breakpoint
CREATE INDEX "world_knowledge_chunks_retrieval_key_idx" ON "world_knowledge_chunks" USING btree ("retrieval_key");--> statement-breakpoint
CREATE INDEX "world_knowledge_chunks_embedding_status_idx" ON "world_knowledge_chunks" USING btree ("embedding_status");--> statement-breakpoint
CREATE UNIQUE INDEX "actor_daily_tokens_actor_date_unique" ON "actor_daily_tokens" USING btree ("actor_id","date_key");--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_actor_idx" ON "actor_daily_tokens" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_date_idx" ON "actor_daily_tokens" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_guest_idx" ON "actor_daily_tokens" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "actor_sessions_actor_last_seen_idx" ON "actor_sessions" USING btree ("actor_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "actor_sessions_guest_last_seen_idx" ON "actor_sessions" USING btree ("guest_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "actor_sessions_user_last_seen_idx" ON "actor_sessions" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "analytics_actors_actor_type_idx" ON "analytics_actors" USING btree ("actor_type");--> statement-breakpoint
CREATE INDEX "analytics_actors_guest_id_idx" ON "analytics_actors" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "analytics_actors_last_seen_idx" ON "analytics_actors" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "analytics_actors_user_id_idx" ON "analytics_actors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_created_idx" ON "admin_audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" USING btree ("actor","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_metrics_daily_date_key_idx" ON "admin_metrics_daily" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "ai_analysis_stale_idx" ON "ai_analysis_snapshots" USING btree ("stale_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_analysis_task_scope_unique" ON "ai_analysis_snapshots" USING btree ("task","scope_key");--> statement-breakpoint
CREATE INDEX "analytics_events_actor_event_time_idx" ON "analytics_events" USING btree ("actor_id","event_time");--> statement-breakpoint
CREATE INDEX "analytics_events_event_name_time_idx" ON "analytics_events" USING btree ("event_name","event_time");--> statement-breakpoint
CREATE INDEX "analytics_events_guest_event_time_idx" ON "analytics_events" USING btree ("guest_id","event_time");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_idempotency_unique" ON "analytics_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "analytics_events_page_time_idx" ON "analytics_events" USING btree ("page","event_time");--> statement-breakpoint
CREATE INDEX "analytics_events_session_event_time_idx" ON "analytics_events" USING btree ("session_id","event_time");--> statement-breakpoint
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_events_user_event_time_idx" ON "analytics_events" USING btree ("user_id","event_time");--> statement-breakpoint
CREATE INDEX "compliance_inquiries_created_idx" ON "compliance_inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "compliance_inquiries_ip_created_idx" ON "compliance_inquiries" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "compliance_inquiries_topic_idx" ON "compliance_inquiries" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "feedbacks_created_idx" ON "feedbacks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedbacks_guest_id_idx" ON "feedbacks" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "feedbacks_user_id_idx" ON "feedbacks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actor_daily_activity_actor_date_unique" ON "actor_daily_activity" USING btree ("actor_id","date_key");--> statement-breakpoint
CREATE INDEX "actor_daily_activity_actor_idx" ON "actor_daily_activity" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_daily_activity_date_idx" ON "actor_daily_activity" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "actor_daily_activity_guest_idx" ON "actor_daily_activity" USING btree ("guest_id");