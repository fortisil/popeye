/**
 * Tests for Tester (QA) type schemas
 */

import { describe, it, expect } from 'vitest';
import {
  TestVerdictSchema,
  TestCommandSchema,
  TestCaseSchema,
  TestPlanOutputSchema,
  TestRunReviewSchema,
  FixStepSchema,
  TestFixPlanSchema,
} from '../../src/types/tester.js';

describe('TestVerdictSchema', () => {
  it('should accept valid verdicts', () => {
    expect(TestVerdictSchema.parse('PASS')).toBe('PASS');
    expect(TestVerdictSchema.parse('PASS_WITH_NOTES')).toBe('PASS_WITH_NOTES');
    expect(TestVerdictSchema.parse('FAIL')).toBe('FAIL');
  });

  it('should reject invalid verdict strings', () => {
    expect(() => TestVerdictSchema.parse('pass')).toThrow();
    expect(() => TestVerdictSchema.parse('UNKNOWN')).toThrow();
    expect(() => TestVerdictSchema.parse('')).toThrow();
  });
});

describe('TestCommandSchema', () => {
  it('should accept a valid command', () => {
    const cmd = { command: 'npm test', purpose: 'Run unit tests', required: true };
    expect(TestCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it('should accept command with optional cwd', () => {
    const cmd = { command: 'pytest', cwd: 'backend/', purpose: 'Run backend tests', required: false };
    expect(TestCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it('should reject empty command string', () => {
    expect(() => TestCommandSchema.parse({ command: '', purpose: 'test', required: true })).toThrow();
  });

  it('should reject missing required fields', () => {
    expect(() => TestCommandSchema.parse({ command: 'npm test' })).toThrow();
    expect(() => TestCommandSchema.parse({ purpose: 'test', required: true })).toThrow();
  });
});

describe('TestCaseSchema', () => {
  const validCase = {
    id: 'TC-1',
    category: 'unit',
    description: 'Test user login',
    acceptanceCriteria: 'Returns 200 with valid credentials',
    evidenceRequired: 'Test output showing assertion passed',
    priority: 'critical' as const,
  };

  it('should accept a valid test case', () => {
    expect(TestCaseSchema.parse(validCase)).toEqual(validCase);
  });

  it('should reject invalid priority values', () => {
    expect(() => TestCaseSchema.parse({ ...validCase, priority: 'urgent' })).toThrow();
  });

  it('should reject empty id', () => {
    expect(() => TestCaseSchema.parse({ ...validCase, id: '' })).toThrow();
  });
});

describe('TestPlanOutputSchema', () => {
  const validPlan = {
    summary: 'Tests login feature risks',
    scope: ['backend'] as const,
    testMatrix: [{
      id: 'TC-1', category: 'unit', description: 'Login test',
      acceptanceCriteria: 'passes', evidenceRequired: 'output', priority: 'high' as const,
    }],
    commands: [{ command: 'pytest', purpose: 'Run tests', required: true }],
    riskFocus: ['Authentication bypass'],
    evidenceRequired: ['test output'],
    minimumVerification: ['build check'],
  };

  it('should accept a valid test plan', () => {
    const result = TestPlanOutputSchema.parse(validPlan);
    expect(result.summary).toBe('Tests login feature risks');
    expect(result.commands).toHaveLength(1);
  });

  it('should accept plan with noTestsRationale', () => {
    const plan = { ...validPlan, noTestsRationale: 'Config-only change, no code logic' };
    expect(TestPlanOutputSchema.parse(plan).noTestsRationale).toBe('Config-only change, no code logic');
  });

  it('should reject empty commands array', () => {
    expect(() => TestPlanOutputSchema.parse({ ...validPlan, commands: [] })).toThrow();
  });

  it('should reject empty scope array', () => {
    expect(() => TestPlanOutputSchema.parse({ ...validPlan, scope: [] })).toThrow();
  });
});

describe('TestRunReviewSchema', () => {
  const validReview = {
    verdict: 'PASS' as const,
    summary: 'All tests passed',
    evidenceReviewed: ['test output'],
    failures: [],
    gaps: [],
    recommendations: [],
    requiresConsensus: false,
  };

  it('should accept a valid PASS review', () => {
    expect(TestRunReviewSchema.parse(validReview).verdict).toBe('PASS');
  });

  it('should accept a FAIL review with failures', () => {
    const review = {
      ...validReview,
      verdict: 'FAIL' as const,
      failures: ['Login test failed'],
      requiresConsensus: true,
    };
    expect(TestRunReviewSchema.parse(review).requiresConsensus).toBe(true);
  });

  it('should reject missing verdict', () => {
    const { verdict, ...rest } = validReview;
    expect(() => TestRunReviewSchema.parse(rest)).toThrow();
  });

  it('should reject empty evidenceReviewed', () => {
    expect(() => TestRunReviewSchema.parse({ ...validReview, evidenceReviewed: [] })).toThrow();
  });
});

describe('TestFixPlanSchema', () => {
  const validFix = {
    failedCriteria: ['Login returns 200'],
    rootCauseAnalysis: 'Password hashing function is not async',
    fixSteps: [{ file: 'src/auth.ts', change: 'Add await', reason: 'Async hash' }],
    regressionRisks: ['May affect session handling'],
    retestStrategy: 'Re-run login test suite',
  };

  it('should accept a valid fix plan', () => {
    expect(TestFixPlanSchema.parse(validFix).rootCauseAnalysis).toContain('async');
  });

  it('should reject empty fixSteps', () => {
    expect(() => TestFixPlanSchema.parse({ ...validFix, fixSteps: [] })).toThrow();
  });

  it('should reject empty failedCriteria', () => {
    expect(() => TestFixPlanSchema.parse({ ...validFix, failedCriteria: [] })).toThrow();
  });
});

describe('FixStepSchema', () => {
  it('should accept valid fix step', () => {
    const step = { file: 'src/index.ts', change: 'Fix import', reason: 'Missing module' };
    expect(FixStepSchema.parse(step)).toEqual(step);
  });

  it('should reject empty file', () => {
    expect(() => FixStepSchema.parse({ file: '', change: 'Fix', reason: 'Bug' })).toThrow();
  });
});
