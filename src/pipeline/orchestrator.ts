/**
 * Pipeline Orchestrator — top-level loop driving pipeline from any phase
 * to completion. Implements deterministic transition logic (P0-A).
 *
 * Key rule: requires_phase_rewind_to ONLY takes effect after RECOVERY_LOOP
 * completes successfully. Any failure from any non-recovery phase always
 * goes to RECOVERY_LOOP first.
 *
 * v1.1: Constitution verification, CR-based phase routing, gateResult merge,
 *       and RCA rewind support.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  PipelinePhase,
  PipelineState,
  PipelineResult,
  RCAPacket,
} from './types.js';
import { createDefaultPipelineState } from './types.js';
import { createGateEngine } from './gate-engine.js';
import type { GateResult } from './gate-engine.js';
import { createArtifactManager } from './artifact-manager.js';
import { createSkillLoader } from './skill-loader.js';
import { createConsensusRunner } from './consensus/consensus-runner.js';
import { verifyConstitution } from './constitution.js';

import {
  runIntake,
  runConsensusMasterPlan,
  runArchitecture,
  runConsensusArchitecture,
  runRolePlanning,
  runConsensusRolePlans,
  runImplementation,
  runQaValidation,
  runReview,
  runAudit,
  runProductionGate,
  runRecoveryLoop,
  runDone,
  runStuck,
} from './phases/index.js';
import type { PhaseContext, PhaseResult } from './phases/index.js';
import type { ProjectState } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';

// ─── Types ───────────────────────────────────────────────

export interface PipelineOptions {
  projectDir: string;
  state: ProjectState;
  consensusConfig?: Partial<ConsensusConfig>;
  onPhaseStart?: (phase: PipelinePhase) => void;
  onPhaseComplete?: (phase: PipelinePhase, result: PhaseResult) => void;
  onProgress?: (message: string) => void;
}

// ─── Phase Dispatch Map ──────────────────────────────────

const PHASE_HANDLERS: Record<PipelinePhase, (ctx: PhaseContext) => Promise<PhaseResult>> = {
  INTAKE: runIntake,
  CONSENSUS_MASTER_PLAN: runConsensusMasterPlan,
  ARCHITECTURE: runArchitecture,
  CONSENSUS_ARCHITECTURE: runConsensusArchitecture,
  ROLE_PLANNING: runRolePlanning,
  CONSENSUS_ROLE_PLANS: runConsensusRolePlans,
  IMPLEMENTATION: runImplementation,
  QA_VALIDATION: runQaValidation,
  REVIEW: runReview,
  AUDIT: runAudit,
  PRODUCTION_GATE: runProductionGate,
  RECOVERY_LOOP: runRecoveryLoop,
  DONE: runDone,
  STUCK: runStuck,
};

/** Phases after which we check for pending CRs */
const CR_CHECK_PHASES: Set<PipelinePhase> = new Set(['REVIEW', 'AUDIT']);

// ─── Orchestrator ────────────────────────────────────────

/** Run the full pipeline from current phase to completion */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const {
    projectDir,
    state,
    consensusConfig,
    onPhaseStart,
    onPhaseComplete,
    onProgress,
  } = options;

  // Initialize pipeline state if needed
  const pipeline: PipelineState = (state as unknown as { pipeline?: PipelineState }).pipeline
    ?? createDefaultPipelineState();

  // Create context dependencies
  const gateEngine = createGateEngine();
  const artifactManager = createArtifactManager(projectDir);
  const skillLoader = createSkillLoader(projectDir);
  const consensusRunner = createConsensusRunner(projectDir, consensusConfig);

  // Ensure docs structure
  artifactManager.ensureDocsStructure();

  const context: PhaseContext = {
    state,
    pipeline,
    projectDir,
    skillLoader,
    artifactManager,
    gateEngine,
    consensusRunner,
  };

  let phase = pipeline.pipelinePhase;
  let failedPhase: PipelinePhase | null = null;

  // ─── Main Loop ───────────────────────────────────────
  while (phase !== 'DONE' && phase !== 'STUCK') {
    onPhaseStart?.(phase);
    onProgress?.(`Pipeline phase: ${phase}`);

    // Execute the current phase
    const handler = PHASE_HANDLERS[phase];
    if (!handler) {
      return {
        success: false,
        finalPhase: phase,
        artifacts: pipeline.artifacts,
        recoveryIterations: pipeline.recoveryCount,
        error: `No handler for phase: ${phase}`,
      };
    }

    let result: PhaseResult;
    try {
      result = await handler(context);
    } catch (err) {
      result = {
        phase,
        success: false,
        artifacts: [],
        message: 'Phase handler threw an exception',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    onPhaseComplete?.(phase, result);

    // v1.1: Verify constitution integrity before evaluating gate
    const constitutionCheck = verifyConstitution(pipeline, projectDir);

    // Evaluate gate with constitution verification result
    const gateResult = gateEngine.evaluateGate(phase, pipeline, {
      constitutionValid: constitutionCheck.valid,
      constitutionReason: constitutionCheck.reason,
    });

    // v1.1: Merge gate result with any pre-existing phase data (preserves consensus scores)
    mergeGateResult(pipeline, phase, gateResult);

    if (gateResult.pass) {
      // ─── PASS ────────────────────────────────────────

      // v1.1: Check for pending CRs after REVIEW/AUDIT — route to consensus before continuing
      if (CR_CHECK_PHASES.has(phase)) {
        const crRoute = getNextCRRoute(pipeline);
        if (crRoute) {
          onProgress?.(`CR ${crRoute.cr_id} routing to ${crRoute.target_phase}`);
          phase = crRoute.target_phase;
          pipeline.pipelinePhase = phase;
          continue;
        }
      }

      if (phase === 'RECOVERY_LOOP') {
        // Recovery succeeded. RCA may specify rewind target.
        const rca = getLatestRCA(pipeline, projectDir);
        if (rca?.requires_phase_rewind_to) {
          phase = rca.requires_phase_rewind_to;
        } else {
          // Retest the phase that failed
          phase = failedPhase ?? 'QA_VALIDATION';
        }
        failedPhase = null;
      } else {
        // Normal progression
        phase = gateEngine.getNextPhase(phase, gateResult);
      }
    } else {
      // ─── FAIL ────────────────────────────────────────
      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        phase = 'STUCK';
      } else {
        failedPhase = phase;
        pipeline.failedPhase = phase;
        phase = 'RECOVERY_LOOP';
        pipeline.recoveryCount++;
      }
    }

    // Update pipeline phase in state
    pipeline.pipelinePhase = phase;
    onProgress?.(`Transitioning to: ${phase}`);
  }

  // ─── Terminal State ────────────────────────────────────
  // Run the terminal phase handler (DONE or STUCK)
  if (phase === 'DONE' || phase === 'STUCK') {
    const terminalHandler = PHASE_HANDLERS[phase];
    if (terminalHandler) {
      try {
        await terminalHandler(context);
      } catch {
        // Best-effort for terminal phases
      }
    }
  }

  return {
    success: phase === 'DONE',
    finalPhase: phase,
    artifacts: pipeline.artifacts,
    recoveryIterations: pipeline.recoveryCount,
    error: phase !== 'DONE'
      ? `Pipeline stuck after ${pipeline.recoveryCount} recovery iterations`
      : undefined,
  };
}

/** Resume pipeline from saved state */
export async function resumePipeline(options: PipelineOptions): Promise<PipelineResult> {
  // Resume is the same as run — it picks up from pipeline.pipelinePhase
  return runPipeline(options);
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Merge gate engine result with existing phase data in gateResults.
 * Preserves score/consensusScore stored by consensus phase handlers
 * while updating pass/blockers from the gate engine.
 */
function mergeGateResult(
  pipeline: PipelineState,
  phase: PipelinePhase,
  gateResult: GateResult,
): void {
  const existing = pipeline.gateResults[phase];
  if (existing?.score !== undefined || existing?.consensusScore !== undefined) {
    // Preserve consensus scores from the phase handler
    pipeline.gateResults[phase] = {
      ...gateResult,
      score: existing.score ?? gateResult.score,
      consensusScore: existing.consensusScore ?? gateResult.consensusScore,
    };
  } else {
    pipeline.gateResults[phase] = gateResult;
  }
}

/**
 * Find the next pending change request that needs routing.
 * Returns the first 'proposed' CR and marks it as 'approved' (routed).
 */
function getNextCRRoute(
  pipeline: PipelineState,
): { cr_id: string; target_phase: PipelinePhase } | undefined {
  const pending = pipeline.pendingChangeRequests;
  if (!pending) return undefined;

  const nextCR = pending.find((cr) => cr.status === 'proposed');
  if (!nextCR) return undefined;

  // Mark as approved (it has been routed to the consensus phase)
  nextCR.status = 'approved';

  return {
    cr_id: nextCR.cr_id,
    target_phase: nextCR.target_phase,
  };
}

/**
 * Read the latest RCA packet from stored artifacts.
 * Parses the JSON artifact file to extract rewind targets.
 */
function getLatestRCA(
  pipeline: PipelineState,
  projectDir: string,
): RCAPacket | undefined {
  const rcaArtifacts = pipeline.artifacts
    .filter((a) => a.type === 'rca_report' && a.content_type === 'json')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (rcaArtifacts.length === 0) return undefined;

  // Read the latest RCA artifact from disk
  const latest = rcaArtifacts[0];
  const rcaPath = join(projectDir, latest.path);
  if (!existsSync(rcaPath)) return undefined;

  try {
    const content = readFileSync(rcaPath, 'utf-8');
    const parsed = JSON.parse(content) as RCAPacket;
    return parsed;
  } catch {
    return undefined;
  }
}
