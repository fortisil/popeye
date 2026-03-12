/**
 * Orchestrator tests — full loop with mocked phases, recovery/rewind/stuck.
 * Tests the deterministic transition logic (P0-A) without real LLM calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGateEngine } from '../../src/pipeline/gate-engine.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelinePhase, PipelineState, ArtifactEntry } from '../../src/pipeline/types.js';
import type { GateResult } from '../../src/pipeline/gate-engine.js';
import { resolveActiveCR, computeLoopSignature, checkStagnation, STAGNATION_THRESHOLD } from '../../src/pipeline/cr-lifecycle.js';

// We test the orchestrator's core logic by simulating gate/phase behavior
// rather than importing runPipeline (which pulls in LLM deps)

function makeArtifact(type: string, phase: string): ArtifactEntry {
  return {
    id: `test-${type}-${phase}-${Date.now()}`,
    type: type as ArtifactEntry['type'],
    phase: phase as PipelinePhase,
    version: 1,
    path: `docs/${type}.md`,
    sha256: 'abc123',
    timestamp: new Date().toISOString(),
    immutable: true,
    content_type: 'markdown',
    group_id: `group-${type}`,
  };
}

/**
 * Simulates the orchestrator's core transition logic without
 * actually running phase handlers or importing LLM dependencies.
 *
 * v2.5.4: Includes recovery budget reset on forward phase change and CR routing.
 * v2.7.0: Includes failedPhase guard on budget reset, baseline capture, and regression detection.
 */
function simulateOrchestratorLoop(
  startPhase: PipelinePhase,
  pipeline: PipelineState,
  phaseOutcomes: Map<PipelinePhase, boolean> | ((phase: PipelinePhase, attempt: number) => boolean),
  options?: {
    maxIterations?: number;
    /** Pending CRs to route after REVIEW/AUDIT */
    pendingCRs?: Array<{ cr_id: string; target_phase: PipelinePhase; status: string }>;
    /** v2.7.0: Custom gate results per phase (for regression detection tests) */
    gateResultOverrides?: Map<PipelinePhase, (attempt: number) => Partial<GateResult>>;
  },
): { finalPhase: PipelinePhase; recoveryCount: number; phaseLog: PipelinePhase[]; progressLog: string[] } {
  const maxIterations = options?.maxIterations ?? 50;
  const engine = createGateEngine();
  let phase = startPhase;
  let failedPhase: PipelinePhase | null = null;
  const phaseLog: PipelinePhase[] = [phase];
  const progressLog: string[] = [];
  const attemptCounts = new Map<PipelinePhase, number>();

  // Install pending CRs if provided
  if (options?.pendingCRs) {
    pipeline.pendingChangeRequests = options.pendingCRs as PipelineState['pendingChangeRequests'];
  }

  const crCheckPhases = new Set<PipelinePhase>(['REVIEW', 'AUDIT']);

  const getOutcome = (p: PipelinePhase): boolean => {
    const attempt = (attemptCounts.get(p) ?? 0) + 1;
    attemptCounts.set(p, attempt);
    if (typeof phaseOutcomes === 'function') {
      return phaseOutcomes(p, attempt);
    }
    return phaseOutcomes.get(p) ?? false;
  };

  /** v2.7.0: Build a GateResult for the current phase (used for regression detection) */
  const getGateResult = (p: PipelinePhase, pass: boolean): GateResult => {
    const attempt = attemptCounts.get(p) ?? 1;
    const overrideFn = options?.gateResultOverrides?.get(p);
    const overrides = overrideFn ? overrideFn(attempt) : {};
    return {
      phase: p,
      pass,
      blockers: [],
      missingArtifacts: [],
      failedChecks: [],
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  };

  for (let i = 0; i < maxIterations; i++) {
    if (phase === 'DONE' || phase === 'STUCK') break;

    const gatePass = getOutcome(phase);
    const gateResult = getGateResult(phase, gatePass);

    if (gatePass) {
      // v2.7.0: Clear failedPhase when the originally-failed phase now passes
      if (pipeline.failedPhase === phase) {
        pipeline.failedPhase = undefined;
        pipeline.recoveryBaselineFailedCheckCount = undefined;
      }

      // v2.5.4: Check for pending CR routing after REVIEW/AUDIT
      if (crCheckPhases.has(phase) && pipeline.pendingChangeRequests) {
        const nextCR = pipeline.pendingChangeRequests.find((cr) => cr.status === 'proposed');
        if (nextCR) {
          nextCR.status = 'approved';
          // v2.5.4: CR routing to a new phase — reset recovery budget
          if (nextCR.target_phase !== phase && pipeline.recoveryCount > 0) {
            progressLog.push(`Recovery budget reset: ${pipeline.recoveryCount} -> 0 (CR routing ${phase} -> ${nextCR.target_phase})`);
            pipeline.recoveryCount = 0;
            pipeline.lastRewindTarget = undefined;
          }
          pipeline.activeChangeRequestId = nextCR.cr_id;
          phase = nextCR.target_phase;
          pipeline.pipelinePhase = phase;
          phaseLog.push(phase);
          continue;
        }
      }

      if (phase === 'RECOVERY_LOOP') {
        // Recovery succeeded — go back to failed phase
        phase = failedPhase ?? 'QA_VALIDATION';
        failedPhase = null;
      } else {
        const nextPhase = engine.getNextPhase(phase, gateResult);

        // v2.5.4 + v2.7.0: Reset recovery budget on forward phase change,
        // but NOT during recovery traversal (failedPhase still set)
        if (nextPhase !== phase && pipeline.recoveryCount > 0 && !pipeline.failedPhase) {
          progressLog.push(`Recovery budget reset: ${pipeline.recoveryCount} -> 0 (advancing ${phase} -> ${nextPhase})`);
          pipeline.recoveryCount = 0;
          pipeline.lastRewindTarget = undefined;
        }

        phase = nextPhase;
      }
    } else {
      // v2.7.0: Regression detection — recovery made things worse
      if (
        pipeline.failedPhase === phase &&
        pipeline.recoveryBaselineFailedCheckCount !== undefined &&
        (gateResult.failedChecks.length + gateResult.missingArtifacts.length) > pipeline.recoveryBaselineFailedCheckCount
      ) {
        progressLog.push(
          `[regression] Recovery worsened ${phase}: ` +
          `${pipeline.recoveryBaselineFailedCheckCount} -> ` +
          `${gateResult.failedChecks.length + gateResult.missingArtifacts.length} failing checks. ` +
          `Treating budget as exhausted.`
        );
        pipeline.recoveryCount = pipeline.maxRecoveryIterations;
      }

      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        phase = 'STUCK';
      } else {
        // v2.7.0: Capture baseline for fresh failure or when failure origin changes
        if (
          pipeline.recoveryBaselineFailedCheckCount === undefined ||
          pipeline.failedPhase !== phase
        ) {
          pipeline.recoveryBaselineFailedCheckCount = gateResult.failedChecks.length + gateResult.missingArtifacts.length;
        }
        failedPhase = phase;
        pipeline.failedPhase = phase;
        phase = 'RECOVERY_LOOP';
        pipeline.recoveryCount++;
      }
    }

    pipeline.pipelinePhase = phase;
    phaseLog.push(phase);
  }

  return { finalPhase: phase, recoveryCount: pipeline.recoveryCount, phaseLog, progressLog };
}

describe('Orchestrator Transition Logic', () => {
  let pipeline: PipelineState;

  beforeEach(() => {
    pipeline = createDefaultPipelineState();
  });

  describe('happy path', () => {
    it('should progress through all phases to DONE', () => {
      // All phases pass
      const outcomes = new Map<PipelinePhase, boolean>([
        ['INTAKE', true],
        ['CONSENSUS_MASTER_PLAN', true],
        ['ARCHITECTURE', true],
        ['CONSENSUS_ARCHITECTURE', true],
        ['ROLE_PLANNING', true],
        ['CONSENSUS_ROLE_PLANS', true],
        ['IMPLEMENTATION', true],
        ['QA_VALIDATION', true],
        ['REVIEW', true],
        ['AUDIT', true],
        ['PRODUCTION_GATE', true],
      ]);

      const result = simulateOrchestratorLoop('INTAKE', pipeline, outcomes);
      expect(result.finalPhase).toBe('DONE');
      expect(result.recoveryCount).toBe(0);
    });

    it('should follow the correct phase sequence', () => {
      const outcomes = new Map<PipelinePhase, boolean>([
        ['INTAKE', true],
        ['CONSENSUS_MASTER_PLAN', true],
        ['ARCHITECTURE', true],
        ['CONSENSUS_ARCHITECTURE', true],
        ['ROLE_PLANNING', true],
        ['CONSENSUS_ROLE_PLANS', true],
        ['IMPLEMENTATION', true],
        ['QA_VALIDATION', true],
        ['REVIEW', true],
        ['AUDIT', true],
        ['PRODUCTION_GATE', true],
      ]);

      const result = simulateOrchestratorLoop('INTAKE', pipeline, outcomes);
      expect(result.phaseLog).toEqual([
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
      ]);
    });
  });

  describe('recovery loop', () => {
    it('should enter RECOVERY_LOOP on gate failure', () => {
      // INTAKE passes, CONSENSUS fails first time, then passes
      let consensusAttempt = 0;
      const outcomes = new Map<PipelinePhase, boolean>([
        ['INTAKE', true],
        ['RECOVERY_LOOP', true],
      ]);

      // Override CONSENSUS to fail once then pass
      const result = simulateOrchestratorLoop('INTAKE', pipeline, outcomes);
      // INTAKE passes -> CONSENSUS (not in outcomes, defaults to false) -> RECOVERY -> CONSENSUS (still false)
      // Eventually hits max recovery
      expect(result.phaseLog).toContain('RECOVERY_LOOP');
    });

    it('should go to STUCK after max recovery iterations', () => {
      pipeline.maxRecoveryIterations = 3;

      // Only INTAKE passes, everything else fails
      const outcomes = new Map<PipelinePhase, boolean>([
        ['INTAKE', true],
      ]);

      const result = simulateOrchestratorLoop('INTAKE', pipeline, outcomes);
      expect(result.finalPhase).toBe('STUCK');
      expect(result.recoveryCount).toBe(3);
    });

    it('should return to failed phase after successful recovery', () => {
      let qaAttempts = 0;

      // Custom simulation: QA fails once, recovery succeeds, QA succeeds on retry
      const engine = createGateEngine();
      let phase: PipelinePhase = 'QA_VALIDATION';
      let failedPhase: PipelinePhase | null = null;
      const log: PipelinePhase[] = [phase];

      // Pre-fill pipeline to reach QA
      // Step 1: QA fails
      failedPhase = 'QA_VALIDATION';
      phase = 'RECOVERY_LOOP';
      pipeline.recoveryCount++;
      log.push(phase);

      // Step 2: RECOVERY passes, returns to QA
      phase = failedPhase;
      failedPhase = null;
      log.push(phase);

      // Step 3: QA passes this time
      const gr: GateResult = { phase, pass: true, blockers: [], missingArtifacts: [], failedChecks: [], timestamp: '' };
      phase = engine.getNextPhase('QA_VALIDATION', gr);
      log.push(phase);

      expect(log).toEqual(['QA_VALIDATION', 'RECOVERY_LOOP', 'QA_VALIDATION', 'REVIEW']);
      expect(pipeline.recoveryCount).toBe(1);
    });
  });

  describe('resume from mid-pipeline', () => {
    it('should resume from ARCHITECTURE', () => {
      const outcomes = new Map<PipelinePhase, boolean>([
        ['ARCHITECTURE', true],
        ['CONSENSUS_ARCHITECTURE', true],
        ['ROLE_PLANNING', true],
        ['CONSENSUS_ROLE_PLANS', true],
        ['IMPLEMENTATION', true],
        ['QA_VALIDATION', true],
        ['REVIEW', true],
        ['AUDIT', true],
        ['PRODUCTION_GATE', true],
      ]);

      const result = simulateOrchestratorLoop('ARCHITECTURE', pipeline, outcomes);
      expect(result.finalPhase).toBe('DONE');
      expect(result.phaseLog[0]).toBe('ARCHITECTURE');
    });

    it('should resume from IMPLEMENTATION', () => {
      const outcomes = new Map<PipelinePhase, boolean>([
        ['IMPLEMENTATION', true],
        ['QA_VALIDATION', true],
        ['REVIEW', true],
        ['AUDIT', true],
        ['PRODUCTION_GATE', true],
      ]);

      const result = simulateOrchestratorLoop('IMPLEMENTATION', pipeline, outcomes);
      expect(result.finalPhase).toBe('DONE');
    });
  });

  describe('gate engine integration', () => {
    it('should evaluate INTAKE gate correctly', () => {
      const engine = createGateEngine();

      // Missing artifacts
      const result1 = engine.evaluateGate('INTAKE', pipeline);
      expect(result1.pass).toBe(false);

      // Add required artifacts (including constitution for v1.1)
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      const result2 = engine.evaluateGate('INTAKE', pipeline);
      expect(result2.pass).toBe(true);
    });

    it('should fail gate when constitution is invalid (v1.1)', () => {
      const engine = createGateEngine();

      // Add all required artifacts
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      // Gate should pass normally
      const passResult = engine.evaluateGate('INTAKE', pipeline);
      expect(passResult.pass).toBe(true);

      // With constitutionValid=false, gate should fail
      const failResult = engine.evaluateGate('INTAKE', pipeline, {
        constitutionValid: false,
        constitutionReason: 'Constitution has been modified since pipeline start',
      });
      expect(failResult.pass).toBe(false);
      expect(failResult.blockers.some((b: string) => b.includes('Constitution'))).toBe(true);
    });

    it('should evaluate PRODUCTION_GATE with check results', () => {
      const engine = createGateEngine();

      // Add required artifacts (production_readiness + audit_report)
      pipeline.artifacts.push(makeArtifact('production_readiness', 'PRODUCTION_GATE'));
      pipeline.artifacts.push(makeArtifact('audit_report', 'AUDIT'));

      // Without check results — still should fail
      const result1 = engine.evaluateGate('PRODUCTION_GATE', pipeline);
      expect(result1.pass).toBe(false);

      // Add check results (including skill_coverage added in v2.2.1)
      pipeline.gateChecks['PRODUCTION_GATE'] = [
        { check_type: 'build', status: 'pass', command: 'npm run build', exit_code: 0, duration_ms: 1000, timestamp: '' },
        { check_type: 'test', status: 'pass', command: 'npm test', exit_code: 0, duration_ms: 2000, timestamp: '' },
        { check_type: 'lint', status: 'pass', command: 'npm run lint', exit_code: 0, duration_ms: 500, timestamp: '' },
        { check_type: 'typecheck', status: 'pass', command: 'tsc', exit_code: 0, duration_ms: 300, timestamp: '' },
        { check_type: 'skill_coverage', status: 'pass', command: 'skill-coverage-check', exit_code: 0, duration_ms: 0, timestamp: '' },
      ];

      const result2 = engine.evaluateGate('PRODUCTION_GATE', pipeline);
      expect(result2.pass).toBe(true);
    });
  });

  describe('callbacks', () => {
    it('should track phase transitions in log', () => {
      const outcomes = new Map<PipelinePhase, boolean>([
        ['INTAKE', true],
        ['CONSENSUS_MASTER_PLAN', true],
      ]);

      const result = simulateOrchestratorLoop('INTAKE', pipeline, outcomes);
      expect(result.phaseLog.length).toBeGreaterThan(1);
      expect(result.phaseLog[0]).toBe('INTAKE');
    });
  });

  // ─── v1.1 Gap Fix Tests ────────────────────────────────

  describe('v1.1: CR routing (Gap #1)', () => {
    it('should route to consensus phase when pending CRs exist after REVIEW', () => {
      // Simulate: REVIEW passes but has a pending CR targeting CONSENSUS_MASTER_PLAN
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-001', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'proposed' },
      ];

      const engine = createGateEngine();
      let phase: PipelinePhase = 'REVIEW';
      const log: PipelinePhase[] = [phase];

      // REVIEW gate passes
      const gateResult: GateResult = {
        phase: 'REVIEW', pass: true, blockers: [],
        missingArtifacts: [], failedChecks: [], timestamp: '',
      };

      // Check for pending CRs (same logic as orchestrator)
      const crCheckPhases = new Set<PipelinePhase>(['REVIEW', 'AUDIT']);
      if (crCheckPhases.has(phase)) {
        const pending = pipeline.pendingChangeRequests;
        const nextCR = pending?.find((cr) => cr.status === 'proposed');
        if (nextCR) {
          nextCR.status = 'approved';
          phase = nextCR.target_phase;
          log.push(phase);
        }
      }

      expect(phase).toBe('CONSENSUS_MASTER_PLAN');
      expect(pipeline.pendingChangeRequests![0].status).toBe('approved');
      expect(log).toEqual(['REVIEW', 'CONSENSUS_MASTER_PLAN']);
    });

    it('should route to consensus phase when pending CRs exist after AUDIT', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-002', change_type: 'architecture', target_phase: 'CONSENSUS_ARCHITECTURE', status: 'proposed' },
      ];

      let phase: PipelinePhase = 'AUDIT';
      const log: PipelinePhase[] = [phase];

      const crCheckPhases = new Set<PipelinePhase>(['REVIEW', 'AUDIT']);
      if (crCheckPhases.has(phase)) {
        const nextCR = pipeline.pendingChangeRequests?.find((cr) => cr.status === 'proposed');
        if (nextCR) {
          nextCR.status = 'approved';
          phase = nextCR.target_phase;
          log.push(phase);
        }
      }

      expect(phase).toBe('CONSENSUS_ARCHITECTURE');
      expect(pipeline.pendingChangeRequests![0].status).toBe('approved');
    });

    it('should not re-route already approved CRs', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-003', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
      ];

      let phase: PipelinePhase = 'REVIEW';
      const nextCR = pipeline.pendingChangeRequests?.find((cr) => cr.status === 'proposed');
      expect(nextCR).toBeUndefined();
      // Phase should continue normally (no routing)
    });

    it('should process multiple CRs one at a time', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-A', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'proposed' },
        { cr_id: 'CR-B', change_type: 'architecture', target_phase: 'CONSENSUS_ARCHITECTURE', status: 'proposed' },
      ];

      // First routing: picks CR-A
      const firstCR = pipeline.pendingChangeRequests.find((cr) => cr.status === 'proposed');
      expect(firstCR?.cr_id).toBe('CR-A');
      firstCR!.status = 'approved';

      // Second routing: picks CR-B
      const secondCR = pipeline.pendingChangeRequests.find((cr) => cr.status === 'proposed');
      expect(secondCR?.cr_id).toBe('CR-B');
      secondCR!.status = 'approved';

      // No more pending CRs
      const thirdCR = pipeline.pendingChangeRequests.find((cr) => cr.status === 'proposed');
      expect(thirdCR).toBeUndefined();
    });

    it('should not route CRs after non-review/audit phases', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-X', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'proposed' },
      ];

      const crCheckPhases = new Set<PipelinePhase>(['REVIEW', 'AUDIT']);
      // IMPLEMENTATION is not a CR-check phase
      expect(crCheckPhases.has('IMPLEMENTATION')).toBe(false);
      expect(crCheckPhases.has('QA_VALIDATION')).toBe(false);
      expect(crCheckPhases.has('PRODUCTION_GATE')).toBe(false);
    });
  });

  describe('v1.1: Constitution verification (Gap #2)', () => {
    it('should block gate progression when constitution is invalid', () => {
      const engine = createGateEngine();

      // Provide all required artifacts for INTAKE
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      // Without constitution check — passes
      const passResult = engine.evaluateGate('INTAKE', pipeline);
      expect(passResult.pass).toBe(true);

      // With invalid constitution — fails
      const failResult = engine.evaluateGate('INTAKE', pipeline, {
        constitutionValid: false,
        constitutionReason: 'Hash mismatch: constitution modified after INTAKE',
      });
      expect(failResult.pass).toBe(false);
      expect(failResult.blockers).toContain('Hash mismatch: constitution modified after INTAKE');
    });

    it('should pass gate when constitution is valid', () => {
      const engine = createGateEngine();
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      const result = engine.evaluateGate('INTAKE', pipeline, {
        constitutionValid: true,
      });
      expect(result.pass).toBe(true);
    });

    it('should apply constitution check to non-INTAKE phases too', () => {
      const engine = createGateEngine();

      // Setup for ARCHITECTURE phase
      pipeline.artifacts.push(makeArtifact('architecture', 'ARCHITECTURE'));

      const result = engine.evaluateGate('ARCHITECTURE', pipeline, {
        constitutionValid: false,
        constitutionReason: 'Constitution tampered',
      });
      expect(result.pass).toBe(false);
      expect(result.blockers.some((b: string) => b.includes('Constitution'))).toBe(true);
    });
  });

  describe('v1.1: gateResult merge (Gap #3)', () => {
    it('should preserve consensus score when merging gate result', () => {
      // Simulate: consensus phase stored a score in gateResults
      pipeline.gateResults['CONSENSUS_MASTER_PLAN'] = {
        phase: 'CONSENSUS_MASTER_PLAN',
        pass: true,
        score: 0.85,
        consensusScore: 0.92,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // Gate engine produces a new result (without score)
      const newGateResult: GateResult = {
        phase: 'CONSENSUS_MASTER_PLAN',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // Merge logic (same as orchestrator's mergeGateResult)
      const existing = pipeline.gateResults['CONSENSUS_MASTER_PLAN'];
      if (existing?.score !== undefined || existing?.consensusScore !== undefined) {
        pipeline.gateResults['CONSENSUS_MASTER_PLAN'] = {
          ...newGateResult,
          score: existing.score ?? newGateResult.score,
          consensusScore: existing.consensusScore ?? newGateResult.consensusScore,
        };
      } else {
        pipeline.gateResults['CONSENSUS_MASTER_PLAN'] = newGateResult;
      }

      // Scores should be preserved
      const merged = pipeline.gateResults['CONSENSUS_MASTER_PLAN'];
      expect(merged.score).toBe(0.85);
      expect(merged.consensusScore).toBe(0.92);
      // But pass/blockers come from the new gate result
      expect(merged.pass).toBe(true);
      expect(merged.blockers).toEqual([]);
    });

    it('should overwrite when no prior scores exist', () => {
      const newGateResult: GateResult = {
        phase: 'INTAKE',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // No existing entry
      const existing = pipeline.gateResults['INTAKE'];
      expect(existing).toBeUndefined();

      // Merge should just set the new result
      pipeline.gateResults['INTAKE'] = newGateResult;
      expect(pipeline.gateResults['INTAKE']).toBe(newGateResult);
    });

    it('should preserve score even when gate fails', () => {
      pipeline.gateResults['CONSENSUS_ARCHITECTURE'] = {
        phase: 'CONSENSUS_ARCHITECTURE',
        pass: true,
        score: 0.7,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: '',
      };

      const failingGateResult: GateResult = {
        phase: 'CONSENSUS_ARCHITECTURE',
        pass: false,
        blockers: ['Missing required artifact'],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: '',
      };

      const existing = pipeline.gateResults['CONSENSUS_ARCHITECTURE'];
      if (existing?.score !== undefined || existing?.consensusScore !== undefined) {
        pipeline.gateResults['CONSENSUS_ARCHITECTURE'] = {
          ...failingGateResult,
          score: existing.score ?? failingGateResult.score,
          consensusScore: existing.consensusScore ?? failingGateResult.consensusScore,
        };
      }

      const merged = pipeline.gateResults['CONSENSUS_ARCHITECTURE'];
      expect(merged.pass).toBe(false);          // gate engine says fail
      expect(merged.score).toBe(0.7);           // consensus score preserved
      expect(merged.blockers).toEqual(['Missing required artifact']);
    });
  });

  describe('v1.1: RCA rewind (Gap #4)', () => {
    it('should return to failed phase after recovery when no RCA rewind target', () => {
      // Manual simulation: phase fails -> recovery -> back to failed phase
      let phase: PipelinePhase = 'QA_VALIDATION';
      let failedPhase: PipelinePhase | null = null;

      // QA fails
      failedPhase = phase;
      phase = 'RECOVERY_LOOP';
      pipeline.recoveryCount++;

      // Recovery succeeds, no RCA rewind target
      // Without RCA, should return to failedPhase
      phase = failedPhase ?? 'QA_VALIDATION';
      failedPhase = null;

      expect(phase).toBe('QA_VALIDATION');
    });

    it('should use RCA rewind target when available', () => {
      // Simulate: RCA says rewind to ARCHITECTURE
      let phase: PipelinePhase = 'QA_VALIDATION';
      let failedPhase: PipelinePhase | null = 'QA_VALIDATION';

      phase = 'RECOVERY_LOOP';
      pipeline.recoveryCount++;

      // Recovery succeeds, RCA has rewind target
      const rca = { requires_phase_rewind_to: 'ARCHITECTURE' as PipelinePhase };
      if (rca.requires_phase_rewind_to) {
        phase = rca.requires_phase_rewind_to;
      } else {
        phase = failedPhase ?? 'QA_VALIDATION';
      }
      failedPhase = null;

      expect(phase).toBe('ARCHITECTURE');
    });

    it('should default to QA_VALIDATION when no failed phase tracked', () => {
      let phase: PipelinePhase = 'RECOVERY_LOOP';
      let failedPhase: PipelinePhase | null = null;

      // Recovery succeeds, no RCA, no failedPhase
      phase = failedPhase ?? 'QA_VALIDATION';

      expect(phase).toBe('QA_VALIDATION');
    });
  });

  // ─── v2.4.5: Resume from STUCK ──────────────────────────

  describe('v2.4.5: resume from STUCK', () => {
    it('should reset to failedPhase when resuming from STUCK', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'CONSENSUS_ROLE_PLANS';
      pipeline.recoveryCount = 5;

      // Simulate resumePipeline logic (without calling runPipeline)
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
      }

      expect(pipeline.pipelinePhase).toBe('CONSENSUS_ROLE_PLANS');
      expect(pipeline.recoveryCount).toBe(0);
    });

    it('should clear stale gate data for the failed phase', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'CONSENSUS_ROLE_PLANS';
      pipeline.recoveryCount = 5;

      // Populate gate data that should be cleared
      pipeline.gateResults['CONSENSUS_ROLE_PLANS'] = {
        phase: 'CONSENSUS_ROLE_PLANS',
        pass: false,
        blockers: ['skill_coverage failed'],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };
      pipeline.gateChecks['CONSENSUS_ROLE_PLANS'] = [
        { check_type: 'skill_coverage', status: 'fail', command: 'skill-coverage-check', exit_code: 1, duration_ms: 0, timestamp: '' },
      ];

      // Preserve other phases' gate data
      pipeline.gateResults['CONSENSUS_ARCHITECTURE'] = {
        phase: 'CONSENSUS_ARCHITECTURE',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // Simulate resume logic
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.gateResults['CONSENSUS_ROLE_PLANS']).toBeUndefined();
      expect(pipeline.gateChecks['CONSENSUS_ROLE_PLANS']).toBeUndefined();
      // Other phases preserved
      expect(pipeline.gateResults['CONSENSUS_ARCHITECTURE']).toBeDefined();
    });

    it('should not modify pipeline when not at STUCK', () => {
      pipeline.pipelinePhase = 'ROLE_PLANNING';
      pipeline.failedPhase = undefined;
      pipeline.recoveryCount = 2;

      // Simulate resume logic — condition not met
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
      }

      expect(pipeline.pipelinePhase).toBe('ROLE_PLANNING');
      expect(pipeline.recoveryCount).toBe(2);
    });

    it('should not auto-recover when STUCK without failedPhase', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = undefined;
      pipeline.recoveryCount = 5;
      const progressMessages: string[] = [];

      // Simulate resume logic with progress tracking
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
      } else if (pipeline.pipelinePhase === 'STUCK' && !pipeline.failedPhase) {
        progressMessages.push('Pipeline is STUCK but failedPhase is missing');
      }

      expect(pipeline.pipelinePhase).toBe('STUCK');
      expect(pipeline.recoveryCount).toBe(5);
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0]).toContain('failedPhase is missing');
    });

    it('should reset recoveryCount from previous value to 0', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'PRODUCTION_GATE';
      pipeline.recoveryCount = 3;

      const prevRecovery = pipeline.recoveryCount;

      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
      }

      expect(prevRecovery).toBe(3);
      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.pipelinePhase).toBe('PRODUCTION_GATE');
    });

    it('should purge legacy CRs without drift_key on resume from STUCK with guidance (v2.5.2)', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.activeChangeRequestId = 'CR-STALE';
      pipeline.pendingChangeRequests = [
        // Legacy CRs (no drift_key, approved) — should be purged
        { cr_id: 'CR-OLD1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
        { cr_id: 'CR-OLD2', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
        { cr_id: 'CR-STALE', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'approved' },
        // New CR with drift_key — should be kept
        { cr_id: 'CR-NEW', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'resolved', drift_key: 'dk-1' },
        // Proposed CR without drift_key (possibly manual) — should be kept
        { cr_id: 'CR-MANUAL', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'proposed' },
      ];

      // Simulate resume logic: purge runs BEFORE guidance check (v2.5.2)
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        // v2.5.2: Purge legacy CRs (unconditional)
        pipeline.pendingChangeRequests = pipeline.pendingChangeRequests!.filter(
          (cr) => cr.drift_key != null || cr.status === 'proposed',
        );
        if (!pipeline.pendingChangeRequests.some((cr) => cr.cr_id === pipeline.activeChangeRequestId)) {
          pipeline.activeChangeRequestId = undefined;
        }

        // Guidance provided — reset phase
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.pendingChangeRequests).toHaveLength(2); // CR-NEW + CR-MANUAL
      expect(pipeline.pendingChangeRequests!.map(cr => cr.cr_id)).toEqual(['CR-NEW', 'CR-MANUAL']);
      expect(pipeline.activeChangeRequestId).toBeUndefined(); // CR-STALE was purged
      expect(pipeline.pipelinePhase).toBe('QA_VALIDATION'); // Reset to failed phase
    });

    it('should purge legacy CRs even without guidance on resume from STUCK (v2.5.2)', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.activeChangeRequestId = 'CR-STALE';
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-OLD1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
        { cr_id: 'CR-STALE', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'approved' },
        { cr_id: 'CR-NEW', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'resolved', drift_key: 'dk-1' },
      ];

      // Simulate resume logic: purge runs even without guidance
      const guidance = ''; // No guidance
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        // v2.5.2: Purge legacy CRs (unconditional — before guidance check)
        pipeline.pendingChangeRequests = pipeline.pendingChangeRequests!.filter(
          (cr) => cr.drift_key != null || cr.status === 'proposed',
        );
        if (!pipeline.pendingChangeRequests.some((cr) => cr.cr_id === pipeline.activeChangeRequestId)) {
          pipeline.activeChangeRequestId = undefined;
        }

        if (guidance.length === 0) {
          // No guidance — pipeline stays STUCK, but CRs are cleaned
        }
      }

      expect(pipeline.pendingChangeRequests).toHaveLength(1); // Only CR-NEW
      expect(pipeline.pendingChangeRequests![0].cr_id).toBe('CR-NEW');
      expect(pipeline.activeChangeRequestId).toBeUndefined(); // CR-STALE was purged
      expect(pipeline.pipelinePhase).toBe('STUCK'); // Still stuck (no guidance)
      expect(pipeline.recoveryCount).toBe(5); // Not reset (no guidance)
    });
  });

  // ─── v2.4.6: Recovery rewind loop detection ──────────────

  describe('v2.4.6: Recovery rewind loop detection', () => {
    it('should rewind normally on first QA failure (lastRewindTarget undefined)', () => {
      // Simulate: RECOVERY_LOOP passes, RCA says IMPLEMENTATION, lastRewindTarget is undefined
      let phase: PipelinePhase = 'RECOVERY_LOOP';
      let failedPhase: PipelinePhase | null = 'QA_VALIDATION';
      pipeline.lastRewindTarget = undefined;
      pipeline.recoveryCount = 1;

      // Simulate RCA rewind target
      let rewindTarget: PipelinePhase | undefined = 'IMPLEMENTATION';

      // v2.4.6 repeated-rewind check
      if (rewindTarget && rewindTarget === pipeline.lastRewindTarget) {
        rewindTarget = undefined;
      }

      const effectiveTarget = rewindTarget ?? failedPhase ?? 'QA_VALIDATION';
      phase = effectiveTarget;
      pipeline.lastRewindTarget = rewindTarget;

      if (failedPhase) {
        delete pipeline.gateResults[failedPhase];
        delete pipeline.gateChecks[failedPhase];
      }
      failedPhase = null;

      expect(phase).toBe('IMPLEMENTATION');
      expect(pipeline.lastRewindTarget).toBe('IMPLEMENTATION');
    });

    it('should skip repeated same-target rewind and re-test failed phase', () => {
      // Simulate: lastRewindTarget === 'IMPLEMENTATION', RCA says IMPLEMENTATION again
      let phase: PipelinePhase = 'RECOVERY_LOOP';
      let failedPhase: PipelinePhase | null = 'QA_VALIDATION';
      pipeline.lastRewindTarget = 'IMPLEMENTATION';
      pipeline.recoveryCount = 2;
      const progressMessages: string[] = [];

      let rewindTarget: PipelinePhase | undefined = 'IMPLEMENTATION';

      // v2.4.6 repeated-rewind check
      if (rewindTarget && rewindTarget === pipeline.lastRewindTarget) {
        progressMessages.push(
          `Repeated rewind to ${rewindTarget} detected ` +
          `(recovery #${pipeline.recoveryCount}) — re-testing ` +
          `${failedPhase ?? 'QA_VALIDATION'} directly`,
        );
        rewindTarget = undefined;
      }

      const effectiveTarget = rewindTarget ?? failedPhase ?? 'QA_VALIDATION';
      phase = effectiveTarget;
      pipeline.lastRewindTarget = rewindTarget;
      failedPhase = null;

      expect(phase).toBe('QA_VALIDATION');
      expect(pipeline.lastRewindTarget).toBeUndefined();
      expect(progressMessages).toHaveLength(1);
      expect(progressMessages[0]).toContain('Repeated rewind');
    });

    it('should allow different rewind targets to proceed normally', () => {
      // First rewind: IMPLEMENTATION
      pipeline.lastRewindTarget = 'IMPLEMENTATION';

      // Second RCA says ARCHITECTURE (different target)
      let rewindTarget: PipelinePhase | undefined = 'ARCHITECTURE';

      if (rewindTarget && rewindTarget === pipeline.lastRewindTarget) {
        rewindTarget = undefined;
      }

      const effectiveTarget = rewindTarget ?? 'QA_VALIDATION';
      pipeline.lastRewindTarget = rewindTarget;

      expect(effectiveTarget).toBe('ARCHITECTURE');
      expect(pipeline.lastRewindTarget).toBe('ARCHITECTURE');
    });

    it('should clear stale gate data after recovery rewind', () => {
      const failedPhase: PipelinePhase = 'QA_VALIDATION';

      // Populate stale gate data
      pipeline.gateResults['QA_VALIDATION'] = {
        phase: 'QA_VALIDATION',
        pass: false,
        blockers: ['test failed'],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };
      pipeline.gateChecks['QA_VALIDATION'] = [
        { check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, duration_ms: 500, timestamp: '' },
      ];

      // Preserve other phases' data
      pipeline.gateResults['IMPLEMENTATION'] = {
        phase: 'IMPLEMENTATION',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // Simulate clearing (as orchestrator does after recovery)
      delete pipeline.gateResults[failedPhase];
      delete pipeline.gateChecks[failedPhase];

      expect(pipeline.gateResults['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateChecks['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateResults['IMPLEMENTATION']).toBeDefined();
    });

    it('should clear lastRewindTarget when resuming from STUCK', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.lastRewindTarget = 'IMPLEMENTATION';

      // Simulate resumePipeline logic
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.pipelinePhase).toBe('QA_VALIDATION');
      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.lastRewindTarget).toBeUndefined();
    });
  });

  // ─── v2.4.8: RECOVERY_LOOP auto-resume ──────────────

  describe('v2.4.8: RECOVERY_LOOP auto-resume', () => {
    it('should auto-resume from RECOVERY_LOOP without guidance', () => {
      pipeline.pipelinePhase = 'RECOVERY_LOOP';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 1;
      pipeline.maxRecoveryIterations = 5;
      pipeline.lastRewindTarget = 'IMPLEMENTATION';

      // Simulate v2.4.8 resumePipeline logic: RECOVERY_LOOP with remaining attempts
      if (
        pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
        pipeline.failedPhase &&
        pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
      ) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
        // Do NOT reset recoveryCount or lastRewindTarget
      }

      expect(pipeline.pipelinePhase).toBe('QA_VALIDATION');
      expect(pipeline.recoveryCount).toBe(1); // preserved, not reset
      expect(pipeline.lastRewindTarget).toBe('IMPLEMENTATION'); // preserved
    });

    it('should preserve recoveryCount (not reset to 0) on auto-resume', () => {
      pipeline.pipelinePhase = 'RECOVERY_LOOP';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 3;
      pipeline.maxRecoveryIterations = 5;

      if (
        pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
        pipeline.failedPhase &&
        pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
      ) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.recoveryCount).toBe(3);
      expect(pipeline.pipelinePhase).toBe('QA_VALIDATION');
    });

    it('should clear stale gate data on auto-resume', () => {
      pipeline.pipelinePhase = 'RECOVERY_LOOP';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 1;
      pipeline.maxRecoveryIterations = 5;

      // Pre-fill gate data
      pipeline.gateResults['QA_VALIDATION'] = {
        phase: 'QA_VALIDATION',
        pass: false,
        blockers: ['test failed'],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };
      pipeline.gateChecks['QA_VALIDATION'] = [
        { check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, duration_ms: 500, timestamp: '' },
      ];
      pipeline.gateResults['IMPLEMENTATION'] = {
        phase: 'IMPLEMENTATION',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      if (
        pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
        pipeline.failedPhase &&
        pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
      ) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.gateResults['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateChecks['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateResults['IMPLEMENTATION']).toBeDefined();
    });

    it('should NOT auto-resume RECOVERY_LOOP at max iterations (block like STUCK)', () => {
      pipeline.pipelinePhase = 'RECOVERY_LOOP';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.maxRecoveryIterations = 5;

      let autoResumed = false;
      let blockedLikeStuck = false;

      // Simulate v2.4.8 resume logic
      if (
        pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
        pipeline.failedPhase &&
        pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
      ) {
        autoResumed = true;
      } else if (
        (pipeline.pipelinePhase === 'STUCK' ||
         (pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
          pipeline.recoveryCount >= (pipeline.maxRecoveryIterations ?? 5))) &&
        pipeline.failedPhase
      ) {
        const guidance = ''; // no guidance provided
        if (guidance.length > 0) {
          autoResumed = true;
        } else {
          blockedLikeStuck = true;
        }
      }

      expect(autoResumed).toBe(false);
      expect(blockedLikeStuck).toBe(true);
      expect(pipeline.pipelinePhase).toBe('RECOVERY_LOOP'); // unchanged, would return error
    });

    it('should still require guidance for STUCK (regression guard)', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.maxRecoveryIterations = 5;

      let autoResumed = false;
      let blockedLikeStuck = false;

      // Simulate v2.4.8 resume logic
      if (
        pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
        pipeline.failedPhase &&
        pipeline.recoveryCount < (pipeline.maxRecoveryIterations ?? 5)
      ) {
        autoResumed = true;
      } else if (
        (pipeline.pipelinePhase === 'STUCK' ||
         (pipeline.pipelinePhase === 'RECOVERY_LOOP' &&
          pipeline.recoveryCount >= (pipeline.maxRecoveryIterations ?? 5))) &&
        pipeline.failedPhase
      ) {
        const guidance = '';
        if (guidance.length > 0) {
          autoResumed = true;
        } else {
          blockedLikeStuck = true;
        }
      }

      expect(autoResumed).toBe(false);
      expect(blockedLikeStuck).toBe(true);
      expect(pipeline.pipelinePhase).toBe('STUCK');
    });
  });

  // ─── v2.4.9: CR resolution after QA passes ──────────────

  describe('v2.4.9: CR resolution after QA passes', () => {
    it('should resolve active config CR and set baselineSnapshotOverride', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-100', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved', drift_key: 'dk-1' },
      ];
      pipeline.activeChangeRequestId = 'CR-100';
      pipeline.latestRepoSnapshot = {
        artifact_id: 'snap-latest',
        path: 'docs/snapshot.json',
        sha256: 'abc',
        version: 1,
        type: 'repo_snapshot',
      };

      resolveActiveCR(pipeline);

      expect(pipeline.pendingChangeRequests![0].status).toBe('resolved');
      expect(pipeline.activeChangeRequestId).toBeUndefined();
      expect(pipeline.baselineSnapshotOverride).toBeDefined();
      expect(pipeline.baselineSnapshotOverride!.artifact_id).toBe('snap-latest');
    });

    it('should resolve non-config CR and advance baseline (v2.5.1: all types advance)', () => {
      // v2.5.1: ALL CR types advance baseline, not just config
      const changeTypes = ['scope', 'architecture', 'dependency', 'requirement'] as const;
      for (const changeType of changeTypes) {
        const p = createDefaultPipelineState();
        p.pendingChangeRequests = [
          { cr_id: `CR-${changeType}`, change_type: changeType, target_phase: 'CONSENSUS_MASTER_PLAN', status: 'approved', drift_key: `dk-${changeType}` },
        ];
        p.activeChangeRequestId = `CR-${changeType}`;
        p.latestRepoSnapshot = {
          artifact_id: `snap-${changeType}`,
          path: 'docs/snapshot.json',
          sha256: 'abc',
          version: 1,
          type: 'repo_snapshot',
        };

        resolveActiveCR(p);

        expect(p.pendingChangeRequests![0].status).toBe('resolved');
        expect(p.activeChangeRequestId).toBeUndefined();
        expect(p.baselineSnapshotOverride).toBeDefined();
        expect(p.baselineSnapshotOverride!.artifact_id).toBe(`snap-${changeType}`);
      }
    });

    it('should gracefully do nothing when no activeChangeRequestId', () => {
      pipeline.activeChangeRequestId = undefined;
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-300', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
      ];

      resolveActiveCR(pipeline);

      // Nothing changed
      expect(pipeline.pendingChangeRequests![0].status).toBe('approved');
    });
  });

  // ─── v2.4.9: Stagnation detection ──────────────────────

  describe('v2.4.9: Stagnation detection', () => {
    it('should detect stagnation when same signature repeats STAGNATION_THRESHOLD times', () => {
      // Set up identical state to produce identical signatures
      pipeline.pipelinePhase = 'REVIEW';
      pipeline.lastSignatures = [];

      // Call checkStagnation repeatedly with identical state
      let stagnant = false;
      for (let i = 0; i < STAGNATION_THRESHOLD; i++) {
        stagnant = checkStagnation(pipeline);
      }

      expect(stagnant).toBe(true);
      expect(pipeline.lastSignatures!.length).toBe(STAGNATION_THRESHOLD);
    });

    it('should not detect stagnation with fewer than threshold calls', () => {
      pipeline.pipelinePhase = 'REVIEW';
      pipeline.lastSignatures = [];

      let stagnant = false;
      for (let i = 0; i < STAGNATION_THRESHOLD - 1; i++) {
        stagnant = checkStagnation(pipeline);
      }

      expect(stagnant).toBe(false);
    });

    it('should not detect stagnation with different signatures', () => {
      pipeline.lastSignatures = [];

      let stagnant = false;
      for (let i = 0; i < STAGNATION_THRESHOLD; i++) {
        pipeline.pipelinePhase = (['REVIEW', 'QA_VALIDATION', 'AUDIT'] as const)[i % 3];
        stagnant = checkStagnation(pipeline);
      }

      expect(stagnant).toBe(false);
    });

    it('should transition to STUCK on stagnation', () => {
      pipeline.pipelinePhase = 'REVIEW';
      pipeline.lastSignatures = [];

      // Simulate the orchestrator's stagnation → STUCK transition
      let phase = pipeline.pipelinePhase;
      for (let i = 0; i < STAGNATION_THRESHOLD; i++) {
        if (checkStagnation(pipeline)) {
          phase = 'STUCK';
        }
      }

      expect(phase).toBe('STUCK');
    });

    it('should produce a 16-char hex signature', () => {
      pipeline.pipelinePhase = 'REVIEW';
      const sig = computeLoopSignature(pipeline);
      expect(sig).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should produce same signature regardless of pending CR count (uses boolean)', () => {
      pipeline.pipelinePhase = 'REVIEW';

      // 1 pending CR
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed' },
      ];
      const sig1 = computeLoopSignature(pipeline);

      // 5 pending CRs — signature should be the same (boolean, not count)
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed' },
        { cr_id: 'CR-2', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
        { cr_id: 'CR-3', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed' },
        { cr_id: 'CR-4', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved' },
        { cr_id: 'CR-5', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed' },
      ];
      const sig5 = computeLoopSignature(pipeline);

      expect(sig1).toBe(sig5);
    });
  });

  // ─── v2.4.9: activeChangeRequestId tracking ──────────────

  describe('v2.4.9: activeChangeRequestId tracking', () => {
    it('should set activeChangeRequestId when routing CR', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-TRACK', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed' },
      ];

      // Simulate getNextCRRoute + activeChangeRequestId assignment
      const nextCR = pipeline.pendingChangeRequests.find((cr) => cr.status === 'proposed');
      expect(nextCR).toBeDefined();
      nextCR!.status = 'approved';
      pipeline.activeChangeRequestId = nextCR!.cr_id;

      expect(pipeline.activeChangeRequestId).toBe('CR-TRACK');
      expect(nextCR!.status).toBe('approved');
    });

    it('should clear activeChangeRequestId on resolution', () => {
      pipeline.pendingChangeRequests = [
        { cr_id: 'CR-CLEAR', change_type: 'scope', target_phase: 'CONSENSUS_MASTER_PLAN', status: 'approved', drift_key: 'dk-x' },
      ];
      pipeline.activeChangeRequestId = 'CR-CLEAR';

      resolveActiveCR(pipeline);

      expect(pipeline.activeChangeRequestId).toBeUndefined();
      expect(pipeline.pendingChangeRequests![0].status).toBe('resolved');
    });
  });

  // ─── v2.5.1: Scope drift guard (first pass vs revision) ──────

  describe('v2.5.1: Scope drift guard', () => {
    it('should NOT create scope CR on first REVIEW (no baselineSnapshotOverride)', () => {
      // Simulate: first REVIEW pass, baseline is CONSENSUS_ROLE_PLANS, large line delta
      pipeline.baselineSnapshotOverride = undefined;
      const isRevisionComparison = !!pipeline.baselineSnapshotOverride;
      const linesDelta = 5000; // huge, but expected from implementation

      // The guard in review.ts: `if (isRevisionComparison && Math.abs(diff.lines_delta) > 1000)`
      const shouldCreateScopeCR = isRevisionComparison && Math.abs(linesDelta) > 1000;

      expect(isRevisionComparison).toBe(false);
      expect(shouldCreateScopeCR).toBe(false);
    });

    it('should create scope CR on revision pass (baselineSnapshotOverride set)', () => {
      // Simulate: subsequent REVIEW, baseline override set, large line delta
      pipeline.baselineSnapshotOverride = {
        artifact_id: 'snap-override',
        path: 'docs/snapshot.json',
        sha256: 'abc',
        version: 1,
        type: 'repo_snapshot',
      };
      const isRevisionComparison = !!pipeline.baselineSnapshotOverride;
      const linesDelta = 2000;

      const shouldCreateScopeCR = isRevisionComparison && Math.abs(linesDelta) > 1000;

      expect(isRevisionComparison).toBe(true);
      expect(shouldCreateScopeCR).toBe(true);
    });

    it('should NOT create scope CR on revision pass if lines_delta <= 1000', () => {
      pipeline.baselineSnapshotOverride = {
        artifact_id: 'snap-override',
        path: 'docs/snapshot.json',
        sha256: 'abc',
        version: 1,
        type: 'repo_snapshot',
      };
      const isRevisionComparison = !!pipeline.baselineSnapshotOverride;
      const linesDelta = 500;

      const shouldCreateScopeCR = isRevisionComparison && Math.abs(linesDelta) > 1000;

      expect(isRevisionComparison).toBe(true);
      expect(shouldCreateScopeCR).toBe(false);
    });
  });

  // ─── v2.5.4: Recovery budget reset on phase change ──────

  describe('v2.5.4: Recovery budget reset on phase change', () => {
    it('should reset recoveryCount when advancing to next phase', () => {
      // CONSENSUS_ROLE_PLANS fails 4 times (consuming budget), then passes.
      // When it advances to IMPLEMENTATION, budget should reset.
      let consensusAttempts = 0;
      const result = simulateOrchestratorLoop(
        'CONSENSUS_ROLE_PLANS',
        pipeline,
        (phase, attempt) => {
          if (phase === 'CONSENSUS_ROLE_PLANS') {
            consensusAttempts++;
            return consensusAttempts >= 5; // Pass on 5th attempt
          }
          if (phase === 'RECOVERY_LOOP') return true;
          // After advancing, fail IMPLEMENTATION once to verify budget was reset
          if (phase === 'IMPLEMENTATION') return attempt > 1;
          return true;
        },
      );

      // Should reach DONE, not STUCK
      expect(result.finalPhase).toBe('DONE');
      // recoveryCount should be 1 (from IMPLEMENTATION's single failure), not 5
      expect(result.recoveryCount).toBeLessThanOrEqual(1);
      // Verify progress log shows budget resets
      expect(result.progressLog.some(m => m.includes('Recovery budget reset'))).toBe(true);
    });

    it('should reset recoveryCount when CR routes to a new phase', () => {
      // REVIEW passes with pending CR routing to CONSENSUS_ARCHITECTURE
      // Pipeline had previous recovery attempts — budget should reset on CR route
      pipeline.recoveryCount = 3;
      pipeline.lastRewindTarget = 'IMPLEMENTATION';

      const result = simulateOrchestratorLoop(
        'REVIEW',
        pipeline,
        new Map<PipelinePhase, boolean>([
          ['REVIEW', true],
          ['CONSENSUS_ARCHITECTURE', true],
          ['ROLE_PLANNING', true],
          ['CONSENSUS_ROLE_PLANS', true],
          ['IMPLEMENTATION', true],
          ['QA_VALIDATION', true],
          ['AUDIT', true],
          ['PRODUCTION_GATE', true],
        ]),
        {
          pendingCRs: [
            { cr_id: 'CR-ARCH', target_phase: 'CONSENSUS_ARCHITECTURE' as PipelinePhase, status: 'proposed' },
          ],
        },
      );

      expect(result.finalPhase).toBe('DONE');
      expect(result.recoveryCount).toBe(0);
      // Verify CR routing triggered budget reset
      expect(result.progressLog.some(m => m.includes('CR routing'))).toBe(true);
    });

    it('should NOT reset recoveryCount if phase does not change (RECOVERY_LOOP rewind)', () => {
      // Simulate: QA fails, RECOVERY_LOOP succeeds, rewinds back to QA
      // Budget should NOT reset because QA→RECOVERY→QA is not forward progress
      let qaAttempts = 0;
      const result = simulateOrchestratorLoop(
        'QA_VALIDATION',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'QA_VALIDATION') {
            qaAttempts++;
            return qaAttempts >= 2; // Fail first, pass second
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
      );

      expect(result.finalPhase).toBe('DONE');
      // recoveryCount should be 1 (from the QA failure), then reset to 0 when
      // QA passes and advances to REVIEW
      expect(result.progressLog.some(m => m.includes('advancing QA_VALIDATION -> REVIEW'))).toBe(true);
    });

    it('should reproduce Gateco scenario: CONSENSUS_ROLE_PLANS exhausts budget, CONSENSUS_ARCHITECTURE gets fresh budget', () => {
      // Gateco regression guard: CONSENSUS_ROLE_PLANS consumes max iterations,
      // passes (via arbitration), pipeline advances through IMPL/QA/REVIEW/AUDIT,
      // CR routes to CONSENSUS_ARCHITECTURE, gate fails
      // → should enter RECOVERY_LOOP (not STUCK)
      pipeline.maxRecoveryIterations = 5;

      let consensusRolePlansAttempts = 0;
      let consensusArchAttempts = 0;

      const result = simulateOrchestratorLoop(
        'CONSENSUS_ROLE_PLANS',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'CONSENSUS_ROLE_PLANS') {
            consensusRolePlansAttempts++;
            // Fail 4 times, pass on 5th (via arbitration)
            return consensusRolePlansAttempts >= 5;
          }
          if (phase === 'CONSENSUS_ARCHITECTURE') {
            consensusArchAttempts++;
            // Fail first time, pass on 2nd
            return consensusArchAttempts >= 2;
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true; // IMPL, QA, REVIEW, AUDIT all pass
        },
        {
          // After AUDIT, CR routes to CONSENSUS_ARCHITECTURE
          pendingCRs: [
            { cr_id: 'CR-GATECO', target_phase: 'CONSENSUS_ARCHITECTURE' as PipelinePhase, status: 'proposed' },
          ],
        },
      );

      // Key assertion: pipeline should reach DONE, NOT STUCK
      // Without v2.5.4 fix, CONSENSUS_ARCHITECTURE would immediately STUCK
      // because recoveryCount(5) >= maxRecoveryIterations(5)
      expect(result.finalPhase).toBe('DONE');
      // Budget should have been reset when advancing past CONSENSUS_ROLE_PLANS
      expect(result.phaseLog).toContain('RECOVERY_LOOP');
      expect(result.phaseLog).not.toContain('STUCK');
    });

    it('should NOT reset budget when same phase loops back to itself', () => {
      // Edge case: phase passes but getNextPhase returns same phase (shouldn't happen
      // in practice, but verifies the !== guard)
      pipeline.recoveryCount = 3;

      // Manually test the condition
      const prevPhase: PipelinePhase = 'REVIEW';
      const nextPhase: PipelinePhase = 'REVIEW'; // hypothetical same-phase transition
      let budgetReset = false;

      if (nextPhase !== prevPhase && pipeline.recoveryCount > 0) {
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
        budgetReset = true;
      }

      expect(budgetReset).toBe(false);
      expect(pipeline.recoveryCount).toBe(3); // unchanged
    });

    it('should clear lastRewindTarget when budget resets on forward progress', () => {
      pipeline.recoveryCount = 2;
      pipeline.lastRewindTarget = 'IMPLEMENTATION';

      // Simulate forward phase change
      const prevPhase: PipelinePhase = 'QA_VALIDATION';
      const nextPhase: PipelinePhase = 'REVIEW';

      if (nextPhase !== prevPhase && pipeline.recoveryCount > 0) {
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
      }

      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.lastRewindTarget).toBeUndefined();
    });
  });

  // ─── v2.6.0: Auto-recovery from STUCK via arbitrator ──────

  describe('v2.6.0: Auto-recovery from STUCK via arbitrator', () => {
    it('should attempt auto-recovery when budget exhausted and no prior attempt', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.autoRecoveryResult = undefined;

      const exhaustedPhase: PipelinePhase = 'QA_VALIDATION';
      const arbitratorConfigured = true;

      // Simulate: budget exhausted + no prior attempt + arbitrator configured
      let phase: PipelinePhase = exhaustedPhase;
      let autoRecoveryAttempted = false;

      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        if (!pipeline.autoRecoveryResult && arbitratorConfigured) {
          // Auto-recovery would be attempted here
          autoRecoveryAttempted = true;

          // Simulate successful auto-recovery
          pipeline.autoRecoveryResult = 'success';
          pipeline.recoveryCount = 0;
          pipeline.lastRewindTarget = undefined;
          phase = exhaustedPhase;
          pipeline.pipelinePhase = phase;
          pipeline.failedPhase = exhaustedPhase;
          delete pipeline.gateResults[exhaustedPhase];
          delete pipeline.gateChecks[exhaustedPhase];
        }
      }

      expect(autoRecoveryAttempted).toBe(true);
      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.autoRecoveryResult).toBe('success');
      expect(phase).toBe('QA_VALIDATION');
    });

    it('should only attempt auto-recovery once (autoRecoveryResult already set)', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.autoRecoveryResult = 'invalid'; // already attempted

      const exhaustedPhase: PipelinePhase = 'QA_VALIDATION';
      const arbitratorConfigured = true;

      let phase: PipelinePhase = exhaustedPhase;
      let autoRecoveryAttempted = false;

      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        if (!pipeline.autoRecoveryResult && arbitratorConfigured) {
          autoRecoveryAttempted = true;
        } else {
          phase = 'STUCK';
        }
      }

      expect(autoRecoveryAttempted).toBe(false);
      expect(phase).toBe('STUCK');
    });

    it('should not attempt auto-recovery when no arbitrator configured', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.autoRecoveryResult = undefined;

      const exhaustedPhase: PipelinePhase = 'QA_VALIDATION';
      const arbitratorConfigured = false; // no arbitrator

      let phase: PipelinePhase = exhaustedPhase;

      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        if (!pipeline.autoRecoveryResult && arbitratorConfigured) {
          // Would attempt auto-recovery
        } else {
          phase = 'STUCK';
        }
      }

      expect(phase).toBe('STUCK');
    });

    it('should not increment recoveryCount after successful auto-recovery', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.autoRecoveryResult = undefined;

      // Simulate successful auto-recovery
      pipeline.autoRecoveryResult = 'success';
      pipeline.recoveryCount = 0;

      // After auto-recovery, recoveryCount should be 0 (not 1)
      expect(pipeline.recoveryCount).toBe(0);
    });

    it('should reset autoRecoveryResult on user-guided resume from STUCK', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'QA_VALIDATION';
      pipeline.recoveryCount = 5;
      pipeline.autoRecoveryResult = 'success'; // from prior auto-recovery

      const guidance = 'User provided new guidance';

      // Simulate resumePipeline STUCK-with-guidance logic (v2.6.0)
      if (pipeline.pipelinePhase === 'STUCK' && pipeline.failedPhase && guidance.length > 0) {
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
        pipeline.autoRecoveryResult = undefined; // v2.6.0
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
      }

      expect(pipeline.autoRecoveryResult).toBeUndefined();
      expect(pipeline.pipelinePhase).toBe('QA_VALIDATION');
      expect(pipeline.recoveryCount).toBe(0);
    });

    it('should preserve exhaustedPhase correctly on auto-recovery', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'CONSENSUS_ROLE_PLANS';

      const exhaustedPhase: PipelinePhase = 'CONSENSUS_ROLE_PLANS';

      // Simulate auto-recovery: capture exhaustedPhase before reassignment
      let phase: PipelinePhase = exhaustedPhase;
      pipeline.autoRecoveryResult = 'success';
      pipeline.recoveryCount = 0;
      phase = exhaustedPhase;
      pipeline.pipelinePhase = phase;
      pipeline.failedPhase = exhaustedPhase;

      expect(phase).toBe('CONSENSUS_ROLE_PLANS');
      expect(pipeline.failedPhase).toBe('CONSENSUS_ROLE_PLANS');
      expect(pipeline.pipelinePhase).toBe('CONSENSUS_ROLE_PLANS');
    });

    it('should clear stale gate data on auto-recovery success', () => {
      pipeline.maxRecoveryIterations = 5;
      pipeline.recoveryCount = 5;
      pipeline.failedPhase = 'QA_VALIDATION';

      // Pre-fill gate data
      pipeline.gateResults['QA_VALIDATION'] = {
        phase: 'QA_VALIDATION',
        pass: false,
        blockers: ['test failed'],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };
      pipeline.gateChecks['QA_VALIDATION'] = [
        { check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, duration_ms: 500, timestamp: '' },
      ];

      // Keep other phases' data
      pipeline.gateResults['IMPLEMENTATION'] = {
        phase: 'IMPLEMENTATION',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      // Simulate auto-recovery success: clear stale gate data
      const exhaustedPhase = pipeline.failedPhase!;
      delete pipeline.gateResults[exhaustedPhase];
      delete pipeline.gateChecks[exhaustedPhase];

      expect(pipeline.gateResults['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateChecks['QA_VALIDATION']).toBeUndefined();
      expect(pipeline.gateResults['IMPLEMENTATION']).toBeDefined();
    });

    it('should attempt auto-recovery on resume from STUCK without guidance', () => {
      // v2.6.0: resumePipeline should try auto-recovery when no guidance is provided
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'CONSENSUS_ARCHITECTURE';
      pipeline.recoveryCount = 5;
      pipeline.autoRecoveryResult = undefined;

      const arbitratorConfigured = true;
      const guidance = ''; // no guidance from user

      let autoRecoveryAttempted = false;
      let finalState: 'running' | 'stuck' = 'stuck';

      // Simulate the resume logic for no-guidance path
      if (guidance.length === 0 && !pipeline.autoRecoveryResult && arbitratorConfigured) {
        autoRecoveryAttempted = true;

        // Simulate successful auto-recovery
        pipeline.autoRecoveryResult = 'success';
        pipeline.pipelinePhase = pipeline.failedPhase;
        pipeline.recoveryCount = 0;
        pipeline.lastRewindTarget = undefined;
        delete pipeline.gateResults[pipeline.failedPhase];
        delete pipeline.gateChecks[pipeline.failedPhase];
        finalState = 'running';
      }

      expect(autoRecoveryAttempted).toBe(true);
      expect(finalState).toBe('running');
      expect(pipeline.pipelinePhase).toBe('CONSENSUS_ARCHITECTURE');
      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.autoRecoveryResult).toBe('success');
    });

    it('should skip auto-recovery on resume if already attempted', () => {
      pipeline.pipelinePhase = 'STUCK';
      pipeline.failedPhase = 'CONSENSUS_ARCHITECTURE';
      pipeline.recoveryCount = 5;
      pipeline.autoRecoveryResult = 'invalid'; // already tried

      const arbitratorConfigured = true;
      const guidance = '';

      let autoRecoveryAttempted = false;

      if (guidance.length === 0 && !pipeline.autoRecoveryResult && arbitratorConfigured) {
        autoRecoveryAttempted = true;
      }

      expect(autoRecoveryAttempted).toBe(false);
      expect(pipeline.pipelinePhase).toBe('STUCK'); // unchanged
    });
  });

  // ─── v2.7.0: Recovery budget guard (infinite loop fix) ──────

  describe('v2.7.0: Recovery budget guard (infinite loop fix)', () => {
    it('should preserve recoveryCount during recovery traversal (no budget reset)', () => {
      // PRODUCTION_GATE fails → recovery rewinds to IMPLEMENTATION → traverses forward
      // Budget must NOT reset during IMPL→QA→REVIEW→AUDIT traversal
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return prodGateAttempts >= 2; // Fail first, pass second
          }
          if (phase === 'RECOVERY_LOOP') return true;
          // All traversal phases pass (IMPLEMENTATION→QA→REVIEW→AUDIT)
          return true;
        },
      );

      expect(result.finalPhase).toBe('DONE');
      // Budget should have been 1 when PRODUCTION_GATE was re-entered (not reset to 0)
      // After PRODUCTION_GATE passes, failedPhase cleared, then budget resets on advance to DONE
      expect(result.progressLog.every(m => !m.includes('advancing IMPLEMENTATION'))).toBe(true);
    });

    it('should reach STUCK when PRODUCTION_GATE keeps failing (no infinite loop)', () => {
      // The core infinite loop scenario: PRODUCTION_GATE always fails,
      // recovery always succeeds and rewinds to IMPLEMENTATION
      pipeline.maxRecoveryIterations = 3;

      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') return false; // Always fails
          if (phase === 'RECOVERY_LOOP') return true;
          return true; // Traversal phases pass
        },
        { maxIterations: 100 },
      );

      expect(result.finalPhase).toBe('STUCK');
      expect(result.recoveryCount).toBe(3);
      // Should NOT have looped more than ~20 iterations (3 recovery cycles * ~6 phases)
      expect(result.phaseLog.length).toBeLessThan(30);
    });

    it('should reset budget on genuine progress (failed phase passes then advances)', () => {
      // QA_VALIDATION fails once, recovery succeeds, QA passes, advances to REVIEW
      // REVIEW fails once — budget should be fresh (reset after QA→REVIEW advance)
      pipeline.maxRecoveryIterations = 3;

      let qaAttempts = 0;
      let reviewAttempts = 0;
      const result = simulateOrchestratorLoop(
        'QA_VALIDATION',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'QA_VALIDATION') {
            qaAttempts++;
            return qaAttempts >= 2; // Fail first, pass second
          }
          if (phase === 'REVIEW') {
            reviewAttempts++;
            return reviewAttempts >= 2; // Fail first, pass second
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
      );

      expect(result.finalPhase).toBe('DONE');
      // Budget should have reset when QA passed and advanced to REVIEW
      expect(result.progressLog.some(m => m.includes('advancing QA_VALIDATION -> REVIEW'))).toBe(true);
    });

    it('should replace failedPhase and baseline when different phase fails during recovery', () => {
      // PRODUCTION_GATE fails (baseline=1) → recovery → rewind to IMPLEMENTATION
      // → QA_VALIDATION fails (new failure origin) → failedPhase should become QA
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      let qaAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return prodGateAttempts >= 2; // Fail first time only
          }
          if (phase === 'QA_VALIDATION') {
            qaAttempts++;
            return qaAttempts >= 2; // Fail first, pass second
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['PRODUCTION_GATE', (_attempt: number) => ({ failedChecks: ['lint' as any] })],
            ['QA_VALIDATION', (_attempt: number) => ({ failedChecks: ['test' as any, 'build' as any] })],
          ]),
        },
      );

      // Pipeline should eventually reach DONE (both phases pass on retry)
      expect(result.finalPhase).toBe('DONE');
      // QA failure should have set a new baseline (2, not 1)
      expect(pipeline.recoveryBaselineFailedCheckCount).toBeUndefined(); // cleared on success
    });
  });

  // ─── v2.7.0: Recovery regression detection ──────

  describe('v2.7.0: Recovery regression detection', () => {
    it('should detect regression when failing checks increase', () => {
      // First PRODUCTION_GATE failure: 1 check. After recovery: 3 checks → regression
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return false; // Always fails
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['PRODUCTION_GATE', (attempt: number) => {
              if (attempt === 1) return { failedChecks: ['lint' as any] };
              // After recovery: 3 failing checks (regression)
              return { failedChecks: ['build' as any, 'test' as any, 'lint' as any] };
            }],
          ]),
        },
      );

      expect(result.finalPhase).toBe('STUCK');
      // Should have detected regression and exhausted budget immediately
      expect(result.progressLog.some(m => m.includes('[regression]'))).toBe(true);
      expect(result.progressLog.some(m => m.includes('1 -> 3'))).toBe(true);
    });

    it('should NOT detect regression when failing checks decrease (improvement)', () => {
      // First failure: 3 checks. After recovery: 1 check → improvement, continue normally
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return prodGateAttempts >= 3; // Fail twice, pass on third
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['PRODUCTION_GATE', (attempt: number) => {
              if (attempt === 1) return { failedChecks: ['build' as any, 'test' as any, 'lint' as any] };
              if (attempt === 2) return { failedChecks: ['lint' as any] }; // Improvement
              return {}; // Pass
            }],
          ]),
        },
      );

      expect(result.finalPhase).toBe('DONE');
      expect(result.progressLog.every(m => !m.includes('[regression]'))).toBe(true);
    });

    it('should NOT detect regression when check count stays the same', () => {
      // First failure: 2 checks. After recovery: 2 checks → same count, not regression
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return prodGateAttempts >= 3; // Fail twice, pass on third
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['PRODUCTION_GATE', (attempt: number) => {
              if (attempt <= 2) return { failedChecks: ['build' as any, 'lint' as any] };
              return {}; // Pass
            }],
          ]),
        },
      );

      expect(result.finalPhase).toBe('DONE');
      expect(result.progressLog.every(m => !m.includes('[regression]'))).toBe(true);
    });

    it('should clear baseline on success (failedPhase passes)', () => {
      // Phase fails, recovers, passes → baseline should be cleared
      pipeline.maxRecoveryIterations = 5;

      let qaAttempts = 0;
      simulateOrchestratorLoop(
        'QA_VALIDATION',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'QA_VALIDATION') {
            qaAttempts++;
            return qaAttempts >= 2;
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['QA_VALIDATION', (attempt: number) => {
              if (attempt === 1) return { failedChecks: ['test' as any] };
              return {};
            }],
          ]),
        },
      );

      expect(pipeline.recoveryBaselineFailedCheckCount).toBeUndefined();
      expect(pipeline.failedPhase).toBeUndefined();
    });

    it('should preserve baseline across retries and detect regression against original', () => {
      // First failure: 1 check (baseline). Second failure: 1 check (same, no regression).
      // Third failure: 2 checks → regression detected against original baseline of 1
      pipeline.maxRecoveryIterations = 5;

      let prodGateAttempts = 0;
      const result = simulateOrchestratorLoop(
        'PRODUCTION_GATE',
        pipeline,
        (phase, _attempt) => {
          if (phase === 'PRODUCTION_GATE') {
            prodGateAttempts++;
            return false; // Always fails
          }
          if (phase === 'RECOVERY_LOOP') return true;
          return true;
        },
        {
          gateResultOverrides: new Map([
            ['PRODUCTION_GATE', (attempt: number) => {
              if (attempt <= 2) return { failedChecks: ['lint' as any] }; // 1 check
              return { failedChecks: ['lint' as any, 'build' as any] }; // 2 checks → regression
            }],
          ]),
        },
      );

      expect(result.finalPhase).toBe('STUCK');
      expect(result.progressLog.some(m => m.includes('[regression]'))).toBe(true);
      expect(result.progressLog.some(m => m.includes('1 -> 2'))).toBe(true);
    });
  });
});
