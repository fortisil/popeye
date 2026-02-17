/**
 * Tests for the audit recovery module.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldTriggerRecovery,
  generateRecoveryPlan,
  recoveryToMilestones,
} from '../../src/workflow/audit-recovery.js';
import type { ProjectAuditReport, AuditFinding, SearchMetadata, AuditCategory } from '../../src/types/audit.js';

/**
 * Minimal audit report for testing.
 */
function makeReport(overrides: Partial<ProjectAuditReport> = {}): ProjectAuditReport {
  return {
    projectName: 'Test',
    language: 'typescript',
    auditedAt: '2024-01-01T00:00:00Z',
    auditRunId: 'run-test',
    summary: {
      projectName: 'Test',
      language: 'typescript',
      totalSourceFiles: 10,
      totalTestFiles: 3,
      totalLinesOfCode: 500,
      totalLinesOfTests: 100,
      componentCount: 1,
      detectedComposition: ['frontend'],
      entryPointCount: 1,
      routeCount: 1,
      dependencyCount: 5,
      hasDocker: false,
      hasEnvExample: true,
      hasCiConfig: false,
    },
    findings: [],
    overallScore: 90,
    categoryScores: {} as Record<AuditCategory, number>,
    criticalCount: 0,
    majorCount: 0,
    minorCount: 0,
    infoCount: 0,
    passedChecks: [],
    searchMetadata: {
      serenaUsed: false,
      serenaRetries: 0,
      serenaErrors: [],
      fallbackUsed: false,
      fallbackTool: '',
      searchQueries: [],
    },
    recommendation: 'pass',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'AUD-001',
    category: 'test-coverage',
    severity: 'major',
    title: 'Low test coverage',
    description: 'Coverage is below threshold.',
    evidence: [{ file: 'src/auth/login.ts', description: 'No tests' }],
    recommendation: 'Add tests for auth module.',
    autoFixable: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldTriggerRecovery
// ---------------------------------------------------------------------------

describe('shouldTriggerRecovery', () => {
  it('should trigger when critical findings exist', () => {
    const report = makeReport({ criticalCount: 1, overallScore: 80 });
    expect(shouldTriggerRecovery(report, false)).toBe(true);
  });

  it('should trigger in strict mode when major findings exist', () => {
    const report = makeReport({ majorCount: 1, criticalCount: 0, overallScore: 85 });
    expect(shouldTriggerRecovery(report, true)).toBe(true);
  });

  it('should NOT trigger in non-strict mode for major-only findings with high score', () => {
    const report = makeReport({ majorCount: 1, criticalCount: 0, overallScore: 85 });
    expect(shouldTriggerRecovery(report, false)).toBe(false);
  });

  it('should trigger when score is low and actionable findings exist', () => {
    const findings = [makeFinding({ autoFixable: true })];
    const report = makeReport({ overallScore: 60, findings, criticalCount: 0, majorCount: 0 });
    expect(shouldTriggerRecovery(report, false)).toBe(true);
  });

  it('should trigger when score is low and category is actionable', () => {
    const findings = [makeFinding({ category: 'integration-wiring', autoFixable: false })];
    const report = makeReport({ overallScore: 60, findings, criticalCount: 0, majorCount: 0 });
    expect(shouldTriggerRecovery(report, false)).toBe(true);
  });

  it('should NOT trigger for info-only findings', () => {
    const findings = [makeFinding({ severity: 'info', category: 'documentation' })];
    const report = makeReport({ overallScore: 90, findings, infoCount: 1, criticalCount: 0, majorCount: 0 });
    expect(shouldTriggerRecovery(report, false)).toBe(false);
  });

  it('should NOT trigger when everything passes', () => {
    const report = makeReport({ overallScore: 95, criticalCount: 0, majorCount: 0 });
    expect(shouldTriggerRecovery(report, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateRecoveryPlan
// ---------------------------------------------------------------------------

describe('generateRecoveryPlan', () => {
  it('should create separate milestone for critical findings', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'critical', title: 'XSS vulnerability' }),
      makeFinding({ id: 'AUD-002', severity: 'major', title: 'Low coverage' }),
    ];
    const report = makeReport({ findings, criticalCount: 1, majorCount: 1 });
    const plan = generateRecoveryPlan(report);

    expect(plan.milestones.length).toBeGreaterThanOrEqual(2);
    expect(plan.milestones[0].name).toContain('[RECOVERY] Critical Fixes');
    expect(plan.milestones[0].tasks).toHaveLength(1);
    expect(plan.milestones[1].name).toContain('[RECOVERY] Major Improvements');
  });

  it('should include polish milestone for auto-fixable minor findings', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'minor', autoFixable: true, title: 'Missing README' }),
    ];
    const report = makeReport({ findings, minorCount: 1 });
    const plan = generateRecoveryPlan(report);

    const polishMs = plan.milestones.find((m) => m.name.includes('Polish'));
    expect(polishMs).toBeDefined();
    expect(polishMs?.tasks).toHaveLength(1);
  });

  it('should NOT include non-autoFixable minor findings in polish', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'minor', autoFixable: false }),
    ];
    const report = makeReport({ findings, minorCount: 1 });
    const plan = generateRecoveryPlan(report);

    expect(plan.milestones).toHaveLength(0);
  });

  it('should set appTarget on every recovery task', () => {
    const findings = [
      makeFinding({
        id: 'AUD-001',
        severity: 'critical',
        evidence: [{ file: 'apps/backend/main.py', description: 'Issue here' }],
      }),
    ];
    const report = makeReport({ findings, criticalCount: 1 });
    const plan = generateRecoveryPlan(report);

    for (const ms of plan.milestones) {
      for (const task of ms.tasks) {
        expect(task.appTarget).toBeTruthy();
      }
    }
    expect(plan.milestones[0].tasks[0].appTarget).toBe('backend');
  });

  it('should provide estimated effort', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'critical' }),
    ];
    const report = makeReport({ findings, criticalCount: 1 });
    const plan = generateRecoveryPlan(report);
    expect(plan.estimatedEffort).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// recoveryToMilestones
// ---------------------------------------------------------------------------

describe('recoveryToMilestones', () => {
  it('should convert recovery milestones to the correct shape', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'critical', title: 'Fix auth' }),
    ];
    const report = makeReport({ findings, criticalCount: 1 });
    const plan = generateRecoveryPlan(report);
    const milestones = recoveryToMilestones(plan, 'typescript');

    expect(milestones).toHaveLength(1);
    expect(milestones[0].name).toContain('[RECOVERY]');
    expect(milestones[0].status).toBe('pending');
    expect(milestones[0].tasks.length).toBeGreaterThan(0);

    for (const task of milestones[0].tasks) {
      expect(task.status).toBe('pending');
      expect(task.name).toBeTruthy();
      expect(task.description).toBeTruthy();
    }
  });

  it('should preserve [RECOVERY] prefix on milestone names', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'major' }),
      makeFinding({ id: 'AUD-002', severity: 'minor', autoFixable: true }),
    ];
    const report = makeReport({ findings, majorCount: 1, minorCount: 1 });
    const plan = generateRecoveryPlan(report);
    const milestones = recoveryToMilestones(plan, 'python');

    for (const ms of milestones) {
      expect(ms.name.startsWith('[RECOVERY]')).toBe(true);
    }
  });

  it('should include acceptance criteria in task description', () => {
    const findings = [
      makeFinding({ id: 'AUD-001', severity: 'critical', recommendation: 'Use parameterized queries' }),
    ];
    const report = makeReport({ findings, criticalCount: 1 });
    const plan = generateRecoveryPlan(report);
    const milestones = recoveryToMilestones(plan, 'typescript');

    const taskDesc = milestones[0].tasks[0].description;
    expect(taskDesc).toContain('Acceptance criteria');
    expect(taskDesc).toContain('parameterized queries');
  });
});
