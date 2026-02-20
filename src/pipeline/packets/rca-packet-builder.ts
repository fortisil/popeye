/**
 * RCA Packet Builder — constructs Root Cause Analysis packets
 * with explicit phase rewind routing (P1-3).
 */

import { randomUUID } from 'node:crypto';

import type { PipelinePhase, RCAPacket } from '../types.js';

export interface BuildRCAPacketArgs {
  incidentSummary: string;
  symptoms: string[];
  rootCause: string;
  responsibleLayer: string;
  originPhase: PipelinePhase;
  governanceGap: string;
  correctiveActions: string[];
  prevention: string;
  rewindTo?: PipelinePhase;
  requiresConsensusOn?: PipelinePhase[];
}

export function buildRCAPacket(args: BuildRCAPacketArgs): RCAPacket {
  return {
    rca_id: randomUUID(),
    timestamp: new Date().toISOString(),
    incident_summary: args.incidentSummary,
    symptoms: args.symptoms,
    root_cause: args.rootCause,
    responsible_layer: args.responsibleLayer,
    origin_phase: args.originPhase,
    governance_gap: args.governanceGap,
    corrective_actions: args.correctiveActions,
    prevention: args.prevention,
    requires_phase_rewind_to: args.rewindTo,
    requires_consensus_on: args.requiresConsensusOn,
  };
}
