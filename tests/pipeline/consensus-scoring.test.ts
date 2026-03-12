/**
 * Consensus Scoring tests — Option B scoring, normalization, REJECT guard,
 * force-zero semantics, backward compat.
 */

import { describe, it, expect } from 'vitest';
import { computeConsensusScore } from '../../src/pipeline/packets/consensus-packet-builder.js';
import { buildConsensusPacket } from '../../src/pipeline/packets/consensus-packet-builder.js';
import { normalizeVoteBlockers } from '../../src/pipeline/consensus/consensus-runner.js';
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

describe('computeConsensusScore (Option B)', () => {
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
    // Option B: (1.0*0.9 + 1.0*0.8) / 2 = 0.85
    expect(result.weighted_score).toBeCloseTo(0.85, 3);
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
    // Option B: (0.5 * 1.0) / 1 = 0.5
    expect(result.weighted_score).toBe(0.5);
  });

  it('should average per reviewer (Option B)', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({ vote: 'REJECT', confidence: 0.1, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0.5); // Simple: 1/2
    // Option B: (1.0*1.0 + 0.0*0.1) / 2 = 0.5
    expect(result.weighted_score).toBe(0.5);
  });

  it('should return honest weighted_score when REJECT vote has real blocking issues (v2.4.2: no force-zero)', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.5,
        blocking_issues: ['Critical bug found'],
        reviewer_id: 'r2',
      }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0.5); // Simple score unaffected
    // v2.4.2: honest score (1.0*1.0 + 0.0*0.5) / 2 = 0.5
    expect(result.weighted_score).toBeCloseTo(0.5, 3);
    expect(result.has_true_blockers).toBe(true);
  });

  it('should NOT force-zero when only non-REJECT votes have blocking_issues', () => {
    // After normalization, APPROVE/CONDITIONAL votes never have blocking_issues.
    // But the scorer must still handle pre-normalization edge cases gracefully.
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({
        vote: 'CONDITIONAL',
        confidence: 0.9,
        blocking_issues: ['Consider auth approach'],
        reviewer_id: 'r2',
      }),
    ];
    const result = computeConsensusScore(votes);
    // Force-zero only fires for REJECT votes with real blockers
    expect(result.weighted_score).toBeGreaterThan(0);
  });

  it('should NOT force weighted_score to 0 when blocking_issues contains only none-variants (defense-in-depth)', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 1.0, reviewer_id: 'r1' }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.5,
        blocking_issues: ['No blocking issues found'],
        reviewer_id: 'r2',
      }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBe(0.5);
    // Defense-in-depth: none-variant filtered, so score is NOT zeroed
    expect(result.weighted_score).toBeGreaterThan(0);
  });

  it('REJECT vote with real blocking issues returns honest score + has_true_blockers=true (v2.4.2)', () => {
    const votes = [
      makeVote({
        vote: 'REJECT',
        confidence: 0.95,
        blocking_issues: ['SQL injection vulnerability'],
        reviewer_id: 'r1',
      }),
      makeVote({ vote: 'APPROVE', confidence: 0.9, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    // v2.4.2: honest score (0.0*0.95 + 1.0*0.9) / 2 = 0.45
    expect(result.weighted_score).toBeCloseTo(0.45, 3);
    expect(result.has_true_blockers).toBe(true);
  });

  it('REJECT vote with no blockers: does NOT force-zero (scores 0 by weight, not by force)', () => {
    const votes = [
      makeVote({
        vote: 'REJECT',
        confidence: 0.5,
        blocking_issues: [],
        reviewer_id: 'r1',
      }),
      makeVote({ vote: 'APPROVE', confidence: 0.96, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    // Option B: (0*0.5 + 1.0*0.96) / 2 = 0.48
    expect(result.weighted_score).toBeCloseTo(0.48, 3);
  });

  it('APPROVE votes after normalization (no blockers left): not force-zeroed', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.96, blocking_issues: [], reviewer_id: 'r1' }),
      makeVote({ vote: 'APPROVE', confidence: 0.97, blocking_issues: [], reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    // Option B: (1.0*0.96 + 1.0*0.97) / 2 = 0.965
    expect(result.weighted_score).toBeCloseTo(0.965, 3);
    expect(result.weighted_score).toBeGreaterThan(0);
  });

  it('should handle mixed votes with varied confidence', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.8, reviewer_id: 'r1' }),
      makeVote({ vote: 'CONDITIONAL', confidence: 0.6, reviewer_id: 'r2' }),
      makeVote({ vote: 'REJECT', confidence: 0.4, reviewer_id: 'r3' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.score).toBeCloseTo(1 / 3, 3); // 1 approve / 3 total
    // Option B: (1.0*0.8 + 0.5*0.6 + 0.0*0.4) / 3 = 1.1/3 ≈ 0.367
    expect(result.weighted_score).toBeCloseTo(1.1 / 3, 3);
  });

  it('should NOT force weighted_score to 0 when concerns exist but no blocking issues', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.9, blocking_issues: [], suggestions: ['improve naming'], reviewer_id: 'r1' }),
      makeVote({ vote: 'APPROVE', confidence: 0.85, blocking_issues: [], suggestions: ['add caching'], reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.weighted_score).toBeGreaterThan(0.8);
  });

  it('CONDITIONAL-only votes should produce correct weighted_score', () => {
    const votes = [
      makeVote({ vote: 'CONDITIONAL', confidence: 0.90, reviewer_id: 'r1' }),
      makeVote({ vote: 'CONDITIONAL', confidence: 0.875, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    // Option B: (0.5*0.90 + 0.5*0.875) / 2 = 0.44375
    expect(result.weighted_score).toBeCloseTo(0.44375, 3);
  });

  it('mixed APPROVE+CONDITIONAL should produce correct weighted_score', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.96, reviewer_id: 'r1' }),
      makeVote({ vote: 'CONDITIONAL', confidence: 0.90, reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    // Option B: (1.0*0.96 + 0.5*0.90) / 2 = 1.41/2 = 0.705
    expect(result.weighted_score).toBeCloseTo(0.705, 3);
  });

  it('APPROVE with suggestions but no blocking_issues should NOT zero score', () => {
    const votes = [
      makeVote({
        vote: 'APPROVE', confidence: 0.96,
        blocking_issues: [], suggestions: ['consider caching', 'improve naming'],
        reviewer_id: 'r1',
      }),
      makeVote({
        vote: 'APPROVE', confidence: 0.95,
        blocking_issues: [], suggestions: ['add monitoring'],
        reviewer_id: 'r2',
      }),
    ];
    const result = computeConsensusScore(votes);
    // Option B: (1.0*0.96 + 1.0*0.95) / 2 = 0.955
    expect(result.weighted_score).toBeCloseTo(0.955, 3);
  });

  // v2.4.2: has_true_blockers tests
  it('computeConsensusScore returns has_true_blockers=true when REJECT has real blockers', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.97, reviewer_id: 'r1' }),
      makeVote({ vote: 'REJECT', confidence: 0.3, blocking_issues: ['Missing auth'], reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.has_true_blockers).toBe(true);
  });

  it('computeConsensusScore returns has_true_blockers=false when no REJECT has blockers', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.97, reviewer_id: 'r1' }),
      makeVote({ vote: 'REJECT', confidence: 0.3, blocking_issues: [], reviewer_id: 'r2' }),
    ];
    const result = computeConsensusScore(votes);
    expect(result.has_true_blockers).toBe(false);
  });

  it('computeConsensusScore returns has_true_blockers=false for empty votes', () => {
    const result = computeConsensusScore([]);
    expect(result.has_true_blockers).toBe(false);
  });
});

describe('normalizeVoteBlockers', () => {
  it('APPROVE + soft blockers -> moved to suggestions, blocking_issues cleared', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.96,
      blocking_issues: ['Consider auth approach', 'Add caching layer'],
      suggestions: ['Improve naming'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].blocking_issues).toEqual([]);
    expect(norm[0].suggestions).toContain('Consider auth approach');
    expect(norm[0].suggestions).toContain('Add caching layer');
    expect(norm[0].suggestions).toContain('Improve naming');
  });

  it('CONDITIONAL + soft blockers -> moved to required_changes, blocking_issues cleared', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['Add error handling', 'Need input validation'],
      suggestions: ['Improve docs'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].blocking_issues).toEqual([]);
    expect(norm[0].required_changes).toContain('Add error handling');
    expect(norm[0].required_changes).toContain('Need input validation');
    expect(norm[0].suggestions).toContain('Improve docs');
  });

  it('REJECT + blockers -> unchanged', () => {
    const votes = [makeVote({
      vote: 'REJECT',
      confidence: 0.5,
      blocking_issues: ['Critical security flaw'],
      suggestions: ['Rewrite auth module'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].blocking_issues).toContain('Critical security flaw');
    expect(norm[0].vote).toBe('REJECT');
  });

  it('APPROVE + [BLOCKER] tagged issue -> vote forced to REJECT, reviewer_inconsistency=true', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.96,
      blocking_issues: ['[BLOCKER] Missing authentication layer'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
    expect(norm[0].blocking_issues).toContain('Missing authentication layer');
    expect(summary.forced_rejects).toBe(1);
  });

  it('APPROVE + "SQL injection" pattern -> vote forced to REJECT', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.96,
      blocking_issues: ['The code has SQL injection vulnerabilities'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
  });

  it('Mixed votes: only REJECT retains blockers after normalization', () => {
    const votes = [
      makeVote({
        vote: 'APPROVE',
        confidence: 0.96,
        blocking_issues: ['Consider caching'],
        reviewer_id: 'r1',
      }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.5,
        blocking_issues: ['Critical data loss issue'],
        reviewer_id: 'r2',
      }),
    ];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].blocking_issues).toEqual([]);
    expect(norm[1].blocking_issues).toContain('Critical data loss issue');
  });

  it('Tag prefixes stripped when moving issues', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['[REQUIRED] Add error handling'],
      suggestions: ['[SUGGESTION] Improve docs'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].required_changes).toContain('Add error handling');
    expect(norm[0].suggestions).toContain('Improve docs');
    // Tags should be stripped
    expect(norm[0].required_changes?.some(r => r.includes('[REQUIRED]'))).toBe(false);
    expect(norm[0].suggestions.some(s => s.includes('[SUGGESTION]'))).toBe(false);
  });

  it('Idempotency: normalizeVoteBlockers(normalizeVoteBlockers(votes)) deep-equals single pass', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['Add error handling', 'Need validation'],
      suggestions: ['Improve docs'],
      reviewer_id: 'r1',
    })];
    const { votes: first } = normalizeVoteBlockers(votes);
    const { votes: second } = normalizeVoteBlockers(first);
    expect(second[0].blocking_issues).toEqual(first[0].blocking_issues);
    expect(second[0].required_changes).toEqual(first[0].required_changes);
    expect(second[0].suggestions).toEqual(first[0].suggestions);
    expect(second[0].vote).toEqual(first[0].vote);
  });

  it('Tags override vote: APPROVE with [BLOCKER] tag -> forced REJECT + blocker in output', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.98,
      blocking_issues: [],
      suggestions: ['[BLOCKER] XSS vulnerability in form handler'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].blocking_issues).toContain('XSS vulnerability in form handler');
    expect(norm[0].reviewer_inconsistency).toBe(true);
  });

  it('Hard pattern in suggestions triggers forced REJECT: APPROVE with "SQL injection" in suggestions', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.97,
      blocking_issues: [],
      suggestions: ['Watch out for SQL injection in the user input handler'],
      reviewer_id: 'r1',
    })];
    const { votes: norm } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
  });

  // v2.4.4: Vote-aware contradiction guard tests
  it('CONDITIONAL + hard pattern in suggestions only -> NOT forced REJECT', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: [],
      suggestions: ['Watch out for SQL injection in the user input handler'],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    // CONDITIONAL with hard pattern only in suggestions stays CONDITIONAL
    expect(norm[0].vote).toBe('CONDITIONAL');
    expect(summary.forced_rejects).toBe(0);
  });

  it('CONDITIONAL + hard pattern in blocking_issues (untagged) -> forced REJECT', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['SQL injection vulnerability in user input'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
    expect(summary.forced_rejects).toBe(1);
  });

  it('CONDITIONAL + [BLOCKER] tagged item -> forced REJECT', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['[BLOCKER] Critical data loss vulnerability'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
    expect(summary.forced_rejects).toBe(1);
  });

  it('CONDITIONAL + [REQUIRED] SQL injection in suggestions -> NOT forced REJECT', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: [],
      suggestions: ['[REQUIRED] SQL injection needs parameterized queries'],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    // [REQUIRED] tag reclassifies to required, NOT blocker. Hard pattern only in
    // required_changes (not blocker-origin), so CONDITIONAL stays.
    expect(norm[0].vote).toBe('CONDITIONAL');
    expect(summary.forced_rejects).toBe(0);
  });

  it('APPROVE + hard pattern in suggestions -> forced REJECT (genuinely inconsistent)', () => {
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.97,
      blocking_issues: [],
      suggestions: ['Beware of XSS vulnerabilities in form handler'],
      reviewer_id: 'r1',
    })];
    const { votes: norm, summary } = normalizeVoteBlockers(votes);
    // APPROVE scans ALL text for hard patterns -> forced REJECT
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].reviewer_inconsistency).toBe(true);
    expect(summary.forced_rejects).toBe(1);
  });
});

describe('normalizeVoteBlockers + computeConsensusScore (integration)', () => {
  it('APPROVE with "consider auth" -> normalize -> weighted_score not force-zeroed', () => {
    const votes = [
      makeVote({
        vote: 'APPROVE',
        confidence: 0.96,
        blocking_issues: ['Consider auth approach'],
        reviewer_id: 'r1',
      }),
      makeVote({ vote: 'APPROVE', confidence: 0.97, reviewer_id: 'r2' }),
    ];
    const { votes: norm } = normalizeVoteBlockers(votes);
    const result = computeConsensusScore(norm);
    expect(result.weighted_score).toBeGreaterThan(0);
    // Option B: (1.0*0.96 + 1.0*0.97) / 2 = 0.965
    expect(result.weighted_score).toBeCloseTo(0.965, 3);
  });

  it('APPROVE with "SQL injection" -> normalize -> forced REJECT -> has_true_blockers (v2.4.2)', () => {
    const votes = [
      makeVote({
        vote: 'APPROVE',
        confidence: 0.96,
        blocking_issues: ['SQL injection vulnerability found'],
        reviewer_id: 'r1',
      }),
      makeVote({ vote: 'APPROVE', confidence: 0.97, reviewer_id: 'r2' }),
    ];
    const { votes: norm } = normalizeVoteBlockers(votes);
    // First vote should have been forced to REJECT
    expect(norm[0].vote).toBe('REJECT');
    expect(norm[0].blocking_issues.length).toBeGreaterThan(0);

    const result = computeConsensusScore(norm);
    // v2.4.2: honest score > 0, has_true_blockers flags the issue
    expect(result.weighted_score).toBeGreaterThan(0);
    expect(result.has_true_blockers).toBe(true);
  });
});

describe('REJECT guard in buildConsensusPacket', () => {
  it('REJECT with true blockers prevents APPROVED final_status', () => {
    // Even if somehow score threshold is met, REJECT with blockers blocks APPROVED
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r1' }),
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r2' }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.3,
        blocking_issues: ['Critical security flaw'],
        reviewer_id: 'r3',
      }),
    ];
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes,
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
    });
    // Force-zero kicks in from scorer, plus REJECT guard
    expect(packet.final_status).toBe('REJECTED');
  });

  it('REJECT without blockers does NOT prevent APPROVED final_status', () => {
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r1' }),
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r2' }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.3,
        blocking_issues: [],
        reviewer_id: 'r3',
      }),
    ];
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes,
      // Low threshold so raw score passes
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
    });
    // Option B: (0.99 + 0.99 + 0) / 3 = 0.66 >= 0.5
    expect(packet.consensus_result.weighted_score).toBeGreaterThan(0);
    expect(packet.final_status).toBe('APPROVED');
  });

  it('governance guard prevents APPROVED even when honest weighted_score passes threshold (v2.4.2)', () => {
    // v2.4.2: with force-zero removed, weighted_score may exceed threshold
    // but governance guard still blocks APPROVED when REJECT has real blockers
    const votes = [
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r1' }),
      makeVote({ vote: 'APPROVE', confidence: 0.99, reviewer_id: 'r2' }),
      makeVote({
        vote: 'REJECT',
        confidence: 0.3,
        blocking_issues: ['Critical security flaw'],
        reviewer_id: 'r3',
      }),
    ];
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes,
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
    });
    // v2.4.2: weighted_score is honest (>0) but governance guard blocks APPROVED
    expect(packet.consensus_result.weighted_score).toBeGreaterThan(0);
    expect(packet.consensus_result.has_true_blockers).toBe(true);
    expect(packet.final_status).toBe('REJECTED');
  });

  it('REJECT guard does not affect ARBITRATED status', () => {
    const votes = [
      makeVote({
        vote: 'REJECT',
        confidence: 0.3,
        blocking_issues: ['Critical bug'],
        reviewer_id: 'r1',
      }),
    ];
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes,
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      arbitratorResult: { decision: 'Override: plan is acceptable with amendments' },
    });
    // Arbitration takes precedence over REJECT guard
    expect(packet.final_status).toBe('ARBITRATED');
  });
});

describe('normalization summary', () => {
  it('summary counts tagged_blockers_demoted_to_required for CONDITIONAL votes', () => {
    const votes = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['[BLOCKER] Need error handling', 'Add validation'],
      reviewer_id: 'r1',
    })];
    // Note: [BLOCKER] tag on CONDITIONAL triggers forced REJECT, NOT demotion
    // Let's test with untagged blockers instead
    const votesClean = [makeVote({
      vote: 'CONDITIONAL',
      confidence: 0.88,
      blocking_issues: ['Need error handling', 'Add validation'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { summary } = normalizeVoteBlockers(votesClean);
    expect(summary.untagged_from_blocking_routed_to_required).toBe(2);
  });

  it('summary counts tagged_blockers_demoted_to_suggestions for APPROVE votes', () => {
    // APPROVE with tagged [BLOCKER] triggers forced REJECT, not demotion.
    // Test with untagged (soft) blockers that get demoted to suggestions.
    const votes = [makeVote({
      vote: 'APPROVE',
      confidence: 0.96,
      blocking_issues: ['Consider caching', 'Maybe add retry logic'],
      suggestions: [],
      reviewer_id: 'r1',
    })];
    const { summary } = normalizeVoteBlockers(votes);
    // Untagged items from blocking → suggestions for APPROVE
    // tagged_blockers_demoted_to_suggestions is for [BLOCKER]-tagged items specifically
    expect(summary.tagged_blockers_demoted_to_suggestions).toBe(0);
  });

  it('summary counts forced_rejects for contradiction guard triggers', () => {
    const votes = [
      makeVote({
        vote: 'APPROVE',
        confidence: 0.96,
        blocking_issues: ['[BLOCKER] Missing auth'],
        reviewer_id: 'r1',
      }),
      makeVote({
        vote: 'CONDITIONAL',
        confidence: 0.88,
        suggestions: ['The code has SQL injection issues'],
        reviewer_id: 'r2',
      }),
    ];
    const { summary } = normalizeVoteBlockers(votes);
    // v2.4.4: Only APPROVE is forced to REJECT (tagged [BLOCKER]).
    // CONDITIONAL with hard pattern only in suggestions is NOT forced.
    expect(summary.forced_rejects).toBe(1);
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
    // Option B: (1.0 * 0.9) / 1 = 0.9
    expect(packet.consensus_result.weighted_score).toBeCloseTo(0.9, 3);
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

  it('should APPROVE when weighted_score meets threshold', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [
        makeVote({ vote: 'APPROVE', confidence: 0.96 }),
        makeVote({ vote: 'APPROVE', confidence: 0.97, reviewer_id: 'r2' }),
      ],
      rules: { threshold: 0.95, quorum: 1, min_reviewers: 1 },
    });
    // Option B: (0.96 + 0.97) / 2 = 0.965 >= 0.95
    expect(packet.final_status).toBe('APPROVED');
  });

  it('should REJECT when weighted_score below threshold', () => {
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

  it('should include normalization_moves when provided', () => {
    const packet = buildConsensusPacket({
      planPacketRef: mockRef,
      votes: [makeVote({ vote: 'APPROVE', confidence: 0.96 })],
      rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      normalizationMoves: {
        tagged_blockers_demoted_to_suggestions: 2,
        tagged_blockers_demoted_to_required: 1,
        untagged_from_blocking_routed_to_required: 3,
        forced_rejects: 0,
      },
    });
    expect(packet.normalization_moves).toBeDefined();
    expect(packet.normalization_moves?.tagged_blockers_demoted_to_suggestions).toBe(2);
  });
});
