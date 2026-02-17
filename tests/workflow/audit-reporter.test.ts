/**
 * Tests for the audit reporter module.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildSummaryReport,
  buildAuditReport,
  writeAuditMarkdown,
  writeAuditJson,
  writeRecoveryMarkdown,
  writeRecoveryJson,
} from '../../src/workflow/audit-reporter.js';
import type { ProjectScanResult, AuditFinding, SearchMetadata, RecoveryPlan } from '../../src/types/audit.js';
import type { ProjectState } from '../../src/types/workflow.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-report-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeScan(overrides: Partial<ProjectScanResult> = {}): ProjectScanResult {
  return {
    tree: 'src/',
    components: [],
    detectedComposition: ['frontend'],
    stateLanguage: 'typescript',
    compositionMismatch: false,
    sourceFiles: [],
    testFiles: [],
    configFiles: ['package.json', 'docker-compose.yml'],
    entryPoints: ['src/main.ts'],
    routeFiles: ['src/routes.ts'],
    dependencies: [
      { file: 'package.json', type: 'package.json', dependencies: { react: '^18' }, devDependencies: { vitest: '^1' } },
    ],
    totalSourceFiles: 15,
    totalTestFiles: 5,
    totalLinesOfCode: 800,
    totalLinesOfTests: 200,
    language: 'typescript',
    docsIndex: [],
    keyFileSnippets: [],
    ...overrides,
  };
}

function makeState(): ProjectState {
  return {
    id: 'test-id',
    name: 'Test Project',
    idea: 'A test project',
    language: 'typescript',
    openaiModel: 'gpt-4',
    phase: 'complete',
    status: 'complete',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  } as ProjectState;
}

function makeMeta(): SearchMetadata {
  return {
    serenaUsed: true,
    serenaRetries: 0,
    serenaErrors: [],
    fallbackUsed: false,
    fallbackTool: '',
    searchQueries: ['audit-analysis'],
  };
}

// ---------------------------------------------------------------------------
// buildSummaryReport
// ---------------------------------------------------------------------------

describe('buildSummaryReport', () => {
  it('should produce a correct summary', () => {
    const summary = buildSummaryReport(makeScan(), makeState());
    expect(summary.projectName).toBe('Test Project');
    expect(summary.totalSourceFiles).toBe(15);
    expect(summary.totalTestFiles).toBe(5);
    expect(summary.dependencyCount).toBe(2); // react + vitest
    expect(summary.hasDocker).toBe(true);
    expect(summary.entryPointCount).toBe(1);
    expect(summary.routeCount).toBe(1);
  });

  it('should include AI overview when provided', () => {
    const summary = buildSummaryReport(makeScan(), makeState(), 'Looks good overall.');
    expect(summary.aiOverview).toBe('Looks good overall.');
  });
});

// ---------------------------------------------------------------------------
// buildAuditReport
// ---------------------------------------------------------------------------

describe('buildAuditReport', () => {
  it('should produce a report with correct severity counts', () => {
    const findings: AuditFinding[] = [
      { id: 'AUD-001', category: 'security', severity: 'critical', title: 'XSS', description: 'Found XSS.', evidence: [], recommendation: 'Sanitize.', autoFixable: false },
      { id: 'AUD-002', category: 'test-coverage', severity: 'major', title: 'Low coverage', description: 'Only 30%.', evidence: [], recommendation: 'Add tests.', autoFixable: false },
      { id: 'AUD-003', category: 'documentation', severity: 'info', title: 'Missing comments', description: 'No JSDoc.', evidence: [], recommendation: 'Add JSDoc.', autoFixable: true },
    ];
    const scores = { overallScore: 72, categoryScores: {} as Record<string, number> };
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      findings, scores as any, makeMeta(), { strict: false }, 'run-123'
    );
    expect(report.criticalCount).toBe(1);
    expect(report.majorCount).toBe(1);
    expect(report.infoCount).toBe(1);
    expect(report.auditRunId).toBe('run-123');
    expect(report.recommendation).toBe('fix-and-recheck');
  });

  it('should recommend pass when no critical and few major findings', () => {
    const findings: AuditFinding[] = [
      { id: 'AUD-001', category: 'documentation', severity: 'minor', title: 'Minor', description: 'Small.', evidence: [], recommendation: 'OK.', autoFixable: true },
    ];
    const scores = { overallScore: 95, categoryScores: {} as Record<string, number> };
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      findings, scores as any, makeMeta(), { strict: false }, 'run-456'
    );
    expect(report.recommendation).toBe('pass');
  });

  it('should recommend major-rework for many critical findings', () => {
    const findings = Array.from({ length: 4 }, (_, i) => ({
      id: `AUD-${i}`,
      category: 'security' as const,
      severity: 'critical' as const,
      title: `Critical ${i}`,
      description: 'Bad.',
      evidence: [],
      recommendation: 'Fix.',
      autoFixable: false,
    }));
    const scores = { overallScore: 30, categoryScores: {} as Record<string, number> };
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      findings, scores as any, makeMeta(), { strict: false }, 'run-789'
    );
    expect(report.recommendation).toBe('major-rework');
  });

  it('should include search metadata in report', () => {
    const meta = makeMeta();
    meta.serenaUsed = true;
    meta.serenaRetries = 1;
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      [], { overallScore: 100, categoryScores: {} as any }, meta, { strict: false }, 'run-x'
    );
    expect(report.searchMetadata.serenaUsed).toBe(true);
    expect(report.searchMetadata.serenaRetries).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

describe('writeAuditMarkdown', () => {
  it('should write a valid markdown file', async () => {
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      [], { overallScore: 100, categoryScores: {} as any }, makeMeta(), { strict: false }, 'run-1'
    );
    const filePath = await writeAuditMarkdown(tmpDir, report);
    expect(filePath).toContain('popeye.audit.md');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('# Audit Report');
    expect(content).toContain('Test Project');
  });
});

describe('writeAuditJson', () => {
  it('should write valid JSON', async () => {
    const report = buildAuditReport(
      buildSummaryReport(makeScan(), makeState()),
      [], { overallScore: 100, categoryScores: {} as any }, makeMeta(), { strict: false }, 'run-2'
    );
    const filePath = await writeAuditJson(tmpDir, report);
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.projectName).toBe('Test Project');
    expect(parsed.overallScore).toBe(100);
  });
});

describe('writeRecoveryMarkdown', () => {
  it('should write recovery plan markdown', async () => {
    const recovery: RecoveryPlan = {
      generatedAt: new Date().toISOString(),
      auditScore: 60,
      auditRunId: 'run-3',
      totalFindings: 5,
      criticalFindings: 1,
      milestones: [
        {
          name: '[RECOVERY] Critical Fixes',
          description: 'Fix critical issues.',
          tasks: [
            {
              name: 'Fix SQL injection',
              description: 'Sanitize inputs.',
              findingIds: ['AUD-001'],
              acceptanceCriteria: ['No raw SQL in handlers'],
              appTarget: 'backend',
            },
          ],
        },
      ],
      estimatedEffort: '2-4 hours',
    };
    const filePath = await writeRecoveryMarkdown(tmpDir, recovery);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('# Recovery Plan');
    expect(content).toContain('[RECOVERY] Critical Fixes');
    expect(content).toContain('Fix SQL injection');
  });
});

describe('writeRecoveryJson', () => {
  it('should write valid recovery JSON', async () => {
    const recovery: RecoveryPlan = {
      generatedAt: new Date().toISOString(),
      auditScore: 60,
      auditRunId: 'run-4',
      totalFindings: 2,
      criticalFindings: 0,
      milestones: [],
      estimatedEffort: '1 hour',
    };
    const filePath = await writeRecoveryJson(tmpDir, recovery);
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.auditRunId).toBe('run-4');
  });
});
