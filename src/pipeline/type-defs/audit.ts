/**
 * Audit types — findings, reports, severity classifications.
 */

import { z } from 'zod';
import { PipelineRoleSchema } from './enums.js';
import { ArtifactRefSchema } from './artifacts.js';

// ─── Audit Severity & Category ───────────────────────────

export const AuditSeveritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

export const AuditCategorySchema = z.enum([
  'integration',
  'config',
  'tests',
  'schema',
  'security',
  'deployment',
]);

// ─── Audit Finding ───────────────────────────────────────

export const AuditFindingSchema = z.object({
  id: z.string(),
  severity: AuditSeveritySchema,
  category: AuditCategorySchema,
  description: z.string(),
  evidence: z.array(ArtifactRefSchema),
  file_path: z.string().optional(),
  line_number: z.number().int().optional(),
  suggested_owner: PipelineRoleSchema,
  blocking: z.boolean(),
});
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

// ─── Audit Report ────────────────────────────────────────

export const AuditReportSchema = z.object({
  audit_id: z.string(),
  timestamp: z.string(),
  repo_snapshot: ArtifactRefSchema,
  overall_status: z.enum(['PASS', 'FAIL']),
  findings: z.array(AuditFindingSchema),
  system_risk_score: z.number().min(0).max(100),
  recovery_required: z.boolean(),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;

// ─── Production Readiness ────────────────────────────────

export const ProductionReadinessSchema = z.object({
  production_id: z.string(),
  timestamp: z.string(),
  build_status: z.enum(['pass', 'fail', 'skip']),
  test_status: z.enum(['pass', 'fail', 'skip']),
  lint_status: z.enum(['pass', 'fail', 'skip']),
  typecheck_status: z.enum(['pass', 'fail', 'skip']),
  migration_status: z.enum(['pass', 'fail', 'skip', 'n/a']),
  audit_status: z.enum(['PASS', 'FAIL']),
  placeholder_scan_status: z.enum(['pass', 'fail', 'skip']),
  security_status: z.enum(['pass', 'fail', 'skip']),
  unresolved_blockers: z.array(z.string()),
  final_verdict: z.enum(['PASS', 'FAIL']),
});
export type ProductionReadiness = z.infer<typeof ProductionReadinessSchema>;
