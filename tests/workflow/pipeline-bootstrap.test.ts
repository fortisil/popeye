/**
 * Fix B tests — new projects use pipeline from start.
 * Verifies that runWorkflow() bootstraps state before pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the modules before importing
vi.mock('../../src/state/index.js', () => ({
  loadProject: vi.fn(),
  projectExists: vi.fn(),
  getProgress: vi.fn(),
  resetToPhase: vi.fn(),
  deleteProject: vi.fn(),
  verifyProjectCompletion: vi.fn(),
  resetIncompleteProject: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock('../../src/pipeline/orchestrator.js', () => ({
  runPipeline: vi.fn(),
  resumePipeline: vi.fn(),
}));

vi.mock('../../src/workflow/plan-mode.js', () => ({
  runPlanMode: vi.fn(),
  resumePlanMode: vi.fn(),
}));

vi.mock('../../src/workflow/execution-mode.js', () => ({
  runExecutionMode: vi.fn(),
  resumeExecutionMode: vi.fn(),
  executeSingleTask: vi.fn(),
}));

vi.mock('../../src/workflow/workflow-logger.js', () => ({
  getWorkflowLogger: () => ({
    stageStart: vi.fn(),
    stageComplete: vi.fn(),
    stageFailed: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('Fix B: New projects use pipeline from start', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: pipeline mode enabled
    delete process.env.POPEYE_LEGACY_WORKFLOW;
  });

  it('should create state and run pipeline when state does not exist', async () => {
    const { loadProject, createProject } = await import('../../src/state/index.js');
    const { runPipeline } = await import('../../src/pipeline/orchestrator.js');

    const mockState = {
      id: 'test-id',
      name: 'test-project',
      idea: 'Build something',
      language: 'python' as const,
      phase: 'plan' as const,
      status: 'pending' as const,
      milestones: [],
      currentMilestone: null,
      currentTask: null,
      consensusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // loadProject fails (no state.json) on first call, succeeds after create
    vi.mocked(loadProject)
      .mockRejectedValueOnce(new Error('No project found'))
      .mockResolvedValue(mockState as any);

    vi.mocked(createProject).mockResolvedValue(mockState as any);
    vi.mocked(runPipeline).mockResolvedValue({
      success: true,
      finalPhase: 'DONE',
      artifacts: [],
      recoveryIterations: 0,
    });

    const { runWorkflow } = await import('../../src/workflow/index.js');

    const result = await runWorkflow(
      { idea: 'Build something', name: 'test-project', language: 'python', openaiModel: 'gpt-4o' },
      { projectDir: '/tmp/test-project' },
    );

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ idea: 'Build something' }),
      '/tmp/test-project',
    );
    expect(runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: '/tmp/test-project',
        state: mockState,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should use existing state when state already exists', async () => {
    const { loadProject, createProject } = await import('../../src/state/index.js');
    const { runPipeline } = await import('../../src/pipeline/orchestrator.js');

    const existingState = {
      id: 'existing-id',
      name: 'existing-project',
      phase: 'execution' as const,
    };

    vi.mocked(loadProject).mockResolvedValue(existingState as any);
    vi.mocked(runPipeline).mockResolvedValue({
      success: true,
      finalPhase: 'DONE',
      artifacts: [],
      recoveryIterations: 0,
    });

    const { runWorkflow } = await import('../../src/workflow/index.js');

    await runWorkflow(
      { idea: 'Build something', name: 'existing-project', language: 'python', openaiModel: 'gpt-4o' },
      { projectDir: '/tmp/existing-project' },
    );

    // Should NOT call createProject since state exists
    expect(createProject).not.toHaveBeenCalled();
    expect(runPipeline).toHaveBeenCalled();
  });

  it('should fall through to legacy workflow when POPEYE_LEGACY_WORKFLOW=1', async () => {
    process.env.POPEYE_LEGACY_WORKFLOW = '1';

    const { runPipeline } = await import('../../src/pipeline/orchestrator.js');
    const { runPlanMode } = await import('../../src/workflow/plan-mode.js');
    const { runExecutionMode } = await import('../../src/workflow/execution-mode.js');

    vi.mocked(runPlanMode).mockResolvedValue({
      success: true,
      state: { phase: 'execution' } as any,
    });
    vi.mocked(runExecutionMode).mockResolvedValue({
      success: true,
      state: { phase: 'complete' } as any,
      completedTasks: 5,
      failedTasks: 0,
    });

    const { runWorkflow } = await import('../../src/workflow/index.js');

    await runWorkflow(
      { idea: 'Build something', name: 'test', language: 'python', openaiModel: 'gpt-4o' },
      { projectDir: '/tmp/test' },
    );

    // Pipeline should NOT be called in legacy mode
    expect(runPipeline).not.toHaveBeenCalled();
  });
});
