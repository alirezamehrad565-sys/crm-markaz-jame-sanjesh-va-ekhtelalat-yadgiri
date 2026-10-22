export { createFollowUpsService } from './service';
export { FOLLOWUP_TRANSITIONS, canTransition, followUpGroupOf, groupBoundaries, defaultDueAt, isOpenStatus } from './pure';
export { registerFollowUpRoutes } from './routes';
export type { FollowUpDeps, FollowUpListFilters, FollowUpsService, NewFollowUpInput, UpdateFollowUpInput } from './types';
