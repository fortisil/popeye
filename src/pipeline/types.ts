/**
 * Pipeline type definitions — barrel re-export from type-defs/ sub-modules.
 *
 * All types are defined in src/pipeline/type-defs/ for modularity:
 *   enums.ts     — PipelinePhase, PipelineRole
 *   artifacts.ts — ArtifactType, ArtifactRef, ArtifactEntry, DependencyEdge
 *   packets.ts   — PlanPacket, ConsensusPacket, ReviewerVote, RCAPacket, ChangeRequest
 *   audit.ts     — AuditFinding, AuditReport, ProductionReadiness
 *   snapshot.ts  — RepoSnapshot, ConfigFileEntry, PortEntry, SnapshotDiff
 *   checks.ts    — GateCheckType, GateCheckResult, ResolvedCommands
 *   state.ts     — PipelineState, GateResult, GateDefinition, SkillDefinition
 *
 * This file re-exports everything so existing imports work unchanged.
 */

export * from './type-defs/index.js';
