/**
 * Gate Engine tests — all transition rules, gate definitions, edge cases.
 */

import { describe, it, expect } from 'vitest';
import { createGateEngine } from '../../src/pipeline/gate-engine.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelinePhase, PipelineState, ArtifactEntry } from '../../src/pipeline/types.js';

function makeArtifact(type: string, phase: string): ArtifactEntry {
  return {
    id: `test-${type}-${phase}`,
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

describe('GateEngine', () => {
  const engine = createGateEngine();

  describe('getGateDefinition', () => {
    it('should return definitions for all 14 phases', () => {
      const phases: PipelinePhase[] = [
        'INTAKE', 'CONSENSUS_MASTER_PLAN', 'ARCHITECTURE',
        'CONSENSUS_ARCHITECTURE', 'ROLE_PLANNING', 'CONSENSUS_ROLE_PLANS',
        'IMPLEMENTATION', 'QA_VALIDATION', 'REVIEW', 'AUDIT',
        'PRODUCTION_GATE', 'RECOVERY_LOOP', 'DONE', 'STUCK',
      ];

      for (const phase of phases) {
        const def = engine.getGateDefinition(phase);
        expect(def).toBeDefined();
        expect(def.phase).toBe(phase);
        expect(def.failTransition).toBeDefined();
      }
    });

    it('should require master_plan and repo_snapshot for INTAKE', () => {
      const def = engine.getGateDefinition('INTAKE');
      expect(def.requiredArtifacts).toContain('master_plan');
      expect(def.requiredArtifacts).toContain('repo_snapshot');
      expect(def.allowedTransitions).toEqual(['CONSENSUS_MASTER_PLAN']);
    });

    it('should require consensus threshold for consensus phases', () => {
      const consensusPhases: PipelinePhase[] = [
        'CONSENSUS_MASTER_PLAN', 'CONSENSUS_ARCHITECTURE', 'CONSENSUS_ROLE_PLANS',
      ];
      for (const phase of consensusPhases) {
        const def = engine.getGateDefinition(phase);
        expect(def.consensusThreshold).toBe(0.95);
        expect(def.minReviewers).toBe(2);
      }
    });

    it('should require build/test/lint/typecheck for PRODUCTION_GATE', () => {
      const def = engine.getGateDefinition('PRODUCTION_GATE');
      expect(def.requiredChecks).toContain('build');
      expect(def.requiredChecks).toContain('test');
      expect(def.requiredChecks).toContain('lint');
      expect(def.requiredChecks).toContain('typecheck');
    });

    it('should have terminal DONE and STUCK phases', () => {
      expect(engine.getGateDefinition('DONE').allowedTransitions).toEqual([]);
      expect(engine.getGateDefinition('STUCK').allowedTransitions).toEqual([]);
    });
  });

  describe('evaluateGate', () => {
    it('should fail when required artifacts are missing', () => {
      const pipeline = createDefaultPipelineState();
      const result = engine.evaluateGate('INTAKE', pipeline);

      expect(result.pass).toBe(false);
      expect(result.missingArtifacts).toContain('master_plan');
      expect(result.missingArtifacts).toContain('repo_snapshot');
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('should pass when all required artifacts exist', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      const result = engine.evaluateGate('INTAKE', pipeline);
      expect(result.pass).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('should check gate check results for QA_VALIDATION', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.artifacts.push(makeArtifact('qa_validation', 'QA_VALIDATION'));
      // No test check result
      const result = engine.evaluateGate('QA_VALIDATION', pipeline);
      expect(result.pass).toBe(false);
      expect(result.failedChecks).toContain('test');
    });

    it('should pass QA when test check passes', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.artifacts.push(makeArtifact('qa_validation', 'QA_VALIDATION'));
      pipeline.gateChecks['QA_VALIDATION'] = [{
        check_type: 'test',
        status: 'pass',
        command: 'npm test',
        exit_code: 0,
        duration_ms: 1000,
        timestamp: new Date().toISOString(),
      }];

      const result = engine.evaluateGate('QA_VALIDATION', pipeline);
      expect(result.pass).toBe(true);
    });

    it('should fail when check result status is fail', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.artifacts.push(makeArtifact('qa_validation', 'QA_VALIDATION'));
      pipeline.gateChecks['QA_VALIDATION'] = [{
        check_type: 'test',
        status: 'fail',
        command: 'npm test',
        exit_code: 1,
        duration_ms: 500,
        timestamp: new Date().toISOString(),
      }];

      const result = engine.evaluateGate('QA_VALIDATION', pipeline);
      expect(result.pass).toBe(false);
      expect(result.failedChecks).toContain('test');
    });
  });

  describe('getNextPhase', () => {
    it('should follow the linear sequence', () => {
      const passResult = {
        phase: 'INTAKE' as PipelinePhase,
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      };

      expect(engine.getNextPhase('INTAKE', passResult)).toBe('CONSENSUS_MASTER_PLAN');
      expect(engine.getNextPhase('CONSENSUS_MASTER_PLAN', passResult)).toBe('ARCHITECTURE');
      expect(engine.getNextPhase('ARCHITECTURE', passResult)).toBe('CONSENSUS_ARCHITECTURE');
      expect(engine.getNextPhase('PRODUCTION_GATE', passResult)).toBe('DONE');
    });
  });

  describe('canTransition', () => {
    it('should allow valid transitions when gate passes', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.artifacts.push(makeArtifact('master_plan', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('repo_snapshot', 'INTAKE'));
      pipeline.artifacts.push(makeArtifact('constitution', 'INTAKE'));

      const result = engine.canTransition('INTAKE', 'CONSENSUS_MASTER_PLAN', pipeline);
      expect(result.allowed).toBe(true);
    });

    it('should reject invalid transitions', () => {
      const pipeline = createDefaultPipelineState();
      const result = engine.canTransition('INTAKE', 'PRODUCTION_GATE', pipeline);
      expect(result.allowed).toBe(false);
      expect(result.blockers.some((b) => b.includes('not allowed'))).toBe(true);
    });
  });

  describe('getPhaseSequence', () => {
    it('should return ordered phases ending with DONE', () => {
      const seq = engine.getPhaseSequence();
      expect(seq[0]).toBe('INTAKE');
      expect(seq[seq.length - 1]).toBe('DONE');
      expect(seq.length).toBe(12); // 12 phases in linear sequence
    });
  });

  describe('getPhaseIndex', () => {
    it('should return correct indices', () => {
      expect(engine.getPhaseIndex('INTAKE')).toBe(0);
      expect(engine.getPhaseIndex('DONE')).toBe(11);
      expect(engine.getPhaseIndex('RECOVERY_LOOP')).toBe(-1); // Not in linear sequence
    });
  });
});
