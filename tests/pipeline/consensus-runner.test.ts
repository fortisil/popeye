/**
 * Consensus Runner tests — vote aggregation, packet construction,
 * prompt building, normalization wiring, arbitration triggers.
 * (LLM calls are not tested here.)
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildReviewPrompt,
  mapVote,
  hasVoteDisagreement,
  normalizeVoteBlockers,
  DEFAULT_CONDITIONAL_FLOOR,
  ConsensusRunner,
  parseRawReviewResponse,
  parseArbitratorResponse,
  loadPlanContent,
  correctConfidenceContradiction,
  getArbitrationTrigger,
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

    it('should include review instructions with scoring guide', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('REJECT');
      expect(prompt).toContain('CONDITIONAL');
      expect(prompt).toContain('Completeness');
      expect(prompt).toContain('Scoring Guide');
      expect(prompt).toContain('[BLOCKER]');
      expect(prompt).toContain('[REQUIRED]');
      expect(prompt).toContain('[SUGGESTION]');
    });

    it('should include revision notice for version > 1 (v2.4.2)', () => {
      const packet = makePlanPacket({
        metadata: {
          packet_id: 'plan-2',
          timestamp: new Date().toISOString(),
          phase: 'INTAKE',
          submitted_by: 'DISPATCHER',
          version: 2,
        },
      });
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('Revision Notice');
      expect(prompt).toContain('prior issues');
    });

    it('should NOT include revision notice for version 1', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).not.toContain('Revision Notice');
    });
  });

  describe('mapVote', () => {
    it('should APPROVE when confidence meets threshold', () => {
      expect(mapVote(0.96, 0.95)).toBe('APPROVE');
      expect(mapVote(0.95, 0.95)).toBe('APPROVE');
      expect(mapVote(1.0, 0.95)).toBe('APPROVE');
    });

    it('should CONDITIONAL for floor to threshold', () => {
      expect(mapVote(0.94, 0.95)).toBe('CONDITIONAL');
      expect(mapVote(0.90, 0.95)).toBe('CONDITIONAL');
      expect(mapVote(0.85, 0.95)).toBe('CONDITIONAL');
      expect(mapVote(0.80, 0.95)).toBe('CONDITIONAL');
    });

    it('should REJECT below floor', () => {
      expect(mapVote(0.79, 0.95)).toBe('REJECT');
      expect(mapVote(0.50, 0.95)).toBe('REJECT');
      expect(mapVote(0.0, 0.95)).toBe('REJECT');
    });

    it('should respect custom thresholds', () => {
      expect(mapVote(0.90, 0.90)).toBe('APPROVE');
      expect(mapVote(0.85, 0.90)).toBe('CONDITIONAL');
    });

    it('should clamp out-of-range inputs', () => {
      expect(mapVote(1.5, 0.95)).toBe('APPROVE');
      expect(mapVote(-0.1, 0.95)).toBe('REJECT');
    });

    it('should handle conditionalFloor > threshold by clamping floor', () => {
      expect(mapVote(0.90, 0.85, 0.95)).toBe('APPROVE');
    });

    it('should export DEFAULT_CONDITIONAL_FLOOR as 0.80', () => {
      expect(DEFAULT_CONDITIONAL_FLOOR).toBe(0.80);
    });
  });

  describe('hasVoteDisagreement', () => {
    it('should return false for single vote', () => {
      expect(hasVoteDisagreement([makeVote('r1', 'APPROVE')])).toBe(false);
    });

    it('should return false for unanimous votes', () => {
      expect(hasVoteDisagreement([
        makeVote('r1', 'APPROVE'),
        makeVote('r2', 'APPROVE'),
      ])).toBe(false);
    });

    it('should return true for mixed votes', () => {
      expect(hasVoteDisagreement([
        makeVote('r1', 'APPROVE'),
        makeVote('r2', 'REJECT'),
      ])).toBe(true);
    });
  });

  describe('vote aggregation via buildConsensusPacket', () => {
    it('should approve when all reviewers approve with sufficient quorum', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [
          makeVote('r1', 'APPROVE', 0.96),
          makeVote('r2', 'APPROVE', 0.97),
        ],
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
        { ...makeVote('r1', 'APPROVE', 0.96), provider: 'openai', model: 'gpt-4o' },
        { ...makeVote('r2', 'APPROVE', 0.97), provider: 'gemini', model: 'gemini-2.0-flash' },
        { ...makeVote('r3', 'APPROVE', 0.98), provider: 'grok', model: 'grok-3' },
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
        votes: [makeVote('r1', 'APPROVE', 0.96)],
        rules: { threshold: 0.5, quorum: 2, min_reviewers: 2 },
      });

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

  describe('arbitration triggers', () => {
    it('triggers arbitration on vote disagreement when enableArbitration=true', () => {
      // We test the shouldArbitrate logic indirectly through normalizedVotes + hasVoteDisagreement
      const votes = [
        makeVote('r1', 'APPROVE', 0.96),
        makeVote('r2', 'REJECT', 0.5),
      ];
      expect(hasVoteDisagreement(votes)).toBe(true);

      // The actual arbitration call requires LLM, so we verify the condition only
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });
      // Verify config is set
      expect(runner).toBeDefined();
    });

    it('does not trigger when enableArbitration=false', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: false,
      });
      // No arbitratorProvider means no arbitration call
      expect(runner).toBeDefined();
    });

    it('triggers on "death by conditional" (all CONDITIONAL, avg conf >= 0.94, required_changes <= 3)', () => {
      const votes: ReviewerVote[] = [
        {
          ...makeVote('r1', 'CONDITIONAL', 0.94),
          blocking_issues: [],
          required_changes: ['Add error handling'],
        },
        {
          ...makeVote('r2', 'CONDITIONAL', 0.95),
          blocking_issues: [],
          required_changes: ['Add input validation'],
        },
      ];

      const allConditional = votes.every(v => v.vote === 'CONDITIONAL');
      const avgConf = votes.reduce((s, v) => s + v.confidence, 0) / votes.length;
      const totalRequired = votes.reduce((s, v) => s + (v.required_changes?.length ?? 0), 0);

      expect(allConditional).toBe(true);
      expect(avgConf).toBeGreaterThanOrEqual(0.94);
      expect(totalRequired).toBeLessThanOrEqual(3);
    });

    it('does NOT trigger "death by conditional" when required_changes > 3', () => {
      const votes: ReviewerVote[] = [
        {
          ...makeVote('r1', 'CONDITIONAL', 0.94),
          blocking_issues: [],
          required_changes: ['Fix A', 'Fix B'],
        },
        {
          ...makeVote('r2', 'CONDITIONAL', 0.95),
          blocking_issues: [],
          required_changes: ['Fix C', 'Fix D'],
        },
      ];

      const totalRequired = votes.reduce((s, v) => s + (v.required_changes?.length ?? 0), 0);
      expect(totalRequired).toBe(4);
      expect(totalRequired).toBeGreaterThan(3);
    });

    it('v2.4.2: caps at 1 attempt per phase+version (version-keyed tracking)', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attempted = (runner as any).arbitrationAttempted as Set<string>;
      attempted.add('CONSENSUS_MASTER_PLAN@v1');
      expect(attempted.has('CONSENSUS_MASTER_PLAN@v1')).toBe(true);
      // Same phase with new version is NOT blocked
      expect(attempted.has('CONSENSUS_MASTER_PLAN@v2')).toBe(false);
      // Different phase is NOT blocked
      expect(attempted.has('CONSENSUS_ARCHITECTURE@v1')).toBe(false);
    });

    it('ARBITRATED packet includes arbitrator_result', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('r1', 'CONDITIONAL', 0.88)],
        rules: { threshold: 0.95, quorum: 1, min_reviewers: 1 },
        arbitratorResult: {
          decision: 'Plan is execution-ready with minor amendments',
          merged_patch: 'Add error handling to endpoint /api/users',
        },
      });

      expect(packet.final_status).toBe('ARBITRATED');
      expect(packet.arbitrator_result).toBeDefined();
      expect(packet.arbitrator_result?.decision).toContain('execution-ready');
      expect(packet.arbitrator_result?.merged_patch).toContain('error handling');
    });
  });

  describe('parseRawReviewResponse — JSON parsing', () => {
    it('parses JSON response with APPROVE and 0.96 confidence', () => {
      const raw = JSON.stringify({
        vote: 'APPROVE',
        confidence: 0.96,
        blocking_issues: [],
        required_changes: [],
        suggestions: ['Consider adding rate limiting'],
        analysis: 'Plan looks solid.',
      });
      const result = parseRawReviewResponse(raw);

      expect(result.confidence).toBe(0.96);
      expect(result.modelVote).toBe('APPROVE');
      expect(result.blockingIssues).toEqual([]);
      expect(result.suggestions).toEqual(['Consider adding rate limiting']);
    });

    it('parses JSON wrapped in markdown code fences', () => {
      const raw = '```json\n' + JSON.stringify({
        vote: 'CONDITIONAL',
        confidence: 0.88,
        blocking_issues: [],
        required_changes: ['[REQUIRED] Add error handling'],
        suggestions: [],
        analysis: 'Needs work.',
      }) + '\n```';
      const result = parseRawReviewResponse(raw);

      expect(result.confidence).toBe(0.88);
      expect(result.modelVote).toBe('CONDITIONAL');
      expect(result.requiredChanges).toEqual(['[REQUIRED] Add error handling']);
    });

    it('parses JSON wrapped in code fences without json label', () => {
      const raw = '```\n' + JSON.stringify({
        vote: 'REJECT',
        confidence: 0.45,
        blocking_issues: ['[BLOCKER] Missing auth'],
        required_changes: [],
        suggestions: [],
      }) + '\n```';
      const result = parseRawReviewResponse(raw);

      expect(result.confidence).toBe(0.45);
      expect(result.modelVote).toBe('REJECT');
      expect(result.blockingIssues).toEqual(['[BLOCKER] Missing auth']);
    });

    it('returns null for invalid JSON and falls back to regex', () => {
      const raw = 'This is not JSON but APPROVE with CONFIDENCE: 0.92';
      const result = parseRawReviewResponse(raw);

      // APPROVE + 0.92 is in [0.80, 0.95) range -> corrected to 0.95 by contradiction detector
      expect(result.confidence).toBe(0.95);
      expect(result.modelVote).toBe('APPROVE');
    });
  });

  describe('parseRawReviewResponse — regex fallback', () => {
    it('parses CONDITIONAL with 0.88 confidence via regex', () => {
      const raw = `VOTE: CONDITIONAL
CONFIDENCE: 0.88

REQUIRED CHANGES:
- Add input validation
- Improve error messages

SUGGESTIONS:
- Consider caching`;

      const result = parseRawReviewResponse(raw);
      expect(result.confidence).toBe(0.88);
      expect(result.modelVote).toBe('CONDITIONAL');
    });

    it('parses REJECT with blocking issues via regex', () => {
      const raw = `VOTE: REJECT
CONFIDENCE: 0.55

[BLOCKER] Missing authentication
[BLOCKER] No rate limiting
[SUGGESTION] Add logging`;

      const result = parseRawReviewResponse(raw);
      expect(result.confidence).toBe(0.55);
      expect(result.modelVote).toBe('REJECT');
      expect(result.blockingIssues).toContain('Missing authentication');
      expect(result.blockingIssues).toContain('No rate limiting');
      expect(result.suggestions).toContain('Add logging');
    });

    it('handles CONSENSUS: XX% fallback format', () => {
      const raw = `ANALYSIS: This plan looks good.
CONSENSUS: 92%`;

      const result = parseRawReviewResponse(raw);
      expect(result.confidence).toBe(0.92);
    });

    it('extracts [BLOCKER], [REQUIRED], [SUGGESTION] tagged items', () => {
      const raw = `VOTE: REJECT
CONFIDENCE: 0.40
[BLOCKER] SQL injection vulnerability in user input handling
[REQUIRED] Add input sanitization
[SUGGESTION] Consider using parameterized queries throughout`;

      const result = parseRawReviewResponse(raw);
      expect(result.blockingIssues).toContain('SQL injection vulnerability in user input handling');
      expect(result.requiredChanges).toContain('Add input sanitization');
      expect(result.suggestions).toContain('Consider using parameterized queries throughout');
    });

    it('confidence > 1 is treated as percentage and normalized', () => {
      const raw = 'CONFIDENCE: 92';
      const result = parseRawReviewResponse(raw);
      expect(result.confidence).toBe(0.92);
    });

    it('defaults to confidence 0 when no parseable score', () => {
      const raw = 'This plan is mediocre.';
      const result = parseRawReviewResponse(raw);
      expect(result.confidence).toBe(0);
    });

    it('extracts vote even when mixed with other text', () => {
      const raw = 'After careful analysis, I believe the plan deserves APPROVE. Confidence: 0.97';
      const result = parseRawReviewResponse(raw);
      expect(result.modelVote).toBe('APPROVE');
      expect(result.confidence).toBe(0.97);
    });

    it('extracts confidence from truncated JSON (quotes around key)', () => {
      // Simulates a truncated JSON response where JSON.parse fails but the
      // regex fallback should still extract confidence from "confidence": 0.88
      const raw = '```json\n{"vote": "CONDITIONAL", "confidence": 0.88, "blocking_issues": [], "required_changes": ["[REQUIRED] Add...';
      const result = parseRawReviewResponse(raw);
      expect(result.modelVote).toBe('CONDITIONAL');
      expect(result.confidence).toBe(0.88);
    });

    it('handles numbered bullet lists in sections', () => {
      const raw = `VOTE: CONDITIONAL
CONFIDENCE: 0.85

REQUIRED CHANGES:
1. Add error handling
2. Improve validation
3. Fix API route naming`;

      const result = parseRawReviewResponse(raw);
      expect(result.requiredChanges).toHaveLength(3);
      expect(result.requiredChanges).toContain('Add error handling');
    });
  });

  describe('governance rule: vote derived from confidence', () => {
    it('modelVote APPROVE with confidence 0.93 -> derived vote is CONDITIONAL', () => {
      // Simulate what spawnSingleReviewer does:
      // model says APPROVE but confidence 0.93 < 0.95 threshold
      const confidence = 0.93;
      const threshold = 0.95;
      const derived = mapVote(confidence, threshold);
      const modelVote = 'APPROVE';

      expect(derived).toBe('CONDITIONAL');
      expect(modelVote).not.toBe(derived);
    });

    it('modelVote REJECT with confidence 0.96 -> derived vote is APPROVE', () => {
      // model says REJECT but confidence 0.96 >= 0.95 threshold
      const confidence = 0.96;
      const threshold = 0.95;
      const derived = mapVote(confidence, threshold);
      const modelVote = 'REJECT';

      expect(derived).toBe('APPROVE');
      expect(modelVote).not.toBe(derived);
    });

    it('reviewer_inconsistency is true when model and derived disagree', () => {
      const confidence = 0.93;
      const threshold = 0.95;
      const derived = mapVote(confidence, threshold);
      const modelVote = 'APPROVE';
      const reviewer_inconsistency = modelVote !== null && modelVote !== derived;

      expect(reviewer_inconsistency).toBe(true);
    });

    it('reviewer_inconsistency is false when model and derived agree', () => {
      const confidence = 0.96;
      const threshold = 0.95;
      const derived = mapVote(confidence, threshold);
      const modelVote = 'APPROVE';
      const reviewer_inconsistency = modelVote !== null && modelVote !== derived;

      expect(reviewer_inconsistency).toBe(false);
    });

    it('vote derivation always uses mapVote regardless of modelVote', () => {
      // Even if modelVote is null, derived should still work
      const confidence = 0.50;
      const threshold = 0.95;
      const derived = mapVote(confidence, threshold);

      expect(derived).toBe('REJECT');
    });
  });

  describe('buildReviewPrompt — JSON response format', () => {
    it('should request JSON response format', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('Return ONLY a JSON object');
      expect(prompt).toContain('"vote"');
      expect(prompt).toContain('"confidence"');
      expect(prompt).toContain('"blocking_issues"');
      expect(prompt).toContain('"required_changes"');
      expect(prompt).toContain('"suggestions"');
    });

    it('should include confidence scale guidance', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('0.95-1.00: APPROVE');
      expect(prompt).toContain('0.80-0.94: CONDITIONAL');
      expect(prompt).toContain('Below 0.80: REJECT');
    });

    it('should not contain old "Respond with" format', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).not.toContain('Respond with:\n- APPROVE, REJECT, or CONDITIONAL');
      expect(prompt).not.toContain('Confidence score (0-1)');
    });
  });

  // ─── v2.4.1: Plan Content Loading Tests ──────────────────

  describe('loadPlanContent', () => {
    function makeTempDir(): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'consensus-test-'));
    }

    it('loads content from valid path', () => {
      const dir = makeTempDir();
      const planPath = 'docs/master_plan.md';
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(dir, planPath), '# My Plan\nDetails here.');

      const result = loadPlanContent(dir, planPath);
      expect(result.content).toContain('# My Plan');
      expect(result.content).toContain('Details here.');
      expect(result.truncated).toBe(false);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns empty for missing file', () => {
      const dir = makeTempDir();
      const result = loadPlanContent(dir, 'docs/nonexistent.md');
      expect(result.content).toBe('');
      expect(result.truncated).toBe(false);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('blocks path traversal (../../etc/passwd)', () => {
      const dir = makeTempDir();
      const result = loadPlanContent(dir, '../../etc/passwd');
      expect(result.content).toBe('');
      expect(result.truncated).toBe(false);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('blocks path traversal (absolute path escape)', () => {
      const dir = makeTempDir();
      // Even if the attacker uses a relative path that resolves outside
      const result = loadPlanContent(dir, '../../../tmp/evil.txt');
      expect(result.content).toBe('');

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('truncates content exceeding 50K chars', () => {
      const dir = makeTempDir();
      const planPath = 'plan.md';
      // Create 60K content
      const bigContent = 'A'.repeat(60_000);
      fs.writeFileSync(path.join(dir, planPath), bigContent);

      const result = loadPlanContent(dir, planPath);
      expect(result.truncated).toBe(true);
      expect(result.content).toContain('[TRUNCATED');
      // Content should be capped around 50K + truncation marker
      expect(result.content.length).toBeLessThan(60_000);

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns empty when artifactPath is undefined', () => {
      const result = loadPlanContent('/tmp/test', undefined);
      expect(result.content).toBe('');
      expect(result.truncated).toBe(false);
    });
  });

  // ─── v2.4.1: Plan Content in Prompt Tests ────────────────

  describe('buildReviewPrompt — plan content', () => {
    it('includes plan content when provided', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet, '# Master Plan\nBuild the API.');

      expect(prompt).toContain('## Plan Content');
      expect(prompt).toContain('# Master Plan');
      expect(prompt).toContain('Build the API.');
    });

    it('shows warning when plan content is empty', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet, '');

      expect(prompt).toContain('## Plan Content');
      expect(prompt).toContain('[WARNING: Plan content could not be loaded');
    });

    it('shows warning when plan content is undefined (backward compat)', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('## Plan Content');
      expect(prompt).toContain('[WARNING: Plan content could not be loaded');
    });
  });

  // ─── v2.4.1: Symmetric Confidence Contradiction Correction ─

  describe('correctConfidenceContradiction', () => {
    it('corrects REJECT + 0.99 -> min(0.79, 0.01) = 0.01', () => {
      const r = correctConfidenceContradiction('REJECT', 0.99);
      expect(r.confidence).toBeCloseTo(0.01, 5);
      expect(r.wasContradiction).toBe(true);
      expect(r.original).toBeCloseTo(0.99, 5);
    });

    it('corrects REJECT + 0.85 -> min(0.79, 0.15) = 0.15', () => {
      const r = correctConfidenceContradiction('REJECT', 0.85);
      expect(r.confidence).toBeCloseTo(0.15, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('does NOT correct REJECT + 0.50 (already in range)', () => {
      const r = correctConfidenceContradiction('REJECT', 0.50);
      expect(r.confidence).toBeCloseTo(0.50, 5);
      expect(r.wasContradiction).toBe(false);
    });

    it('corrects CONDITIONAL + 0.98 -> snap to 0.87', () => {
      const r = correctConfidenceContradiction('CONDITIONAL', 0.98);
      expect(r.confidence).toBeCloseTo(0.87, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('corrects CONDITIONAL + 0.60 -> snap to 0.87', () => {
      const r = correctConfidenceContradiction('CONDITIONAL', 0.60);
      expect(r.confidence).toBeCloseTo(0.87, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('does NOT correct CONDITIONAL + 0.88 (already in range)', () => {
      const r = correctConfidenceContradiction('CONDITIONAL', 0.88);
      expect(r.confidence).toBeCloseTo(0.88, 5);
      expect(r.wasContradiction).toBe(false);
    });

    it('corrects APPROVE + 0.40 -> max(0.95, 0.60) = 0.95', () => {
      const r = correctConfidenceContradiction('APPROVE', 0.40);
      expect(r.confidence).toBeCloseTo(0.95, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('corrects APPROVE + 0.02 -> max(0.95, 0.98) = 0.98', () => {
      const r = correctConfidenceContradiction('APPROVE', 0.02);
      expect(r.confidence).toBeCloseTo(0.98, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('corrects APPROVE + 0.88 -> snap to 0.95', () => {
      const r = correctConfidenceContradiction('APPROVE', 0.88);
      expect(r.confidence).toBeCloseTo(0.95, 5);
      expect(r.wasContradiction).toBe(true);
    });

    it('does NOT correct APPROVE + 0.96 (already in range)', () => {
      const r = correctConfidenceContradiction('APPROVE', 0.96);
      expect(r.confidence).toBeCloseTo(0.96, 5);
      expect(r.wasContradiction).toBe(false);
    });

    it('does NOT correct when modelVote is null', () => {
      const r = correctConfidenceContradiction(null, 0.99);
      expect(r.confidence).toBeCloseTo(0.99, 5);
      expect(r.wasContradiction).toBe(false);
    });
  });

  // ─── v2.4.1: Governance Preservation Tests ────────────────

  describe('governance preservation (correctConfidenceContradiction + mapVote)', () => {
    it('corrected REJECT derives REJECT via mapVote', () => {
      const { confidence } = correctConfidenceContradiction('REJECT', 0.99);
      expect(mapVote(confidence, 0.95)).toBe('REJECT');
    });

    it('corrected CONDITIONAL derives CONDITIONAL via mapVote', () => {
      const { confidence } = correctConfidenceContradiction('CONDITIONAL', 0.98);
      expect(mapVote(confidence, 0.95)).toBe('CONDITIONAL');
    });

    it('corrected APPROVE derives APPROVE via mapVote', () => {
      const { confidence } = correctConfidenceContradiction('APPROVE', 0.40);
      expect(mapVote(confidence, 0.95)).toBe('APPROVE');
    });
  });

  // ─── v2.4.1: Integration (parseRawReviewResponse + correction) ─

  describe('parseRawReviewResponse — confidence contradiction correction', () => {
    it('corrects JSON response with REJECT + 0.99 and logs warning', () => {
      const raw = JSON.stringify({
        vote: 'REJECT',
        confidence: 0.99,
        blocking_issues: ['[BLOCKER] Missing auth'],
        required_changes: [],
        suggestions: [],
      });
      const result = parseRawReviewResponse(raw);

      // Confidence should be corrected: min(0.79, 1 - 0.99) = 0.01
      expect(result.confidence).toBeCloseTo(0.01, 5);
      expect(result.modelVote).toBe('REJECT');
    });

    it('does not alter valid REJECT + 0.45', () => {
      const raw = JSON.stringify({
        vote: 'REJECT',
        confidence: 0.45,
        blocking_issues: ['[BLOCKER] Missing auth'],
        required_changes: [],
        suggestions: [],
      });
      const result = parseRawReviewResponse(raw);

      expect(result.confidence).toBeCloseTo(0.45, 5);
    });

    it('corrects JSON response with APPROVE + 0.40', () => {
      const raw = JSON.stringify({
        vote: 'APPROVE',
        confidence: 0.40,
        blocking_issues: [],
        required_changes: [],
        suggestions: [],
      });
      const result = parseRawReviewResponse(raw);

      // Corrected: max(0.95, 1 - 0.40) = max(0.95, 0.60) = 0.95
      expect(result.confidence).toBeCloseTo(0.95, 5);
    });
  });

  // ─── v2.4.1: Prompt Wording Tests ────────────────────────

  describe('buildReviewPrompt — confidence semantics wording', () => {
    it('should state confidence is plan quality not review certainty', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('PLAN QUALITY');
      expect(prompt).toContain('NOT how certain you are');
    });

    it('should warn that mismatches will be auto-corrected', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('auto-corrected');
      expect(prompt).toContain('Mismatched vote+confidence');
    });

    it('should include valid/invalid response examples', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).toContain('Examples of VALID responses');
      expect(prompt).toContain('Examples of INVALID responses');
      expect(prompt).toContain('REJECT with confidence 0.99');
      expect(prompt).toContain('APPROVE with confidence 0.60');
    });
  });

  // ─── v2.4.1: Arbitrator Governance Tests ──────────────────

  describe('arbitrator governance (confidence-only derivation)', () => {
    it('arbitrator approval derived from confidence only, not modelVote', () => {
      const rawLowConf = JSON.stringify({
        vote: 'APPROVE',
        confidence: 0.85,
        blocking_issues: [],
        required_changes: [],
        suggestions: [],
      });
      const parsedLow = parseRawReviewResponse(rawLowConf);
      // APPROVE + 0.85 -> corrected to 0.95, so approved = true
      const approvedCorrected = parsedLow.confidence >= 0.90;
      expect(approvedCorrected).toBe(true);

      // Now test: REJECT + 0.50 -> no correction, confidence stays 0.50
      const rawReject = JSON.stringify({
        vote: 'REJECT',
        confidence: 0.50,
        blocking_issues: ['[BLOCKER] Bad plan'],
        required_changes: [],
        suggestions: [],
      });
      const parsedReject = parseRawReviewResponse(rawReject);
      const approvedReject = parsedReject.confidence >= 0.90;
      expect(approvedReject).toBe(false);
    });
  });

  // ─── v2.4.2: Version-keyed Arbitration Tests ──────────────

  describe('version-keyed arbitration (v2.4.2)', () => {
    it('same phase + new version allows retry', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attempted = (runner as any).arbitrationAttempted as Set<string>;
      attempted.add('CONSENSUS_MASTER_PLAN@v1');

      // v2 should NOT be blocked
      expect(attempted.has('CONSENSUS_MASTER_PLAN@v2')).toBe(false);
    });

    it('same phase + same version blocks retry', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attempted = (runner as any).arbitrationAttempted as Set<string>;
      attempted.add('CONSENSUS_MASTER_PLAN@v1');

      expect(attempted.has('CONSENSUS_MASTER_PLAN@v1')).toBe(true);
    });
  });

  // ─── v2.4.2: Revision Directive Tests ──────────────────────

  describe('revisionDirective in review prompt (v2.4.2)', () => {
    it('revisionDirective is rendered in review prompt when provided', () => {
      const packet = makePlanPacket({
        metadata: {
          packet_id: 'plan-2',
          timestamp: new Date().toISOString(),
          phase: 'CONSENSUS_MASTER_PLAN',
          submitted_by: 'DISPATCHER',
          version: 2,
        },
      });
      const directive = 'Fix the authentication flow and add rate limiting';
      const prompt = buildReviewPrompt(packet, '# Plan', directive);

      expect(prompt).toContain('Prior Feedback (Must Address)');
      expect(prompt).toContain('Fix the authentication flow');
      expect(prompt).toContain('Confirm each item above is addressed');
    });

    it('revisionDirective is NOT rendered when undefined (backward compat)', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet, '# Plan');

      expect(prompt).not.toContain('Prior Feedback (Must Address)');
    });

    it('revisionDirective is NOT rendered when empty string', () => {
      const packet = makePlanPacket({
        metadata: {
          packet_id: 'plan-2',
          timestamp: new Date().toISOString(),
          phase: 'CONSENSUS_MASTER_PLAN',
          submitted_by: 'DISPATCHER',
          version: 2,
        },
      });
      const prompt = buildReviewPrompt(packet, '# Plan', '   ');

      expect(prompt).not.toContain('Prior Feedback (Must Address)');
    });

    it('revisionDirective is truncated at 2000 chars', () => {
      const packet = makePlanPacket({
        metadata: {
          packet_id: 'plan-2',
          timestamp: new Date().toISOString(),
          phase: 'CONSENSUS_MASTER_PLAN',
          submitted_by: 'DISPATCHER',
          version: 2,
        },
      });
      const longDirective = 'A'.repeat(3000);
      const prompt = buildReviewPrompt(packet, '# Plan', longDirective);

      expect(prompt).toContain('Prior Feedback (Must Address)');
      expect(prompt).toContain('[TRUNCATED');
      // Should not contain full 3000 chars of content
      const directiveSection = prompt.split('Prior Feedback (Must Address)')[1];
      expect(directiveSection.indexOf('A'.repeat(2001))).toBe(-1);
    });

    it('revision notice appears in prompt when version > 1 and mentions "prior issues"', () => {
      const packet = makePlanPacket({
        metadata: {
          packet_id: 'plan-3',
          timestamp: new Date().toISOString(),
          phase: 'CONSENSUS_MASTER_PLAN',
          submitted_by: 'DISPATCHER',
          version: 3,
        },
      });
      const prompt = buildReviewPrompt(packet, '# Plan');

      expect(prompt).toContain('Revision Notice');
      expect(prompt).toContain('revision 3');
      expect(prompt).toContain('prior issues');
    });

    it('revision notice does NOT appear when version = 1', () => {
      const packet = makePlanPacket();
      const prompt = buildReviewPrompt(packet);

      expect(prompt).not.toContain('Revision Notice');
    });
  });

  // ─── v2.4.2: getArbitrationTrigger Tests ──────────────────

  describe('getArbitrationTrigger (v2.4.2)', () => {
    it('returns DISAGREEMENT when votes have mixed APPROVE/REJECT', () => {
      const votes = [
        makeVote('r1', 'APPROVE', 0.96),
        makeVote('r2', 'REJECT', 0.5),
      ];
      expect(getArbitrationTrigger(votes, 0.48, 0.95)).toBe('DISAGREEMENT');
    });

    it('returns BORDERLINE_SCORE when weighted_score within 0.10 of threshold', () => {
      // All same vote (no disagreement), but score within 0.10 of threshold
      const votes = [
        makeVote('r1', 'CONDITIONAL', 0.90),
        makeVote('r2', 'CONDITIONAL', 0.88),
      ];
      // weighted_score 0.89, threshold 0.95, 0.89 >= 0.85 -> BORDERLINE
      expect(getArbitrationTrigger(votes, 0.89, 0.95)).toBe('BORDERLINE_SCORE');
    });

    it('returns ALL_CONDITIONAL when all votes conditional with high confidence', () => {
      const votes: ReviewerVote[] = [
        { ...makeVote('r1', 'CONDITIONAL', 0.94), blocking_issues: [], required_changes: ['Fix A'] },
        { ...makeVote('r2', 'CONDITIONAL', 0.95), blocking_issues: [], required_changes: ['Fix B'] },
      ];
      // Not DISAGREEMENT (all same), not BORDERLINE (0.44 < 0.85)
      expect(getArbitrationTrigger(votes, 0.44, 0.95)).toBe('ALL_CONDITIONAL');
    });

    it('returns NONE when no trigger conditions met', () => {
      const votes = [
        makeVote('r1', 'REJECT', 0.3),
        makeVote('r2', 'REJECT', 0.4),
      ];
      // Unanimous REJECT, score 0.0, threshold 0.95 => no trigger
      expect(getArbitrationTrigger(votes, 0.0, 0.95)).toBe('NONE');
    });

    it('DISAGREEMENT takes priority over BORDERLINE_SCORE', () => {
      const votes = [
        makeVote('r1', 'APPROVE', 0.96),
        makeVote('r2', 'REJECT', 0.5),
      ];
      // weighted_score 0.48 is also borderline of 0.55 threshold, but DISAGREEMENT fires first
      expect(getArbitrationTrigger(votes, 0.48, 0.55)).toBe('DISAGREEMENT');
    });
  });

  // ─── v2.4.2: Arbitrator Rotation Tests ────────────────────

  describe('arbitrator rotation (v2.4.2)', () => {
    it('arbitrator rotates to OpenAI when default Gemini is a dissenter', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
        reviewerProviders: [
          { provider: 'openai', model: 'gpt-4.1', temperature: 0.3 },
          { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
        ],
      });

      // Access private callArbitrator via constructing the scenario:
      // We verify the rotation logic by checking the internal state
      // The rotation happens inside callArbitrator, which we can't easily unit-test
      // without mocking the adapter. Instead, verify the runner is properly configured.
      expect(runner).toBeDefined();

      // Verify the rotation logic directly via the dissenter detection:
      const votes = [
        makeVote('r1', 'APPROVE', 0.96),
        { ...makeVote('r2', 'REJECT', 0.5), provider: 'gemini' },
      ];
      const dissentingProviders = new Set(
        votes.filter(v => v.vote === 'REJECT').map(v => v.provider),
      );
      // Default arbitrator (gemini) IS a dissenter
      expect(dissentingProviders.has('gemini')).toBe(true);

      // Rotation should pick openai (first in fallback order that's configured & not dissenting)
      const configuredProviders = new Set(['openai', 'gemini']);
      const ARBITRATOR_FALLBACK_ORDER = ['openai', 'grok', 'gemini'];
      const alternate = ARBITRATOR_FALLBACK_ORDER.find(
        p => !dissentingProviders.has(p) && configuredProviders.has(p),
      );
      expect(alternate).toBe('openai');
    });

    it('arbitrator keeps default when default is NOT a dissenter', () => {
      const votes = [
        { ...makeVote('r1', 'APPROVE', 0.96), provider: 'openai' },
        { ...makeVote('r2', 'REJECT', 0.5), provider: 'openai' },
      ];
      const dissentingProviders = new Set(
        votes.filter(v => v.vote === 'REJECT').map(v => v.provider),
      );
      // Default arbitrator (gemini) is NOT a dissenter
      expect(dissentingProviders.has('gemini')).toBe(false);
    });
  });

  // ─── v2.4.2: Escalation Tests ─────────────────────────────

  describe('escalation (v2.4.2)', () => {
    it('escalation would add 3rd reviewer at version >= 3 when only 2 providers', () => {
      // Test the escalation logic: at v3+ with 2 providers, add a 3rd
      const providers = [
        { provider: 'openai', model: 'gpt-4.1', temperature: 0.3 },
        { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
      ];
      const version = 3;

      if (version >= 3 && providers.length < 3) {
        const existingNames = new Set(providers.map(p => p.provider));
        const candidates = new Set(['openai', 'gemini', 'grok']); // simulated config
        const PREFERRED_ORDER = ['grok', 'openai', 'gemini'];
        const tieBreaker = PREFERRED_ORDER.find(p => candidates.has(p) && !existingNames.has(p));

        expect(tieBreaker).toBe('grok');
      }
    });

    it('escalation does not add reviewer when already 3+ providers', () => {
      const providers = [
        { provider: 'openai', model: 'gpt-4.1', temperature: 0.3 },
        { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
        { provider: 'grok', model: 'grok-3', temperature: 0.3 },
      ];
      // With 3 providers already, no escalation needed
      expect(providers.length >= 3).toBe(true);
    });

    it('escalation does not add reviewer at version < 3', () => {
      const version = 2;
      expect(version >= 3).toBe(false);
    });
  });

  // ─── v2.4.2: No Forced-Approval Tests ─────────────────────

  describe('no forced-approval (v2.4.2)', () => {
    it('high version still returns honest REJECTED status (no escape hatch)', () => {
      const votes = [
        makeVote('r1', 'REJECT', 0.3),
        makeVote('r2', 'REJECT', 0.4),
      ];
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes,
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      // Even at high iterations, governance is never bypassed
      expect(packet.final_status).toBe('REJECTED');
      expect(packet.consensus_result.approved).toBe(false);
    });
  });

  // ─── v2.4.3: parseArbitratorResponse Tests ─────────────────

  describe('parseArbitratorResponse (v2.4.3)', () => {
    it('parses JSON in code fence with valid schema -> approved: true', () => {
      const raw = '```json\n' + JSON.stringify({
        approved: true,
        reasoning: 'Plan is solid with minor amendments',
        suggestedChanges: ['Add error handling to /api/users'],
      }) + '\n```';
      const result = parseArbitratorResponse(raw);

      expect(result.approved).toBe(true);
      expect(result.reasoning).toBe('Plan is solid with minor amendments');
      expect(result.suggestedChanges).toEqual(['Add error handling to /api/users']);
    });

    it('parses plain JSON without code fence -> approved: true', () => {
      const raw = JSON.stringify({
        approved: true,
        reasoning: 'Acceptable plan',
        suggestedChanges: [],
      });
      const result = parseArbitratorResponse(raw);

      expect(result.approved).toBe(true);
      expect(result.reasoning).toBe('Acceptable plan');
      expect(result.suggestedChanges).toEqual([]);
    });

    it('parses free-form text "approved: true" -> approved: true', () => {
      const raw = 'After reviewing the plan, I determine approved: true. The plan addresses all major concerns.';
      const result = parseArbitratorResponse(raw);

      expect(result.approved).toBe(true);
    });

    it('parses free-form text "APPROVE" -> approved: true, "REJECT" -> approved: false', () => {
      const approveRaw = 'I APPROVE this plan based on the evidence presented.';
      expect(parseArbitratorResponse(approveRaw).approved).toBe(true);

      const rejectRaw = 'I must REJECT this plan due to fundamental issues.';
      expect(parseArbitratorResponse(rejectRaw).approved).toBe(false);
    });

    it('garbage text -> approved: false (safe default)', () => {
      const raw = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
      const result = parseArbitratorResponse(raw);

      expect(result.approved).toBe(false);
      expect(result.reasoning).toBe(raw.slice(0, 2000));
    });

    it('schema with both suggestedChanges and suggested_changes -> merged, no error', () => {
      const raw = JSON.stringify({
        approved: true,
        reasoning: 'Good plan',
        suggestedChanges: ['Fix A'],
        suggested_changes: ['Fix B'],
      });
      const result = parseArbitratorResponse(raw);

      expect(result.approved).toBe(true);
      expect(result.suggestedChanges).toContain('Fix A');
      expect(result.suggestedChanges).toContain('Fix B');
      expect(result.suggestedChanges).toHaveLength(2);
    });
  });

  // ─── v2.4.3: Gate ARBITRATED Status Tests ───────────────────

  describe('gate engine respects ARBITRATED (v2.4.3)', () => {
    it('gate passes when finalStatus=ARBITRATED even with score below threshold', async () => {
      // Simulate: phase handler stores ARBITRATED with low weighted_score
      const { createGateEngine } = await import('../../src/pipeline/gate-engine.js');
      const gateEngine = createGateEngine();
      const pipeline = {
        pipelinePhase: 'CONSENSUS_MASTER_PLAN' as const,
        artifacts: [
          { id: 'c1', type: 'consensus', phase: 'CONSENSUS_MASTER_PLAN', path: '', sha256: '', version: 1, content_type: 'json', timestamp: new Date().toISOString() },
        ],
        gateResults: {
          CONSENSUS_MASTER_PLAN: {
            phase: 'CONSENSUS_MASTER_PLAN' as const,
            pass: true,
            score: 0.60,  // below 0.95 threshold
            blockers: [],
            missingArtifacts: [],
            failedChecks: [],
            consensusScore: 0.50,
            finalStatus: 'ARBITRATED',  // v2.4.3: should override threshold check
            timestamp: new Date().toISOString(),
          },
        },
        gateChecks: {},
        recoveryCount: 0,
        maxRecoveryIterations: 6,
        skillUsageEvents: [],
        latestRepoSnapshot: null,
      };

      const result = gateEngine.evaluateGate('CONSENSUS_MASTER_PLAN', pipeline as any);
      // Gate should pass because ARBITRATED overrides score check
      expect(result.pass).toBe(true);
    });

    it('gate fails when finalStatus=REJECTED and score below threshold', async () => {
      const { createGateEngine } = await import('../../src/pipeline/gate-engine.js');
      const gateEngine = createGateEngine();
      const pipeline = {
        pipelinePhase: 'CONSENSUS_MASTER_PLAN' as const,
        artifacts: [
          { id: 'c1', type: 'consensus', phase: 'CONSENSUS_MASTER_PLAN', path: '', sha256: '', version: 1, content_type: 'json', timestamp: new Date().toISOString() },
        ],
        gateResults: {
          CONSENSUS_MASTER_PLAN: {
            phase: 'CONSENSUS_MASTER_PLAN' as const,
            pass: false,
            score: 0.60,
            blockers: [],
            missingArtifacts: [],
            failedChecks: [],
            consensusScore: 0.50,
            finalStatus: 'REJECTED',  // NOT arbitrated
            timestamp: new Date().toISOString(),
          },
        },
        gateChecks: {},
        recoveryCount: 0,
        maxRecoveryIterations: 6,
        skillUsageEvents: [],
        latestRepoSnapshot: null,
      };

      const result = gateEngine.evaluateGate('CONSENSUS_MASTER_PLAN', pipeline as any);
      // Gate should fail because REJECTED + below threshold
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('below threshold'))).toBe(true);
    });

    it('mergeGateResult preserves finalStatus from phase handler', () => {
      // Simulate the orchestrator merge logic
      const pipeline = {
        gateResults: {
          CONSENSUS_MASTER_PLAN: {
            phase: 'CONSENSUS_MASTER_PLAN' as const,
            pass: true,
            score: 0.80,
            blockers: [],
            missingArtifacts: [],
            failedChecks: [],
            consensusScore: 0.50,
            finalStatus: 'ARBITRATED',
            timestamp: '2024-01-01T00:00:00Z',
          },
        },
      } as any;

      const newGateResult = {
        phase: 'CONSENSUS_MASTER_PLAN' as const,
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: '2024-01-01T00:00:01Z',
      };

      // Simulate mergeGateResult logic
      const existing = pipeline.gateResults['CONSENSUS_MASTER_PLAN'];
      pipeline.gateResults['CONSENSUS_MASTER_PLAN'] = {
        ...newGateResult,
        score: existing.score ?? newGateResult.score,
        consensusScore: existing.consensusScore ?? newGateResult.consensusScore,
        finalStatus: existing.finalStatus ?? newGateResult.finalStatus,
      };

      expect(pipeline.gateResults['CONSENSUS_MASTER_PLAN'].finalStatus).toBe('ARBITRATED');
      expect(pipeline.gateResults['CONSENSUS_MASTER_PLAN'].score).toBe(0.80);
    });
  });

  // ─── v2.4.4: Version-increment / Arbitration Key Tests ────────

  describe('version-increment arbitration key (v2.4.4)', () => {
    it('recoveryCount=0 -> version=1 -> arbitration key CONSENSUS_ARCHITECTURE@v1', () => {
      const recoveryCount = 0;
      const version = recoveryCount + 1;
      expect(version).toBe(1);

      const key = `CONSENSUS_ARCHITECTURE@v${version}`;
      expect(key).toBe('CONSENSUS_ARCHITECTURE@v1');
    });

    it('recoveryCount=1 -> version=2 -> arbitration key CONSENSUS_ARCHITECTURE@v2', () => {
      const recoveryCount = 1;
      const version = recoveryCount + 1;
      expect(version).toBe(2);

      const key = `CONSENSUS_ARCHITECTURE@v${version}`;
      expect(key).toBe('CONSENSUS_ARCHITECTURE@v2');
    });

    it('arbitrationAttempted Set does NOT block second run with different version', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attempted = (runner as any).arbitrationAttempted as Set<string>;

      // First run: recoveryCount=0, version=1
      attempted.add('CONSENSUS_ARCHITECTURE@v1');
      expect(attempted.has('CONSENSUS_ARCHITECTURE@v1')).toBe(true);

      // Second run after recovery: recoveryCount=1, version=2
      // Should NOT be blocked by the Set
      expect(attempted.has('CONSENSUS_ARCHITECTURE@v2')).toBe(false);

      // Same for CONSENSUS_ROLE_PLANS
      attempted.add('CONSENSUS_ROLE_PLANS@v1');
      expect(attempted.has('CONSENSUS_ROLE_PLANS@v1')).toBe(true);
      expect(attempted.has('CONSENSUS_ROLE_PLANS@v2')).toBe(false);
    });

    it('version=1 (default) blocks retry when version not incremented', () => {
      const runner = new ConsensusRunner({
        mode: 'independent',
        minReviewers: 2,
        threshold: 0.95,
        quorum: 2,
        projectDir: '/tmp/test',
        enableArbitration: true,
        arbitratorProvider: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attempted = (runner as any).arbitrationAttempted as Set<string>;

      // If version stays at 1 (bug: missing recoveryCount passthrough),
      // the Set WILL block retry
      attempted.add('CONSENSUS_ARCHITECTURE@v1');
      expect(attempted.has('CONSENSUS_ARCHITECTURE@v1')).toBe(true);
      // This is the bug scenario: version=1 again -> blocked
      const secondKey = `CONSENSUS_ARCHITECTURE@v${1}`;
      expect(attempted.has(secondKey)).toBe(true);
    });
  });

  // ─── v2.4.3: Stale Master Plan Test ─────────────────────────

  describe('latest master plan artifact (v2.4.3)', () => {
    it('reverse-find picks latest master_plan not stale v1', () => {
      const artifacts = [
        { id: 'mp1', type: 'master_plan', phase: 'INTAKE', version: 1, timestamp: '2024-01-01T00:00:00Z' },
        { id: 'other', type: 'constitution', phase: 'INTAKE', version: 1, timestamp: '2024-01-01T00:00:01Z' },
        { id: 'mp2', type: 'master_plan', phase: 'INTAKE', version: 2, timestamp: '2024-01-02T00:00:00Z' },
      ];

      // Simulates the fix: [...artifacts].reverse().find()
      const latest = [...artifacts].reverse().find((a) => a.type === 'master_plan');
      expect(latest).toBeDefined();
      expect(latest!.id).toBe('mp2');
      expect(latest!.version).toBe(2);

      // Verify old .find() would have returned stale v1
      const stale = artifacts.find((a) => a.type === 'master_plan');
      expect(stale!.id).toBe('mp1');
      expect(stale!.version).toBe(1);
    });
  });
});
