/**
 * Tests for the audit analyzer module.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAnalysisPrompt,
  parseAuditFindings,
  calculateAuditScores,
} from '../../src/workflow/audit-analyzer.js';
import type { ProjectScanResult } from '../../src/types/audit.js';
import type { ProjectState } from '../../src/types/workflow.js';

/**
 * Minimal scan result for testing prompts.
 */
function makeScan(overrides: Partial<ProjectScanResult> = {}): ProjectScanResult {
  return {
    tree: 'src/\n  main.ts',
    components: [],
    detectedComposition: ['frontend'],
    stateLanguage: 'typescript',
    compositionMismatch: false,
    sourceFiles: [],
    testFiles: [],
    configFiles: [],
    entryPoints: [],
    routeFiles: [],
    dependencies: [],
    totalSourceFiles: 10,
    totalTestFiles: 3,
    totalLinesOfCode: 500,
    totalLinesOfTests: 100,
    language: 'typescript',
    docsIndex: [],
    keyFileSnippets: [],
    ...overrides,
  };
}

/**
 * Minimal project state for testing.
 */
function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
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
    ...overrides,
  } as ProjectState;
}

// ---------------------------------------------------------------------------
// buildAnalysisPrompt
// ---------------------------------------------------------------------------

describe('buildAnalysisPrompt', () => {
  it('should include project name and language', () => {
    const prompt = buildAnalysisPrompt(makeScan(), makeState(), 2, false);
    expect(prompt).toContain('Test Project');
    expect(prompt).toContain('typescript');
  });

  it('should include component structure section', () => {
    const scan = makeScan({
      components: [
        {
          kind: 'frontend',
          rootDir: 'apps/frontend',
          language: 'typescript',
          framework: 'react',
          entryPoints: ['src/main.tsx'],
          routeFiles: [],
          testFiles: [],
          sourceFiles: [],
          dependencyManifests: [],
        },
      ],
    });
    const prompt = buildAnalysisPrompt(scan, makeState(), 2, false);
    expect(prompt).toContain('frontend');
    expect(prompt).toContain('react');
    expect(prompt).toContain('apps/frontend');
  });

  it('should include wiring matrix when present', () => {
    const scan = makeScan({
      wiring: {
        frontendApiBaseEnvKeys: ['VITE_API_URL'],
        frontendApiBaseResolved: 'http://localhost:3000',
        backendCorsOrigins: ['http://localhost:5173'],
        backendApiPrefix: '/api',
        potentialMismatches: [],
      },
    });
    const prompt = buildAnalysisPrompt(scan, makeState(), 2, false);
    expect(prompt).toContain('VITE_API_URL');
    expect(prompt).toContain('Wiring Matrix');
  });

  it('should include CLAUDE.md content when present', () => {
    const scan = makeScan({ claudeMdContent: '# Project Rules\nFollow PEP8.' });
    const prompt = buildAnalysisPrompt(scan, makeState(), 2, false);
    expect(prompt).toContain('Project Rules');
  });

  it('should include depth-2 checks', () => {
    const prompt = buildAnalysisPrompt(makeScan(), makeState(), 2, false);
    expect(prompt).toContain('Depth-2 Checks');
  });

  it('should include depth-3 checks at depth 3', () => {
    const prompt = buildAnalysisPrompt(makeScan(), makeState(), 3, false);
    expect(prompt).toContain('Depth-3 Checks');
    expect(prompt).toContain('OWASP');
  });

  it('should indicate strict mode when enabled', () => {
    const prompt = buildAnalysisPrompt(makeScan(), makeState(), 2, true);
    expect(prompt).toContain('STRICT MODE');
  });

  it('should include milestone status', () => {
    const state = makeState({
      milestones: [
        {
          id: 'm1',
          name: 'Setup',
          description: 'Initial setup',
          status: 'complete',
          tasks: [
            { id: 't1', name: 'Init', description: 'Init project', status: 'complete' },
          ],
        },
      ],
    });
    const prompt = buildAnalysisPrompt(makeScan(), state, 2, false);
    expect(prompt).toContain('Setup: complete');
  });
});

// ---------------------------------------------------------------------------
// parseAuditFindings
// ---------------------------------------------------------------------------

describe('parseAuditFindings', () => {
  it('should parse valid JSON findings from code fences', () => {
    const raw = '```json\n[\n  {\n    "id": "AUD-001",\n    "category": "test-coverage",\n    "severity": "major",\n    "title": "No tests",\n    "description": "Missing tests.",\n    "evidence": [],\n    "recommendation": "Add tests.",\n    "autoFixable": false\n  }\n]\n```';
    const findings = parseAuditFindings(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('AUD-001');
  });

  it('should parse JSON without code fences', () => {
    const raw = '[{"id":"AUD-001","category":"security","severity":"critical","title":"SQL Injection","description":"Raw SQL used.","evidence":[],"recommendation":"Use ORM.","autoFixable":false}]';
    const findings = parseAuditFindings(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('security');
  });

  it('should handle malformed JSON gracefully', () => {
    const findings = parseAuditFindings('This is not JSON at all.');
    expect(findings).toEqual([]);
  });

  it('should skip individual malformed findings', () => {
    const raw = JSON.stringify([
      {
        id: 'AUD-001',
        category: 'test-coverage',
        severity: 'major',
        title: 'Valid',
        description: 'Valid finding.',
        evidence: [],
        recommendation: 'Fix it.',
        autoFixable: false,
      },
      {
        id: 'AUD-002',
        // Missing required fields
        title: 'Invalid',
      },
    ]);
    const findings = parseAuditFindings(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('AUD-001');
  });

  it('should handle non-array JSON', () => {
    const findings = parseAuditFindings('{"not": "an array"}');
    expect(findings).toEqual([]);
  });

  it('should extract JSON array embedded in surrounding text', () => {
    const raw = 'Here are the findings:\n[{"id":"AUD-001","category":"documentation","severity":"info","title":"Missing changelog","description":"No CHANGELOG.md","evidence":[],"recommendation":"Add one.","autoFixable":true}]\nEnd of findings.';
    const findings = parseAuditFindings(raw);
    expect(findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// calculateAuditScores
// ---------------------------------------------------------------------------

describe('calculateAuditScores', () => {
  it('should return 100 when no findings', () => {
    const { overallScore, categoryScores } = calculateAuditScores([], makeScan());
    expect(overallScore).toBe(100);
    expect(categoryScores['test-coverage']).toBe(100);
  });

  it('should deduct for critical findings', () => {
    const findings = [
      {
        id: 'AUD-001',
        category: 'security' as const,
        severity: 'critical' as const,
        title: 'SQL Injection',
        description: 'Found raw SQL.',
        evidence: [],
        recommendation: 'Use ORM.',
        autoFixable: false,
      },
    ];
    const { overallScore, categoryScores } = calculateAuditScores(findings, makeScan());
    expect(categoryScores['security']).toBe(80); // 100 - 20
    expect(overallScore).toBeLessThan(100);
  });

  it('should not go below 0', () => {
    const findings = Array.from({ length: 10 }, (_, i) => ({
      id: `AUD-${i}`,
      category: 'security' as const,
      severity: 'critical' as const,
      title: `Finding ${i}`,
      description: 'Critical issue.',
      evidence: [],
      recommendation: 'Fix it.',
      autoFixable: false,
    }));
    const { categoryScores } = calculateAuditScores(findings, makeScan());
    expect(categoryScores['security']).toBe(0);
  });

  it('should handle mixed severity findings', () => {
    const findings = [
      {
        id: 'AUD-001',
        category: 'test-coverage' as const,
        severity: 'major' as const,
        title: 'Low coverage',
        description: 'Only 20% covered.',
        evidence: [],
        recommendation: 'Add tests.',
        autoFixable: false,
      },
      {
        id: 'AUD-002',
        category: 'test-coverage' as const,
        severity: 'info' as const,
        title: 'Snapshot tests used',
        description: 'Consider replacing with assertions.',
        evidence: [],
        recommendation: 'Optional.',
        autoFixable: false,
      },
    ];
    const { categoryScores } = calculateAuditScores(findings, makeScan());
    // major = -10, info = 0
    expect(categoryScores['test-coverage']).toBe(90);
  });
});
