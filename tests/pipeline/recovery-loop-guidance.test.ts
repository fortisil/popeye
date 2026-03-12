/**
 * Recovery guidance + micro-plan tests (v2.4.6).
 * Tests QA fix directive injection, marker replacement, and
 * buildRecoveryMicroPlan risk heuristics without LLM calls.
 */

import { describe, it, expect } from 'vitest';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelinePhase, PipelineState, GateCheckResult } from '../../src/pipeline/types.js';

// ─── Helpers: replicate the guidance injection logic from recovery-loop.ts ──

/**
 * Simulates the QA fix directive injection (step 2c in recovery-loop.ts).
 * Extracted here so we can test it without running the full phase handler.
 */
function injectQaFixDirective(
  pipeline: PipelineState,
  failedPhase: PipelinePhase | undefined,
  failedChecks: GateCheckResult[],
): void {
  if (failedPhase === 'QA_VALIDATION' || failedPhase === 'PRODUCTION_GATE'
      || failedPhase === 'IMPLEMENTATION') {
    const failedCheckDetails = failedChecks
      .filter((c) => c.status === 'fail')
      .map((c) => [
        `**${c.check_type}** (exit code ${c.exit_code}):`,
        `Command: \`${c.command}\``,
        c.stderr_summary ? c.stderr_summary.slice(0, 500) : 'No stderr captured',
      ].join('\n'))
      .join('\n\n');

    if (failedCheckDetails) {
      const existing = pipeline.sessionGuidance ?? '';
      const marker = '--- QA FIX DIRECTIVE ---';
      const base = existing.includes(marker)
        ? existing.slice(0, existing.indexOf(marker)).trim()
        : existing;
      const directive = [
        `Fix the following failures (recovery iteration ${pipeline.recoveryCount}):`,
        '',
        failedCheckDetails,
        '',
        'Apply targeted fixes only. Do not rewrite code that already works.',
      ].join('\n');
      pipeline.sessionGuidance = [base, '', marker, directive.slice(0, 3000)]
        .join('\n').trim();
    }
  }
}

/**
 * Replicates buildRecoveryMicroPlan from recovery-loop.ts for testing.
 */
function buildRecoveryMicroPlan(
  rcaResponse: string,
  failedChecks: GateCheckResult[],
  recoveryCount: number,
): { plan: string; needsConsensus: boolean; riskLevel: 'low' | 'medium' | 'high' } {
  const stderrLines = failedChecks
    .filter((c) => c.status === 'fail')
    .map((c) => c.stderr_summary ?? '')
    .join('\n');

  const combined = rcaResponse + '\n' + stderrLines;
  const combinedLower = combined.toLowerCase();

  const touchesSchema = /schema|migration|prisma|drizzle|typeorm|knex/.test(combinedLower);
  const touchesDeps = /package\.json|requirements\.txt|dependency|npm install|pip install/
    .test(combinedLower);
  const touchesConfig =
    /tsconfig\.json|vite\.config|jest\.config|vitest\.config|docker-compose|\.github\/workflows/
    .test(combinedLower);
  const touchesApi = /api route|endpoint|public api|breaking change/.test(combinedLower);

  const mentionedFiles = combined.match(/[\w/.-]+\.(ts|tsx|js|jsx|py|sql|prisma)/gi) ?? [];
  const uniqueFiles = [...new Set(mentionedFiles)];

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (touchesApi || uniqueFiles.length > 5) riskLevel = 'high';
  else if (touchesSchema || touchesDeps || touchesConfig) riskLevel = 'medium';

  const needsConsensus = riskLevel !== 'low' && recoveryCount >= 2;

  const plan = [
    `# Recovery Fix Plan (iteration ${recoveryCount})`,
    '',
    `**Risk level:** ${riskLevel}`,
    `**Files likely affected:** ${uniqueFiles.length > 0 ? uniqueFiles.join(', ') : 'unknown'}`,
    `**Consensus required:** ${needsConsensus ? 'yes' : 'no'}`,
    '',
    '## Root Cause Summary',
    rcaResponse.slice(0, 800),
    '',
    '## Test Failures',
    stderrLines.slice(0, 1000) || 'No stderr captured',
    '',
    '## Fix Checklist',
    '- [ ] Address root cause identified above',
    '- [ ] Fix failing test assertions',
    '- [ ] Verify no regressions in passing tests',
    touchesSchema ? '- [ ] Review schema/migration changes for correctness' : '',
    touchesDeps ? '- [ ] Verify dependency changes are necessary and compatible' : '',
  ].filter(Boolean).join('\n');

  return { plan, needsConsensus, riskLevel };
}

/**
 * Simulates the micro-plan injection (step 3d in recovery-loop.ts).
 */
function injectMicroPlan(pipeline: PipelineState, microPlanText: string): void {
  const existing = pipeline.sessionGuidance ?? '';
  const markers = ['--- QA FIX DIRECTIVE ---', '--- RECOVERY FIX PLAN ---'];
  let base = existing;
  for (const m of markers) {
    if (base.includes(m)) base = base.slice(0, base.indexOf(m)).trim();
  }
  pipeline.sessionGuidance = [
    base, '', '--- RECOVERY FIX PLAN ---', microPlanText.slice(0, 3000),
  ].join('\n').trim();
}

// ─── Tests ──────────────────────────────────────────────

describe('Recovery guidance (v2.4.6)', () => {
  describe('QA fix directive injection', () => {
    it('should inject QA FIX DIRECTIVE marker with stderr into sessionGuidance', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.recoveryCount = 1;

      const failedChecks: GateCheckResult[] = [
        {
          check_type: 'test',
          status: 'fail',
          command: 'npm test',
          exit_code: 1,
          stderr_summary: 'FAIL src/utils.test.ts\nExpected 3, received 5',
          duration_ms: 1200,
          timestamp: new Date().toISOString(),
        },
      ];

      injectQaFixDirective(pipeline, 'QA_VALIDATION', failedChecks);

      expect(pipeline.sessionGuidance).toContain('--- QA FIX DIRECTIVE ---');
      expect(pipeline.sessionGuidance).toContain('FAIL src/utils.test.ts');
      expect(pipeline.sessionGuidance).toContain('exit code 1');
      expect(pipeline.sessionGuidance).toContain('Apply targeted fixes only');
    });

    it('should replace (not accumulate) directive on repeated failures', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.recoveryCount = 1;

      const firstChecks: GateCheckResult[] = [
        {
          check_type: 'test',
          status: 'fail',
          command: 'npm test',
          exit_code: 1,
          stderr_summary: 'First error',
          duration_ms: 500,
          timestamp: '',
        },
      ];

      const secondChecks: GateCheckResult[] = [
        {
          check_type: 'test',
          status: 'fail',
          command: 'npm test',
          exit_code: 1,
          stderr_summary: 'Second error',
          duration_ms: 500,
          timestamp: '',
        },
      ];

      // Inject first
      injectQaFixDirective(pipeline, 'QA_VALIDATION', firstChecks);
      expect(pipeline.sessionGuidance).toContain('First error');

      // Inject second — should replace, not accumulate
      pipeline.recoveryCount = 2;
      injectQaFixDirective(pipeline, 'QA_VALIDATION', secondChecks);

      const markerCount = (pipeline.sessionGuidance ?? '').split('--- QA FIX DIRECTIVE ---').length - 1;
      expect(markerCount).toBe(1);
      expect(pipeline.sessionGuidance).toContain('Second error');
    });
  });

  describe('buildRecoveryMicroPlan risk heuristics', () => {
    it('should return low risk for simple test failures', () => {
      const result = buildRecoveryMicroPlan(
        'The test assertion in utils.ts expects 3 but received 5. Fix the calculation.',
        [{ check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, stderr_summary: 'Expected 3, got 5', duration_ms: 500, timestamp: '' }],
        1,
      );

      expect(result.riskLevel).toBe('low');
      expect(result.needsConsensus).toBe(false);
      expect(result.plan).toContain('iteration 1');
      expect(result.plan).toContain('utils.ts');
    });

    it('should return medium risk for schema/migration changes', () => {
      const result = buildRecoveryMicroPlan(
        'The schema migration for the users table is missing the new column. Update the prisma schema.',
        [{ check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, stderr_summary: 'Column not found', duration_ms: 500, timestamp: '' }],
        1,
      );

      expect(result.riskLevel).toBe('medium');
      // recoveryCount=1 < 2, so no consensus yet
      expect(result.needsConsensus).toBe(false);
    });

    it('should return high risk for API/endpoint changes or >5 files', () => {
      const result = buildRecoveryMicroPlan(
        'The public API endpoint /api/users returns wrong status. This is a breaking change affecting a.ts, b.ts, c.ts, d.ts, e.ts, f.ts',
        [{ check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, stderr_summary: 'API test failed', duration_ms: 500, timestamp: '' }],
        3,
      );

      expect(result.riskLevel).toBe('high');
      // High risk + recoveryCount=3 >= 2 => consensus needed
      expect(result.needsConsensus).toBe(true);
    });

    it('should require consensus for medium risk on second+ attempt', () => {
      const result = buildRecoveryMicroPlan(
        'Need to update the schema and migration files.',
        [{ check_type: 'test', status: 'fail', command: 'npm test', exit_code: 1, duration_ms: 500, timestamp: '' }],
        2,
      );

      expect(result.riskLevel).toBe('medium');
      expect(result.needsConsensus).toBe(true);
    });
  });

  describe('Micro-plan marker replaces QA marker', () => {
    it('should replace QA FIX DIRECTIVE with RECOVERY FIX PLAN after both run', () => {
      const pipeline = createDefaultPipelineState();
      pipeline.recoveryCount = 1;
      pipeline.sessionGuidance = 'Some initial guidance';

      // Step 1: QA fix directive is injected (simulating step 2c)
      const failedChecks: GateCheckResult[] = [
        {
          check_type: 'test',
          status: 'fail',
          command: 'npm test',
          exit_code: 1,
          stderr_summary: 'Test failed',
          duration_ms: 500,
          timestamp: '',
        },
      ];
      injectQaFixDirective(pipeline, 'QA_VALIDATION', failedChecks);
      expect(pipeline.sessionGuidance).toContain('--- QA FIX DIRECTIVE ---');

      // Step 2: Micro-plan replaces it (simulating step 3d)
      const microPlan = buildRecoveryMicroPlan(
        'Root cause: off-by-one error in utils.ts',
        failedChecks,
        1,
      );
      injectMicroPlan(pipeline, microPlan.plan);

      // Final guidance should have RECOVERY FIX PLAN, not QA FIX DIRECTIVE
      expect(pipeline.sessionGuidance).toContain('--- RECOVERY FIX PLAN ---');
      expect(pipeline.sessionGuidance).not.toContain('--- QA FIX DIRECTIVE ---');
      // Initial guidance should be preserved
      expect(pipeline.sessionGuidance).toContain('Some initial guidance');
    });
  });
});
