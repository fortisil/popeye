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
import { createDefaultPipelineState, toLegacyPhase } from './types.js';
import { createGateEngine } from './gate-engine.js';
import type { GateResult } from './gate-engine.js';
import { createArtifactManager } from './artifact-manager.js';
import { createSkillLoader } from './skill-loader.js';
import { createConsensusRunner } from './consensus/consensus-runner.js';
import { verifyConstitution } from './constitution.js';
import { SkillUsageRegistry } from './skills/usage-registry.js';
import { runSkillCoverageCheck } from './check-runner.js';
import { resolveActiveCR, checkStagnation } from './cr-lifecycle.js';

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
import { updateState } from '../state/index.js';

// ─── Types ───────────────────────────────────────────────

export interface PipelineOptions {
  projectDir: string;
  state: ProjectState;
  consensusConfig?: Partial<ConsensusConfig>;
  /** User steering, upgrade context, or resume instructions */
  additionalContext?: string;
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
    additionalContext,
    onPhaseStart,
    onPhaseComplete,
    onProgress,
  } = options;

  // Initialize pipeline state if needed
  const pipeline: PipelineState = state.pipeline ?? createDefaultPipelineState();
  // Attach pipeline to state so persistence includes it
  state.pipeline = pipeline;

  // Persist user guidance in pipeline state so it survives resume
  if (additionalContext && !pipeline.sessionGuidance) {
    pipeline.sessionGuidance = additionalContext;
  }

  // Initialize skill usage events array (v2.2.1)
  pipeline.skillUsageEvents = pipeline.skillUsageEvents ?? [];
  const skillUsageRegistry = new SkillUsageRegistry(pipeline.skillUsageEvents);

  // Create context dependencies
  const gateEngine = createGateEngine();
  const artifactManager = createArtifactManager(projectDir);
  const skillLoader = createSkillLoader(projectDir);
  const consensusRunner = createConsensusRunner(projectDir, consensusConfig, skillLoader, skillUsageRegistry);

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
    skillUsageRegistry,
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

    // Log phase outcome — critical for diagnosing pipeline loops
    if (!result.success) {
      onProgress?.(`Phase ${phase} FAILED: ${result.message}${result.error ? ` — ${result.error}` : ''}`);
    }

    // v2.2.1: Run skill coverage check before gates that require it
    if (phase === 'CONSENSUS_ROLE_PLANS' || phase === 'PRODUCTION_GATE') {
      const coverageResult = runSkillCoverageCheck(pipeline, phase);
      const phaseChecks = pipeline.gateChecks[phase] ?? [];
      // Replace any existing skill_coverage check result
      const filtered = phaseChecks.filter((c) => c.check_type !== 'skill_coverage');
      filtered.push(coverageResult);
      pipeline.gateChecks[phase] = filtered;
    }

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

      // v2.7.0: Clear failedPhase when the originally-failed phase now passes.
      // INVARIANT: This is the ONLY place failedPhase is cleared during the main loop.
      // It must remain set throughout the entire recovery traversal to guard budget resets.
      if (pipeline.failedPhase === phase) {
        pipeline.failedPhase = undefined;
        pipeline.recoveryBaselineFailedCheckCount = undefined;
      }

      // v2.4.9: Resolve the active CR after its routed phase passes
      if (pipeline.activeChangeRequestId) {
        resolveActiveCR(pipeline, onProgress);
      }

      // v1.1: Check for pending CRs after REVIEW/AUDIT — route to consensus before continuing
      if (CR_CHECK_PHASES.has(phase)) {
        const crRoute = getNextCRRoute(pipeline);
        if (crRoute) {
          onProgress?.(`CR ${crRoute.cr_id} routing to ${crRoute.target_phase}`);
          // v2.5.4: CR routing to a new phase — reset recovery budget
          if (crRoute.target_phase !== phase && pipeline.recoveryCount > 0) {
            onProgress?.(`Recovery budget reset: ${pipeline.recoveryCount} -> 0 (CR routing ${phase} -> ${crRoute.target_phase})`);
            pipeline.recoveryCount = 0;
            pipeline.lastRewindTarget = undefined;
          }
          pipeline.activeChangeRequestId = crRoute.cr_id;
          phase = crRoute.target_phase;
          pipeline.pipelinePhase = phase;
          // v2.5.0: Stagnation check before continue (otherwise skipped by the continue)
          if (checkStagnation(pipeline, onProgress)) {
            phase = 'STUCK';
            pipeline.pipelinePhase = phase;
          }
          // Persist before continue (otherwise CR-routed phase is lost on crash)
          try {
            await updateState(projectDir, { pipeline, phase: toLegacyPhase(phase) });
          } catch { /* non-fatal */ }
          continue;
        }
      }

      if (phase === 'RECOVERY_LOOP') {
        // Recovery succeeded. RCA may specify rewind target.
        const rca = getLatestRCA(pipeline, projectDir);
        let rewindTarget = rca?.requires_phase_rewind_to;

        // v2.4.6: Detect repeated same-target rewind — if we already rewound
        // to this target last iteration and it didn't help, skip the rewind
        // and re-test the failed phase directly.
        if (rewindTarget && rewindTarget === pipeline.lastRewindTarget) {
          onProgress?.(
            `Repeated rewind to ${rewindTarget} detected ` +
            `(recovery #${pipeline.recoveryCount}) — re-testing ` +
            `${failedPhase ?? 'QA_VALIDATION'} directly`,
          );
          rewindTarget = undefined;
        }

        // Determine effective target
        const effectiveTarget = rewindTarget ?? failedPhase ?? 'QA_VALIDATION';
        phase = effectiveTarget;

        // Record only the actual rewind target taken (not undefined when skipped)
        pipeline.lastRewindTarget = rewindTarget;

        // v2.4.6: Clear stale gate data so the re-entered phase evaluates fresh
        if (failedPhase) {
          delete pipeline.gateResults[failedPhase];
          delete pipeline.gateChecks[failedPhase];
        }

        failedPhase = null;
      } else {
        // Normal progression
        const nextPhase = gateEngine.getNextPhase(phase, gateResult);

        // v2.5.4: Reset recovery budget on forward phase change.
        // Each phase gets a fresh budget — prevents a single contentious consensus
        // from consuming all iterations, leaving later phases with zero.
        // v2.7.0: Don't reset budget during recovery traversal.
        // failedPhase stays set until the originally-failed phase passes, so
        // intermediate forward transitions (IMPL→QA→REVIEW→AUDIT) are skipped.
        if (nextPhase !== phase && pipeline.recoveryCount > 0 && !pipeline.failedPhase) {
          onProgress?.(`Recovery budget reset: ${pipeline.recoveryCount} -> 0 (advancing ${phase} -> ${nextPhase})`);
          pipeline.recoveryCount = 0;
          pipeline.lastRewindTarget = undefined;
        }

        phase = nextPhase;
      }
    } else {
      // ─── FAIL ────────────────────────────────────────
      onProgress?.(`Gate FAILED for ${phase}: ${gateResult.blockers.join('; ')}`);

      // v2.7.0: Regression detection — recovery made things worse than the original failure
      if (
        pipeline.failedPhase === phase &&
        pipeline.recoveryBaselineFailedCheckCount !== undefined &&
        (gateResult.failedChecks.length + gateResult.missingArtifacts.length) > pipeline.recoveryBaselineFailedCheckCount
      ) {
        onProgress?.(
          `[regression] Recovery worsened ${phase}: ` +
          `${pipeline.recoveryBaselineFailedCheckCount} -> ` +
          `${gateResult.failedChecks.length + gateResult.missingArtifacts.length} failing checks. ` +
          `Treating budget as exhausted.`
        );
        pipeline.recoveryCount = pipeline.maxRecoveryIterations;
      }

      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        const exhaustedPhase = phase; // capture before any reassignment

        // v2.6.0: One auto-recovery attempt before STUCK
        const arbitratorConfigured = !!(consensusConfig?.arbitrator);
        if (!pipeline.autoRecoveryResult && arbitratorConfigured) {
          onProgress?.(`[auto-recovery] Budget exhausted at ${exhaustedPhase}. Consulting arbitrator...`);

          try {
            const { attemptAutoRecovery } = await import('./auto-recovery.js');
            const result = await attemptAutoRecovery({
              pipeline, projectDir, artifactManager, consensusConfig,
            });

            pipeline.autoRecoveryResult = result.success ? 'success' : 'invalid';
            if (result.artifact) pipeline.artifacts.push(result.artifact);

            if (result.success && result.guidance) {
              onProgress?.(`[auto-recovery] Strategic guidance received (${result.guidance.length} chars). Resetting budget.`);
              pipeline.recoveryCount = 0;
              pipeline.lastRewindTarget = undefined;
              // Stay on the failed phase — let the normal loop re-execute it
              // with the injected strategic guidance
              phase = exhaustedPhase;
              pipeline.pipelinePhase = phase;
              pipeline.failedPhase = exhaustedPhase;
              // Clear stale gate data so re-entry evaluates fresh
              delete pipeline.gateResults[exhaustedPhase];
              delete pipeline.gateChecks[exhaustedPhase];
              // Continue main loop (don't fall through to STUCK)
            } else {
              onProgress?.(`[auto-recovery] No useful guidance. Entering STUCK.`);
              phase = 'STUCK';
            }
          } catch (err) {
            pipeline.autoRecoveryResult = (err as Error)?.message?.includes('timeout') ? 'timeout' : 'error';
            onProgress?.(`[auto-recovery] Failed: ${err instanceof Error ? err.message : 'unknown'}. Entering STUCK.`);
            phase = 'STUCK';
          }
        } else {
          phase = 'STUCK';
        }
      } else {
        // v2.7.0: Capture baseline for fresh failure or when failure origin changes
        if (
          pipeline.recoveryBaselineFailedCheckCount === undefined ||
          pipeline.failedPhase !== phase  // Different phase failing — new recovery origin
        ) {
          pipeline.recoveryBaselineFailedCheckCount = gateResult.failedChecks.length + gateResult.missingArtifacts.length;
        }
        failedPhase = phase;
        pipeline.failedPhase = phase;
        phase = 'RECOVERY_LOOP';
        pipeline.recoveryCount++;
      }
    }

    // v2.5.0: Stagnation detection — shared helper checks rolling signature window
    if (checkStagnation(pipeline, onProgress)) {
      phase = 'STUCK';
    }

    // Update pipeline phase in state
    pipeline.pipelinePhase = phase;

    // v2.4.5b: Persist pipeline state after each phase transition (crash safety)
    try {
      await updateState(projectDir, { pipeline, phase: toLegacyPhase(phase) });
    } catch (persistErr) {
      onProgress?.(`Warning: Failed to persist pipeline state: ${
        persistErr instanceof Error ? persistErr.message : String(persistErr)}`);
    }

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

  // Persist final pipeline state (DONE or STUCK)
  try {
    await updateState(projectDir, { pipeline, phase: toLegacyPhase(phase) });
  } catch {
    // Best-effort for terminal persistence
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

/** Resume pipeline from saved state — with STUCK recovery (v2.4.5) */
export async function resumePipeline(options: PipelineOptions): Promise<PipelineResult> {
  const pipeline: PipelineState | undefined = options.state.pipeline;

  // v2.5.3: Normalize stale legacy status when pipeline is STUCK.
  // completeProject() may have set status='complete' before the pipeline entered STUCK,
  // leaving inconsistent state. Fix on load so the display layer never sees the lie.
  if (
    pipeline &&
    (pipeline.pipelinePhase === 'STUCK' || pipeline.pipelinePhase === 'RECOVERY_LOOP') &&
    options.state.status === 'complete'
  ) {
    options.state.status = 'in-progress';
    try {
      await updateState(options.projectDir, { status: 'in-progress' });
    } catch {
      // Best-effort — display layer override in interactive.ts handles it regardless
    }
  }

  // v2.4.8: RECOVERY_LOOP with remaining attempts — auto-resume without guidance.
  // Must check this BEFORE the STUCK branch because RECOVERY_LOOP with exhausted
  // attempts falls through to the guidance-required path below.
  if (
    pipeline?.pipelinePhase === 'RECOVERY_LOOP' &&
    pipeline?.failedPhase &&
    pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
  ) {
    // Reset to the failed phase so the main loop re-enters. Do NOT reset
    // recoveryCount — the pipeline retains its remaining iteration budget.
    // Do NOT clear lastRewindTarget — preserve repeated-rewind detection.
    pipeline.pipelinePhase = pipeline.failedPhase;
    delete pipeline.gateResults[pipeline.failedPhase];
    delete pipeline.gateChecks[pipeline.failedPhase];
    options.onProgress?.(
      `[resume] Auto-resuming from RECOVERY_LOOP: resetting to ${pipeline.failedPhase}, ` +
      `recoveryCount ${pipeline.recoveryCount}/${pipeline.maxRecoveryIterations}`,
    );
  } else if (
    // v2.4.7: STUCK (or RECOVERY_LOOP with exhausted attempts) requires user guidance.
    (pipeline?.pipelinePhase === 'STUCK' ||
     (pipeline?.pipelinePhase === 'RECOVERY_LOOP' &&
      pipeline.recoveryCount >= (pipeline.maxRecoveryIterations ?? 5))) &&
    pipeline?.failedPhase
  ) {
    // v2.5.2: Purge legacy CRs without drift_key (from pre-v2.5.0 infinite loop).
    // These are orphaned — no drift_key means they can never be deduplicated or resolved.
    // Runs unconditionally (before guidance check) so cleanup persists even without guidance.
    if (pipeline.pendingChangeRequests) {
      const before = pipeline.pendingChangeRequests.length;
      pipeline.pendingChangeRequests = pipeline.pendingChangeRequests.filter(
        (cr) => cr.drift_key != null || cr.status === 'proposed',
      );
      const purged = before - pipeline.pendingChangeRequests.length;
      if (purged > 0) {
        options.onProgress?.(`[resume] Purged ${purged} legacy CRs without drift_key`);
      }
    }

    // Clear stale activeChangeRequestId if the referenced CR was purged
    if (
      pipeline.activeChangeRequestId &&
      !pipeline.pendingChangeRequests?.some((cr) => cr.cr_id === pipeline.activeChangeRequestId)
    ) {
      options.onProgress?.(`[resume] Cleared stale activeChangeRequestId: ${pipeline.activeChangeRequestId}`);
      pipeline.activeChangeRequestId = undefined;
    }

    const guidance = options.additionalContext?.trim() ?? '';
    if (guidance.length > 0) {
      // User provided guidance — allow one more retry
      const prevRecovery = pipeline.recoveryCount;
      pipeline.pipelinePhase = pipeline.failedPhase;
      pipeline.recoveryCount = 0;
      pipeline.lastRewindTarget = undefined;
      pipeline.autoRecoveryResult = undefined;  // v2.6.0: Fresh auto-recovery budget after user guidance

      // Clear stale gate results and checks for the failed phase
      delete pipeline.gateResults[pipeline.failedPhase];
      delete pipeline.gateChecks[pipeline.failedPhase];

      options.onProgress?.(
        `[resume] Recovering from ${pipeline.pipelinePhase}: resetting to ${pipeline.failedPhase}, ` +
        `recoveryCount ${prevRecovery} -> 0 (user provided guidance)`,
      );
    } else {
      // No guidance — v2.6.0: attempt auto-recovery before giving up
      const arbitratorConfigured = !!(options.consensusConfig?.arbitrator);
      if (!pipeline.autoRecoveryResult && arbitratorConfigured) {
        options.onProgress?.(
          `[resume] No guidance provided. Attempting auto-recovery via arbitrator...`,
        );

        try {
          const artifactManager = createArtifactManager(options.projectDir);
          const { attemptAutoRecovery } = await import('./auto-recovery.js');
          const result = await attemptAutoRecovery({
            pipeline,
            projectDir: options.projectDir,
            artifactManager,
            consensusConfig: options.consensusConfig,
          });

          pipeline.autoRecoveryResult = result.success ? 'success' : 'invalid';
          if (result.artifact) pipeline.artifacts.push(result.artifact);

          if (result.success && result.guidance) {
            options.onProgress?.(
              `[resume] Auto-recovery guidance received (${result.guidance.length} chars). Resetting budget.`,
            );
            const prevRecovery = pipeline.recoveryCount;
            pipeline.pipelinePhase = pipeline.failedPhase;
            pipeline.recoveryCount = 0;
            pipeline.lastRewindTarget = undefined;
            delete pipeline.gateResults[pipeline.failedPhase];
            delete pipeline.gateChecks[pipeline.failedPhase];

            options.onProgress?.(
              `[resume] Recovering from STUCK: resetting to ${pipeline.failedPhase}, ` +
              `recoveryCount ${prevRecovery} -> 0 (auto-recovery guidance)`,
            );
            // Fall through to runPipeline() below
          } else {
            options.onProgress?.(`[resume] Auto-recovery produced no useful guidance.`);
            // Fall through to return STUCK below
          }
        } catch (err) {
          pipeline.autoRecoveryResult = (err as Error)?.message?.includes('timeout') ? 'timeout' : 'error';
          options.onProgress?.(
            `[resume] Auto-recovery failed: ${err instanceof Error ? err.message : 'unknown'}`,
          );
          // Fall through to return STUCK below
        }

        // Persist state (whether auto-recovery succeeded or not)
        try {
          await updateState(options.projectDir, { pipeline });
        } catch { /* best-effort */ }

        // If auto-recovery succeeded, fall through to runPipeline()
        if (pipeline.autoRecoveryResult === 'success') {
          return runPipeline(options);
        }
      }

      // No guidance, no auto-recovery (or auto-recovery failed) — return STUCK
      try {
        await updateState(options.projectDir, { pipeline });
      } catch {
        // Best-effort — cleanup is still in memory for next resume
      }
      options.onProgress?.(
        `[resume] Pipeline is stuck at ${pipeline.failedPhase} after ${pipeline.recoveryCount} recovery attempts. ` +
        `Provide guidance to attempt recovery.`,
      );
      return {
        success: false,
        finalPhase: 'STUCK',
        artifacts: pipeline.artifacts,
        recoveryIterations: pipeline.recoveryCount,
        error: `Pipeline stuck at ${pipeline.failedPhase} after ${pipeline.recoveryCount} recovery iterations. Provide guidance to retry.`,
      };
    }
  } else if (
    (pipeline?.pipelinePhase === 'STUCK' || pipeline?.pipelinePhase === 'RECOVERY_LOOP') &&
    !pipeline?.failedPhase
  ) {
    options.onProgress?.(
      `[resume] Pipeline is ${pipeline.pipelinePhase} but failedPhase is missing — cannot auto-recover`,
    );
    return {
      success: false,
      finalPhase: 'STUCK',
      artifacts: pipeline?.artifacts ?? [],
      recoveryIterations: pipeline?.recoveryCount ?? 0,
      error: 'Pipeline is stuck with no failed phase recorded. Manual intervention required.',
    };
  }

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
  if (existing?.score !== undefined || existing?.consensusScore !== undefined || existing?.finalStatus !== undefined) {
    // Preserve consensus scores and finalStatus from the phase handler
    pipeline.gateResults[phase] = {
      ...gateResult,
      score: existing.score ?? gateResult.score,
      consensusScore: existing.consensusScore ?? gateResult.consensusScore,
      finalStatus: existing.finalStatus ?? gateResult.finalStatus,  // v2.4.3
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

  // Mark as routed/in-flight (kept as 'approved' for backward compatibility)
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
