/**
 * Consensus Runner tests — vote aggregation, packet construction,
 * prompt building. (LLM calls are not tested here.)
 */

import { describe, it, expect } from 'vitest';
import {
  buildReviewPrompt,
} from '../../src/pipeline/consensus/consensus-runner.js';
import {
  buildConsensusPacket,
} from '../../src/pipeline/packets/consensus-packet-builder.js';
import type {
  PlanPacket,
  ReviewerVote,
  ArtifactRef,
} from '../../src/pipeline/types.js';

function makeRef(type: string = 'master_plan'): ArtifactRef {
  return {
    artifact_id: `ref-${type}`,
    path: `docs/${type}.md`,
    sha256: 'abc',
    version: 1,
    type: type as ArtifactRef['type'],
  };
}

function makePlanPacket(overrides: Partial<PlanPacket> = {}): PlanPacket {
  return {
    metadata: {
      packet_id: 'plan-1',
      timestamp: new Date().toISOString(),
      phase: 'INTAKE',
      submitted_by: 'DISPATCHER',
      version: 1,
    },
    references: {
      master_plan: makeRef('master_plan'),
      constitution: makeRef('constitution'),
      repo_snapshot: makeRef('repo_snapshot'),
    },
    proposed_artifacts: [],
    acceptance_criteria: ['All endpoints documented', 'Tests for all routes'],
    artifact_dependencies: [],
    constraints: [
      { type: 'technical', description: 'Use TypeScript', source: makeRef() },
    ],
    ...overrides,
  };
}

function makeVote(
  reviewerId: string,
  vote: 'APPROVE' | 'REJECT' | 'CONDITIONAL',
  confidence: number = 0.9,
): ReviewerVote {
  return {
    reviewer_id: reviewerId,
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    prompt_hash: 'hash',
    vote,
    confidence,
    blocking_issues: vote === 'REJECT' ? ['blocking issue'] : [],
    suggestions: [],
    evidence_refs: [],
  };
}

describe('ConsensusRunner', () => {
  describe('buildReviewPrompt', () => {
    it('should include phase and submitter', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('INTAKE');
      expect(prompt).toContain('DISPATCHER');
    });

    it('should include acceptance criteria', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('All endpoints documented');
      expect(prompt).toContain('Tests for all routes');
    });

    it('should include constraints', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('technical');
      expect(prompt).toContain('Use TypeScript');
    });

    it('should include open questions when present', () => {
      const packet = makePlanPacket({
        open_questions: ['Which database?', 'Auth strategy?'],
      });
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('Which database?');
      expect(prompt).toContain('Auth strategy?');
    });

    it('should include review instructions', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('REJECT');
      expect(prompt).toContain('CONDITIONAL');
      expect(prompt).toContain('Completeness');
    });
  });

  describe('vote aggregation via buildConsensusPacket', () => {
    it('should approve when all reviewers approve with sufficient quorum', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'APPROVE'), makeVote('r2', 'APPROVE')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.final_status).toBe('APPROVED');
      expect(packet.consensus_result.approved).toBe(true);
      expect(packet.consensus_result.score).toBe(1.0);
    });

    it('should reject when below threshold', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'APPROVE'), makeVote('r2', 'REJECT')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.final_status).toBe('REJECTED');
      expect(packet.consensus_result.score).toBe(0.5);
    });

    it('should handle multi-provider votes', () => {
      const votes: ReviewerVote[] = [
        { ...makeVote('r1', 'APPROVE'), provider: 'openai', model: 'gpt-4o' },
        { ...makeVote('r2', 'APPROVE'), provider: 'gemini', model: 'gemini-2.0-flash' },
        { ...makeVote('r3', 'APPROVE'), provider: 'grok', model: 'grok-3' },
      ];

      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes,
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.consensus_result.participating_reviewers).toBe(3);
      expect(packet.final_status).toBe('APPROVED');
    });

    it('should count CONDITIONAL as non-approve', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'APPROVE'), makeVote('r2', 'CONDITIONAL')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      // CONDITIONAL is not APPROVE, so score = 0.5
      expect(packet.consensus_result.score).toBe(0.5);
      expect(packet.final_status).toBe('REJECTED');
    });

    it('should use ARBITRATED status when arbitrator is present', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'APPROVE'), makeVote('r2', 'REJECT')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
        arbitratorResult: { decision: 'Approve with amendments' },
      });

      expect(packet.final_status).toBe('ARBITRATED');
    });

    it('should reject when quorum not met', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'APPROVE')],
        rules: { threshold: 0.5, quorum: 2, min_reviewers: 2 },
      });

      // 1 approver, score = 1.0, but quorum = 2, only 1 voter
      expect(packet.consensus_result.approved).toBe(false);
    });

    it('should link plan packet reference', () => {
      const planRef = makeRef();
      const packet = buildConsensusPacket({
        planPacketRef: planRef,
        votes: [makeVote('r1', 'APPROVE')],
        rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      });

      expect(packet.plan_packet_reference).toBe(planRef);
      expect(packet.metadata.plan_packet_id).toBe(planRef.artifact_id);
    });
  });
});
