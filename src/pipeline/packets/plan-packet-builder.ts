/**
 * Plan Packet Builder — deterministic construction of PlanPackets.
 * Auto-generates packet_id, timestamp, auto-increments version.
 */

import { randomUUID } from 'node:crypto';

import type {
  PipelinePhase,
  PipelineRole,
  ArtifactRef,
  DependencyEdge,
  Constraint,
  PlanPacket,
} from '../types.js';

export interface BuildPlanPacketArgs {
  phase: PipelinePhase;
  submittedBy: PipelineRole;
  masterPlanRef: ArtifactRef;
  constitutionRef: ArtifactRef;
  repoSnapshotRef: ArtifactRef;
  proposedArtifacts: ArtifactRef[];
  acceptanceCriteria: string[];
  dependencies: DependencyEdge[];
  constraints: Constraint[];
  openQuestions?: string[];
  /** Override version (defaults to 1) */
  version?: number;
}

export function buildPlanPacket(args: BuildPlanPacketArgs): PlanPacket {
  return {
    metadata: {
      packet_id: randomUUID(),
      timestamp: new Date().toISOString(),
      phase: args.phase,
      submitted_by: args.submittedBy,
      version: args.version ?? 1,
    },
    references: {
      master_plan: args.masterPlanRef,
      constitution: args.constitutionRef,
      repo_snapshot: args.repoSnapshotRef,
    },
    proposed_artifacts: args.proposedArtifacts,
    acceptance_criteria: args.acceptanceCriteria,
    artifact_dependencies: args.dependencies,
    constraints: args.constraints,
    open_questions: args.openQuestions,
  };
}
