/**
 * Task-level workflow
 * Handles the per-task consensus cycle: Plan → Consensus → Implement → Test
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isWorkspace } from '../types/project.js';
import type { ProjectState, Task, Milestone } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { createPlan as claudeCreatePlan } from '../adapters/claude.js';
import {
  loadProject,
  updateState,
} from '../state/index.js';
import { iterateUntilConsensus, runOptimizedConsensusProcess, type ConsensusProcessResult } from './consensus.js';
import { executeTask as executeTaskCode, handleTestFailure } from './execution-mode.js';
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
  /** True if workflow paused due to rate limiting (not a failure) */
  rateLimitPaused?: boolean;
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

  const result = await claudeCreatePlan(prompt, context, state.language, onProgress);

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
 * Detect if the failure is a test runner crash (0 passed, many failed)
 * vs actual individual test failures
 */
function isTestRunnerCrash(testResult: TestResult): boolean {
  return testResult.passed === 0 && testResult.failed > 20;
}

/**
 * Detect which app a task targets from its name (e.g., "[BE]", "[FE]", "[WEB]")
 */
function detectTaskApp(taskName: string): string | null {
  if (taskName.includes('[BE]') || taskName.toLowerCase().includes('backend')) return 'backend';
  if (taskName.includes('[FE]') || taskName.toLowerCase().includes('frontend')) return 'frontend';
  if (taskName.includes('[WEB]') || taskName.toLowerCase().includes('website')) return 'website';
  return null;
}

/**
 * Build a fix plan for test failures that can be reviewed by consensus
 *
 * @param task - The task whose tests failed
 * @param testResult - The test result with failure details
 * @param state - Current project state
 * @returns A plan string describing the proposed fix
 */
function buildTestFixPlan(
  task: Task,
  testResult: TestResult,
  state: ProjectState,
): string {
  const isCrash = isTestRunnerCrash(testResult);
  const targetApp = detectTaskApp(task.name);

  // For crashes, extract the first error (usually the root cause)
  const outputSnippet = isCrash
    ? testResult.output.slice(0, 3000)
    : testResult.output.slice(0, 2000);

  if (isCrash) {
    return `## Test Runner Crash - Fix Plan

### Task: ${task.name}
### Language: ${state.language}
${targetApp ? `### Target App: ${targetApp}` : ''}

### CRITICAL: Test Runner Crashed
The test runner crashed with 0 passed out of ${testResult.failed} total tests.
This is NOT ${testResult.failed} individual failures - this is a **startup/import crash**.

### Most Likely Root Causes (check in this order)
1. **Import error** - A new file imports a module that doesn't exist or has a typo
2. **Syntax error** - A new or modified file has invalid syntax
3. **Missing dependency** - A package is used but not installed
4. **Circular import** - New code creates a circular dependency
5. **Config error** - Test config (vitest.config, jest.config, pytest.ini) was broken

### Test Output (look for the FIRST error)
\`\`\`
${outputSnippet}
\`\`\`

### Fix Approach
1. Find the FIRST error in the output above - that's the root cause
2. Fix that single error (likely a broken import or syntax issue)
3. Do NOT try to fix ${testResult.failed} individual tests - they all fail because of the one root cause
${targetApp ? `4. Focus ONLY on files in the apps/${targetApp}/ directory` : ''}

### Review Checklist
- [ ] Identified the single root cause (import/syntax/config error)
- [ ] Fix targets the root cause, not symptoms
- [ ] No unrelated code changes
`;
  }

  // Normal case: individual test failures
  const failedTests = testResult.failedTests?.map(t => `- ${t}`).join('\n') || '(see output)';

  return `## Test Failure Fix Plan

### Task: ${task.name}
### Language: ${state.language}
${targetApp ? `### Target App: ${targetApp}` : ''}

### Test Results
- Passed: ${testResult.passed}
- Failed: ${testResult.failed}
- Total: ${testResult.total}

### Failed Tests
${failedTests}

### Test Output (truncated)
\`\`\`
${outputSnippet}
\`\`\`

### Proposed Fix Approach
1. Analyze the root cause of each test failure from the output above
2. Identify whether the issue is in the implementation code (most likely) or the test expectations
3. Fix the implementation code to satisfy the test assertions
4. Do NOT modify the tests unless they contain clear bugs
5. Ensure fixes don't break other passing tests
${targetApp ? `6. Focus ONLY on files in the apps/${targetApp}/ directory` : ''}

### Review Checklist
- [ ] Root cause correctly identified for each failure
- [ ] Fix addresses the actual problem, not just the symptom
- [ ] No regressions introduced to passing tests
- [ ] Code changes are minimal and focused
`;
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
            isFullstack: isWorkspace(state.language),
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
            isFullstack: isWorkspace(state.language),
            language: state.language,
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
        // Check if this is a rate limit pause (not a real failure)
        if (implementResult.rateLimitPaused) {
          const resetInfo = implementResult.rateLimitInfo;
          const pauseMessage = resetInfo?.message || 'Rate limit reached';

          state = await updateTaskInState(projectDir, task.id, {
            status: 'paused',
            error: `Rate limit: ${pauseMessage}. Run /resume to continue.`,
          });

          onProgress?.('task-implement', `Task paused due to rate limit: ${pauseMessage}`);
          onProgress?.('task-implement', 'Your progress is saved. Run /resume to continue after the rate limit resets.');

          return {
            success: false,
            task: { ...task, status: 'paused' },
            consensusResult,
            rateLimitPaused: true,
            error: `Rate limit: ${pauseMessage}`,
          };
        }

        // Actual failure
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

        // Build failure reason for visibility
        const isCrash = isTestRunnerCrash(testResult);
        let failureReason: string;

        if (isCrash) {
          // Extract first meaningful error line from output
          const errorLines = testResult.output.split('\n')
            .filter(l => /error|Error|ERROR|failed to|cannot find|SyntaxError|ImportError|ModuleNotFound/i.test(l))
            .slice(0, 2);
          const rootCause = errorLines.length > 0
            ? errorLines[0].trim().slice(0, 120)
            : 'test runner crashed';
          failureReason = `TEST RUNNER CRASH (0/${testResult.failed} passed) - ${rootCause}`;
        } else {
          const failedNames = testResult.failedTests?.slice(0, 5).join(', ') || '';
          failureReason = failedNames
            ? `${testResult.failed} failed: ${failedNames}${(testResult.failedTests?.length || 0) > 5 ? '...' : ''}`
            : testResult.error || getTestSummary(testResult);
        }

        // Tests failed - check if retries exhausted
        if (retries >= maxRetries) {
          onProgress?.('task-test', `Tests failed after ${retries} retries (${failureReason})`);
          break;
        }

        retries++;
        onProgress?.('task-test', `Tests failed (${failureReason}), planning fix ${retries}/${maxRetries}...`);

        // Build a fix plan and get consensus before implementing
        const fixPlan = buildTestFixPlan(task, testResult, state);
        const fixContext = `
Project: ${state.name}
Language: ${state.language}
Milestone: ${milestone.name}
Task: ${task.name}
Phase: Test failure fix (attempt ${retries}/${maxRetries})
`.trim();

        const useOptimized = consensusConfig?.useOptimizedConsensus !== false;
        let fixConsensus: ConsensusProcessResult;

        if (useOptimized) {
          onProgress?.('task-test', `Getting consensus on fix plan (attempt ${retries}/${maxRetries})...`);
          fixConsensus = await runOptimizedConsensusProcess(
            fixPlan,
            fixContext,
            {
              projectDir,
              config: consensusConfig,
              milestoneId: milestone.id,
              milestoneName: milestone.name,
              taskId: task.id,
              taskName: `${task.name} - Test Fix ${retries}`,
              parallelReviews: true,
              isFullstack: isWorkspace(state.language),
              onIteration: (iteration, result) => {
                onProgress?.('task-test', `Fix consensus iteration ${iteration}: ${result.score}%`);
              },
              onProgress,
            }
          );
        } else {
          onProgress?.('task-test', `Getting consensus on fix plan (attempt ${retries}/${maxRetries})...`);
          fixConsensus = await iterateUntilConsensus(
            fixPlan,
            fixContext,
            {
              projectDir,
              config: consensusConfig,
              isFullstack: isWorkspace(state.language),
              language: state.language,
              onIteration: (iteration, result) => {
                onProgress?.('task-test', `Fix consensus iteration ${iteration}: ${result.score}%`);
              },
              onProgress,
            }
          );
        }

        if (!fixConsensus.approved) {
          onProgress?.('task-test', `Fix plan not approved (${fixConsensus.finalScore}%), skipping fix`);
          break;
        }

        onProgress?.('task-test', `Fix plan approved (${fixConsensus.finalScore}%), implementing fix...`);

        // Implement the consensus-approved fix
        const fixResult = await handleTestFailure(
          task,
          testResult,
          fixConsensus.bestPlan,
          projectDir,
          (msg) => onProgress?.('task-test', msg),
        );

        if (!fixResult.success) {
          // Check if this is a rate limit pause (not a real failure)
          if (fixResult.rateLimitPaused) {
            const resetInfo = fixResult.rateLimitInfo;
            const pauseMessage = resetInfo?.message || 'Rate limit reached';

            state = await updateTaskInState(projectDir, task.id, {
              status: 'paused',
              error: `Rate limit during test fix: ${pauseMessage}. Run /resume to continue.`,
            });

            onProgress?.('task-test', `Test fix paused due to rate limit: ${pauseMessage}`);
            onProgress?.('task-test', 'Your progress is saved. Run /resume to continue after the rate limit resets.');

            return {
              success: false,
              task: { ...task, status: 'paused' },
              consensusResult,
              testResult,
              rateLimitPaused: true,
              error: `Rate limit: ${pauseMessage}`,
            };
          }

          onProgress?.('task-test', `Fix attempt ${retries} failed: ${fixResult.error || 'unknown error'}`);
          break;
        }

        onProgress?.('task-test', `Fix ${retries} applied, re-running tests...`);
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
