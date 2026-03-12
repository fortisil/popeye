/**
 * Change Request tests — builder, routing, formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  buildChangeRequest,
  routeChangeRequest,
  formatChangeRequest,
  computeDriftKey,
  isDuplicateCR,
} from '../../src/pipeline/change-request.js';
import type { ArtifactRef } from '../../src/pipeline/types.js';

const mockRef: ArtifactRef = {
  artifact_id: 'test-artifact',
  path: 'docs/test.md',
  sha256: 'abc',
  version: 1,
  type: 'repo_snapshot',
};

describe('buildChangeRequest', () => {
  it('should create a CR with generated ID and timestamp', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'config',
      description: 'Config files changed',
      justification: 'Drift detected',
      affectedArtifacts: [mockRef],
      affectedPhases: ['IMPLEMENTATION'],
      riskLevel: 'medium',
    });

    expect(cr.cr_id).toMatch(/^CR-/);
    expect(cr.timestamp).toBeTruthy();
    expect(cr.status).toBe('proposed');
    expect(cr.origin_phase).toBe('REVIEW');
    expect(cr.requested_by).toBe('REVIEWER');
    expect(cr.change_type).toBe('config');
    expect(cr.impact_analysis.risk_level).toBe('medium');
  });

  it('should generate unique IDs for different CRs', () => {
    const cr1 = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'architecture',
      description: 'Arch change',
      justification: 'Finding',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'high',
    });
    const cr2 = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'scope',
      description: 'Scope change',
      justification: 'Finding 2',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'low',
    });

    expect(cr1.cr_id).not.toBe(cr2.cr_id);
  });

  it('should include impact analysis', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'scope',
      description: 'Scope expanded',
      justification: 'New requirements',
      affectedArtifacts: [mockRef],
      affectedPhases: ['CONSENSUS_MASTER_PLAN', 'IMPLEMENTATION'],
      riskLevel: 'high',
    });

    expect(cr.impact_analysis.affected_artifacts).toHaveLength(1);
    expect(cr.impact_analysis.affected_phases).toContain('CONSENSUS_MASTER_PLAN');
    expect(cr.impact_analysis.risk_level).toBe('high');
  });
});

describe('routeChangeRequest', () => {
  it('should route scope changes to CONSENSUS_MASTER_PLAN', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'scope',
      description: 'test',
      justification: 'test',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'low',
    });
    expect(routeChangeRequest(cr)).toBe('CONSENSUS_MASTER_PLAN');
  });

  it('should route architecture changes to CONSENSUS_ARCHITECTURE', () => {
    const cr = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'architecture',
      description: 'test',
      justification: 'test',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'high',
    });
    expect(routeChangeRequest(cr)).toBe('CONSENSUS_ARCHITECTURE');
  });

  it('should route dependency changes to CONSENSUS_ROLE_PLANS', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'dependency',
      description: 'test',
      justification: 'test',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'medium',
    });
    expect(routeChangeRequest(cr)).toBe('CONSENSUS_ROLE_PLANS');
  });

  it('should route config changes to QA_VALIDATION', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'config',
      description: 'test',
      justification: 'test',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'low',
    });
    expect(routeChangeRequest(cr)).toBe('QA_VALIDATION');
  });

  it('should route requirement changes to CONSENSUS_MASTER_PLAN', () => {
    const cr = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'requirement',
      description: 'test',
      justification: 'test',
      affectedArtifacts: [],
      affectedPhases: [],
      riskLevel: 'high',
    });
    expect(routeChangeRequest(cr)).toBe('CONSENSUS_MASTER_PLAN');
  });
});

describe('formatChangeRequest', () => {
  it('should format CR as markdown', () => {
    const cr = buildChangeRequest({
      originPhase: 'REVIEW',
      requestedBy: 'REVIEWER',
      changeType: 'config',
      description: 'Config files changed during implementation',
      justification: 'Detected by snapshot diff',
      affectedArtifacts: [mockRef],
      affectedPhases: ['IMPLEMENTATION'],
      riskLevel: 'medium',
    });

    const md = formatChangeRequest(cr);
    expect(md).toContain('# Change Request');
    expect(md).toContain(cr.cr_id);
    expect(md).toContain('proposed');
    expect(md).toContain('config');
    expect(md).toContain('REVIEWER');
    expect(md).toContain('medium');
    expect(md).toContain('Config files changed');
  });
});

// ─── v2.4.9: Drift Key Dedup ─────────────────────────────

describe('computeDriftKey', () => {
  it('should produce the same key regardless of input order', () => {
    const key1 = computeDriftKey('config', 'snap-1', ['b.json', 'a.json'], ['b:x->y', 'a:p->q']);
    const key2 = computeDriftKey('config', 'snap-1', ['a.json', 'b.json'], ['a:p->q', 'b:x->y']);
    expect(key1).toBe(key2);
  });

  it('should produce different keys for different baselines', () => {
    const key1 = computeDriftKey('config', 'snap-1', ['a.json'], ['a:x->y']);
    const key2 = computeDriftKey('config', 'snap-2', ['a.json'], ['a:x->y']);
    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different change types', () => {
    const key1 = computeDriftKey('config', 'snap-1', ['a.json'], []);
    const key2 = computeDriftKey('scope', 'snap-1', ['a.json'], []);
    expect(key1).not.toBe(key2);
  });

  it('should return a 32-char hex string', () => {
    const key = computeDriftKey('config', 'snap-1', ['a.json'], ['a:x->y']);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('isDuplicateCR', () => {
  it('should return false for undefined pendingCRs', () => {
    expect(isDuplicateCR(undefined, 'dk-1')).toBe(false);
  });

  it('should return false when no matching drift_key', () => {
    const pending = [
      { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed', drift_key: 'dk-other' },
    ];
    expect(isDuplicateCR(pending, 'dk-1')).toBe(false);
  });

  it('should return true for proposed CR with same drift_key', () => {
    const pending = [
      { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'proposed', drift_key: 'dk-1' },
    ];
    expect(isDuplicateCR(pending, 'dk-1')).toBe(true);
  });

  it('should return true for approved CR with same drift_key', () => {
    const pending = [
      { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'approved', drift_key: 'dk-1' },
    ];
    expect(isDuplicateCR(pending, 'dk-1')).toBe(true);
  });

  it('should return true for resolved CR with same drift_key', () => {
    const pending = [
      { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'resolved', drift_key: 'dk-1' },
    ];
    expect(isDuplicateCR(pending, 'dk-1')).toBe(true);
  });

  it('should return false when only rejected CR has same drift_key', () => {
    const pending = [
      { cr_id: 'CR-1', change_type: 'config', target_phase: 'QA_VALIDATION', status: 'rejected', drift_key: 'dk-1' },
    ];
    expect(isDuplicateCR(pending, 'dk-1')).toBe(false);
  });
});
