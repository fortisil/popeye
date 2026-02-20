/**
 * State Migration — bridges old 3-phase workflow to new pipeline state.
 * Auto-triggered on load when pipelinePhase is missing from state.
 */

import type { PipelinePhase, PipelineState, PipelineRole } from './types.js';
import { createDefaultPipelineState } from './types.js';
import type { ProjectState, WorkflowPhase } from '../types/workflow.js';

// ─── Phase Mapping ───────────────────────────────────────

const LEGACY_PHASE_MAP: Record<string, PipelinePhase> = {
  plan: 'INTAKE',
  execution: 'IMPLEMENTATION',
  complete: 'DONE',
};

/** Convert legacy WorkflowPhase to PipelinePhase */
export function toPipelinePhase(legacyPhase: WorkflowPhase): PipelinePhase {
  return LEGACY_PHASE_MAP[legacyPhase] ?? 'INTAKE';
}

/** Convert PipelinePhase back to legacy WorkflowPhase */
export function toLegacyPhase(pipelinePhase: PipelinePhase): WorkflowPhase {
  switch (pipelinePhase) {
    case 'INTAKE':
    case 'CONSENSUS_MASTER_PLAN':
    case 'ARCHITECTURE':
    case 'CONSENSUS_ARCHITECTURE':
    case 'ROLE_PLANNING':
    case 'CONSENSUS_ROLE_PLANS':
      return 'plan';
    case 'IMPLEMENTATION':
    case 'QA_VALIDATION':
    case 'REVIEW':
    case 'AUDIT':
    case 'PRODUCTION_GATE':
    case 'RECOVERY_LOOP':
      return 'execution';
    case 'DONE':
    case 'STUCK':
      return 'complete';
  }
}

// ─── Migration ───────────────────────────────────────────

/** Migrate a legacy ProjectState to include PipelineState */
export function migrateToPipelineState(state: ProjectState): PipelineState {
  const pipeline = createDefaultPipelineState();

  // Map legacy phase
  pipeline.pipelinePhase = toPipelinePhase(state.phase);

  // Derive active roles from language
  pipeline.activeRoles = deriveActiveRoles(state.language);

  return pipeline;
}

/** Check if a state object needs pipeline migration */
export function needsPipelineMigration(state: unknown): boolean {
  return !(state as Record<string, unknown>).pipeline;
}

// ─── Role Derivation ─────────────────────────────────────

function deriveActiveRoles(language: string): PipelineRole[] {
  const baseRoles: PipelineRole[] = [
    'DISPATCHER', 'ARCHITECT', 'REVIEWER', 'ARBITRATOR',
    'DEBUGGER', 'AUDITOR', 'JOURNALIST', 'RELEASE_MANAGER',
    'QA_TESTER',
  ];

  switch (language) {
    case 'fullstack':
    case 'all':
      return [
        ...baseRoles,
        'DB_EXPERT', 'BACKEND_PROGRAMMER', 'FRONTEND_PROGRAMMER',
        'WEBSITE_PROGRAMMER', 'UI_UX_SPECIALIST',
      ];
    case 'python':
    case 'typescript':
      return [...baseRoles, 'BACKEND_PROGRAMMER'];
    case 'website':
      return [...baseRoles, 'WEBSITE_PROGRAMMER', 'MARKETING_EXPERT', 'SOCIAL_EXPERT'];
    default:
      return [...baseRoles, 'BACKEND_PROGRAMMER'];
  }
}
