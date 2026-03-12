/**
 * Skill Coverage Gate — deterministic assertion that every active role
 * has recorded usage (or is explicitly exempt).
 *
 * Called at CONSENSUS_ROLE_PLANS and PRODUCTION_GATE gates.
 */

import type { PipelineRole, PipelinePhase, PipelineState } from '../types.js';
import type { SkillUsageEvent } from './usage-registry.js';

// ─── Phase Order (must match orchestrator/gate phase sequence) ────

/** Canonical phase order — used for phase-aware deferral in coverage checks. */
export const PHASE_ORDER: PipelinePhase[] = [
  'INTAKE', 'CONSENSUS_MASTER_PLAN', 'ARCHITECTURE', 'CONSENSUS_ARCHITECTURE',
  'ROLE_PLANNING', 'CONSENSUS_ROLE_PLANS', 'IMPLEMENTATION', 'QA_VALIDATION',
  'REVIEW', 'AUDIT', 'PRODUCTION_GATE', 'RECOVERY_LOOP', 'DONE', 'STUCK',
];

// ─── Required Usage Configuration ────────────────────────

export interface RoleUsageRequirement {
  phases: PipelinePhase[];
  minEvents: number;
  conditional?: 'always' | 'if_recovery' | 'if_arbitrated' | 'if_journal_triggered';
}

export const ROLE_REQUIRED_USAGE: Record<PipelineRole, RoleUsageRequirement> = {
  DISPATCHER:          { phases: [],                    minEvents: 0 },
  ARCHITECT:           { phases: ['ARCHITECTURE'],      minEvents: 1 },
  DB_EXPERT:           { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  BACKEND_PROGRAMMER:  { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  FRONTEND_PROGRAMMER: { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  WEBSITE_PROGRAMMER:  { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  UI_UX_SPECIALIST:    { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  MARKETING_EXPERT:    { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  SOCIAL_EXPERT:       { phases: ['ROLE_PLANNING'],     minEvents: 1 },
  QA_TESTER:           { phases: ['ROLE_PLANNING', 'QA_VALIDATION'], minEvents: 1 },
  REVIEWER:            { phases: ['REVIEW'],            minEvents: 1 },
  ARBITRATOR:          { phases: [],                    minEvents: 0, conditional: 'if_arbitrated' },
  DEBUGGER:            { phases: ['RECOVERY_LOOP'],     minEvents: 0, conditional: 'if_recovery' },
  AUDITOR:             { phases: ['AUDIT'],             minEvents: 1 },
  JOURNALIST: {
    phases: [
      'CONSENSUS_MASTER_PLAN', 'CONSENSUS_ARCHITECTURE', 'CONSENSUS_ROLE_PLANS',
      'AUDIT', 'PRODUCTION_GATE', 'RECOVERY_LOOP', 'DONE',
    ],
    minEvents: 1,
    conditional: 'if_journal_triggered',
  },
  RELEASE_MANAGER:     { phases: ['DONE'],              minEvents: 1 },
};

// ─── Coverage Result ─────────────────────────────────────

export interface CoverageMissing {
  role: PipelineRole;
  expectedPhases: PipelinePhase[];
  reason: string;
}

export interface CoverageResult {
  pass: boolean;
  missing: CoverageMissing[];
  covered: PipelineRole[];
  /** Roles skipped because their required phases haven't been reached yet (v2.4.5) */
  deferred: PipelineRole[];
}

// ─── Assertion Logic ─────────────────────────────────────

/**
 * Assert that all active roles have recorded skill usage
 * according to their requirements.
 *
 * Args:
 *   activeRoles: Roles currently active in the pipeline.
 *   events: All recorded skill usage events.
 *   pipeline: Full pipeline state for conditional checks.
 *   currentPhase: Current pipeline phase for phase-aware deferral (v2.4.5).
 *     Omit for strict mode (checks all roles regardless of phase).
 *
 * Returns:
 *   CoverageResult with pass/fail and details.
 */
export function assertSkillCoverage(
  activeRoles: PipelineRole[],
  events: SkillUsageEvent[],
  pipeline: PipelineState,
  currentPhase?: PipelinePhase,
): CoverageResult {
  const missing: CoverageMissing[] = [];
  const covered: PipelineRole[] = [];
  const deferred: PipelineRole[] = [];

  // Resolve phase index; -1 means unknown/omitted -> strict mode (check all)
  const currentIdx = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1;

  for (const role of activeRoles) {
    const requirement = ROLE_REQUIRED_USAGE[role];
    if (!requirement) {
      // Reason: Unknown role — skip rather than crash
      continue;
    }

    // Meta-only roles (DISPATCHER) with minEvents 0 and no conditional
    if (requirement.minEvents === 0 && !requirement.conditional) {
      covered.push(role);
      continue;
    }

    // Conditional roles — check if their condition is met
    if (requirement.conditional) {
      const isRequired = isConditionalRequired(requirement.conditional, pipeline);
      if (!isRequired) {
        // Condition not met — not required, count as covered
        covered.push(role);
        continue;
      }
    }

    // v2.4.5: Phase-aware deferral — skip roles whose phases are all after currentPhase.
    // Only applies when currentIdx >= 0 (known phase). Unknown phase = strict mode.
    if (currentIdx >= 0 && requirement.phases.length > 0) {
      const anyPhaseReached = requirement.phases.some(
        (p) => PHASE_ORDER.indexOf(p) <= currentIdx,
      );
      if (!anyPhaseReached) {
        // Reason: Role's required phases are all after currentPhase — defer check
        deferred.push(role);
        continue;
      }
    }

    // Check if role has at least minEvents usage events
    const roleEvents = events.filter((e) => e.role === role);
    const effectiveMin = Math.max(requirement.minEvents, 1);

    if (roleEvents.length >= effectiveMin) {
      covered.push(role);
    } else {
      missing.push({
        role,
        expectedPhases: requirement.phases,
        reason: roleEvents.length === 0
          ? `No skill usage recorded for ${role}`
          : `Only ${roleEvents.length}/${effectiveMin} usage events for ${role}`,
      });
    }
  }

  return {
    pass: missing.length === 0,
    missing,
    covered,
    deferred,
  };
}

// ─── Conditional Helpers ─────────────────────────────────

function isConditionalRequired(
  conditional: NonNullable<RoleUsageRequirement['conditional']>,
  pipeline: PipelineState,
): boolean {
  switch (conditional) {
    case 'always':
      return true;

    case 'if_recovery':
      return pipeline.recoveryCount > 0;

    case 'if_arbitrated':
      return hasArbitratedConsensus(pipeline);

    case 'if_journal_triggered':
      return hasJournalTriggered(pipeline);

    default:
      return false;
  }
}

/** Check if any arbitration occurred during consensus phases. */
function hasArbitratedConsensus(pipeline: PipelineState): boolean {
  // Reason: Arbitration artifacts are created when consensus requires arbitrator intervention
  const arbitrationArtifacts = pipeline.artifacts.filter((a) => a.type === 'arbitration');
  return arbitrationArtifacts.length > 0;
}

/** Check if any journalist-triggering phases have completed. */
function hasJournalTriggered(pipeline: PipelineState): boolean {
  const journalPhases: PipelinePhase[] = [
    'CONSENSUS_MASTER_PLAN', 'CONSENSUS_ARCHITECTURE', 'CONSENSUS_ROLE_PLANS',
    'AUDIT', 'PRODUCTION_GATE', 'RECOVERY_LOOP', 'DONE',
  ];
  const completedPhases = new Set(Object.keys(pipeline.gateResults));
  return journalPhases.some((phase) => completedPhases.has(phase));
}
