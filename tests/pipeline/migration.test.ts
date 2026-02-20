/**
 * Migration tests — phase mapping, defaults, role derivation.
 */

import { describe, it, expect } from 'vitest';
import {
  toPipelinePhase,
  toLegacyPhase,
  migrateToPipelineState,
  needsPipelineMigration,
} from '../../src/pipeline/migration.js';
import type { ProjectState } from '../../src/types/workflow.js';

function makeMinimalState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    idea: 'test idea',
    language: 'typescript',
    phase: 'plan',
    projectDir: '/tmp/test',
    timestamp: new Date().toISOString(),
    ...overrides,
  } as ProjectState;
}

describe('Migration', () => {
  describe('toPipelinePhase', () => {
    it('should map plan to INTAKE', () => {
      expect(toPipelinePhase('plan')).toBe('INTAKE');
    });

    it('should map execution to IMPLEMENTATION', () => {
      expect(toPipelinePhase('execution')).toBe('IMPLEMENTATION');
    });

    it('should map complete to DONE', () => {
      expect(toPipelinePhase('complete')).toBe('DONE');
    });

    it('should default to INTAKE for unknown phases', () => {
      expect(toPipelinePhase('unknown' as any)).toBe('INTAKE');
    });
  });

  describe('toLegacyPhase', () => {
    it('should map planning phases to plan', () => {
      expect(toLegacyPhase('INTAKE')).toBe('plan');
      expect(toLegacyPhase('CONSENSUS_MASTER_PLAN')).toBe('plan');
      expect(toLegacyPhase('ARCHITECTURE')).toBe('plan');
      expect(toLegacyPhase('CONSENSUS_ARCHITECTURE')).toBe('plan');
      expect(toLegacyPhase('ROLE_PLANNING')).toBe('plan');
      expect(toLegacyPhase('CONSENSUS_ROLE_PLANS')).toBe('plan');
    });

    it('should map execution phases to execution', () => {
      expect(toLegacyPhase('IMPLEMENTATION')).toBe('execution');
      expect(toLegacyPhase('QA_VALIDATION')).toBe('execution');
      expect(toLegacyPhase('REVIEW')).toBe('execution');
      expect(toLegacyPhase('AUDIT')).toBe('execution');
      expect(toLegacyPhase('PRODUCTION_GATE')).toBe('execution');
      expect(toLegacyPhase('RECOVERY_LOOP')).toBe('execution');
    });

    it('should map terminal phases to complete', () => {
      expect(toLegacyPhase('DONE')).toBe('complete');
      expect(toLegacyPhase('STUCK')).toBe('complete');
    });
  });

  describe('migrateToPipelineState', () => {
    it('should create default pipeline state with correct phase', () => {
      const state = makeMinimalState({ phase: 'plan' });
      const pipeline = migrateToPipelineState(state);

      expect(pipeline.pipelinePhase).toBe('INTAKE');
      expect(pipeline.artifacts).toEqual([]);
      expect(pipeline.recoveryCount).toBe(0);
      expect(pipeline.maxRecoveryIterations).toBe(5);
    });

    it('should map execution phase', () => {
      const state = makeMinimalState({ phase: 'execution' });
      const pipeline = migrateToPipelineState(state);
      expect(pipeline.pipelinePhase).toBe('IMPLEMENTATION');
    });

    it('should map complete phase', () => {
      const state = makeMinimalState({ phase: 'complete' });
      const pipeline = migrateToPipelineState(state);
      expect(pipeline.pipelinePhase).toBe('DONE');
    });

    it('should derive roles for typescript project', () => {
      const state = makeMinimalState({ language: 'typescript' });
      const pipeline = migrateToPipelineState(state);

      expect(pipeline.activeRoles).toContain('DISPATCHER');
      expect(pipeline.activeRoles).toContain('ARCHITECT');
      expect(pipeline.activeRoles).toContain('BACKEND_PROGRAMMER');
      expect(pipeline.activeRoles).not.toContain('FRONTEND_PROGRAMMER');
    });

    it('should derive roles for fullstack project', () => {
      const state = makeMinimalState({ language: 'fullstack' });
      const pipeline = migrateToPipelineState(state);

      expect(pipeline.activeRoles).toContain('DB_EXPERT');
      expect(pipeline.activeRoles).toContain('BACKEND_PROGRAMMER');
      expect(pipeline.activeRoles).toContain('FRONTEND_PROGRAMMER');
      expect(pipeline.activeRoles).toContain('WEBSITE_PROGRAMMER');
      expect(pipeline.activeRoles).toContain('UI_UX_SPECIALIST');
    });

    it('should derive roles for website project', () => {
      const state = makeMinimalState({ language: 'website' });
      const pipeline = migrateToPipelineState(state);

      expect(pipeline.activeRoles).toContain('WEBSITE_PROGRAMMER');
      expect(pipeline.activeRoles).toContain('MARKETING_EXPERT');
      expect(pipeline.activeRoles).toContain('SOCIAL_EXPERT');
      expect(pipeline.activeRoles).not.toContain('DB_EXPERT');
    });
  });

  describe('needsPipelineMigration', () => {
    it('should return true when pipeline is missing', () => {
      expect(needsPipelineMigration({ phase: 'plan' })).toBe(true);
    });

    it('should return false when pipeline exists', () => {
      expect(needsPipelineMigration({ pipeline: {} })).toBe(false);
    });
  });
});
