/**
 * Skill Coverage Gate tests — assertSkillCoverage with conditional roles.
 */

import { describe, it, expect } from 'vitest';
import {
  assertSkillCoverage,
  ROLE_REQUIRED_USAGE,
  PHASE_ORDER,
} from '../../../src/pipeline/skills/coverage-gate.js';
import type { SkillUsageEvent } from '../../../src/pipeline/skills/usage-registry.js';
import type { PipelineState, PipelineRole, PipelinePhase } from '../../../src/pipeline/types.js';
import { createDefaultPipelineState } from '../../../src/pipeline/types.js';

/** Helper to create a usage event */
function makeEvent(
  role: PipelineRole,
  phase: string = 'ROLE_PLANNING',
): SkillUsageEvent {
  return {
    role,
    phase: phase as SkillUsageEvent['phase'],
    used_as: 'system_prompt',
    skill_source: 'defaults',
    timestamp: new Date().toISOString(),
  };
}

/** Helper to create pipeline state with overrides */
function makePipeline(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    ...createDefaultPipelineState(),
    ...overrides,
  };
}

describe('assertSkillCoverage', () => {
  describe('expected use — all active roles have usage', () => {
    it('should pass when all active roles have recorded usage', () => {
      const activeRoles: PipelineRole[] = [
        'DISPATCHER', 'ARCHITECT', 'DB_EXPERT', 'BACKEND_PROGRAMMER',
      ];
      const events: SkillUsageEvent[] = [
        makeEvent('ARCHITECT', 'ARCHITECTURE'),
        makeEvent('DB_EXPERT', 'ROLE_PLANNING'),
        makeEvent('BACKEND_PROGRAMMER', 'ROLE_PLANNING'),
      ];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, events, pipeline);

      expect(result.pass).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.covered).toContain('DISPATCHER');
      expect(result.covered).toContain('ARCHITECT');
    });
  });

  describe('fail case — active role missing usage', () => {
    it('should fail when active UI_UX_SPECIALIST has no usage events', () => {
      const activeRoles: PipelineRole[] = [
        'DISPATCHER', 'ARCHITECT', 'UI_UX_SPECIALIST',
      ];
      const events: SkillUsageEvent[] = [
        makeEvent('ARCHITECT', 'ARCHITECTURE'),
        // UI_UX_SPECIALIST has no events
      ];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, events, pipeline);

      expect(result.pass).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].role).toBe('UI_UX_SPECIALIST');
      expect(result.missing[0].reason).toContain('No skill usage recorded');
    });
  });

  describe('DISPATCHER — meta-only role always passes', () => {
    it('should mark DISPATCHER as covered without any events', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER'],
        [],
        makePipeline({ activeRoles: ['DISPATCHER'] }),
      );

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('DISPATCHER');
    });
  });

  describe('DEBUGGER — conditional on recovery', () => {
    it('should pass when recoveryCount=0 (not required)', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'DEBUGGER'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'DEBUGGER'],
          recoveryCount: 0,
        }),
      );

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('DEBUGGER');
    });

    it('should fail when recoveryCount>0 and no usage events', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'DEBUGGER'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'DEBUGGER'],
          recoveryCount: 1,
        }),
      );

      expect(result.pass).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].role).toBe('DEBUGGER');
    });

    it('should pass when recoveryCount>0 and usage recorded', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'DEBUGGER'],
        [makeEvent('DEBUGGER', 'RECOVERY_LOOP')],
        makePipeline({
          activeRoles: ['DISPATCHER', 'DEBUGGER'],
          recoveryCount: 2,
        }),
      );

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('DEBUGGER');
    });
  });

  describe('ARBITRATOR — conditional on arbitration', () => {
    it('should pass when no arbitration artifacts exist', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'ARBITRATOR'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'ARBITRATOR'],
          artifacts: [],
        }),
      );

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('ARBITRATOR');
    });

    it('should fail when arbitration artifacts exist but no usage', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'ARBITRATOR'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'ARBITRATOR'],
          artifacts: [{
            id: 'arb-1',
            type: 'arbitration',
            phase: 'CONSENSUS_MASTER_PLAN',
            version: 1,
            path: 'docs/arbitration.json',
            sha256: 'abc',
            timestamp: new Date().toISOString(),
            immutable: true,
            content_type: 'json',
            group_id: 'g1',
          }],
        }),
      );

      expect(result.pass).toBe(false);
      expect(result.missing[0].role).toBe('ARBITRATOR');
    });
  });

  describe('JOURNALIST — conditional on journal triggers', () => {
    it('should pass when no journal-triggering phases completed', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'JOURNALIST'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'JOURNALIST'],
          gateResults: {},
        }),
      );

      expect(result.pass).toBe(true);
    });

    it('should fail when journal phase completed but no usage', () => {
      const result = assertSkillCoverage(
        ['DISPATCHER', 'JOURNALIST'],
        [],
        makePipeline({
          activeRoles: ['DISPATCHER', 'JOURNALIST'],
          gateResults: {
            CONSENSUS_MASTER_PLAN: {
              phase: 'CONSENSUS_MASTER_PLAN',
              pass: true,
              blockers: [],
              missingArtifacts: [],
              failedChecks: [],
              timestamp: new Date().toISOString(),
            },
          },
        }),
      );

      expect(result.pass).toBe(false);
      expect(result.missing[0].role).toBe('JOURNALIST');
    });
  });

  describe('ROLE_REQUIRED_USAGE configuration', () => {
    it('should have entries for all 16 pipeline roles', () => {
      const expectedRoles: PipelineRole[] = [
        'DISPATCHER', 'ARCHITECT', 'DB_EXPERT', 'BACKEND_PROGRAMMER',
        'FRONTEND_PROGRAMMER', 'WEBSITE_PROGRAMMER', 'UI_UX_SPECIALIST',
        'MARKETING_EXPERT', 'SOCIAL_EXPERT', 'QA_TESTER', 'REVIEWER',
        'ARBITRATOR', 'DEBUGGER', 'AUDITOR', 'JOURNALIST', 'RELEASE_MANAGER',
      ];

      for (const role of expectedRoles) {
        expect(ROLE_REQUIRED_USAGE[role]).toBeDefined();
      }
    });
  });

  // ─── v2.4.5: Phase-aware deferral ────────────────────────

  describe('phase-aware deferral (v2.4.5)', () => {
    it('should defer AUDITOR at CONSENSUS_ROLE_PLANS', () => {
      // AUDITOR requires AUDIT phase, which comes after CONSENSUS_ROLE_PLANS
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'AUDITOR'];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, [], pipeline, 'CONSENSUS_ROLE_PLANS');

      expect(result.pass).toBe(true);
      expect(result.deferred).toContain('AUDITOR');
      expect(result.missing).toHaveLength(0);
    });

    it('should check AUDITOR at PRODUCTION_GATE (AUDIT <= PRODUCTION_GATE)', () => {
      // AUDIT comes before PRODUCTION_GATE in PHASE_ORDER, so AUDITOR is checked
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'AUDITOR'];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, [], pipeline, 'PRODUCTION_GATE');

      expect(result.pass).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].role).toBe('AUDITOR');
      expect(result.deferred).not.toContain('AUDITOR');
    });

    it('should pass AUDITOR at PRODUCTION_GATE with events', () => {
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'AUDITOR'];
      const events = [makeEvent('AUDITOR', 'AUDIT')];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, events, pipeline, 'PRODUCTION_GATE');

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('AUDITOR');
      expect(result.deferred).toHaveLength(0);
    });

    it('should defer RELEASE_MANAGER at PRODUCTION_GATE (DONE > PRODUCTION_GATE)', () => {
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'RELEASE_MANAGER'];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, [], pipeline, 'PRODUCTION_GATE');

      expect(result.pass).toBe(true);
      expect(result.deferred).toContain('RELEASE_MANAGER');
    });

    it('should check QA_TESTER at CONSENSUS_ROLE_PLANS (ROLE_PLANNING <= CONSENSUS_ROLE_PLANS)', () => {
      // QA_TESTER has phases [ROLE_PLANNING, QA_VALIDATION].
      // ROLE_PLANNING comes before CONSENSUS_ROLE_PLANS, so QA_TESTER is checked.
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'QA_TESTER'];
      const events = [makeEvent('QA_TESTER', 'ROLE_PLANNING')];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(activeRoles, events, pipeline, 'CONSENSUS_ROLE_PLANS');

      expect(result.pass).toBe(true);
      expect(result.covered).toContain('QA_TESTER');
      expect(result.deferred).not.toContain('QA_TESTER');
    });

    it('should pass full production scenario at CONSENSUS_ROLE_PLANS', () => {
      // Simulate real pipeline: all SUPPORT_ROLES + website impl roles active.
      // Provide events only for roles through ROLE_PLANNING phase.
      const activeRoles: PipelineRole[] = [
        'DISPATCHER', 'ARCHITECT', 'QA_TESTER', 'REVIEWER', 'ARBITRATOR',
        'DEBUGGER', 'AUDITOR', 'JOURNALIST', 'RELEASE_MANAGER',
        'DB_EXPERT', 'BACKEND_PROGRAMMER', 'WEBSITE_PROGRAMMER',
      ];
      const events: SkillUsageEvent[] = [
        makeEvent('ARCHITECT', 'ARCHITECTURE'),
        makeEvent('DB_EXPERT', 'ROLE_PLANNING'),
        makeEvent('BACKEND_PROGRAMMER', 'ROLE_PLANNING'),
        makeEvent('WEBSITE_PROGRAMMER', 'ROLE_PLANNING'),
        makeEvent('QA_TESTER', 'ROLE_PLANNING'),
      ];
      const pipeline = makePipeline({
        activeRoles,
        recoveryCount: 0,
        artifacts: [],
        gateResults: {},
      });

      const result = assertSkillCoverage(activeRoles, events, pipeline, 'CONSENSUS_ROLE_PLANS');

      expect(result.pass).toBe(true);
      // AUDITOR and RELEASE_MANAGER should be deferred
      expect(result.deferred).toContain('AUDITOR');
      expect(result.deferred).toContain('RELEASE_MANAGER');
      // REVIEWER should also be deferred (REVIEW phase > CONSENSUS_ROLE_PLANS)
      expect(result.deferred).toContain('REVIEWER');
      // Conditional roles with no trigger are covered (not deferred)
      expect(result.covered).toContain('ARBITRATOR');
      expect(result.covered).toContain('DEBUGGER');
      expect(result.covered).toContain('JOURNALIST');
    });

    it('should fall back to strict mode with unknown currentPhase', () => {
      // An unknown phase not in PHASE_ORDER gets indexOf = -1, same as strict mode
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'AUDITOR'];
      const pipeline = makePipeline({ activeRoles });

      const result = assertSkillCoverage(
        activeRoles, [], pipeline, 'SOME_NEW_PHASE' as PipelinePhase,
      );

      // Strict mode: AUDITOR is checked (not deferred) and fails
      expect(result.pass).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].role).toBe('AUDITOR');
      expect(result.deferred).toHaveLength(0);
    });

    it('should use strict mode when currentPhase is omitted (backward compat)', () => {
      const activeRoles: PipelineRole[] = ['DISPATCHER', 'AUDITOR'];
      const pipeline = makePipeline({ activeRoles });

      // No currentPhase param — same as original behavior
      const result = assertSkillCoverage(activeRoles, [], pipeline);

      expect(result.pass).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].role).toBe('AUDITOR');
      expect(result.deferred).toHaveLength(0);
    });

    it('PHASE_ORDER should include all key phases', () => {
      const keyPhases: PipelinePhase[] = [
        'INTAKE', 'CONSENSUS_ROLE_PLANS', 'PRODUCTION_GATE', 'DONE', 'STUCK',
        'AUDIT', 'REVIEW', 'ARCHITECTURE', 'ROLE_PLANNING',
      ];
      for (const phase of keyPhases) {
        expect(PHASE_ORDER).toContain(phase);
      }
    });
  });
});
