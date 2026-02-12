/**
 * Tests for remediation workflow
 */

import { describe, it, expect, vi } from 'vitest';
import type { Task, Milestone, ProjectState } from '../../src/types/workflow.js';
import type { TaskWorkflowResult } from '../../src/workflow/task-workflow.js';
import type { TestResult } from '../../src/workflow/test-runner.js';
import { buildFailureContext, MAX_REMEDIATION_ATTEMPTS } from '../../src/workflow/remediation.js';

/**
 * Helper to create a minimal task for testing
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'milestone-1-task-1',
    name: 'Implement user authentication',
    description: 'Add JWT-based authentication to the API',
    status: 'failed',
    ...overrides,
  };
}

/**
 * Helper to create a minimal milestone for testing
 */
function createTestMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'milestone-1',
    name: 'Authentication System',
    description: 'Build the authentication system',
    status: 'in-progress',
    tasks: [createTestTask()],
    ...overrides,
  };
}

/**
 * Helper to create a minimal project state for testing
 */
function createTestState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    id: 'test-project',
    name: 'Test Project',
    idea: 'A test project',
    language: 'typescript',
    openaiModel: 'gpt-4o',
    phase: 'execution',
    status: 'in-progress',
    milestones: [createTestMilestone()],
    currentMilestone: 'milestone-1',
    currentTask: 'milestone-1-task-1',
    consensusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a task workflow result for testing
 */
function createTaskResult(overrides: Partial<TaskWorkflowResult> = {}): TaskWorkflowResult {
  return {
    success: false,
    task: createTestTask(),
    error: 'Tests failed: 3 tests failing',
    ...overrides,
  };
}

describe('MAX_REMEDIATION_ATTEMPTS', () => {
  it('should be set to 2', () => {
    expect(MAX_REMEDIATION_ATTEMPTS).toBe(2);
  });
});

describe('buildFailureContext', () => {
  it('should build context with full task results', async () => {
    const task = createTestTask({
      plan: '## Implementation Plan\n1. Create auth module\n2. Add JWT verification',
    });
    const milestone = createTestMilestone({ tasks: [task] });
    const state = createTestState();

    const testResult: TestResult = {
      success: false,
      passed: 5,
      failed: 3,
      total: 8,
      output: 'FAIL src/auth.test.ts\n  - should validate token\n  - should reject expired token',
      failedTests: ['should validate token', 'should reject expired token', 'should handle missing token'],
    };

    const taskResult = createTaskResult({
      task,
      testResult,
      consensusResult: {
        approved: true,
        finalPlan: 'plan',
        finalScore: 92,
        bestPlan: 'plan',
        bestScore: 92,
        bestIteration: 1,
        totalIterations: 1,
        iterations: [],
        finalConcerns: ['Consider edge cases for token expiry'],
        finalRecommendations: ['Add rate limiting to auth endpoints'],
        arbitrated: false,
      },
    });

    const context = await buildFailureContext(task, milestone, taskResult, state, '/tmp/test-project');

    // Should contain task info
    expect(context).toContain('Implement user authentication');
    expect(context).toContain('milestone-1-task-1');

    // Should contain error details
    expect(context).toContain('Tests failed: 3 tests failing');

    // Should contain test results
    expect(context).toContain('Passed**: 5');
    expect(context).toContain('Failed**: 3');
    expect(context).toContain('should validate token');

    // Should contain consensus feedback
    expect(context).toContain('Consider edge cases for token expiry');
    expect(context).toContain('Add rate limiting to auth endpoints');

    // Should contain task plan
    expect(context).toContain('Create auth module');

    // Should contain milestone context
    expect(context).toContain('Test Project');
    expect(context).toContain('typescript');
  });

  it('should build context with minimal results', async () => {
    const task = createTestTask();
    const milestone = createTestMilestone();
    const state = createTestState();

    const taskResult = createTaskResult({
      error: 'Implementation failed: unknown error',
    });

    const context = await buildFailureContext(task, milestone, taskResult, state, '/tmp/test-project');

    // Should still contain basic info
    expect(context).toContain('Implement user authentication');
    expect(context).toContain('Implementation failed: unknown error');
    expect(context).toContain('Test Project');
  });

  it('should include previous remediation attempts when present', async () => {
    const task = createTestTask({
      remediationAttempts: 1,
      lastFailureAnalysis: 'Missing import for jwt module',
      lastRemediationPlan: 'Add import statement for jsonwebtoken',
    });
    const milestone = createTestMilestone({ tasks: [task] });
    const state = createTestState();
    const taskResult = createTaskResult();

    const context = await buildFailureContext(task, milestone, taskResult, state, '/tmp/test-project');

    // Should include previous attempt info
    expect(context).toContain('Previous Remediation Attempts (1)');
    expect(context).toContain('Missing import for jwt module');
    expect(context).toContain('Add import statement for jsonwebtoken');
    expect(context).toContain('DIFFERENT approach');
  });

  it('should detect test runner crashes', async () => {
    const task = createTestTask();
    const milestone = createTestMilestone();
    const state = createTestState();

    const testResult: TestResult = {
      success: false,
      passed: 0,
      failed: 50,
      total: 50,
      output: 'SyntaxError: Cannot find module ./auth',
    };

    const taskResult = createTaskResult({ testResult });

    const context = await buildFailureContext(task, milestone, taskResult, state, '/tmp/test-project');

    expect(context).toContain('CRASH DETECTED');
  });

  it('should handle missing error message gracefully', async () => {
    const task = createTestTask();
    const milestone = createTestMilestone();
    const state = createTestState();

    const taskResult: TaskWorkflowResult = {
      success: false,
      task,
    };

    const context = await buildFailureContext(task, milestone, taskResult, state, '/tmp/test-project');

    expect(context).toContain('No error message available');
  });

  it('should include completed and remaining tasks in milestone context', async () => {
    const completedTask = createTestTask({
      id: 'milestone-1-task-0',
      name: 'Setup project structure',
      status: 'complete',
    });
    const failedTask = createTestTask({
      id: 'milestone-1-task-1',
      name: 'Implement auth',
      status: 'failed',
    });
    const pendingTask = createTestTask({
      id: 'milestone-1-task-2',
      name: 'Add user management',
      status: 'pending',
    });

    const milestone = createTestMilestone({
      tasks: [completedTask, failedTask, pendingTask],
    });
    const state = createTestState();
    const taskResult = createTaskResult({ task: failedTask });

    const context = await buildFailureContext(failedTask, milestone, taskResult, state, '/tmp/test-project');

    expect(context).toContain('Setup project structure');
    expect(context).toContain('Add user management');
  });
});
