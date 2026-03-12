/**
 * Consensus Packet Builder — aggregates reviewer votes into a ConsensusPacket.
 * Auto-computes consensus result (score, approval) and final status.
 * v2.0: Option B scoring — avg(baseWeight * confidence) per reviewer.
 *       REJECT guard: REJECT with true blockers prevents APPROVED (not ARBITRATED).
 *       Normalization summary passthrough.
 */

import { randomUUID } from 'node:crypto';

import type {
  ArtifactRef,
  ReviewerVote,
  ConsensusPacket,
} from '../types.js';
import { isNoneVariant } from '../../shared/text-utils.js';

export interface ConsensusRules {
  threshold: number;
  quorum: number;
  min_reviewers: number;
}

export interface NormalizationSummary {
  tagged_blockers_demoted_to_suggestions: number;
  tagged_blockers_demoted_to_required: number;
  untagged_from_blocking_routed_to_required: number;
  forced_rejects: number;
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
  normalizationMoves?: NormalizationSummary;
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
 * Option B weighted score: average of (vote_weight * confidence) per reviewer.
 * v2.4.2: Returns honest rawWeighted score + has_true_blockers flag.
 * Force-zero veto removed — governance guard in buildConsensusPacket() is
 * the single enforcement point for blocker-based rejection.
 */
export function computeConsensusScore(
  votes: ReviewerVote[],
): { score: number; weighted_score: number; has_true_blockers: boolean } {
  if (votes.length === 0) return { score: 0, weighted_score: 0, has_true_blockers: false };

  // Simple score (backward compat): approve ratio
  const approvedCount = votes.filter((v) => v.vote === 'APPROVE').length;
  const score = approvedCount / votes.length;

  // Option B scoring: average of (vote_weight * confidence) per reviewer
  let weightedSum = 0;
  for (const v of votes) {
    const baseWeight = VOTE_WEIGHTS[v.vote] ?? 0;
    weightedSum += baseWeight * v.confidence;
  }
  const rawWeighted = weightedSum / votes.length;

  // v2.4.2: Detect true blockers but don't force score to 0.
  // Downstream code uses has_true_blockers for decisions instead.
  const has_true_blockers = votes.some(
    (v) => v.vote === 'REJECT' && v.blocking_issues.some((issue) => !isNoneVariant(issue)),
  );

  return {
    score,
    weighted_score: rawWeighted,
    has_true_blockers,
  };
}

export function buildConsensusPacket(args: BuildConsensusPacketArgs): ConsensusPacket {
  const { planPacketRef, votes, rules, arbitratorResult, normalizationMoves } = args;

  const { score, weighted_score, has_true_blockers } = computeConsensusScore(votes);

  // Use weighted_score (not simple score) for approval decision
  const approved = weighted_score >= rules.threshold && votes.length >= rules.quorum;

  let finalStatus: 'APPROVED' | 'REJECTED' | 'ARBITRATED';
  if (arbitratorResult) {
    finalStatus = 'ARBITRATED';
  } else if (approved) {
    finalStatus = 'APPROVED';
  } else {
    finalStatus = 'REJECTED';
  }

  // Governance guard: REJECT with true blockers prevents APPROVED (but not ARBITRATED)
  const hasRejectWithTrueBlockers = votes.some(
    (v) => v.vote === 'REJECT' && v.blocking_issues.some((i) => !isNoneVariant(i)),
  );
  if (hasRejectWithTrueBlockers && finalStatus === 'APPROVED') {
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
      has_true_blockers,
    },
    arbitrator_result: arbitratorResult,
    final_status: finalStatus,
    normalization_moves: normalizationMoves,
  };
}
