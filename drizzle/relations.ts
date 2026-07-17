import { relations } from "drizzle-orm/relations";
import { users, actorDailyTokens, actorSessions, analyticsActors, analyticsEvents, complianceInquiries, feedbacks, actorDailyActivity, narrativeForeshadowLedger, npcAgentState, npcMemoryEntries, npcRelationEdges, playerEchoCanon, playerEchoEvents, narrativePacingLedger, narrativeRuns, settlementHistories, socialEventLedger, storyEvents, saveSlots, usersQuota, userSessions, worldEngineAgendaSnapshots, worldEngineRuns, worldEntities, worldEngineDirectorState, worldEntityEdges, worldEntityTags, worldPlayerFacts, gameSessionMemory, surveyResponses, userDailyActivity, userDailyTokens, userOnboarding, worldEngineEventQueue, worldKnowledgeChunks } from "./schema";

export const actorDailyTokensRelations = relations(actorDailyTokens, ({one}) => ({
	user: one(users, {
		fields: [actorDailyTokens.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	actorDailyTokens: many(actorDailyTokens),
	actorSessions: many(actorSessions),
	analyticsActors: many(analyticsActors),
	analyticsEvents: many(analyticsEvents),
	complianceInquiries: many(complianceInquiries),
	feedbacks: many(feedbacks),
	actorDailyActivities: many(actorDailyActivity),
	narrativeForeshadowLedgers: many(narrativeForeshadowLedger),
	npcAgentStates: many(npcAgentState),
	npcMemoryEntries: many(npcMemoryEntries),
	npcRelationEdges: many(npcRelationEdges),
	playerEchoCanons: many(playerEchoCanon),
	playerEchoEvents: many(playerEchoEvents),
	narrativePacingLedgers: many(narrativePacingLedger),
	narrativeRuns: many(narrativeRuns),
	settlementHistories: many(settlementHistories),
	socialEventLedgers: many(socialEventLedger),
	storyEvents: many(storyEvents),
	saveSlots: many(saveSlots),
	usersQuotas: many(usersQuota),
	userSessions: many(userSessions),
	worldEngineAgendaSnapshots: many(worldEngineAgendaSnapshots),
	worldEntities: many(worldEntities),
	worldEngineDirectorStates: many(worldEngineDirectorState),
	worldPlayerFacts: many(worldPlayerFacts),
	gameSessionMemories: many(gameSessionMemory),
	surveyResponses: many(surveyResponses),
	userDailyActivities: many(userDailyActivity),
	userDailyTokens: many(userDailyTokens),
	userOnboardings: many(userOnboarding),
	worldEngineRuns: many(worldEngineRuns),
	worldEngineEventQueues: many(worldEngineEventQueue),
	worldKnowledgeChunks: many(worldKnowledgeChunks),
}));

export const actorSessionsRelations = relations(actorSessions, ({one}) => ({
	user: one(users, {
		fields: [actorSessions.userId],
		references: [users.id]
	}),
}));

export const analyticsActorsRelations = relations(analyticsActors, ({one}) => ({
	user: one(users, {
		fields: [analyticsActors.userId],
		references: [users.id]
	}),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({one}) => ({
	user: one(users, {
		fields: [analyticsEvents.userId],
		references: [users.id]
	}),
}));

export const complianceInquiriesRelations = relations(complianceInquiries, ({one}) => ({
	user: one(users, {
		fields: [complianceInquiries.userId],
		references: [users.id]
	}),
}));

export const feedbacksRelations = relations(feedbacks, ({one}) => ({
	user: one(users, {
		fields: [feedbacks.userId],
		references: [users.id]
	}),
}));

export const actorDailyActivityRelations = relations(actorDailyActivity, ({one}) => ({
	user: one(users, {
		fields: [actorDailyActivity.userId],
		references: [users.id]
	}),
}));

export const narrativeForeshadowLedgerRelations = relations(narrativeForeshadowLedger, ({one}) => ({
	user: one(users, {
		fields: [narrativeForeshadowLedger.userId],
		references: [users.id]
	}),
}));

export const npcAgentStateRelations = relations(npcAgentState, ({one}) => ({
	user: one(users, {
		fields: [npcAgentState.userId],
		references: [users.id]
	}),
}));

export const npcMemoryEntriesRelations = relations(npcMemoryEntries, ({one}) => ({
	user: one(users, {
		fields: [npcMemoryEntries.userId],
		references: [users.id]
	}),
}));

export const npcRelationEdgesRelations = relations(npcRelationEdges, ({one}) => ({
	user: one(users, {
		fields: [npcRelationEdges.userId],
		references: [users.id]
	}),
}));

export const playerEchoCanonRelations = relations(playerEchoCanon, ({one}) => ({
	user: one(users, {
		fields: [playerEchoCanon.userId],
		references: [users.id]
	}),
}));

export const playerEchoEventsRelations = relations(playerEchoEvents, ({one}) => ({
	user: one(users, {
		fields: [playerEchoEvents.userId],
		references: [users.id]
	}),
}));

export const narrativePacingLedgerRelations = relations(narrativePacingLedger, ({one}) => ({
	user: one(users, {
		fields: [narrativePacingLedger.userId],
		references: [users.id]
	}),
}));

export const narrativeRunsRelations = relations(narrativeRuns, ({one}) => ({
	user: one(users, {
		fields: [narrativeRuns.userId],
		references: [users.id]
	}),
}));

export const settlementHistoriesRelations = relations(settlementHistories, ({one}) => ({
	user: one(users, {
		fields: [settlementHistories.userId],
		references: [users.id]
	}),
}));

export const socialEventLedgerRelations = relations(socialEventLedger, ({one}) => ({
	user: one(users, {
		fields: [socialEventLedger.userId],
		references: [users.id]
	}),
}));

export const storyEventsRelations = relations(storyEvents, ({one}) => ({
	user: one(users, {
		fields: [storyEvents.userId],
		references: [users.id]
	}),
}));

export const saveSlotsRelations = relations(saveSlots, ({one}) => ({
	user: one(users, {
		fields: [saveSlots.userId],
		references: [users.id]
	}),
}));

export const usersQuotaRelations = relations(usersQuota, ({one}) => ({
	user: one(users, {
		fields: [usersQuota.userId],
		references: [users.id]
	}),
}));

export const userSessionsRelations = relations(userSessions, ({one}) => ({
	user: one(users, {
		fields: [userSessions.userId],
		references: [users.id]
	}),
}));

export const worldEngineAgendaSnapshotsRelations = relations(worldEngineAgendaSnapshots, ({one}) => ({
	user: one(users, {
		fields: [worldEngineAgendaSnapshots.userId],
		references: [users.id]
	}),
	worldEngineRun: one(worldEngineRuns, {
		fields: [worldEngineAgendaSnapshots.runId],
		references: [worldEngineRuns.runId]
	}),
}));

export const worldEngineRunsRelations = relations(worldEngineRuns, ({one, many}) => ({
	worldEngineAgendaSnapshots: many(worldEngineAgendaSnapshots),
	user: one(users, {
		fields: [worldEngineRuns.userId],
		references: [users.id]
	}),
	worldEngineEventQueues: many(worldEngineEventQueue),
}));

export const worldEntitiesRelations = relations(worldEntities, ({one, many}) => ({
	user: one(users, {
		fields: [worldEntities.ownerUserId],
		references: [users.id]
	}),
	worldEntityEdges_fromEntityId: many(worldEntityEdges, {
		relationName: "worldEntityEdges_fromEntityId_worldEntities_id"
	}),
	worldEntityEdges_toEntityId: many(worldEntityEdges, {
		relationName: "worldEntityEdges_toEntityId_worldEntities_id"
	}),
	worldEntityTags: many(worldEntityTags),
	worldPlayerFacts: many(worldPlayerFacts),
	worldKnowledgeChunks: many(worldKnowledgeChunks),
}));

export const worldEngineDirectorStateRelations = relations(worldEngineDirectorState, ({one}) => ({
	user: one(users, {
		fields: [worldEngineDirectorState.userId],
		references: [users.id]
	}),
}));

export const worldEntityEdgesRelations = relations(worldEntityEdges, ({one}) => ({
	worldEntity_fromEntityId: one(worldEntities, {
		fields: [worldEntityEdges.fromEntityId],
		references: [worldEntities.id],
		relationName: "worldEntityEdges_fromEntityId_worldEntities_id"
	}),
	worldEntity_toEntityId: one(worldEntities, {
		fields: [worldEntityEdges.toEntityId],
		references: [worldEntities.id],
		relationName: "worldEntityEdges_toEntityId_worldEntities_id"
	}),
}));

export const worldEntityTagsRelations = relations(worldEntityTags, ({one}) => ({
	worldEntity: one(worldEntities, {
		fields: [worldEntityTags.entityId],
		references: [worldEntities.id]
	}),
}));

export const worldPlayerFactsRelations = relations(worldPlayerFacts, ({one}) => ({
	user: one(users, {
		fields: [worldPlayerFacts.userId],
		references: [users.id]
	}),
	worldEntity: one(worldEntities, {
		fields: [worldPlayerFacts.entityId],
		references: [worldEntities.id]
	}),
}));

export const gameSessionMemoryRelations = relations(gameSessionMemory, ({one}) => ({
	user: one(users, {
		fields: [gameSessionMemory.userId],
		references: [users.id]
	}),
}));

export const surveyResponsesRelations = relations(surveyResponses, ({one}) => ({
	user: one(users, {
		fields: [surveyResponses.userId],
		references: [users.id]
	}),
}));

export const userDailyActivityRelations = relations(userDailyActivity, ({one}) => ({
	user: one(users, {
		fields: [userDailyActivity.userId],
		references: [users.id]
	}),
}));

export const userDailyTokensRelations = relations(userDailyTokens, ({one}) => ({
	user: one(users, {
		fields: [userDailyTokens.userId],
		references: [users.id]
	}),
}));

export const userOnboardingRelations = relations(userOnboarding, ({one}) => ({
	user: one(users, {
		fields: [userOnboarding.userId],
		references: [users.id]
	}),
}));

export const worldEngineEventQueueRelations = relations(worldEngineEventQueue, ({one}) => ({
	worldEngineRun: one(worldEngineRuns, {
		fields: [worldEngineEventQueue.runId],
		references: [worldEngineRuns.runId]
	}),
	user: one(users, {
		fields: [worldEngineEventQueue.userId],
		references: [users.id]
	}),
}));

export const worldKnowledgeChunksRelations = relations(worldKnowledgeChunks, ({one}) => ({
	worldEntity: one(worldEntities, {
		fields: [worldKnowledgeChunks.entityId],
		references: [worldEntities.id]
	}),
	user: one(users, {
		fields: [worldKnowledgeChunks.ownerUserId],
		references: [users.id]
	}),
}));