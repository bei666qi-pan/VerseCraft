import type { WorldEngineStructuredDelta } from "./contracts";
import type { DirectorValidationResult } from "./validator";

/** Materialize the only Director plan that persistence and Writer hints may see. */
export function materializeAcceptedDirectorPlan(args: {
  plan: WorldEngineStructuredDelta;
  validation: DirectorValidationResult;
  acceptedSocialEventCodes?: readonly string[];
}): WorldEngineStructuredDelta | null {
  if (!args.validation.accepted) return null;

  const acceptedEvents = new Set(args.validation.acceptedEventCodes);
  const acceptedSocialEvents = new Set(
    args.acceptedSocialEventCodes ?? args.validation.acceptedSocialEventCodes,
  );
  const worldEvents = args.plan.world_events_to_schedule.filter((event) =>
    acceptedEvents.has(event.event_code),
  );
  const socialEvents = args.plan.social_events_to_schedule.filter((event) =>
    acceptedSocialEvents.has(event.event_code),
  );
  const acceptedSocialNpcIds = new Set(
    socialEvents.flatMap((event) => [...event.actor_npc_ids, ...event.target_npc_ids]),
  );

  return {
    ...args.plan,
    // A free-text intent can summarize rejected siblings, so it is safe only
    // when no event was removed by a deterministic gate or critic.
    director_intent: args.validation.rejectedEventCodes.length > 0
      ? ""
      : args.plan.director_intent,
    world_events_to_schedule: worldEvents,
    social_events_to_schedule: socialEvents,
    npc_relation_deltas: args.plan.npc_relation_deltas.filter(
      (delta) => acceptedSocialNpcIds.has(delta.from_npc_id) && acceptedSocialNpcIds.has(delta.to_npc_id),
    ),
    npc_agent_patches: args.plan.npc_agent_patches.filter((patch) =>
      acceptedSocialNpcIds.has(patch.npc_id),
    ),
    agenda_write_allowed: args.plan.agenda_write_allowed && worldEvents.length > 0,
    social_write_allowed: args.plan.social_write_allowed && socialEvents.length > 0,
  };
}
