/**
 * Pipeline module — re-exports all public APIs.
 */

// Core types
export type {
  PipelinePhase,
  PipelineRole,
  PipelineState,
  PipelineResult,
  ArtifactType,
  ArtifactRef,
  ArtifactEntry,
  PlanPacket,
  ConsensusPacket,
  ReviewerVote,
  RCAPacket,
  AuditFinding,
  AuditReport,
  RepoSnapshot,
  GateCheckResult,
  ResolvedCommands,
  ChangeRequest,
} from './types.js';

export {
  PipelinePhaseSchema,
  PipelineRoleSchema,
  createDefaultPipelineState,
} from './types.js';

// Orchestrator
export { runPipeline, resumePipeline } from './orchestrator.js';
export type { PipelineOptions } from './orchestrator.js';

// Gate Engine
export { createGateEngine, GateEngine } from './gate-engine.js';
export type { GateDefinition, GateResult } from './gate-engine.js';

// Artifact Manager
export { createArtifactManager, ArtifactManager } from './artifact-manager.js';

// Repo Snapshot
export { generateRepoSnapshot, diffSnapshots } from './repo-snapshot.js';

// Command Resolver
export { resolveCommands, detectProjectType } from './command-resolver.js';

// Check Runner
export { runCheck, runAllChecks, runPlaceholderScan, runStartCheck, runEnvCheck } from './check-runner.js';

// Packet Builders
export { buildPlanPacket, buildConsensusPacket, buildRCAPacket, buildAuditReport } from './packets/index.js';

// Skill Loader
export { createSkillLoader, SkillLoader } from './skill-loader.js';

// Consensus Runner
export { createConsensusRunner, ConsensusRunner } from './consensus/consensus-runner.js';

// Migration
export { migrateToPipelineState, needsPipelineMigration, toLegacyPhase } from './migration.js';

// Constitution (v1.1)
export { computeConstitutionHash, createConstitutionArtifact, verifyConstitution } from './constitution.js';

// Artifact Validators (v1.1)
export { validateArtifactCompleteness, getValidatableArtifactTypes } from './artifact-validators.js';
export type { ValidationResult } from './artifact-validators.js';

// Change Request (v1.1)
export { buildChangeRequest, routeChangeRequest, formatChangeRequest } from './change-request.js';

// Role Execution Adapter (v1.1)
export { buildRoleExecutionContext, executeWithRoleContext, buildAllRoleContexts } from './role-execution-adapter.js';
export type { RoleExecutionContext } from './role-execution-adapter.js';

// Consensus Packet Builder (v1.1 weighted scoring)
export { computeConsensusScore } from './packets/consensus-packet-builder.js';

// Phase types
export type { PhaseContext, PhaseResult } from './phases/index.js';
