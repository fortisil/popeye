/**
 * Re-exports all phase implementations.
 */

export { runIntake } from './intake.js';
export { runConsensusMasterPlan } from './consensus-master-plan.js';
export { runArchitecture } from './architecture.js';
export { runConsensusArchitecture } from './consensus-architecture.js';
export { runRolePlanning } from './role-planning.js';
export { runConsensusRolePlans } from './consensus-role-plans.js';
export { runImplementation } from './implementation.js';
export { runQaValidation } from './qa-validation.js';
export { runReview } from './review.js';
export { runAudit } from './audit.js';
export { runProductionGate } from './production-gate.js';
export { runRecoveryLoop } from './recovery-loop.js';
export { runDone } from './done.js';
export { runStuck } from './stuck.js';

export type { PhaseContext, PhaseResult } from './phase-context.js';
export { triggerJournalist, successResult, failureResult } from './phase-context.js';
