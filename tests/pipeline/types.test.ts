/**
 * Pipeline Types tests — Zod schema validation for all types.
 */

import { describe, it, expect } from 'vitest';
import {
  PipelinePhaseSchema,
  PipelineRoleSchema,
  ArtifactTypeSchema,
  GateCheckTypeSchema,
  createDefaultPipelineState,
} from '../../src/pipeline/types.js';

describe('PipelineTypes', () => {
  describe('PipelinePhaseSchema', () => {
    it('should accept valid phases', () => {
      const phases = [
        'INTAKE', 'CONSENSUS_MASTER_PLAN', 'ARCHITECTURE',
        'CONSENSUS_ARCHITECTURE', 'ROLE_PLANNING', 'CONSENSUS_ROLE_PLANS',
        'IMPLEMENTATION', 'QA_VALIDATION', 'REVIEW', 'AUDIT',
        'PRODUCTION_GATE', 'RECOVERY_LOOP', 'DONE', 'STUCK',
      ];

      for (const phase of phases) {
        const result = PipelinePhaseSchema.safeParse(phase);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid phases', () => {
      const result = PipelinePhaseSchema.safeParse('INVALID_PHASE');
      expect(result.success).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(PipelinePhaseSchema.safeParse(42).success).toBe(false);
      expect(PipelinePhaseSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('PipelineRoleSchema', () => {
    it('should accept all valid roles', () => {
      const roles = [
        'DISPATCHER', 'ARCHITECT', 'DB_EXPERT',
        'BACKEND_PROGRAMMER', 'FRONTEND_PROGRAMMER',
        'WEBSITE_PROGRAMMER', 'QA_TESTER',
        'REVIEWER', 'ARBITRATOR', 'DEBUGGER',
        'AUDITOR', 'JOURNALIST', 'RELEASE_MANAGER',
        'MARKETING_EXPERT', 'SOCIAL_EXPERT', 'UI_UX_SPECIALIST',
      ];

      for (const role of roles) {
        const result = PipelineRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid roles', () => {
      expect(PipelineRoleSchema.safeParse('INVALID_ROLE').success).toBe(false);
    });

    it('should have exactly 16 roles', () => {
      expect(PipelineRoleSchema.options.length).toBe(16);
    });
  });

  describe('createDefaultPipelineState', () => {
    it('should create state with INTAKE phase', () => {
      const state = createDefaultPipelineState();
      expect(state.pipelinePhase).toBe('INTAKE');
    });

    it('should create state with empty artifacts', () => {
      const state = createDefaultPipelineState();
      expect(state.artifacts).toEqual([]);
    });

    it('should create state with zero recovery count', () => {
      const state = createDefaultPipelineState();
      expect(state.recoveryCount).toBe(0);
    });

    it('should create state with max recovery of 5', () => {
      const state = createDefaultPipelineState();
      expect(state.maxRecoveryIterations).toBe(5);
    });

    it('should create state with empty gate results', () => {
      const state = createDefaultPipelineState();
      expect(state.gateResults).toEqual({});
      expect(state.gateChecks).toEqual({});
    });

    it('should create state with empty active roles', () => {
      const state = createDefaultPipelineState();
      expect(state.activeRoles).toEqual([]);
    });

    it('should create state with empty constitution hash', () => {
      const state = createDefaultPipelineState();
      expect(state.constitutionHash).toBe('');
    });

    it('should return independent instances', () => {
      const s1 = createDefaultPipelineState();
      const s2 = createDefaultPipelineState();
      s1.artifacts.push({} as any);
      expect(s2.artifacts).toHaveLength(0);
    });
  });

  describe('ArtifactTypeSchema (v1.1)', () => {
    it('should accept constitution artifact type', () => {
      expect(ArtifactTypeSchema.safeParse('constitution').success).toBe(true);
    });

    it('should accept change_request artifact type', () => {
      expect(ArtifactTypeSchema.safeParse('change_request').success).toBe(true);
    });

    it('should still accept all original artifact types', () => {
      const originals = [
        'master_plan', 'architecture', 'role_plan', 'consensus',
        'audit_report', 'repo_snapshot', 'build_check', 'qa_validation',
      ];
      for (const t of originals) {
        expect(ArtifactTypeSchema.safeParse(t).success).toBe(true);
      }
    });

    it('should reject unknown artifact types', () => {
      expect(ArtifactTypeSchema.safeParse('unknown_type').success).toBe(false);
    });
  });

  describe('GateCheckTypeSchema (v1.1)', () => {
    it('should accept start check type', () => {
      expect(GateCheckTypeSchema.safeParse('start').success).toBe(true);
    });

    it('should accept env_check type', () => {
      expect(GateCheckTypeSchema.safeParse('env_check').success).toBe(true);
    });

    it('should still accept all original check types', () => {
      const originals = ['build', 'test', 'lint', 'typecheck', 'migration', 'placeholder_scan'];
      for (const t of originals) {
        expect(GateCheckTypeSchema.safeParse(t).success).toBe(true);
      }
    });

    it('should reject unknown check types', () => {
      expect(GateCheckTypeSchema.safeParse('unknown_check').success).toBe(false);
    });
  });
});
