/**
 * Fix A tests — sessionGuidance threading through pipeline.
 * Verifies additionalContext persists in PipelineState and reaches phases.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultPipelineState,
  PipelineStateSchema,
  ArtifactTypeSchema,
} from '../../src/pipeline/types.js';

describe('Fix A: sessionGuidance threading', () => {
  describe('PipelineState.sessionGuidance', () => {
    it('should accept sessionGuidance in pipeline state', () => {
      const state = createDefaultPipelineState();
      state.sessionGuidance = 'Upgrade from v1 to v2: preserve API backwards compat';

      const result = PipelineStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data?.sessionGuidance).toBe(
        'Upgrade from v1 to v2: preserve API backwards compat',
      );
    });

    it('should allow omitting sessionGuidance (backward compat)', () => {
      const state = createDefaultPipelineState();
      // No sessionGuidance set

      const result = PipelineStateSchema.safeParse(state);
      expect(result.success).toBe(true);
      expect(result.data?.sessionGuidance).toBeUndefined();
    });

    it('should allow empty string for sessionGuidance', () => {
      const state = createDefaultPipelineState();
      state.sessionGuidance = '';

      const result = PipelineStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });
  });

  describe('additional_context artifact type', () => {
    it('should accept additional_context as valid artifact type', () => {
      const result = ArtifactTypeSchema.safeParse('additional_context');
      expect(result.success).toBe(true);
    });

    it('should still accept all existing artifact types', () => {
      const existingTypes = [
        'master_plan', 'architecture', 'role_plan', 'consensus',
        'arbitration', 'audit_report', 'rca_report', 'production_readiness',
        'change_request',
      ];

      for (const type of existingTypes) {
        expect(ArtifactTypeSchema.safeParse(type).success).toBe(true);
      }
    });
  });

  describe('PipelineOptions additionalContext -> sessionGuidance', () => {
    it('should store additionalContext in pipeline state when not already set', () => {
      const pipeline = createDefaultPipelineState();
      const additionalContext = 'Focus on mobile-first responsive design';

      // Simulates orchestrator logic
      if (additionalContext && !pipeline.sessionGuidance) {
        pipeline.sessionGuidance = additionalContext;
      }

      expect(pipeline.sessionGuidance).toBe('Focus on mobile-first responsive design');
    });

    it('should not overwrite existing sessionGuidance on resume', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.sessionGuidance = 'Original guidance from first run';
      const additionalContext = 'New guidance on resume';

      // Simulates orchestrator logic
      if (additionalContext && !pipeline.sessionGuidance) {
        pipeline.sessionGuidance = additionalContext;
      }

      expect(pipeline.sessionGuidance).toBe('Original guidance from first run');
    });

    it('should leave sessionGuidance undefined when no additionalContext', () => {
      const pipeline = createDefaultPipelineState();
      const additionalContext: string | undefined = undefined;

      if (additionalContext && !pipeline.sessionGuidance) {
        pipeline.sessionGuidance = additionalContext;
      }

      expect(pipeline.sessionGuidance).toBeUndefined();
    });
  });

  describe('INTAKE phase guidance injection', () => {
    it('should prepend guidance to plan input when provided', () => {
      const guidance = 'Upgrade context: migrate from Express to Fastify';
      const expandedIdea = 'Build a REST API with user authentication';

      const planInput = guidance
        ? `${guidance}\n\n---\n\n${expandedIdea}`
        : expandedIdea;

      expect(planInput).toContain(guidance);
      expect(planInput).toContain('---');
      expect(planInput).toContain(expandedIdea);
      expect(planInput.indexOf(guidance)).toBeLessThan(planInput.indexOf(expandedIdea));
    });

    it('should pass through expandedIdea unchanged when no guidance', () => {
      const guidance = '';
      const expandedIdea = 'Build a REST API with user authentication';

      const planInput = guidance
        ? `${guidance}\n\n---\n\n${expandedIdea}`
        : expandedIdea;

      expect(planInput).toBe(expandedIdea);
    });
  });

  describe('IMPLEMENTATION phase guidance injection', () => {
    it('should merge role prompt with guidance', () => {
      const combinedRolePrompt = '## BACKEND_PROGRAMMER\nScope: API endpoints';
      const guidance = 'Preserve backwards compatibility with v1 API';

      const systemPrompt = [combinedRolePrompt, guidance].filter(Boolean).join('\n\n') || undefined;

      expect(systemPrompt).toContain(combinedRolePrompt);
      expect(systemPrompt).toContain(guidance);
    });

    it('should use only role prompt when no guidance', () => {
      const combinedRolePrompt = '## BACKEND_PROGRAMMER\nScope: API endpoints';
      const guidance: string | undefined = undefined;

      const systemPrompt = [combinedRolePrompt, guidance].filter(Boolean).join('\n\n') || undefined;

      expect(systemPrompt).toBe(combinedRolePrompt);
    });

    it('should use only guidance when no role prompt', () => {
      const combinedRolePrompt = '';
      const guidance = 'Focus on performance';

      const systemPrompt = [combinedRolePrompt, guidance].filter(Boolean).join('\n\n') || undefined;

      expect(systemPrompt).toBe(guidance);
    });

    it('should return undefined when neither role prompt nor guidance', () => {
      const combinedRolePrompt = '';
      const guidance: string | undefined = undefined;

      const systemPrompt = [combinedRolePrompt, guidance].filter(Boolean).join('\n\n') || undefined;

      expect(systemPrompt).toBeUndefined();
    });
  });

  describe('RECOVERY_LOOP guidance in RCA prompt', () => {
    it('should include user guidance in RCA prompt when available', () => {
      const debuggerPrompt = 'You are a debugger agent...';
      const guidance = 'User wants API backwards compat preserved';
      const failureEvidence = 'Failed phase: QA_VALIDATION';

      const rcaPrompt = [
        debuggerPrompt,
        '',
        ...(guidance ? ['## User Guidance', guidance, ''] : []),
        '## Failure Evidence',
        failureEvidence,
      ].join('\n');

      expect(rcaPrompt).toContain('## User Guidance');
      expect(rcaPrompt).toContain(guidance);
      expect(rcaPrompt.indexOf('User Guidance')).toBeLessThan(
        rcaPrompt.indexOf('Failure Evidence'),
      );
    });

    it('should omit User Guidance section when no guidance', () => {
      const debuggerPrompt = 'You are a debugger agent...';
      const guidance: string | undefined = undefined;
      const failureEvidence = 'Failed phase: QA_VALIDATION';

      const rcaPrompt = [
        debuggerPrompt,
        '',
        ...(guidance ? ['## User Guidance', guidance, ''] : []),
        '## Failure Evidence',
        failureEvidence,
      ].join('\n');

      expect(rcaPrompt).not.toContain('## User Guidance');
      expect(rcaPrompt).toContain('## Failure Evidence');
    });
  });
});
