/**
 * Task-level workflow
 * Handles the per-task consensus cycle: Plan → Consensus → Implement → Test
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState, Task, Milestone } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { createPlan as claudeCreatePlan } from '../adapters/claude.js';
import {
  loadProject,
  updateState,
} from '../state/index.js';
import { iterateUntilConsensus, runOptimizedConsensusProcess, type ConsensusProcessResult } from './consensus.js';
import { executeTask as executeTaskCode } from './execution-mode.js';
import { runTests, testsExist, getTestSummary, type TestResult } from './test-runner.js';

/**
 * Options for task workflow
 */
export interface TaskWorkflowOptions {
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  maxRetries?: number;
  onProgress?: (phase: string, message: string) => void;
}

/**
 * Result of task workflow
 */
export interface TaskWorkflowResult {
  success: boolean;
  task: Task;
  consensusResult?: ConsensusProcessResult;
  testResult?: TestResult;
  error?: string;
}

/**
 * Create a detailed implementation plan for a specific task
 *
 * @param task - The task to plan
 * @param milestone - The parent milestone
 * @param state - Current project state
 * @param onProgress - Progress callback
 * @returns The task implementation plan
 */
async function createTaskPlan(
  task: Task,
  milestone: Milestone,
  state: ProjectState,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Creating detailed task plan...');

  const context = `
## Project Context
Project: ${state.name}
Language: ${state.language}

## Milestone: ${milestone.name}
${milestone.description}

## Overall Project Plan
${state.plan?.slice(0, 2000) || 'No overall plan available'}

## Completed Tasks in This Milestone
${milestone.tasks
  .filter(t => t.status === 'complete')
  .map(t => `- ${t.name}`)
  .join('\n') || 'None yet'}
`.trim();

  const prompt = `
Create a detailed implementation plan for the following task:

## Task: ${task.name}
${task.description}

${task.testPlan ? `## Test Requirements\n${task.testPlan}` : ''}

Please provide:
1. **Implementation Steps**: Specific code changes needed
2. **Files to Create/Modify**: List all files that will be touched
3. **Dependencies**: Any packages or modules needed
4. **Acceptance Criteria**: How to verify the task is complete
5. **Test Plan**: Specific tests to write

Be specific and actionable. This plan will be reviewed for consensus before implementation.
`.trim();

  const result = await claudeCreatePlan(prompt, context, onProgress);

  if (!result.success) {
    throw new Error(`Failed to create task plan: ${result.error}`);
  }

  return result.response;
}

/**
 * Document a task plan to the docs folder
 *
 * @param projectDir - Project directory
 * @param milestone - Parent milestone
 * @param task - The task
 * @param plan - The plan content
 * @param consensusResult - The consensus result
 * @returns Path to the document
 */
async function documentTaskPlan(
  projectDir: string,
  milestone: Milestone,
  task: Task,
  plan: string,
  consensusResult: ConsensusProcessResult
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs', 'tasks');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const taskNum = task.id.split('-task-')[1] || '1';
  const filename = `milestone_${milestoneNum}_task_${taskNum}_plan.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# Task Plan: ${task.name}

## Metadata
- **Milestone**: ${milestone.name}
- **Task ID**: ${task.id}
- **Consensus Score**: ${consensusResult.finalScore}%
- **Iterations**: ${consensusResult.totalIterations}
- **Status**: ${consensusResult.approved ? 'APPROVED' : 'NOT APPROVED'}
- **Generated**: ${new Date().toISOString()}

## Task Description
${task.description}

## Implementation Plan
${plan}

${consensusResult.finalConcerns.length > 0 ? `
## Notes from Review
${consensusResult.finalConcerns.map(c => `- ${c}`).join('\n')}
` : ''}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/tasks/${filename}`;
}

/**
 * Document task test results
 *
 * @param projectDir - Project directory
 * @param milestone - Parent milestone
 * @param task - The task
 * @param testResult - Test results
 * @returns Path to the document
 */
async function documentTestResults(
  projectDir: string,
  milestone: Milestone,
  task: Task,
  testResult: TestResult
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs', 'tests');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const taskNum = task.id.split('-task-')[1] || '1';
  const filename = `milestone_${milestoneNum}_task_${taskNum}_tests.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# Test Results: ${task.name}

## Summary
- **Status**: ${testResult.success ? 'PASSED' : 'FAILED'}
- **Total Tests**: ${testResult.total}
- **Passed**: ${testResult.passed}
- **Failed**: ${testResult.failed}
- **Execution Time**: ${new Date().toISOString()}

## Task Details
- **Milestone**: ${milestone.name}
- **Task ID**: ${task.id}

## Test Output
\`\`\`
${testResult.output.slice(0, 5000)}
\`\`\`

${testResult.failedTests && testResult.failedTests.length > 0 ? `
## Failed Tests
${testResult.failedTests.map(t => `- ${t}`).join('\n')}
` : ''}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/tests/${filename}`;
}

/**
 * Update task in state with new data
 */
async function updateTaskInState(
  projectDir: string,
  taskId: string,
  updates: Partial<Task>
): Promise<ProjectState> {
  const state = await loadProject(projectDir);

  const updatedMilestones = state.milestones.map(milestone => ({
    ...milestone,
    tasks: milestone.tasks.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    ),
  }));

  return updateState(projectDir, { milestones: updatedMilestones });
}

/**
 * Run the complete task workflow: Plan → Consensus → Implement → Test
 *
 * @param milestone - The parent milestone
 * @param task - The task to execute
 * @param options - Workflow options
 * @returns Task workflow result
 */
export async function runTaskWorkflow(
  milestone: Milestone,
  task: Task,
  options: TaskWorkflowOptions
): Promise<TaskWorkflowResult> {
  const {
    projectDir,
    consensusConfig,
    maxRetries = 3,
    onProgress,
  } = options;

  try {
    let state = await loadProject(projectDir);

    // Reload task from state to get latest data (for resume scenarios)
    const currentMilestone = state.milestones.find(m => m.id === milestone.id);
    const currentTask = currentMilestone?.tasks.find(t => t.id === task.id);
    if (currentTask) {
      task = currentTask;
    }

    // Check if we're resuming from a previous attempt
    const hasApprovedPlan = task.consensusApproved && task.plan;
    const hasCompletedImplementation = task.implementationComplete;

    // Mark task as in-progress
    state = await updateTaskInState(projectDir, task.id, {
      status: 'in-progress',
      error: undefined, // Clear previous error
    });

    let consensusResult: ConsensusProcessResult;

    // ============================================
    // PHASE 1-2: Plan and Consensus (skip if already approved)
    // ============================================
    if (hasApprovedPlan) {
      onProgress?.('task-plan', `Using existing approved plan for: ${task.name} (Score: ${task.consensusScore}%)`);

      // Create mock consensus result from saved data
      consensusResult = {
        approved: true,
        finalPlan: task.plan!,
        finalScore: task.consensusScore || 95,
        bestPlan: task.plan!,
        bestScore: task.consensusScore || 95,
        bestIteration: task.consensusIterations || 1,
        totalIterations: task.consensusIterations || 1,
        iterations: [],
        finalConcerns: [],
        finalRecommendations: [],
        arbitrated: false,
      };
    } else {
      // ============================================
      // PHASE 1: Create Task Plan
      // ============================================
      onProgress?.('task-plan', `Planning task: ${task.name}`);

      const taskPlan = await createTaskPlan(
        task,
        milestone,
        state,
        (msg) => onProgress?.('task-plan', msg)
      );

      // Store plan in task
      state = await updateTaskInState(projectDir, task.id, {
        plan: taskPlan,
      });

      // ============================================
      // PHASE 2: Get Consensus on Task Plan
      // ============================================
      onProgress?.('task-consensus', `Getting consensus for task: ${task.name}`);

      const context = `
Project: ${state.name}
Language: ${state.language}
Milestone: ${milestone.name}
Task: ${task.name}
`.trim();

      // Use optimized consensus with batched feedback and plan storage
      const useOptimized = consensusConfig?.useOptimizedConsensus !== false;

      if (useOptimized) {
        onProgress?.('task-consensus', `Using optimized consensus (batched feedback, file-based tracking)`);
        consensusResult = await runOptimizedConsensusProcess(
          taskPlan,
          context,
          {
            projectDir,
            config: consensusConfig,
            milestoneId: milestone.id,
            milestoneName: milestone.name,
            taskId: task.id,
            taskName: task.name,
            parallelReviews: true,
            onIteration: (iteration, result) => {
              onProgress?.('task-consensus', `Iteration ${iteration}: ${result.score}%`);
            },
            onProgress,
          }
        );
      } else {
        // Fallback to original consensus
        consensusResult = await iterateUntilConsensus(
          taskPlan,
          context,
          {
            projectDir,
            config: consensusConfig,
            onIteration: (iteration, result) => {
              onProgress?.('task-consensus', `Iteration ${iteration}: ${result.score}%`);
            },
            onProgress,
          }
        );
      }

      // Document the task plan
      const planDocPath = await documentTaskPlan(
        projectDir,
        milestone,
        task,
        consensusResult.bestPlan,
        consensusResult
      );

      // Update task with consensus results
      state = await updateTaskInState(projectDir, task.id, {
        plan: consensusResult.bestPlan,
        consensusScore: consensusResult.finalScore,
        consensusIterations: consensusResult.totalIterations,
        consensusApproved: consensusResult.approved,
        planDoc: planDocPath,
      });

      // Check if consensus was achieved
      if (!consensusResult.approved) {
        onProgress?.('task-consensus', `Consensus not reached for task: ${task.name} (${consensusResult.finalScore}%)`);

        state = await updateTaskInState(projectDir, task.id, {
          status: 'failed',
          error: `Consensus not reached: ${consensusResult.finalScore}%`,
        });

        return {
          success: false,
          task: { ...task, status: 'failed' },
          consensusResult,
          error: `Task plan not approved. Score: ${consensusResult.finalScore}%`,
        };
      }

      onProgress?.('task-consensus', `Task plan approved with ${consensusResult.finalScore}% consensus`);
    }

    // ============================================
    // PHASE 3: Implement the Task (skip if already complete)
    // ============================================
    if (hasCompletedImplementation) {
      onProgress?.('task-implement', `Implementation already complete for: ${task.name}, skipping to tests...`);
    } else {
      onProgress?.('task-implement', `Implementing task: ${task.name}`);

      const implementResult = await executeTaskCode(
        task,
        consensusResult.bestPlan,  // Use the approved plan as context
        projectDir,
        (msg) => onProgress?.('task-implement', msg)
      );

      if (!implementResult.success) {
        state = await updateTaskInState(projectDir, task.id, {
          status: 'failed',
          error: implementResult.error,
        });

        return {
          success: false,
          task: { ...task, status: 'failed' },
          consensusResult,
          error: `Implementation failed: ${implementResult.error}`,
        };
      }

      // Mark implementation as complete (for resume purposes)
      state = await updateTaskInState(projectDir, task.id, {
        implementationComplete: true,
      });

      onProgress?.('task-implement', `Implementation complete for: ${task.name}`);
    }

    // ============================================
    // PHASE 4: Run Tests
    // ============================================
    const hasTests = await testsExist(projectDir, state.language);

    if (hasTests) {
      onProgress?.('task-test', `Running tests for: ${task.name}`);

      let retries = 0;
      let testResult: TestResult | undefined;

      while (retries <= maxRetries) {
        testResult = await runTests(projectDir, state.language);

        // Document test results
        const testDocPath = await documentTestResults(
          projectDir,
          milestone,
          task,
          testResult
        );

        state = await updateTaskInState(projectDir, task.id, {
          testResultsDoc: testDocPath,
        });

        if (testResult.success) {
          onProgress?.('task-test', `Tests passed: ${getTestSummary(testResult)}`);
          break;
        }

        retries++;
        if (retries <= maxRetries) {
          onProgress?.('task-test', `Tests failed, retry ${retries}/${maxRetries}...`);
          // Could add fix attempt here
        }
      }

      if (testResult && !testResult.success) {
        state = await updateTaskInState(projectDir, task.id, {
          status: 'failed',
          testsPassed: false,
          error: `Tests failed after ${retries} retries`,
        });

        return {
          success: false,
          task: { ...task, status: 'failed', testsPassed: false },
          consensusResult,
          testResult,
          error: `Tests failed: ${getTestSummary(testResult)}`,
        };
      }

      // Mark task as complete
      state = await updateTaskInState(projectDir, task.id, {
        status: 'complete',
        testsPassed: true,
      });

      return {
        success: true,
        task: { ...task, status: 'complete', testsPassed: true },
        consensusResult,
        testResult,
      };
    }

    // No tests - mark as complete
    state = await updateTaskInState(projectDir, task.id, {
      status: 'complete',
    });

    onProgress?.('task-complete', `Task complete: ${task.name}`);

    return {
      success: true,
      task: { ...task, status: 'complete' },
      consensusResult,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.('task-error', errorMessage);

    await updateTaskInState(projectDir, task.id, {
      status: 'failed',
      error: errorMessage,
    });

    return {
      success: false,
      task: { ...task, status: 'failed', error: errorMessage },
      error: errorMessage,
    };
  }
}
