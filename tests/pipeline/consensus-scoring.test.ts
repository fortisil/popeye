/**
 * Consensus Scoring tests — weighted scoring, CONDITIONAL handling,
 * blocking issues, confidence weights, backward compat.
 */

import { describe, it, expect } from 'vitest';
import { computeConsensusScore } from '../../src/pipeline/packets/consensus-packet-builder.js';
import { buildConsensusPacket } from '../../src/pipeline/packets/consensus-packet-builder.js';
import type { ReviewerVote, ArtifactRef } from '../../src/pipeline/types.js';

function makeVote(overrides: Partial<ReviewerVote> = {}): ReviewerVote {
  return {
    reviewer_id: 'r1',
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.2,
    prompt_hash: 'abc',
    vote: 'APPROVE',
    confidence: 0.9,
    blocking_issues: [],
    suggestions: [],
    evidence_refs: [],
    ...overrides,
  };
}

const mockRef: ArtifactRef = {
  artifact_id: 'test-ref',
  path: 'docs/test.md',
  sha256: 'abc123',
  version: 1,
  type: 'master_plan',
};

describe('computeConsensusScore', () => {
  it('should return 0 for empty votes', () => {
    const result = computeConsensusScore([]);
    expect(result.score).toBe(0);
    expect(result.weighted_score).toBe(0);
  });

  it('should return 1.0 for all APPROVE votes', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.9 }),
      makeVote({ vote: 'APPROVE', confidence: 0.8, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(1.0);
    expect(result.weighted_score).toBe(1.0);
  });

  it('should return 0 for all REJECT votes', () => {
    const votes = [
      makeVote({ vote: 'REJECT', confidence: 0.9, reviewer_id: 'r1' }),
      makeVote({ vote: 'REJECT', confidence: 0.8, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0);
    expect(result.weighted_score).toBe(0);
  });

  it('should treat CONDITIONAL as 0.5 weight', () => {
    const votes = [
      makeVote({ vote: 'CONDITIONAL', confidence: 1.0, reviewer_id: 'r1' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0); // Simple: 0 approves / 1 total
    expect(result.weighted_score).toBe(0.5); // Weighted: 0.5 * 1.0 / 1.0
  });

  it('should weight by confidence', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({ vote: 'REJECT', confidence: 0.1, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0.5); // Simple: 1/2
    // Weighted: (1.0*1.0 + 0.0*0.1) / (1.0+0.1) = 1.0/1.1 ≈ 0.909
    expect(result.weighted_score).toBeCloseTo(1.0 / 1.1, 3);
  });

  it('should force weighted_score to 0 when blocking issues exist', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({
        vote: 'CONDITIONAL',
        confidence: 0.9,
        blocking_issues: ['Critical bug found'],
        reviewer_id: 'r2',
      }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0.5); // Simple score unaffected
    expect(result.weighted_score).toBe(0); // Forced to 0 by blocking issues
  });

  it('should handle mixed votes with varied confidence', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.8, reviewer_id: 'r1' }),
      makeVote({ vote: 'CONDITIONAL', confidence: 0.6, reviewer_id: 'r2' }),
      makeVote({ vote: 'REJECT', confidence: 0.4, reviewer_id: 'r3' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBeCloseTo(1 / 3, 3); // 1 approve / 3 total
    // Weighted: (1.0*0.8 + 0.5*0.6 + 0.0*0.4) / (0.8+0.6+0.4) = 1.1/1.8 ≈ 0.611
    expect(result.weighted_score).toBeCloseTo(1.1 / 1.8, 3);
  });
});

describe('buildConsensusPacket', () => {
  it('should include weighted_score in consensus_result', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [makeVote({ vote: 'APPROVE', confidence: 0.9 })],
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
    });
    expect(packet.consensus_result.weighted_score).toBeDefined();
    expect(packet.consensus_result.weighted_score).toBe(1.0);
  });

  it('should maintain backward-compatible simple score', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [
        makeVote({ vote: 'APPROVE', reviewer_id: 'r1' }),
        makeVote({ vote: 'REJECT', reviewer_id: 'r2' }),
      ],
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
    });
    expect(packet.consensus_result.score).toBe(0.5);
  });

  it('should APPROVE when score meets threshold', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [makeVote({ vote: 'APPROVE' })],
      rules: { threshold: 0.95, quorum: 1, min_reviewers: 1 },
    });
    expect(packet.final_status).toBe('APPROVED');
  });

  it('should REJECT when score below threshold', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [
        makeVote({ vote: 'APPROVE', reviewer_id: 'r1' }),
        makeVote({ vote: 'REJECT', reviewer_id: 'r2' }),
      ],
      rules: { threshold: 0.95, quorum: 1, min_reviewers: 1 },
    });
    expect(packet.final_status).toBe('REJECTED');
  });

  it('should ARBITRATE when arbitrator result provided', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [makeVote({ vote: 'REJECT' })],
      rules: { threshold: 0.95, quorum: 1, min_reviewers: 1 },
      arbitratorResult: { decision: 'Override to approve' },
    });
    expect(packet.final_status).toBe('ARBITRATED');
  });
});
