/**
 * Review Bridge tests — severity mapping, category mapping, CR routing,
 * pipeline detection, finding conversion.
 */

import { describe, it, expect } from 'vitest';
import {
  mapSeverity,
  mapCategory,
  categoryToChangeType,
  convertFinding,
  isPipelineManaged,
  extractPipelineState,
} from '../../../src/pipeline/bridges/review-bridge.js';
import { createDefaultPipelineState } from '../../../src/pipeline/types.js';
import type { AuditFinding as WorkflowFinding } from '../../../src/types/audit.js';
import type { ArtifactRef } from '../../../src/pipeline/types.js';
import type { ProjectState } from '../../../src/types/workflow.js';

// ─── Test Data ───────────────────────────────────────────

function makeSnapshotRef(): ArtifactRef {
  return {
    artifact_id: 'snap-001',
    path: 'docs/snapshots/repo_snapshot_001.json',
    sha256: 'abc123',
    version: 1,
    type: 'repo_snapshot',
  };
}

function makeWorkflowFinding(overrides: Partial<WorkflowFinding> = {}): WorkflowFinding {
  return {
    id: 'finding-1',
    category: 'integration-wiring',
    severity: 'critical',
    title: 'API endpoint mismatch',
    description: 'Frontend calls /api/users but backend serves /api/v1/users',
    evidence: [{ file: 'src/api.ts', line: 42, snippet: 'fetch("/api/users")' }],
    recommendation: 'Update frontend API base URL',
    autoFixable: true,
    ...overrides,
  };
}

function makeProjectState(withPipeline = false): ProjectState {
  const base: ProjectState = {
    id: 'test-id',
    name: 'test-project',
    idea: 'Build something',
    language: 'python',
    phase: 'execution',
    status: 'in-progress',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ProjectState;

  if (withPipeline) {
    (base as unknown as { pipeline: unknown }).pipeline = createDefaultPipelineState();
  }

  return base;
}

// ─── Tests ───────────────────────────────────────────────

describe('Review Bridge', () => {
  describe('severity mapping', () => {
    it('should map critical to P0', () => {
      expect(mapSeverity('critical')).toBe('P0');
    });

    it('should map major to P1', () => {
      expect(mapSeverity('major')).toBe('P1');
    });

    it('should map minor to P2', () => {
      expect(mapSeverity('minor')).toBe('P2');
    });

    it('should map info to P3', () => {
      expect(mapSeverity('info')).toBe('P3');
    });
  });

  describe('category mapping', () => {
    it('should map integration-wiring to integration', () => {
      expect(mapCategory('integration-wiring')).toBe('integration');
    });

    it('should map feature-completeness to integration', () => {
      expect(mapCategory('feature-completeness')).toBe('integration');
    });

    it('should map test-coverage to tests', () => {
      expect(mapCategory('test-coverage')).toBe('tests');
    });

    it('should map config-deployment to config', () => {
      expect(mapCategory('config-deployment')).toBe('config');
    });

    it('should map security to security', () => {
      expect(mapCategory('security')).toBe('security');
    });

    it('should map dependency-sanity to deployment', () => {
      expect(mapCategory('dependency-sanity')).toBe('deployment');
    });

    it('should map consistency to schema', () => {
      expect(mapCategory('consistency')).toBe('schema');
    });

    it('should map documentation to deployment', () => {
      expect(mapCategory('documentation')).toBe('deployment');
    });
  });

  describe('CR change type routing', () => {
    it('should route integration to architecture CR', () => {
      expect(categoryToChangeType('integration')).toBe('architecture');
    });

    it('should route schema to architecture CR', () => {
      expect(categoryToChangeType('schema')).toBe('architecture');
    });

    it('should route security to requirement CR', () => {
      expect(categoryToChangeType('security')).toBe('requirement');
    });

    it('should route tests to config CR', () => {
      expect(categoryToChangeType('tests')).toBe('config');
    });

    it('should route config to config CR', () => {
      expect(categoryToChangeType('config')).toBe('config');
    });

    it('should route deployment to config CR', () => {
      expect(categoryToChangeType('deployment')).toBe('config');
    });
  });

  describe('finding conversion', () => {
    it('should convert a critical workflow finding to P0 pipeline finding', () => {
      const wf = makeWorkflowFinding({ severity: 'critical', category: 'integration-wiring' });
      const ref = makeSnapshotRef();

      const pf = convertFinding(wf, ref);

      expect(pf.id).toBe('finding-1');
      expect(pf.severity).toBe('P0');
      expect(pf.category).toBe('integration');
      expect(pf.blocking).toBe(true);
      expect(pf.description).toContain('API endpoint mismatch');
      expect(pf.file_path).toBe('src/api.ts');
      expect(pf.line_number).toBe(42);
      expect(pf.evidence).toEqual([ref]);
      expect(pf.suggested_owner).toBe('AUDITOR');
    });

    it('should convert an info finding to P3 non-blocking', () => {
      const wf = makeWorkflowFinding({ severity: 'info', category: 'documentation' });
      const ref = makeSnapshotRef();

      const pf = convertFinding(wf, ref);

      expect(pf.severity).toBe('P3');
      expect(pf.blocking).toBe(false);
    });

    it('should mark P0 and P1 as blocking, P2 and P3 as non-blocking', () => {
      const ref = makeSnapshotRef();

      expect(convertFinding(makeWorkflowFinding({ severity: 'critical' }), ref).blocking).toBe(true);
      expect(convertFinding(makeWorkflowFinding({ severity: 'major' }), ref).blocking).toBe(true);
      expect(convertFinding(makeWorkflowFinding({ severity: 'minor' }), ref).blocking).toBe(false);
      expect(convertFinding(makeWorkflowFinding({ severity: 'info' }), ref).blocking).toBe(false);
    });

    it('should handle finding with no evidence', () => {
      const wf = makeWorkflowFinding({ evidence: [] });
      const ref = makeSnapshotRef();

      const pf = convertFinding(wf, ref);

      expect(pf.file_path).toBeUndefined();
      expect(pf.line_number).toBeUndefined();
    });
  });

  describe('pipeline detection', () => {
    it('should detect pipeline-managed state', () => {
      const state = makeProjectState(true);
      expect(isPipelineManaged(state)).toBe(true);
    });

    it('should detect non-pipeline state', () => {
      const state = makeProjectState(false);
      expect(isPipelineManaged(state)).toBe(false);
    });

    it('should extract pipeline state when present', () => {
      const state = makeProjectState(true);
      const pipeline = extractPipelineState(state);

      expect(pipeline).toBeDefined();
      expect(pipeline!.pipelinePhase).toBe('INTAKE');
    });

    it('should return undefined when no pipeline state', () => {
      const state = makeProjectState(false);
      expect(extractPipelineState(state)).toBeUndefined();
    });
  });

  describe('CR routing determinism', () => {
    it('should route integration findings to CONSENSUS_ARCHITECTURE', () => {
      // Integration → architecture CR → CONSENSUS_ARCHITECTURE (via change-request.ts routing)
      const changeType = categoryToChangeType('integration');
      expect(changeType).toBe('architecture');
      // architecture routes to CONSENSUS_ARCHITECTURE per CHANGE_TYPE_ROUTING
    });

    it('should route security findings to CONSENSUS_MASTER_PLAN', () => {
      const changeType = categoryToChangeType('security');
      expect(changeType).toBe('requirement');
      // requirement routes to CONSENSUS_MASTER_PLAN per CHANGE_TYPE_ROUTING
    });

    it('should route test findings to QA_VALIDATION', () => {
      const changeType = categoryToChangeType('tests');
      expect(changeType).toBe('config');
      // config routes to QA_VALIDATION per CHANGE_TYPE_ROUTING
    });
  });
});
