/**
 * Pipeline state types — the core mutable state, gate definitions, gate results.
 */

import { z } from 'zod';
import { PipelinePhaseSchema, type PipelinePhase, PipelineRoleSchema, type PipelineRole } from './enums.js';
import { ArtifactTypeSchema, ArtifactEntrySchema, ArtifactRefSchema, type ArtifactEntry } from './artifacts.js';
import { GateCheckTypeSchema, GateCheckResultSchema, ResolvedCommandsSchema, type GateCheckType } from './checks.js';
import type { ArtifactType } from './artifacts.js';
import type { ConsensusPacket } from './packets.js';
import type { RCAPacket } from './packets.js';
// Reason: SkillUsageEvent type is defined inline in the Zod schema to keep state serialization self-contained

// ─── Gate Definition ─────────────────────────────────────

export const GateDefinitionSchema = z.object({
  phase: PipelinePhaseSchema,
  requiredArtifacts: z.array(ArtifactTypeSchema),
  requiredChecks: z.array(GateCheckTypeSchema),
  consensusThreshold: z.number().min(0).max(1).optional(),
  minReviewers: z.number().int().positive().optional(),
  allowedTransitions: z.array(PipelinePhaseSchema),
  failTransition: PipelinePhaseSchema,
});
export type GateDefinition = z.infer<typeof GateDefinitionSchema>;

// ─── Gate Result ─────────────────────────────────────────

/** Result of evaluating a gate */
export interface GateResult {
  phase: PipelinePhase;
  pass: boolean;
  score?: number;
  blockers: string[];
  missingArtifacts: ArtifactType[];
  failedChecks: GateCheckType[];
  consensusScore?: number;
  timestamp: string;
}

// ─── Skill Definition ────────────────────────────────────

export interface SkillDefinition {
  role: PipelineRole;
  systemPrompt: string;
  constraints: string[];
  outputContract: string[];
  requiredSections: string[];
}

// ─── Phase Result ────────────────────────────────────────

export interface PhaseResult {
  success: boolean;
  phase: PipelinePhase;
  artifacts: ArtifactEntry[];
  errors?: string[];
  /** For consensus phases: the consensus packet produced */
  consensusPacket?: ConsensusPacket;
  /** For recovery: the RCA packet produced */
  rcaPacket?: RCAPacket;
}

// ─── Phase Context ───────────────────────────────────────

/**
 * Context passed to every phase handler.
 * Defined as an interface so phase implementations can import it.
 * The orchestrator constructs this before entering the phase loop.
 */
export interface PhaseContext {
  projectDir: string;
  pipeline: PipelineState;
  skillsDir?: string;
}

// ─── Pipeline State ──────────────────────────────────────

export const PipelineStateSchema = z.object({
  pipelinePhase: PipelinePhaseSchema,
  artifacts: z.array(ArtifactEntrySchema),
  recoveryCount: z.number().int().min(0),
  maxRecoveryIterations: z.number().int().positive(),
  gateResults: z.record(z.string(), z.object({
    phase: PipelinePhaseSchema,
    pass: z.boolean(),
    score: z.number().optional(),
    blockers: z.array(z.string()),
    missingArtifacts: z.array(ArtifactTypeSchema),
    failedChecks: z.array(GateCheckTypeSchema),
    consensusScore: z.number().optional(),
    finalStatus: z.string().optional(),  // v2.4.3: 'APPROVED' | 'REJECTED' | 'ARBITRATED'
    timestamp: z.string(),
  })),
  gateChecks: z.record(z.string(), z.array(GateCheckResultSchema)),
  activeRoles: z.array(PipelineRoleSchema),
  constitutionHash: z.string(),
  latestRepoSnapshot: ArtifactRefSchema.optional(),
  resolvedCommands: ResolvedCommandsSchema.optional(),
  /** Tracks which phase failed, for recovery routing */
  failedPhase: PipelinePhaseSchema.optional(),
  /** Last rewind target from recovery — detects repeated same-target rewinds (v2.4.6) */
  lastRewindTarget: PipelinePhaseSchema.optional(),
  /** v2.6.0: Auto-recovery result — tracks whether arbitrator guidance was attempted before STUCK */
  autoRecoveryResult: z.enum(['success', 'timeout', 'invalid', 'error']).optional(),
  /** v2.7.0: Baseline failure count before recovery — for regression detection */
  recoveryBaselineFailedCheckCount: z.number().int().min(0).optional(),
  /** Session guidance: user steering, upgrade context, or resume instructions */
  sessionGuidance: z.string().optional(),
  /** Pending change requests that force re-routing to consensus phases (v1.1) */
  pendingChangeRequests: z.array(z.object({
    cr_id: z.string(),
    change_type: z.enum(['scope', 'architecture', 'dependency', 'config', 'requirement']),
    target_phase: PipelinePhaseSchema,
    status: z.enum(['proposed', 'approved', 'rejected', 'resolved']),
    drift_key: z.string().optional(),
  })).optional(),
  /** ID of the CR currently being processed by the routed phase (v2.4.9) */
  activeChangeRequestId: z.string().optional(),
  /** Snapshot override: after config CR resolved, REVIEW uses this instead of CONSENSUS_ROLE_PLANS baseline (v2.4.9) */
  baselineSnapshotOverride: ArtifactRefSchema.optional(),
  /** Rolling loop signatures for stagnation detection (v2.4.9) */
  lastSignatures: z.array(z.string()).optional(),
  /** Skill usage events for coverage enforcement (v2.2.1) */
  skillUsageEvents: z.array(z.object({
    role: PipelineRoleSchema,
    phase: PipelinePhaseSchema,
    used_as: z.enum(['system_prompt', 'review_prompt', 'arbitration_prompt', 'role_context', 'planning_prompt', 'other']),
    skill_source: z.enum(['project_override', 'defaults']),
    skill_version: z.string().optional(),
    timestamp: z.string(),
  })).optional(),
});
export type PipelineState = z.infer<typeof PipelineStateSchema>;

// ─── Pipeline Result ─────────────────────────────────────

export interface PipelineResult {
  finalPhase: PipelinePhase;
  success: boolean;
  artifacts: ArtifactEntry[];
  recoveryIterations: number;
  error?: string;
}

// ─── Consensus Modes ─────────────────────────────────────

export type ConsensusMode = 'independent' | 'iterative';

// ─── Helper: legacy phase mapping ────────────────────────

/**
 * Maps pipeline phases to the legacy 3-phase WorkflowPhase.
 * Used for backward compatibility with existing state/UI code.
 */
export function toLegacyPhase(phase: PipelinePhase): 'plan' | 'execution' | 'complete' {
  switch (phase) {
    case 'INTAKE':
    case 'CONSENSUS_MASTER_PLAN':
    case 'ARCHITECTURE':
    case 'CONSENSUS_ARCHITECTURE':
    case 'ROLE_PLANNING':
    case 'CONSENSUS_ROLE_PLANS':
      return 'plan';
    case 'IMPLEMENTATION':
    case 'QA_VALIDATION':
    case 'REVIEW':
    case 'AUDIT':
    case 'PRODUCTION_GATE':
    case 'RECOVERY_LOOP':
    case 'STUCK':
      return 'execution';
    case 'DONE':
      return 'complete';
  }
}

// ─── Default pipeline state factory ──────────────────────

export function createDefaultPipelineState(): PipelineState {
  return {
    pipelinePhase: 'INTAKE',
    artifacts: [],
    recoveryCount: 0,
    maxRecoveryIterations: 5,
    gateResults: {},
    gateChecks: {},
    activeRoles: [],
    constitutionHash: '',
    skillUsageEvents: [],
  };
}
