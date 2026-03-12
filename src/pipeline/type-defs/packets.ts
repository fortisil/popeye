/**
 * Structured packet types — plans, consensus, RCA, constraints, change requests.
 */

import { z } from 'zod';
import { PipelinePhaseSchema, PipelineRoleSchema } from './enums.js';
import { ArtifactRefSchema, DependencyEdgeSchema } from './artifacts.js';

// ─── Constraint ──────────────────────────────────────────

export const ConstraintSchema = z.object({
  type: z.enum(['technical', 'business', 'timeline', 'compliance']),
  description: z.string(),
  source: ArtifactRefSchema,
});
export type Constraint = z.infer<typeof ConstraintSchema>;

// ─── Plan Packet ─────────────────────────────────────────

export const PlanPacketMetadataSchema = z.object({
  packet_id: z.string(),
  timestamp: z.string(),
  phase: PipelinePhaseSchema,
  submitted_by: PipelineRoleSchema,
  version: z.number().int().positive(),
});

export const PlanPacketSchema = z.object({
  metadata: PlanPacketMetadataSchema,
  references: z.object({
    master_plan: ArtifactRefSchema,
    constitution: ArtifactRefSchema,
    repo_snapshot: ArtifactRefSchema,
  }),
  proposed_artifacts: z.array(ArtifactRefSchema),
  acceptance_criteria: z.array(z.string()),
  artifact_dependencies: z.array(DependencyEdgeSchema),
  constraints: z.array(ConstraintSchema),
  open_questions: z.array(z.string()).optional(),
});
export type PlanPacket = z.infer<typeof PlanPacketSchema>;

// ─── Reviewer Vote ───────────────────────────────────────

export const ReviewerVoteSchema = z.object({
  reviewer_id: z.string(),
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
  prompt_hash: z.string(),
  vote: z.enum(['APPROVE', 'REJECT', 'CONDITIONAL']),
  confidence: z.number().min(0).max(1),
  blocking_issues: z.array(z.string()),
  required_changes: z.array(z.string()).optional(),
  suggestions: z.array(z.string()),
  evidence_refs: z.array(ArtifactRefSchema),
  reviewer_inconsistency: z.boolean().optional(),
});
export type ReviewerVote = z.infer<typeof ReviewerVoteSchema>;

// ─── Consensus Packet ────────────────────────────────────

export const ConsensusRulesSchema = z.object({
  threshold: z.number().min(0).max(1),
  quorum: z.number().int().positive(),
  min_reviewers: z.number().int().positive(),
});

export const ConsensusResultSchema = z.object({
  approved: z.boolean(),
  score: z.number().min(0).max(1),
  weighted_score: z.number().min(0).max(1),
  participating_reviewers: z.number().int(),
  has_true_blockers: z.boolean().default(false),
});

export const ArbitratorResultSchema = z.object({
  decision: z.string(),
  merged_patch: z.string().optional(),
  artifact_ref: ArtifactRefSchema.optional(),
});

export const NormalizationMovesSchema = z.object({
  tagged_blockers_demoted_to_suggestions: z.number(),
  tagged_blockers_demoted_to_required: z.number(),
  untagged_from_blocking_routed_to_required: z.number(),
  forced_rejects: z.number(),
}).optional();

export const ConsensusPacketSchema = z.object({
  metadata: z.object({
    packet_id: z.string(),
    timestamp: z.string(),
    plan_packet_id: z.string(),
  }),
  plan_packet_reference: ArtifactRefSchema,
  reviewer_votes: z.array(ReviewerVoteSchema),
  consensus_rules: ConsensusRulesSchema,
  consensus_result: ConsensusResultSchema,
  arbitrator_result: ArbitratorResultSchema.optional(),
  final_status: z.enum(['APPROVED', 'REJECTED', 'ARBITRATED']),
  normalization_moves: NormalizationMovesSchema,
});
export type ConsensusPacket = z.infer<typeof ConsensusPacketSchema>;

// ─── RCA Packet ──────────────────────────────────────────

export const RCAPacketSchema = z.object({
  rca_id: z.string(),
  timestamp: z.string(),
  incident_summary: z.string(),
  symptoms: z.array(z.string()),
  root_cause: z.string(),
  responsible_layer: z.string(),
  origin_phase: PipelinePhaseSchema,
  governance_gap: z.string(),
  corrective_actions: z.array(z.string()),
  prevention: z.string(),
  requires_phase_rewind_to: PipelinePhaseSchema.optional(),
  requires_consensus_on: z.array(PipelinePhaseSchema).optional(),
});
export type RCAPacket = z.infer<typeof RCAPacketSchema>;

// ─── Change Request ──────────────────────────────────────

export const ChangeRequestSchema = z.object({
  cr_id: z.string(),
  timestamp: z.string(),
  origin_phase: PipelinePhaseSchema,
  requested_by: PipelineRoleSchema,
  change_type: z.enum(['scope', 'architecture', 'dependency', 'config', 'requirement']),
  description: z.string(),
  justification: z.string(),
  impact_analysis: z.object({
    affected_artifacts: z.array(ArtifactRefSchema),
    affected_phases: z.array(PipelinePhaseSchema),
    risk_level: z.enum(['low', 'medium', 'high']),
  }),
  status: z.enum(['proposed', 'approved', 'rejected', 'resolved']),
  approval_artifact: ArtifactRefSchema.optional(),
  /** Deterministic drift fingerprint for CR deduplication (v2.4.9) */
  drift_key: z.string().optional(),
  /** ISO timestamp when the CR was resolved (v2.4.9) */
  resolved_at: z.string().optional(),
  /** How the CR was resolved (v2.4.9) */
  resolution: z.enum(['accepted_baseline', 'reverted', 'manual_override']).optional(),
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
