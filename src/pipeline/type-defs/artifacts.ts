/**
 * Artifact system types — artifact types, refs, entries, dependency edges.
 */

import { z } from 'zod';
import { PipelinePhaseSchema } from './enums.js';

// ─── Artifact Types ──────────────────────────────────────

export const ArtifactTypeSchema = z.enum([
  'master_plan',
  'architecture',
  'role_plan',
  'consensus',
  'arbitration',
  'audit_report',
  'rca_report',
  'production_readiness',
  'release_notes',
  'deployment',
  'rollback',
  'repo_snapshot',
  'build_check',
  'test_check',
  'lint_check',
  'typecheck_check',
  'placeholder_scan',
  'qa_validation',
  'review_decision',
  'stuck_report',
  'journalist_trace',
  'resolved_commands',
  'constitution',
  'change_request',
  'additional_context',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

// ─── Content Type ────────────────────────────────────────

export const ContentTypeSchema = z.enum(['markdown', 'json']);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// ─── Artifact Reference ──────────────────────────────────

/** Universal pointer between packets and artifacts */
export const ArtifactRefSchema = z.object({
  artifact_id: z.string(),
  path: z.string(),
  sha256: z.string(),
  version: z.number().int().positive(),
  type: ArtifactTypeSchema,
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

// ─── Artifact Entry ──────────────────────────────────────

/** Immutable artifact entry stored in pipeline state */
export const ArtifactEntrySchema = z.object({
  id: z.string(),
  type: ArtifactTypeSchema,
  phase: PipelinePhaseSchema,
  version: z.number().int().positive(),
  path: z.string(),
  sha256: z.string(),
  timestamp: z.string(),
  immutable: z.literal(true),
  content_type: ContentTypeSchema,
  group_id: z.string(),
  previous_id: z.string().optional(),
});
export type ArtifactEntry = z.infer<typeof ArtifactEntrySchema>;

// ─── Dependency Edge ─────────────────────────────────────

/** Dependency edge between artifacts */
export const DependencyEdgeSchema = z.object({
  from: ArtifactRefSchema,
  to: ArtifactRefSchema,
  relationship: z.enum(['depends_on', 'supersedes', 'references']),
});
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;
