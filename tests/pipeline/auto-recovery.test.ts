/**
 * Tests for auto-recovery.ts — strategic guidance from arbitrator (v2.6.0).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the adapter/query layer
vi.mock('../../src/pipeline/consensus/arbitrator-query.js', () => ({
  queryProvider: vi.fn(),
}));
vi.mock('../../src/pipeline/consensus/consensus-runner.js', () => ({
  getModelForProvider: vi.fn(() => 'gemini-2.5-flash'),
}));

import {
  buildFailureContext,
  buildAutoRecoveryPrompt,
  attemptAutoRecovery,
  injectAutoRecoveryGuidance,
} from '../../src/pipeline/auto-recovery.js';
import { queryProvider } from '../../src/pipeline/consensus/arbitrator-query.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelineState, ArtifactEntry } from '../../src/pipeline/types.js';

// ─── Mock ArtifactManager ────────────────────────────────

function createMockArtifactManager() {
  return {
    createAndStoreText: vi.fn(
      (type: string, _content: string, phase: string): ArtifactEntry => ({
        id: `test-${type}-${Date.now()}`,
        type: type as ArtifactEntry['type'],
        phase: phase as ArtifactEntry['phase'],
        version: 1,
        path: `docs/${type}.md`,
        sha256: 'test-sha',
        timestamp: new Date().toISOString(),
        immutable: true,
        content_type: 'markdown',
        group_id: `group-${type}`,
      }),
    ),
    createAndStoreJson: vi.fn(),
    ensureDocsStructure: vi.fn(),
    updateIndex: vi.fn(),
  };
}

// ─── Helpers ─────────────────────────────────────────────

function makePipelineWithFailures(): PipelineState {
  const pipeline = createDefaultPipelineState();
  pipeline.failedPhase = 'QA_VALIDATION';
  pipeline.recoveryCount = 5;
  pipeline.maxRecoveryIterations = 5;
  pipeline.gateResults['QA_VALIDATION'] = {
    phase: 'QA_VALIDATION',
    pass: false,
    blockers: ['test suite failing', 'build errors in auth module'],
    missingArtifacts: [],
    failedChecks: [],
    timestamp: new Date().toISOString(),
  };
  pipeline.gateChecks['QA_VALIDATION'] = [
    {
      check_type: 'test',
      status: 'fail',
      command: 'npm test',
      exit_code: 1,
      duration_ms: 5000,
      timestamp: '',
      stderr_summary: 'FAIL src/auth.test.ts: Cannot find module ./auth-utils',
    },
  ];
  pipeline.gateResults['IMPLEMENTATION'] = {
    phase: 'IMPLEMENTATION',
    pass: true,
    blockers: [],
    missingArtifacts: [],
    failedChecks: [],
    timestamp: new Date().toISOString(),
  };
  pipeline.sessionGuidance = 'Fix the auth module imports';
  return pipeline;
}

describe('buildFailureContext', () => {
  it('should extract blockers and check failures', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');

    expect(ctx.failedPhase).toBe('QA_VALIDATION');
    expect(ctx.recoveryCount).toBe(5);
    expect(ctx.maxIterations).toBe(5);
    expect(ctx.blockers).toContain('test suite failing');
    expect(ctx.checkFailures.length).toBe(1);
    expect(ctx.checkFailures[0]).toContain('npm test');
  });

  it('should extract transition sequence from gateResults', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');

    expect(ctx.transitionSequence.length).toBeGreaterThan(0);
    expect(ctx.transitionSequence.some(s => s.includes('QA_VALIDATION'))).toBe(true);
    expect(ctx.transitionSequence.some(s => s.includes('FAIL'))).toBe(true);
  });

  it('should handle missing artifact files gracefully', () => {
    const pipeline = makePipelineWithFailures();
    pipeline.artifacts.push({
      id: 'rca-1',
      type: 'rca_report',
      phase: 'RECOVERY_LOOP',
      version: 1,
      path: 'docs/nonexistent-rca.md',
      sha256: 'abc',
      timestamp: new Date().toISOString(),
      immutable: true,
      content_type: 'markdown',
      group_id: 'g1',
    });

    const ctx = buildFailureContext(pipeline, '/tmp/test-project');

    expect(ctx.rcaSummaries.length).toBe(1);
    expect(ctx.rcaSummaries[0]).toContain('Could not read');
  });

  it('should return empty arrays when no failures exist', () => {
    const pipeline = createDefaultPipelineState();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');

    expect(ctx.failedPhase).toBe('unknown');
    expect(ctx.blockers).toEqual([]);
    expect(ctx.checkFailures).toEqual([]);
    expect(ctx.rcaSummaries).toEqual([]);
  });
});

describe('buildAutoRecoveryPrompt', () => {
  it('should include all required sections', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');
    const prompt = buildAutoRecoveryPrompt(ctx);

    expect(prompt).toContain('Strategic Recovery Analysis');
    expect(prompt).toContain('Failure Timeline');
    expect(prompt).toContain('Current Blockers');
    expect(prompt).toContain('Root Pattern');
    expect(prompt).toContain('Primary Strategy');
    expect(prompt).toContain('Stop Doing');
    expect(prompt).toContain('Concrete Next Steps');
  });

  it('should include failure details', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');
    const prompt = buildAutoRecoveryPrompt(ctx);

    expect(prompt).toContain('QA_VALIDATION');
    expect(prompt).toContain('5/5');
    expect(prompt).toContain('test suite failing');
  });

  it('should include check failures section when present', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');
    const prompt = buildAutoRecoveryPrompt(ctx);

    expect(prompt).toContain('Check Failures');
    expect(prompt).toContain('npm test');
  });

  it('should instruct against tactical dumps', () => {
    const pipeline = makePipelineWithFailures();
    const ctx = buildFailureContext(pipeline, '/tmp/test-project');
    const prompt = buildAutoRecoveryPrompt(ctx);

    expect(prompt).toContain('Do NOT produce another tactical dump');
  });
});

describe('attemptAutoRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success when queryProvider returns valid text', async () => {
    const guidance = 'Root pattern: the auth module has circular imports. ' +
      'Primary strategy: flatten the import graph by extracting shared types.';
    vi.mocked(queryProvider).mockResolvedValue(guidance);

    const pipeline = makePipelineWithFailures();
    const artifactManager = createMockArtifactManager();

    const result = await attemptAutoRecovery({
      pipeline,
      projectDir: '/tmp/test-project',
      artifactManager: artifactManager as any,
      consensusConfig: { arbitrator: 'gemini' } as any,
    });

    expect(result.success).toBe(true);
    expect(result.guidance).toBe(guidance);
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.type).toBe('auto_recovery_guidance');
    expect(artifactManager.createAndStoreText).toHaveBeenCalledOnce();
  });

  it('should inject guidance into pipeline.sessionGuidance', async () => {
    const guidance = 'Strategic guidance content that is longer than fifty characters for validation.';
    vi.mocked(queryProvider).mockResolvedValue(guidance);

    const pipeline = makePipelineWithFailures();
    const originalGuidance = pipeline.sessionGuidance;

    await attemptAutoRecovery({
      pipeline,
      projectDir: '/tmp/test-project',
      artifactManager: createMockArtifactManager() as any,
      consensusConfig: { arbitrator: 'gemini' } as any,
    });

    expect(pipeline.sessionGuidance).toContain('AUTO-RECOVERY GUIDANCE');
    expect(pipeline.sessionGuidance).toContain(guidance);
    // Base guidance should be preserved
    expect(pipeline.sessionGuidance).toContain(originalGuidance!);
  });

  it('should return failure when response is too short', async () => {
    vi.mocked(queryProvider).mockResolvedValue('Too short');

    const pipeline = makePipelineWithFailures();

    const result = await attemptAutoRecovery({
      pipeline,
      projectDir: '/tmp/test-project',
      artifactManager: createMockArtifactManager() as any,
      consensusConfig: { arbitrator: 'gemini' } as any,
    });

    expect(result.success).toBe(false);
    expect(result.guidance).toBeNull();
    expect(result.artifact).toBeNull();
  });

  it('should return failure when queryProvider returns null (timeout)', async () => {
    vi.mocked(queryProvider).mockResolvedValue(null);

    const pipeline = makePipelineWithFailures();

    const result = await attemptAutoRecovery({
      pipeline,
      projectDir: '/tmp/test-project',
      artifactManager: createMockArtifactManager() as any,
      consensusConfig: { arbitrator: 'gemini' } as any,
    });

    expect(result.success).toBe(false);
    expect(result.guidance).toBeNull();
    expect(result.artifact).toBeNull();
  });

  it('should use default arbitrator when none specified in config', async () => {
    const guidance = 'Long enough guidance text that meets the fifty character minimum requirement for validation.';
    vi.mocked(queryProvider).mockResolvedValue(guidance);

    const pipeline = makePipelineWithFailures();

    await attemptAutoRecovery({
      pipeline,
      projectDir: '/tmp/test-project',
      artifactManager: createMockArtifactManager() as any,
      consensusConfig: undefined,
    });

    // Should have been called (uses default 'gemini')
    expect(queryProvider).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(queryProvider).mock.calls[0];
    expect(callArgs[1].provider).toBe('gemini');
  });
});

describe('injectAutoRecoveryGuidance', () => {
  it('should inject guidance with marker', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.sessionGuidance = 'Base guidance content';

    injectAutoRecoveryGuidance(pipeline, 'New strategic guidance');

    expect(pipeline.sessionGuidance).toContain('Base guidance content');
    expect(pipeline.sessionGuidance).toContain('--- AUTO-RECOVERY GUIDANCE ---');
    expect(pipeline.sessionGuidance).toContain('New strategic guidance');
  });

  it('should replace prior auto-recovery block (idempotent)', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.sessionGuidance = 'Base guidance\n\n--- AUTO-RECOVERY GUIDANCE ---\nOld guidance';

    injectAutoRecoveryGuidance(pipeline, 'New strategic guidance');

    // Should only have ONE marker block
    const markerCount = (pipeline.sessionGuidance!.match(/--- AUTO-RECOVERY GUIDANCE ---/g) || []).length;
    expect(markerCount).toBe(1);
    // Old guidance should be gone
    expect(pipeline.sessionGuidance).not.toContain('Old guidance');
    // New guidance should be present
    expect(pipeline.sessionGuidance).toContain('New strategic guidance');
    // Base guidance should be preserved
    expect(pipeline.sessionGuidance).toContain('Base guidance');
  });

  it('should handle empty sessionGuidance', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.sessionGuidance = undefined;

    injectAutoRecoveryGuidance(pipeline, 'Guidance text');

    expect(pipeline.sessionGuidance).toContain('--- AUTO-RECOVERY GUIDANCE ---');
    expect(pipeline.sessionGuidance).toContain('Guidance text');
  });

  it('should cap guidance at 3000 chars', () => {
    const pipeline = createDefaultPipelineState();
    const longGuidance = 'x'.repeat(5000);

    injectAutoRecoveryGuidance(pipeline, longGuidance);

    // The guidance portion should be capped
    const markerIdx = pipeline.sessionGuidance!.indexOf('--- AUTO-RECOVERY GUIDANCE ---');
    const guidanceAfterMarker = pipeline.sessionGuidance!.slice(
      markerIdx + '--- AUTO-RECOVERY GUIDANCE ---'.length + 1,
    );
    expect(guidanceAfterMarker.length).toBeLessThanOrEqual(3000);
  });
});
