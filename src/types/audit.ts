/**
 * Audit system type definitions.
 *
 * Zod schemas and TypeScript types for the post-build audit/review feature.
 * Covers scanning, analysis, reporting, and recovery.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const AuditSeveritySchema = z.enum(['critical', 'major', 'minor', 'info']);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

export const AuditCategorySchema = z.enum([
  'feature-completeness',
  'integration-wiring',
  'test-coverage',
  'config-deployment',
  'dependency-sanity',
  'consistency',
  'security',
  'documentation',
]);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

export const ComponentKindSchema = z.enum([
  'frontend',
  'backend',
  'website',
  'shared',
  'infra',
]);
export type ComponentKind = z.infer<typeof ComponentKindSchema>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const AuditEvidenceSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  snippet: z.string().optional(),
  description: z.string().optional(),
});
export type AuditEvidence = z.infer<typeof AuditEvidenceSchema>;

// ---------------------------------------------------------------------------
// Dependency manifest
// ---------------------------------------------------------------------------

export const DependencyManifestSchema = z.object({
  file: z.string(),
  type: z.enum(['package.json', 'requirements.txt', 'pyproject.toml', 'other']),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});
export type DependencyManifest = z.infer<typeof DependencyManifestSchema>;

// ---------------------------------------------------------------------------
// File entry
// ---------------------------------------------------------------------------

export const FileEntrySchema = z.object({
  path: z.string(),
  lines: z.number().optional(),
  extension: z.string().optional(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const FileExcerptSchema = z.object({
  path: z.string(),
  content: z.string(),
});
export type FileExcerpt = z.infer<typeof FileExcerptSchema>;

// ---------------------------------------------------------------------------
// Component scan (per-component scanning for upgrade safety)
// ---------------------------------------------------------------------------

export const ComponentScanSchema = z.object({
  kind: ComponentKindSchema,
  rootDir: z.string(),
  language: z.enum(['typescript', 'python', 'mixed']),
  framework: z.string().optional(),
  entryPoints: z.array(z.string()),
  routeFiles: z.array(z.string()),
  testFiles: z.array(FileEntrySchema),
  sourceFiles: z.array(FileEntrySchema),
  dependencyManifests: z.array(DependencyManifestSchema),
});
export type ComponentScan = z.infer<typeof ComponentScanSchema>;

// ---------------------------------------------------------------------------
// Wiring matrix (deterministic FE<->BE wiring check)
// ---------------------------------------------------------------------------

export const WiringMismatchSchema = z.object({
  type: z.string(),
  details: z.string(),
  evidence: z.array(AuditEvidenceSchema),
});
export type WiringMismatch = z.infer<typeof WiringMismatchSchema>;

export const WiringMatrixSchema = z.object({
  frontendApiBaseEnvKeys: z.array(z.string()),
  frontendApiBaseResolved: z.string().optional(),
  backendCorsOrigins: z.array(z.string()).optional(),
  backendApiPrefix: z.string().optional(),
  potentialMismatches: z.array(WiringMismatchSchema),
});
export type WiringMatrix = z.infer<typeof WiringMatrixSchema>;

// ---------------------------------------------------------------------------
// Project scan result
// ---------------------------------------------------------------------------

export const ProjectScanResultSchema = z.object({
  tree: z.string(),
  // Component-based scanning (upgrade-safe)
  components: z.array(ComponentScanSchema),
  detectedComposition: z.array(ComponentKindSchema),
  stateLanguage: z.string(),
  compositionMismatch: z.boolean(),
  // Aggregated totals
  sourceFiles: z.array(FileEntrySchema),
  testFiles: z.array(FileEntrySchema),
  configFiles: z.array(z.string()),
  entryPoints: z.array(z.string()),
  routeFiles: z.array(z.string()),
  dependencies: z.array(DependencyManifestSchema),
  totalSourceFiles: z.number(),
  totalTestFiles: z.number(),
  totalLinesOfCode: z.number(),
  totalLinesOfTests: z.number(),
  language: z.string(),
  // Priority doc reads
  claudeMdContent: z.string().optional(),
  readmeContent: z.string().optional(),
  docsIndex: z.array(z.string()),
  keyFileSnippets: z.array(FileExcerptSchema),
  // Wiring matrix
  wiring: WiringMatrixSchema.optional(),
  // Config
  envExampleContent: z.string().optional(),
  dockerComposeContent: z.string().optional(),
});
export type ProjectScanResult = z.infer<typeof ProjectScanResultSchema>;

// ---------------------------------------------------------------------------
// Search metadata (Serena tracking)
// ---------------------------------------------------------------------------

export const SearchMetadataSchema = z.object({
  serenaUsed: z.boolean(),
  serenaRetries: z.number(),
  serenaErrors: z.array(z.string()),
  fallbackUsed: z.boolean(),
  fallbackTool: z.string(),
  searchQueries: z.array(z.string()),
});
export type SearchMetadata = z.infer<typeof SearchMetadataSchema>;

// ---------------------------------------------------------------------------
// Audit finding
// ---------------------------------------------------------------------------

export const AuditFindingSchema = z.object({
  id: z.string(),
  category: AuditCategorySchema,
  severity: AuditSeveritySchema,
  title: z.string(),
  description: z.string(),
  evidence: z.array(AuditEvidenceSchema),
  recommendation: z.string(),
  autoFixable: z.boolean(),
});
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------

export const ProjectSummaryReportSchema = z.object({
  projectName: z.string(),
  language: z.string(),
  totalSourceFiles: z.number(),
  totalTestFiles: z.number(),
  totalLinesOfCode: z.number(),
  totalLinesOfTests: z.number(),
  componentCount: z.number(),
  detectedComposition: z.array(ComponentKindSchema),
  entryPointCount: z.number(),
  routeCount: z.number(),
  dependencyCount: z.number(),
  hasDocker: z.boolean(),
  hasEnvExample: z.boolean(),
  hasCiConfig: z.boolean(),
  aiOverview: z.string().optional(),
});
export type ProjectSummaryReport = z.infer<typeof ProjectSummaryReportSchema>;

// ---------------------------------------------------------------------------
// Audit report
// ---------------------------------------------------------------------------

export const AuditRecommendationSchema = z.enum([
  'pass',
  'fix-and-recheck',
  'major-rework',
]);
export type AuditRecommendation = z.infer<typeof AuditRecommendationSchema>;

export const ProjectAuditReportSchema = z.object({
  projectName: z.string(),
  language: z.string(),
  auditedAt: z.string(),
  auditRunId: z.string(),
  summary: ProjectSummaryReportSchema,
  findings: z.array(AuditFindingSchema),
  overallScore: z.number(),
  categoryScores: z.record(AuditCategorySchema, z.number()),
  criticalCount: z.number(),
  majorCount: z.number(),
  minorCount: z.number(),
  infoCount: z.number(),
  passedChecks: z.array(z.string()),
  searchMetadata: SearchMetadataSchema,
  recommendation: AuditRecommendationSchema,
});
export type ProjectAuditReport = z.infer<typeof ProjectAuditReportSchema>;

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export const RecoveryTaskSchema = z.object({
  name: z.string(),
  description: z.string(),
  findingIds: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  testPlan: z.string().optional(),
  appTarget: ComponentKindSchema,
});
export type RecoveryTask = z.infer<typeof RecoveryTaskSchema>;

export const RecoveryMilestoneSchema = z.object({
  name: z.string(),
  description: z.string(),
  tasks: z.array(RecoveryTaskSchema),
});
export type RecoveryMilestone = z.infer<typeof RecoveryMilestoneSchema>;

export const RecoveryPlanSchema = z.object({
  generatedAt: z.string(),
  auditScore: z.number(),
  auditRunId: z.string(),
  totalFindings: z.number(),
  criticalFindings: z.number(),
  milestones: z.array(RecoveryMilestoneSchema),
  estimatedEffort: z.string(),
});
export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;

// ---------------------------------------------------------------------------
// Options & result
// ---------------------------------------------------------------------------

export const AuditModeOptionsSchema = z.object({
  projectDir: z.string(),
  depth: z.number().min(1).max(3).default(2),
  runTests: z.boolean().default(true),
  strict: z.boolean().default(false),
  format: z.enum(['json', 'md', 'both']).default('both'),
  autoRecover: z.boolean().default(true),
  target: z.union([z.literal('all'), ComponentKindSchema]).default('all'),
});
export type AuditModeOptions = z.infer<typeof AuditModeOptionsSchema>;

export const AuditModeResultSchema = z.object({
  success: z.boolean(),
  summary: ProjectSummaryReportSchema,
  audit: ProjectAuditReportSchema,
  recovery: RecoveryPlanSchema.optional(),
  reportPaths: z.object({
    auditMd: z.string().optional(),
    auditJson: z.string().optional(),
    recoveryMd: z.string().optional(),
    recoveryJson: z.string().optional(),
  }),
  error: z.string().optional(),
});
export type AuditModeResult = z.infer<typeof AuditModeResultSchema>;
