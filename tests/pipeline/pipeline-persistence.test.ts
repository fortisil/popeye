/**
 * Pipeline Persistence tests — verify PipelineState round-trips through
 * ProjectStateSchema, survives saveState/loadState, and merges via updateState.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { ProjectStateSchema } from '../../src/types/workflow.js';
import type { ProjectState } from '../../src/types/workflow.js';
import { PipelineStateSchema, createDefaultPipelineState } from '../../src/pipeline/types.js';
import type { PipelineState } from '../../src/pipeline/types.js';
import { saveState, loadState } from '../../src/state/persistence.js';
import { updateState } from '../../src/state/index.js';

/** Minimal valid ProjectState for testing (no pipeline field) */
function makeBaseState(overrides: Partial<ProjectState> = {}): ProjectState {
  const now = new Date().toISOString();
  return {
    id: 'test-id',
    name: 'test-project',
    idea: 'A test idea',
    language: 'python',
    openaiModel: 'gpt-4o',
    phase: 'plan',
    status: 'pending',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Build a populated PipelineState for round-trip testing */
function makePopulatedPipeline(): PipelineState {
  const base = createDefaultPipelineState();
  return {
    ...base,
    pipelinePhase: 'CONSENSUS_ROLE_PLANS',
    recoveryCount: 2,
    artifacts: [
      {
        id: 'art-1',
        type: 'master_plan',
        phase: 'CONSENSUS_MASTER_PLAN',
        version: 1,
        path: 'docs/plans/master-plan.md',
        sha256: 'abc123def456',
        timestamp: new Date().toISOString(),
        immutable: true,
        content_type: 'markdown',
        group_id: 'group-master',
      },
    ],
    gateResults: {
      INTAKE: {
        phase: 'INTAKE',
        pass: true,
        blockers: [],
        missingArtifacts: [],
        failedChecks: [],
        timestamp: new Date().toISOString(),
      },
    },
    gateChecks: {
      INTAKE: [
        {
          check_type: 'build',
          status: 'pass',
          command: 'npm run build',
          exit_code: 0,
          duration_ms: 1200,
          timestamp: new Date().toISOString(),
        },
      ],
    },
    activeRoles: ['DISPATCHER', 'ARCHITECT'],
    failedPhase: 'ARCHITECTURE',
    skillUsageEvents: [
      {
        role: 'ARCHITECT',
        phase: 'ARCHITECTURE',
        used_as: 'system_prompt',
        skill_source: 'defaults',
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

describe('Pipeline Persistence', () => {
  // ─── Test 1: Round-trip through ProjectStateSchema ──────────────

  it('should round-trip pipeline state through ProjectStateSchema', () => {
    const pipeline = makePopulatedPipeline();
    const state = makeBaseState({ pipeline });

    const result = ProjectStateSchema.safeParse(state);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pipeline).toBeDefined();
    expect(result.data.pipeline!.pipelinePhase).toBe('CONSENSUS_ROLE_PLANS');
    expect(result.data.pipeline!.artifacts).toHaveLength(1);
    expect(result.data.pipeline!.recoveryCount).toBe(2);
  });

  // ─── Test 2: Backward compatibility — legacy state without pipeline ─

  it('should load legacy state without pipeline as undefined', () => {
    const state = makeBaseState();
    // Explicitly ensure no pipeline field
    delete (state as Record<string, unknown>).pipeline;

    const result = ProjectStateSchema.safeParse(state);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pipeline).toBeUndefined();
  });

  // ─── Test 3: All subfields survive Zod round-trip ──────────────

  it('should preserve all pipeline subfields through Zod round-trip', () => {
    const pipeline = makePopulatedPipeline();
    const state = makeBaseState({ pipeline });

    const result = ProjectStateSchema.safeParse(state);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const p = result.data.pipeline!;

    // Gate results preserved
    expect(p.gateResults['INTAKE']).toBeDefined();
    expect(p.gateResults['INTAKE'].pass).toBe(true);

    // Gate checks preserved
    expect(p.gateChecks['INTAKE']).toHaveLength(1);
    expect(p.gateChecks['INTAKE'][0].check_type).toBe('build');
    expect(p.gateChecks['INTAKE'][0].status).toBe('pass');

    // Active roles preserved
    expect(p.activeRoles).toEqual(['DISPATCHER', 'ARCHITECT']);

    // Skill usage events preserved
    expect(p.skillUsageEvents).toHaveLength(1);
    expect(p.skillUsageEvents![0].role).toBe('ARCHITECT');
    expect(p.skillUsageEvents![0].used_as).toBe('system_prompt');

    // Failed phase preserved
    expect(p.failedPhase).toBe('ARCHITECTURE');

    // No inflation — constitutionHash stays empty string
    expect(p.constitutionHash).toBe('');
  });

  // ─── Test 4 & 5: saveState/loadState and updateState ───────────
  // These use disk I/O, so we create a temp dir

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'popeye-persist-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('should persist and load pipeline state via saveState/loadState', async () => {
    const pipeline = makePopulatedPipeline();
    const state = makeBaseState({ pipeline });

    await saveState(tmpDir, state);
    const loaded = await loadState(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.pipeline).toBeDefined();
    expect(loaded!.pipeline!.pipelinePhase).toBe('CONSENSUS_ROLE_PLANS');
    expect(loaded!.pipeline!.artifacts).toHaveLength(1);
    expect(loaded!.pipeline!.artifacts[0].type).toBe('master_plan');
    expect(loaded!.pipeline!.recoveryCount).toBe(2);
    expect(loaded!.pipeline!.failedPhase).toBe('ARCHITECTURE');
  });

  it('should merge pipeline update via updateState without losing other fields', async () => {
    const pipeline = makePopulatedPipeline();
    const state = makeBaseState({
      pipeline,
      specification: 'original spec',
    });

    // Save initial state
    await saveState(tmpDir, state);

    // Update only the pipeline (advance phase, bump recovery)
    const updatedPipeline: PipelineState = {
      ...pipeline,
      pipelinePhase: 'IMPLEMENTATION',
      recoveryCount: 0,
    };

    const result = await updateState(tmpDir, { pipeline: updatedPipeline });

    // Pipeline was updated
    expect(result.pipeline).toBeDefined();
    expect(result.pipeline!.pipelinePhase).toBe('IMPLEMENTATION');
    expect(result.pipeline!.recoveryCount).toBe(0);

    // Other fields preserved
    expect(result.specification).toBe('original spec');
    expect(result.name).toBe('test-project');
    expect(result.id).toBe('test-id');

    // Verify on disk too
    const loaded = await loadState(tmpDir);
    expect(loaded!.pipeline!.pipelinePhase).toBe('IMPLEMENTATION');
    expect(loaded!.specification).toBe('original spec');
  });
});
