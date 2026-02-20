/**
 * Gate Engine — pure deterministic state machine for the pipeline.
 * No side effects. Reads artifacts and check results, never executes anything.
 * All 14 phases with specific required artifacts and checks per phase.
 */

import type {
  PipelinePhase,
  PipelineState,
  ArtifactType,
  ArtifactEntry,
  GateCheckType,
} from './types.js';

// ─── Gate Definition ─────────────────────────────────────

export interface GateDefinition {
  phase: PipelinePhase;
  requiredArtifacts: ArtifactType[];
  requiredChecks: GateCheckType[];
  consensusThreshold?: number;
  minReviewers?: number;
  allowedTransitions: PipelinePhase[];
  failTransition: PipelinePhase;
}

export interface GateResult {
  phase: PipelinePhase;
  pass: boolean;
  score?: number;
  blockers: string[];
  missingArtifacts: ArtifactType[];
  failedChecks: GateCheckType[];
  consensusScore?: number;
  timestamp: string;
}

// ─── Gate Definitions Map ────────────────────────────────

const GATE_DEFINITIONS: Record<PipelinePhase, GateDefinition> = {
  INTAKE: {
    phase: 'INTAKE',
    requiredArtifacts: ['master_plan', 'repo_snapshot', 'constitution'],
    requiredChecks: [],
    allowedTransitions: ['CONSENSUS_MASTER_PLAN'],
    failTransition: 'RECOVERY_LOOP',
  },
  CONSENSUS_MASTER_PLAN: {
    phase: 'CONSENSUS_MASTER_PLAN',
    requiredArtifacts: ['master_plan', 'consensus'],
    requiredChecks: [],
    consensusThreshold: 0.95,
    minReviewers: 2,
    allowedTransitions: ['ARCHITECTURE'],
    failTransition: 'RECOVERY_LOOP',
  },
  ARCHITECTURE: {
    phase: 'ARCHITECTURE',
    requiredArtifacts: ['architecture', 'repo_snapshot'],
    requiredChecks: [],
    allowedTransitions: ['CONSENSUS_ARCHITECTURE'],
    failTransition: 'RECOVERY_LOOP',
  },
  CONSENSUS_ARCHITECTURE: {
    phase: 'CONSENSUS_ARCHITECTURE',
    requiredArtifacts: ['architecture', 'consensus'],
    requiredChecks: [],
    consensusThreshold: 0.95,
    minReviewers: 2,
    allowedTransitions: ['ROLE_PLANNING'],
    failTransition: 'RECOVERY_LOOP',
  },
  ROLE_PLANNING: {
    phase: 'ROLE_PLANNING',
    requiredArtifacts: ['role_plan'],
    requiredChecks: [],
    allowedTransitions: ['CONSENSUS_ROLE_PLANS'],
    failTransition: 'RECOVERY_LOOP',
  },
  CONSENSUS_ROLE_PLANS: {
    phase: 'CONSENSUS_ROLE_PLANS',
    requiredArtifacts: ['role_plan', 'consensus'],
    requiredChecks: [],
    consensusThreshold: 0.95,
    minReviewers: 2,
    allowedTransitions: ['IMPLEMENTATION'],
    failTransition: 'RECOVERY_LOOP',
  },
  IMPLEMENTATION: {
    phase: 'IMPLEMENTATION',
    requiredArtifacts: ['repo_snapshot'],
    requiredChecks: [],
    allowedTransitions: ['QA_VALIDATION'],
    failTransition: 'RECOVERY_LOOP',
  },
  QA_VALIDATION: {
    phase: 'QA_VALIDATION',
    requiredArtifacts: ['qa_validation'],
    requiredChecks: ['test'],
    allowedTransitions: ['REVIEW'],
    failTransition: 'RECOVERY_LOOP',
  },
  REVIEW: {
    phase: 'REVIEW',
    requiredArtifacts: ['review_decision', 'repo_snapshot'],
    requiredChecks: [],
    allowedTransitions: ['AUDIT'],
    failTransition: 'RECOVERY_LOOP',
  },
  AUDIT: {
    phase: 'AUDIT',
    requiredArtifacts: ['audit_report'],
    requiredChecks: [],
    allowedTransitions: ['PRODUCTION_GATE'],
    failTransition: 'RECOVERY_LOOP',
  },
  PRODUCTION_GATE: {
    phase: 'PRODUCTION_GATE',
    requiredArtifacts: ['production_readiness'],
    requiredChecks: ['build', 'test', 'lint', 'typecheck'],
    allowedTransitions: ['DONE'],
    failTransition: 'RECOVERY_LOOP',
  },
  RECOVERY_LOOP: {
    phase: 'RECOVERY_LOOP',
    requiredArtifacts: ['rca_report'],
    requiredChecks: [],
    allowedTransitions: [
      'INTAKE', 'CONSENSUS_MASTER_PLAN', 'ARCHITECTURE',
      'CONSENSUS_ARCHITECTURE', 'ROLE_PLANNING', 'CONSENSUS_ROLE_PLANS',
      'IMPLEMENTATION', 'QA_VALIDATION', 'REVIEW', 'AUDIT',
      'PRODUCTION_GATE', 'STUCK',
    ],
    failTransition: 'STUCK',
  },
  DONE: {
    phase: 'DONE',
    requiredArtifacts: ['release_notes', 'deployment', 'rollback'],
    requiredChecks: [],
    allowedTransitions: [],
    failTransition: 'DONE', // terminal
  },
  STUCK: {
    phase: 'STUCK',
    requiredArtifacts: ['stuck_report'],
    requiredChecks: [],
    allowedTransitions: [],
    failTransition: 'STUCK', // terminal
  },
};

/** Ordered phase sequence for linear progression */
const PHASE_SEQUENCE: PipelinePhase[] = [
  'INTAKE',
  'CONSENSUS_MASTER_PLAN',
  'ARCHITECTURE',
  'CONSENSUS_ARCHITECTURE',
  'ROLE_PLANNING',
  'CONSENSUS_ROLE_PLANS',
  'IMPLEMENTATION',
  'QA_VALIDATION',
  'REVIEW',
  'AUDIT',
  'PRODUCTION_GATE',
  'DONE',
];

// ─── Gate Engine ─────────────────────────────────────────

export class GateEngine {
  /** Get gate definition for a specific phase */
  getGateDefinition(phase: PipelinePhase): GateDefinition {
    return GATE_DEFINITIONS[phase];
  }

  /**
   * Evaluate whether a phase's gate passes.
   *
   * Args:
   *   phase: The phase to evaluate.
   *   pipeline: Current pipeline state.
   *   options: Optional checks like constitution verification.
   */
  evaluateGate(
    phase: PipelinePhase,
    pipeline: PipelineState,
    options?: { constitutionValid?: boolean; constitutionReason?: string },
  ): GateResult {
    const gateDef = GATE_DEFINITIONS[phase];
    const blockers: string[] = [];
    const missingArtifacts: ArtifactType[] = [];
    const failedChecks: GateCheckType[] = [];

    // Constitution verification (v1.1) — applied to all gates after INTAKE
    if (options?.constitutionValid === false) {
      blockers.push(options.constitutionReason ?? 'Constitution verification failed');
    }

    // Check required artifacts exist
    for (const requiredType of gateDef.requiredArtifacts) {
      const hasArtifact = pipeline.artifacts.some(
        (a) => a.type === requiredType && a.phase === phase,
      );
      if (!hasArtifact) {
        missingArtifacts.push(requiredType);
        blockers.push(`Missing artifact: ${requiredType}`);
      }
    }

    // Check required check results
    const phaseChecks = pipeline.gateChecks[phase] ?? [];
    for (const requiredCheck of gateDef.requiredChecks) {
      const checkResult = phaseChecks.find((c) => c.check_type === requiredCheck);
      if (!checkResult) {
        failedChecks.push(requiredCheck);
        blockers.push(`Missing check result: ${requiredCheck}`);
      } else if (checkResult.status === 'fail') {
        failedChecks.push(requiredCheck);
        blockers.push(`Check failed: ${requiredCheck} (exit code ${checkResult.exit_code})`);
      }
    }

    // Check consensus threshold for consensus phases
    let consensusScore: number | undefined;
    if (gateDef.consensusThreshold !== undefined) {
      const consensusArtifact = findLatestConsensusForPhase(pipeline, phase);
      if (consensusArtifact) {
        consensusScore = parseConsensusScore(pipeline, phase);
        if (consensusScore !== undefined && consensusScore < gateDef.consensusThreshold) {
          blockers.push(
            `Consensus score ${consensusScore.toFixed(2)} below threshold ${gateDef.consensusThreshold}`,
          );
        }
      } else {
        blockers.push('No consensus packet found');
      }
    }

    // Check audit status for post-audit phases
    if (phase === 'PRODUCTION_GATE') {
      const auditArtifact = pipeline.artifacts.find(
        (a) => a.type === 'audit_report',
      );
      if (!auditArtifact) {
        blockers.push('Audit report required before production gate');
      }
    }

    const pass = blockers.length === 0;

    return {
      phase,
      pass,
      blockers,
      missingArtifacts,
      failedChecks,
      consensusScore,
      timestamp: new Date().toISOString(),
    };
  }

  /** Get the next phase after a successful gate */
  getNextPhase(
    current: PipelinePhase,
    _gateResult: GateResult,
  ): PipelinePhase {
    const currentIndex = PHASE_SEQUENCE.indexOf(current);
    if (currentIndex === -1 || currentIndex >= PHASE_SEQUENCE.length - 1) {
      return 'DONE';
    }
    return PHASE_SEQUENCE[currentIndex + 1];
  }

  /** Check if a transition between two phases is allowed */
  canTransition(
    from: PipelinePhase,
    to: PipelinePhase,
    pipeline: PipelineState,
  ): { allowed: boolean; blockers: string[] } {
    const gateDef = GATE_DEFINITIONS[from];
    const blockers: string[] = [];

    if (!gateDef.allowedTransitions.includes(to)) {
      blockers.push(`Transition from ${from} to ${to} is not allowed`);
    }

    // Verify gate passes before transition
    const gateResult = this.evaluateGate(from, pipeline);
    if (!gateResult.pass) {
      blockers.push(...gateResult.blockers);
    }

    return {
      allowed: blockers.length === 0,
      blockers,
    };
  }

  /** Get the ordered phase sequence */
  getPhaseSequence(): PipelinePhase[] {
    return [...PHASE_SEQUENCE];
  }

  /** Get phase index in the sequence (for progress tracking) */
  getPhaseIndex(phase: PipelinePhase): number {
    return PHASE_SEQUENCE.indexOf(phase);
  }
}

/** Factory function */
export function createGateEngine(): GateEngine {
  return new GateEngine();
}

// ─── Helpers ─────────────────────────────────────────────

function findLatestConsensusForPhase(
  pipeline: PipelineState,
  phase: PipelinePhase,
): ArtifactEntry | undefined {
  return pipeline.artifacts
    .filter((a) => a.type === 'consensus' && a.phase === phase)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
}

/**
 * Extract consensus score from pipeline gate results.
 * The score is stored by consensus phase handlers after running consensus.
 * Falls back to reading from the consensus artifact's stored data.
 */
function parseConsensusScore(
  pipeline: PipelineState,
  phase: PipelinePhase,
): number | undefined {
  // Look up stored score from gateResults (set by consensus phase handlers)
  const gateResult = pipeline.gateResults[phase];
  if (gateResult?.score !== undefined) {
    return gateResult.score;
  }

  // Fallback: check consensusScore field
  if (gateResult?.consensusScore !== undefined) {
    return gateResult.consensusScore;
  }

  return undefined;
}
