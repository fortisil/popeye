/**
 * Tests for audit type schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  AuditSeveritySchema,
  AuditCategorySchema,
  ComponentKindSchema,
  AuditEvidenceSchema,
  DependencyManifestSchema,
  FileEntrySchema,
  ComponentScanSchema,
  WiringMismatchSchema,
  WiringMatrixSchema,
  SearchMetadataSchema,
  AuditFindingSchema,
  ProjectSummaryReportSchema,
  ProjectAuditReportSchema,
  RecoveryTaskSchema,
  RecoveryMilestoneSchema,
  RecoveryPlanSchema,
  AuditModeOptionsSchema,
} from '../../src/types/audit.js';

describe('AuditSeveritySchema', () => {
  it('should accept valid severity values', () => {
    expect(AuditSeveritySchema.parse('critical')).toBe('critical');
    expect(AuditSeveritySchema.parse('major')).toBe('major');
    expect(AuditSeveritySchema.parse('minor')).toBe('minor');
    expect(AuditSeveritySchema.parse('info')).toBe('info');
  });

  it('should reject invalid values', () => {
    expect(() => AuditSeveritySchema.parse('high')).toThrow();
    expect(() => AuditSeveritySchema.parse('')).toThrow();
  });
});

describe('AuditCategorySchema', () => {
  it('should accept all valid categories', () => {
    const categories = [
      'feature-completeness',
      'integration-wiring',
      'test-coverage',
      'config-deployment',
      'dependency-sanity',
      'consistency',
      'security',
      'documentation',
    ];
    for (const cat of categories) {
      expect(AuditCategorySchema.parse(cat)).toBe(cat);
    }
  });

  it('should reject invalid category', () => {
    expect(() => AuditCategorySchema.parse('performance')).toThrow();
  });
});

describe('ComponentKindSchema', () => {
  it('should accept valid kinds', () => {
    expect(ComponentKindSchema.parse('frontend')).toBe('frontend');
    expect(ComponentKindSchema.parse('backend')).toBe('backend');
    expect(ComponentKindSchema.parse('website')).toBe('website');
    expect(ComponentKindSchema.parse('shared')).toBe('shared');
    expect(ComponentKindSchema.parse('infra')).toBe('infra');
  });

  it('should reject unknown kind', () => {
    expect(() => ComponentKindSchema.parse('mobile')).toThrow();
  });
});

describe('ComponentScanSchema', () => {
  const validComponent = {
    kind: 'frontend',
    rootDir: 'apps/frontend',
    language: 'typescript',
    framework: 'react',
    entryPoints: ['src/main.tsx'],
    routeFiles: ['src/App.tsx'],
    testFiles: [{ path: 'tests/App.test.tsx', lines: 50 }],
    sourceFiles: [{ path: 'src/main.tsx', lines: 20, extension: '.tsx' }],
    dependencyManifests: [
      { file: 'package.json', type: 'package.json', dependencies: { react: '^18.0.0' } },
    ],
  };

  it('should validate a complete component scan', () => {
    const result = ComponentScanSchema.parse(validComponent);
    expect(result.kind).toBe('frontend');
    expect(result.rootDir).toBe('apps/frontend');
    expect(result.sourceFiles).toHaveLength(1);
  });

  it('should accept minimal component scan', () => {
    const minimal = {
      kind: 'backend',
      rootDir: '.',
      language: 'python',
      entryPoints: [],
      routeFiles: [],
      testFiles: [],
      sourceFiles: [],
      dependencyManifests: [],
    };
    const result = ComponentScanSchema.parse(minimal);
    expect(result.framework).toBeUndefined();
  });

  it('should reject invalid language', () => {
    expect(() =>
      ComponentScanSchema.parse({ ...validComponent, language: 'rust' })
    ).toThrow();
  });
});

describe('WiringMatrixSchema', () => {
  it('should validate a complete wiring matrix', () => {
    const wiring = {
      frontendApiBaseEnvKeys: ['VITE_API_URL'],
      frontendApiBaseResolved: 'http://localhost:3000',
      backendCorsOrigins: ['http://localhost:5173'],
      backendApiPrefix: '/api',
      potentialMismatches: [
        {
          type: 'cors-origin-mismatch',
          details: 'Frontend origin not in CORS list',
          evidence: [{ file: '.env.example', snippet: 'VITE_API_URL=http://localhost:3000' }],
        },
      ],
    };
    const result = WiringMatrixSchema.parse(wiring);
    expect(result.potentialMismatches).toHaveLength(1);
  });

  it('should accept empty mismatches', () => {
    const wiring = {
      frontendApiBaseEnvKeys: [],
      potentialMismatches: [],
    };
    const result = WiringMatrixSchema.parse(wiring);
    expect(result.potentialMismatches).toHaveLength(0);
  });
});

describe('SearchMetadataSchema', () => {
  it('should validate search metadata', () => {
    const meta = {
      serenaUsed: true,
      serenaRetries: 1,
      serenaErrors: ['timeout'],
      fallbackUsed: true,
      fallbackTool: 'grep',
      searchQueries: ['find_symbol UserService'],
    };
    const result = SearchMetadataSchema.parse(meta);
    expect(result.serenaUsed).toBe(true);
    expect(result.serenaRetries).toBe(1);
  });

  it('should require all fields', () => {
    expect(() => SearchMetadataSchema.parse({ serenaUsed: true })).toThrow();
  });
});

describe('AuditFindingSchema', () => {
  const validFinding = {
    id: 'AUD-001',
    category: 'test-coverage',
    severity: 'major',
    title: 'No tests for auth module',
    description: 'The authentication module has zero test files.',
    evidence: [{ file: 'src/auth/login.ts', description: 'No test file found' }],
    recommendation: 'Add unit tests for auth handlers',
    autoFixable: false,
  };

  it('should validate a complete finding', () => {
    const result = AuditFindingSchema.parse(validFinding);
    expect(result.id).toBe('AUD-001');
    expect(result.autoFixable).toBe(false);
  });

  it('should reject missing required fields', () => {
    const { recommendation, ...incomplete } = validFinding;
    expect(() => AuditFindingSchema.parse(incomplete)).toThrow();
  });

  it('should reject invalid severity', () => {
    expect(() =>
      AuditFindingSchema.parse({ ...validFinding, severity: 'high' })
    ).toThrow();
  });
});

describe('RecoveryTaskSchema', () => {
  it('should require appTarget', () => {
    const task = {
      name: 'Fix CORS config',
      description: 'Update backend CORS settings',
      findingIds: ['AUD-003'],
      acceptanceCriteria: ['CORS allows frontend origin'],
      appTarget: 'backend',
    };
    const result = RecoveryTaskSchema.parse(task);
    expect(result.appTarget).toBe('backend');
  });

  it('should reject missing appTarget', () => {
    const task = {
      name: 'Fix something',
      description: 'A task',
      findingIds: ['AUD-001'],
      acceptanceCriteria: ['Fixed'],
    };
    expect(() => RecoveryTaskSchema.parse(task)).toThrow();
  });
});

describe('AuditModeOptionsSchema', () => {
  it('should apply defaults', () => {
    const result = AuditModeOptionsSchema.parse({ projectDir: '/tmp/proj' });
    expect(result.depth).toBe(2);
    expect(result.runTests).toBe(true);
    expect(result.strict).toBe(false);
    expect(result.format).toBe('both');
    expect(result.autoRecover).toBe(true);
    expect(result.target).toBe('all');
  });

  it('should accept overrides', () => {
    const result = AuditModeOptionsSchema.parse({
      projectDir: '/tmp/proj',
      depth: 3,
      strict: true,
      target: 'frontend',
    });
    expect(result.depth).toBe(3);
    expect(result.strict).toBe(true);
    expect(result.target).toBe('frontend');
  });

  it('should reject depth out of range', () => {
    expect(() =>
      AuditModeOptionsSchema.parse({ projectDir: '/tmp/proj', depth: 5 })
    ).toThrow();
  });
});
