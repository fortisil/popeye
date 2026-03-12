/**
 * Tests for analyzeProjectProgress and verifyProjectCompletion
 *
 * Validates that the progress analysis correctly handles the edge case
 * where a project is genuinely complete but has no milestone tracking data.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  analyzeProjectProgress,
  verifyProjectCompletion,
} from '../../src/state/index.js';

/**
 * Build a minimal valid ProjectState JSON object.
 *
 * @param overrides - Partial fields to merge on top of the defaults
 * @returns A plain object that satisfies ProjectStateSchema
 */
function buildState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: 'test-id',
    name: 'test-project',
    idea: 'A test project',
    language: 'typescript',
    openaiModel: 'gpt-4o',
    phase: 'complete',
    status: 'complete',
    specification: '',
    plan: '',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Write a state.json file inside a temp directory's .popeye/ folder.
 *
 * @param tmpDir - The temporary project root directory
 * @param state - The state object to write
 */
async function writeState(tmpDir: string, state: Record<string, unknown>): Promise<void> {
  const stateDir = path.join(tmpDir, '.popeye');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, 'state.json'), JSON.stringify(state));
}

/**
 * Write a plan file so readPlanFile can parse it.
 *
 * @param tmpDir - The temporary project root directory
 * @param content - Markdown content for the plan
 */
async function writePlan(tmpDir: string, content: string): Promise<void> {
  const docsDir = path.join(tmpDir, 'docs');
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(path.join(docsDir, 'PLAN.md'), content);
}

// Track temp dirs for cleanup
const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'progress-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

describe('analyzeProjectProgress', () => {
  it('should treat zero milestones + explicitly complete as genuinely complete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'complete',
      milestones: [],
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(true);
    expect(result.statusMismatch).toBe(false);
    expect(result.totalMilestones).toBe(0);
    expect(result.totalTasks).toBe(0);
  });

  it('should detect mismatch when zero milestones but phase is not complete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(false);
    expect(result.statusMismatch).toBe(true);
  });

  it('should treat non-zero milestones with all tasks complete as genuinely complete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'complete',
      milestones: [
        {
          id: 'm1',
          name: 'Milestone 1',
          description: 'First milestone',
          status: 'complete',
          tasks: [
            { id: 't1', name: 'Task 1', description: 'First task', status: 'complete' },
            { id: 't2', name: 'Task 2', description: 'Second task', status: 'complete' },
          ],
        },
        {
          id: 'm2',
          name: 'Milestone 2',
          description: 'Second milestone',
          status: 'complete',
          tasks: [
            { id: 't3', name: 'Task 3', description: 'Third task', status: 'complete' },
          ],
        },
      ],
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(true);
    expect(result.statusMismatch).toBe(false);
    expect(result.totalMilestones).toBe(2);
    expect(result.completedTasks).toBe(3);
  });

  it('should detect mismatch when non-zero milestones are incomplete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'complete',
      milestones: [
        {
          id: 'm1',
          name: 'Milestone 1',
          description: 'First milestone',
          status: 'complete',
          tasks: [
            { id: 't1', name: 'Task 1', description: 'First task', status: 'complete' },
          ],
        },
        {
          id: 'm2',
          name: 'Milestone 2',
          description: 'Second milestone',
          status: 'pending',
          tasks: [
            { id: 't2', name: 'Task 2', description: 'Second task', status: 'pending' },
          ],
        },
      ],
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(false);
    expect(result.statusMismatch).toBe(true);
    expect(result.completedMilestones).toBe(1);
    expect(result.totalMilestones).toBe(2);
  });
});

describe('verifyProjectCompletion', () => {
  it('should return isComplete=true for zero milestones + explicitly complete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'complete',
      milestones: [],
    }));

    const result = await verifyProjectCompletion(tmpDir);

    expect(result.isComplete).toBe(true);
  });

  it('should return isComplete=false when zero milestones but phase is execution', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
    }));

    const result = await verifyProjectCompletion(tmpDir);

    expect(result.isComplete).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ─── Pipeline test helpers ────────────────────────────────

/**
 * Build a minimal valid pipeline state object that satisfies PipelineStateSchema.
 *
 * @param overrides - Fields to merge on top of the defaults
 * @returns A plain object matching PipelineState
 */
function buildPipelineState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pipelinePhase: 'DONE',
    artifacts: [],
    recoveryCount: 0,
    maxRecoveryIterations: 5,
    gateResults: {},
    gateChecks: {},
    activeRoles: [],
    constitutionHash: '',
    ...overrides,
  };
}

// ─── Pipeline terminal state handling ─────────────────────

describe('pipeline terminal state handling', () => {
  it('should treat pipeline DONE + 0 milestones as genuinely complete', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({ pipelinePhase: 'DONE' }),
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(true);
    expect(result.statusMismatch).toBe(false);
    expect(result.pipelineTerminal).toBe(true);
    expect(result.pipelinePhase).toBe('DONE');
  });

  it('should treat pipeline STUCK + 0 milestones as not complete but no mismatch', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({
        pipelinePhase: 'STUCK',
        failedPhase: 'QA_VALIDATION',
        recoveryCount: 3,
      }),
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.isActuallyComplete).toBe(false);
    expect(result.statusMismatch).toBe(false);
    expect(result.pipelineTerminal).toBe(true);
    expect(result.progressSummary).toContain('STUCK');
  });

  it('should treat pipeline active phase + 0 milestones as not terminal', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'in-progress',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({ pipelinePhase: 'IMPLEMENTATION' }),
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.pipelineTerminal).toBe(false);
    expect(result.isActuallyComplete).toBe(false);
  });

  it('should handle exact gateco reproducer (STUCK + complete status + 0 milestones)', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({
        pipelinePhase: 'STUCK',
        failedPhase: 'QA_VALIDATION',
        recoveryCount: 5,
      }),
    }));

    const result = await analyzeProjectProgress(tmpDir);

    // Must NOT trigger status mismatch — pipeline terminal overrides
    expect(result.statusMismatch).toBe(false);
    expect(result.pipelineTerminal).toBe(true);
    expect(result.isActuallyComplete).toBe(false);
    // Summary should contain the stuck details
    expect(result.progressSummary).toContain('STUCK');
    expect(result.progressSummary).toContain('QA_VALIDATION');
    expect(result.progressSummary).toContain('5');
  });

  it('should treat RECOVERY_LOOP the same as STUCK (interrupted mid-recovery)', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({
        pipelinePhase: 'RECOVERY_LOOP',
        failedPhase: 'QA_VALIDATION',
        recoveryCount: 1,
      }),
    }));

    const result = await analyzeProjectProgress(tmpDir);

    expect(result.statusMismatch).toBe(false);
    expect(result.pipelineTerminal).toBe(true);
    expect(result.isActuallyComplete).toBe(false);
    expect(result.progressSummary).toContain('STUCK');
    expect(result.progressSummary).toContain('QA_VALIDATION');
  });
});

describe('verifyProjectCompletion with pipeline', () => {
  it('should return isComplete=true for pipeline DONE', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({ pipelinePhase: 'DONE' }),
    }));

    const result = await verifyProjectCompletion(tmpDir);

    expect(result.isComplete).toBe(true);
  });

  it('should return isComplete=false for pipeline STUCK', async () => {
    const tmpDir = await makeTmpDir();
    await writeState(tmpDir, buildState({
      status: 'complete',
      phase: 'execution',
      milestones: [],
      pipeline: buildPipelineState({
        pipelinePhase: 'STUCK',
        failedPhase: 'QA_VALIDATION',
        recoveryCount: 5,
      }),
    }));

    const result = await verifyProjectCompletion(tmpDir);

    expect(result.isComplete).toBe(false);
  });
});
