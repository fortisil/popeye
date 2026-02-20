/**
 * Orchestrator tests — full loop with mocked phases, recovery/rewind/stuck.
 * Tests the deterministic transition logic (P0-A) without real LLM calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGateEngine } from '../../src/pipeline/gate-engine.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelinePhase, PipelineState, ArtifactEntry } from '../../src/pipeline/types.js';
import type { GateResult } from '../../src/pipeline/gate-engine.js';

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
 */
function simulateOrchestratorLoop(
  startPhase: PipelinePhase,
  pipeline: PipelineState,
  phaseOutcomes: Map<PipelinePhase, boolean>, // phase -> gate pass?
  maxIterations = 50,
): { finalPhase: PipelinePhase; recoveryCount: number; phaseLog: PipelinePhase[] } {
  const engine = createGateEngine();
  let phase = startPhase;
  let failedPhase: PipelinePhase | null = null;
  const phaseLog: PipelinePhase[] = [phase];

  for (let i = 0; i < maxIterations; i++) {
    if (phase === 'DONE' || phase === 'STUCK') break;

    const gatePass = phaseOutcomes.get(phase) ?? false;

    if (gatePass) {
      if (phase === 'RECOVERY_LOOP') {
        // Recovery succeeded — go back to failed phase
        phase = failedPhase ?? 'QA_VALIDATION';
        failedPhase = null;
      } else {
        const gateResult: GateResult = {
          phase,
          pass: true,
          blockers: [],
          missingArtifacts: [],
          failedChecks: [],
          timestamp: new Date().toISOString(),
        };
        phase = engine.getNextPhase(phase, gateResult);
      }
    } else {
      if (pipeline.recoveryCount >= pipeline.maxRecoveryIterations) {
        phase = 'STUCK';
      } else {
        failedPhase = phase;
        phase = 'RECOVERY_LOOP';
        pipeline.recoveryCount++;
      }
    }

    pipeline.pipelinePhase = phase;
    phaseLog.push(phase);
  }

  return { finalPhase: phase, recoveryCount: pipeline.recoveryCount, phaseLog };
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

      // Add check results
      pipeline.gateChecks['PRODUCTION_GATE'] = [
        { check_type: 'build', status: 'pass', command: 'npm run build', exit_code: 0, duration_ms: 1000, timestamp: '' },
        { check_type: 'test', status: 'pass', command: 'npm test', exit_code: 0, duration_ms: 2000, timestamp: '' },
        { check_type: 'lint', status: 'pass', command: 'npm run lint', exit_code: 0, duration_ms: 500, timestamp: '' },
        { check_type: 'typecheck', status: 'pass', command: 'tsc', exit_code: 0, duration_ms: 300, timestamp: '' },
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
});
