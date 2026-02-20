/**
 * Consensus Packet Builder — aggregates reviewer votes into a ConsensusPacket.
 * Auto-computes consensus result (score, approval) and final status.
 * v1.1: Added confidence-weighted scoring.
 */

import { randomUUID } from 'node:crypto';

import type {
  ArtifactRef,
  ReviewerVote,
  ConsensusPacket,
} from '../types.js';

export interface ConsensusRules {
  threshold: number;
  quorum: number;
  min_reviewers: number;
}

export interface BuildConsensusPacketArgs {
  planPacketRef: ArtifactRef;
  votes: ReviewerVote[];
  rules: ConsensusRules;
  arbitratorResult?: {
    decision: string;
    merged_patch?: string;
    artifact_ref?: ArtifactRef;
  };
}

/** Vote weight mapping: APPROVE=1.0, CONDITIONAL=0.5, REJECT=0.0 */
const VOTE_WEIGHTS: Record<string, number> = {
  'APPROVE': 1.0,
  'CONDITIONAL': 0.5,
  'REJECT': 0.0,
};

/**
 * Compute both simple and confidence-weighted consensus scores.
 *
 * Simple score: approve count / total votes (backward compat).
 * Weighted score: each vote's weight (APPROVE=1, CONDITIONAL=0.5, REJECT=0)
 * multiplied by voter confidence, then averaged by total confidence.
 * If any vote has blocking_issues, weighted_score is forced to 0.
 */
export function computeConsensusScore(
  votes: ReviewerVote[],
): { score: number; weighted_score: number } {
  if (votes.length === 0) return { score: 0, weighted_score: 0 };

  // Simple score (backward compat): approve ratio
  const approvedCount = votes.filter((v) => v.vote === 'APPROVE').length;
  const score = approvedCount / votes.length;

  // Weighted score: confidence-weighted vote values
  let totalWeight = 0;
  let weightedSum = 0;
  for (const v of votes) {
    const w = v.confidence;
    weightedSum += (VOTE_WEIGHTS[v.vote] ?? 0) * w;
    totalWeight += w;
  }
  const rawWeighted = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Override: any vote with blocking_issues forces weighted_score to 0
  const hasBlockingIssues = votes.some((v) => v.blocking_issues.length > 0);

  return {
    score,
    weighted_score: hasBlockingIssues ? 0 : rawWeighted,
  };
}

export function buildConsensusPacket(args: BuildConsensusPacketArgs): ConsensusPacket {
  const { planPacketRef, votes, rules, arbitratorResult } = args;

  const { score, weighted_score } = computeConsensusScore(votes);
  const approved = score >= rules.threshold && votes.length >= rules.quorum;

  let finalStatus: 'APPROVED' | 'REJECTED' | 'ARBITRATED';
  if (arbitratorResult) {
    finalStatus = 'ARBITRATED';
  } else if (approved) {
    finalStatus = 'APPROVED';
  } else {
    finalStatus = 'REJECTED';
  }

  return {
    metadata: {
      packet_id: randomUUID(),
      timestamp: new Date().toISOString(),
      plan_packet_id: planPacketRef.artifact_id,
    },
    plan_packet_reference: planPacketRef,
    reviewer_votes: votes,
    consensus_rules: {
      threshold: rules.threshold,
      quorum: rules.quorum,
      min_reviewers: rules.min_reviewers,
    },
    consensus_result: {
      approved,
      score,
      weighted_score,
      participating_reviewers: votes.length,
    },
    arbitrator_result: arbitratorResult,
    final_status: finalStatus,
  };
}
