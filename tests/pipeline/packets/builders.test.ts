/**
 * Packet Builders tests — all 4 builders: auto-compute, version increment.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPlanPacket,
  buildConsensusPacket,
  buildRCAPacket,
  buildAuditReport,
} from '../../../src/pipeline/packets/index.js';
import type { ArtifactRef, ReviewerVote, AuditFinding } from '../../../src/pipeline/types.js';

function makeRef(type: string = 'master_plan'): ArtifactRef {
  return {
    artifact_id: `ref-${type}`,
    path: `docs/${type}.md`,
    sha256: 'abc123',
    version: 1,
    type: type as ArtifactRef['type'],
  };
}

function makeVote(
  vote: 'APPROVE' | 'REJECT' | 'CONDITIONAL',
  reviewerId: string = 'reviewer-1',
): ReviewerVote {
  return {
    reviewer_id: reviewerId,
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    prompt_hash: 'hash123',
    vote,
    confidence: 0.9,
    blocking_issues: vote === 'REJECT' ? ['issue'] : [],
    suggestions: [],
    evidence_refs: [],
  };
}

describe('PacketBuilders', () => {
  describe('buildPlanPacket', () => {
    it('should create a valid plan packet', () => {
      const packet = buildPlanPacket({
        phase: 'INTAKE',
        submittedBy: 'DISPATCHER',
        masterPlanRef: makeRef('master_plan'),
        constitutionRef: makeRef('constitution'),
        repoSnapshotRef: makeRef('repo_snapshot'),
        proposedArtifacts: [makeRef('architecture')],
        acceptanceCriteria: ['All endpoints documented'],
        dependencies: [],
        constraints: [],
      });

      expect(packet.metadata.packet_id).toBeDefined();
      expect(packet.metadata.timestamp).toBeDefined();
      expect(packet.metadata.phase).toBe('INTAKE');
      expect(packet.metadata.submitted_by).toBe('DISPATCHER');
      expect(packet.metadata.version).toBe(1);
      expect(packet.references.master_plan.artifact_id).toBe('ref-master_plan');
      expect(packet.proposed_artifacts).toHaveLength(1);
      expect(packet.acceptance_criteria).toHaveLength(1);
    });

    it('should accept version override', () => {
      const packet = buildPlanPacket({
        phase: 'ARCHITECTURE',
        submittedBy: 'ARCHITECT',
        masterPlanRef: makeRef(),
        constitutionRef: makeRef(),
        repoSnapshotRef: makeRef('repo_snapshot'),
        proposedArtifacts: [],
        acceptanceCriteria: [],
        dependencies: [],
        constraints: [],
        version: 3,
      });

      expect(packet.metadata.version).toBe(3);
    });

    it('should include open questions when provided', () => {
      const packet = buildPlanPacket({
        phase: 'INTAKE',
        submittedBy: 'DISPATCHER',
        masterPlanRef: makeRef(),
        constitutionRef: makeRef(),
        repoSnapshotRef: makeRef('repo_snapshot'),
        proposedArtifacts: [],
        acceptanceCriteria: [],
        dependencies: [],
        constraints: [],
        openQuestions: ['Which database?', 'Auth strategy?'],
      });

      expect(packet.open_questions).toHaveLength(2);
    });
  });

  describe('buildConsensusPacket', () => {
    it('should auto-compute APPROVED when all approve', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1'), makeVote('APPROVE', 'r2')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.consensus_result.approved).toBe(true);
      expect(packet.consensus_result.score).toBe(1.0);
      expect(packet.consensus_result.participating_reviewers).toBe(2);
      expect(packet.final_status).toBe('APPROVED');
    });

    it('should auto-compute REJECTED when below threshold', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1'), makeVote('REJECT', 'r2')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.consensus_result.approved).toBe(false);
      expect(packet.consensus_result.score).toBe(0.5);
      expect(packet.final_status).toBe('REJECTED');
    });

    it('should set ARBITRATED when arbitrator present', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1'), makeVote('REJECT', 'r2')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
        arbitratorResult: { decision: 'Approve with changes' },
      });

      expect(packet.final_status).toBe('ARBITRATED');
      expect(packet.arbitrator_result?.decision).toBe('Approve with changes');
    });

    it('should reject when quorum not met', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1')],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      // Score is 1.0 but quorum=2, only 1 voter
      expect(packet.consensus_result.approved).toBe(false);
      expect(packet.final_status).toBe('REJECTED');
    });

    it('should handle zero votes', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [],
        rules: { threshold: 0.95, quorum: 2, min_reviewers: 2 },
      });

      expect(packet.consensus_result.score).toBe(0);
      expect(packet.consensus_result.approved).toBe(false);
    });

    it('should include weighted_score in consensus result (v1.1)', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1'), makeVote('APPROVE', 'r2')],
        rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      });

      expect(packet.consensus_result.weighted_score).toBeDefined();
      expect(typeof packet.consensus_result.weighted_score).toBe('number');
      expect(packet.consensus_result.weighted_score).toBe(1.0);
    });

    it('should have weighted_score < 1 for mixed votes (v1.1)', () => {
      const packet = buildConsensusPacket({
        planPacketRef: makeRef(),
        votes: [makeVote('APPROVE', 'r1'), makeVote('REJECT', 'r2')],
        rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      });

      // weighted_score should be 0 since REJECT vote has blocking_issues
      expect(packet.consensus_result.weighted_score).toBe(0);
    });

    it('should link to plan packet', () => {
      const planRef = makeRef();
      const packet = buildConsensusPacket({
        planPacketRef: planRef,
        votes: [makeVote('APPROVE')],
        rules: { threshold: 0.5, quorum: 1, min_reviewers: 1 },
      });

      expect(packet.metadata.plan_packet_id).toBe(planRef.artifact_id);
      expect(packet.plan_packet_reference).toBe(planRef);
    });
  });

  describe('buildRCAPacket', () => {
    it('should create RCA with all fields', () => {
      const rca = buildRCAPacket({
        incidentSummary: 'Tests failing on CI',
        symptoms: ['test timeout', 'flaky assertions'],
        rootCause: 'Race condition in async setup',
        responsibleLayer: 'test infrastructure',
        originPhase: 'QA_VALIDATION',
        governanceGap: 'No test isolation check',
        correctiveActions: ['Add mutex to shared resource'],
        prevention: 'Enable parallel test isolation',
      });

      expect(rca.rca_id).toBeDefined();
      expect(rca.timestamp).toBeDefined();
      expect(rca.incident_summary).toBe('Tests failing on CI');
      expect(rca.symptoms).toHaveLength(2);
      expect(rca.root_cause).toContain('Race condition');
      expect(rca.origin_phase).toBe('QA_VALIDATION');
      expect(rca.corrective_actions).toHaveLength(1);
    });

    it('should include rewind target when provided', () => {
      const rca = buildRCAPacket({
        incidentSummary: 'Architecture mismatch',
        symptoms: ['contract violation'],
        rootCause: 'Wrong API design',
        responsibleLayer: 'architecture',
        originPhase: 'IMPLEMENTATION',
        governanceGap: 'No contract validation',
        correctiveActions: ['Redesign API'],
        prevention: 'Add contract tests',
        rewindTo: 'ARCHITECTURE',
        requiresConsensusOn: ['ARCHITECTURE'],
      });

      expect(rca.requires_phase_rewind_to).toBe('ARCHITECTURE');
      expect(rca.requires_consensus_on).toEqual(['ARCHITECTURE']);
    });

    it('should leave rewind undefined when not needed', () => {
      const rca = buildRCAPacket({
        incidentSummary: 'Minor fix',
        symptoms: ['typo'],
        rootCause: 'Spelling error',
        responsibleLayer: 'documentation',
        originPhase: 'REVIEW',
        governanceGap: 'None',
        correctiveActions: ['Fix typo'],
        prevention: 'Add spell check',
      });

      expect(rca.requires_phase_rewind_to).toBeUndefined();
      expect(rca.requires_consensus_on).toBeUndefined();
    });
  });

  describe('buildAuditReport', () => {
    it('should PASS with no findings', () => {
      const report = buildAuditReport({
        repoSnapshot: makeRef('repo_snapshot'),
        findings: [],
      });

      expect(report.audit_id).toBeDefined();
      expect(report.overall_status).toBe('PASS');
      expect(report.system_risk_score).toBe(0);
      expect(report.recovery_required).toBe(false);
      expect(report.findings).toHaveLength(0);
    });

    it('should FAIL with blocking findings', () => {
      const finding: AuditFinding = {
        id: 'f1',
        severity: 'P0',
        category: 'security',
        description: 'SQL injection in login',
        evidence: [],
        blocking: true,
        suggested_owner: 'BACKEND_PROGRAMMER',
      };

      const report = buildAuditReport({
        repoSnapshot: makeRef('repo_snapshot'),
        findings: [finding],
      });

      expect(report.overall_status).toBe('FAIL');
      expect(report.system_risk_score).toBe(40); // P0 = 40
      expect(report.recovery_required).toBe(true);
    });

    it('should PASS with non-blocking findings', () => {
      const finding: AuditFinding = {
        id: 'f1',
        severity: 'P3',
        category: 'config',
        description: 'Missing optional config',
        evidence: [],
        blocking: false,
        suggested_owner: 'BACKEND_PROGRAMMER',
      };

      const report = buildAuditReport({
        repoSnapshot: makeRef('repo_snapshot'),
        findings: [finding],
      });

      expect(report.overall_status).toBe('PASS');
      expect(report.system_risk_score).toBe(2); // P3 = 2
      expect(report.recovery_required).toBe(false);
    });

    it('should compute cumulative risk score', () => {
      const findings: AuditFinding[] = [
        { id: 'f1', severity: 'P0', category: 'security', description: 'A', evidence: [], blocking: true, suggested_owner: 'DEBUGGER' },
        { id: 'f2', severity: 'P1', category: 'tests', description: 'B', evidence: [], blocking: true, suggested_owner: 'QA_TESTER' },
        { id: 'f3', severity: 'P2', category: 'config', description: 'C', evidence: [], blocking: false, suggested_owner: 'BACKEND_PROGRAMMER' },
      ];

      const report = buildAuditReport({
        repoSnapshot: makeRef('repo_snapshot'),
        findings,
      });

      expect(report.system_risk_score).toBe(68); // 40 + 20 + 8
      expect(report.recovery_required).toBe(true);
    });

    it('should cap risk score at 100', () => {
      const findings: AuditFinding[] = Array.from({ length: 5 }, (_, i) => ({
        id: `f${i}`,
        severity: 'P0' as const,
        category: 'security' as const,
        description: `Finding ${i}`,
        evidence: [],
        blocking: true,
        suggested_owner: 'DEBUGGER' as const,
      }));

      const report = buildAuditReport({
        repoSnapshot: makeRef('repo_snapshot'),
        findings,
      });

      expect(report.system_risk_score).toBe(100); // 5 * 40 = 200, capped at 100
    });
  });
});
