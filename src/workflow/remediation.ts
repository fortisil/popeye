/**
 * Remediation loop for consensus-driven failure recovery
 * When a task fails during execution, this module:
 * 1. Gathers full failure context
 * 2. Analyzes root cause via Claude
 * 3. Creates a fix plan
 * 4. Gets consensus from reviewers (with full failure context)
 * 5. Implements the approved fix
 * 6. Retries the task
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState, Task, Milestone } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { isWorkspace } from '../types/project.js';
import { createPlan as claudeCreatePlan, generateCode } from '../adapters/claude.js';
import { loadProject, updateState } from '../state/index.js';
import {
  iterateUntilConsensus,
  runOptimizedConsensusProcess,
  type ConsensusProcessResult,
} from './consensus.js';
import { runTaskWorkflow, type TaskWorkflowResult } from './task-workflow.js';

/**
 * Maximum number of remediation attempts per task
 */
export const MAX_REMEDIATION_ATTEMPTS = 2;

/**
 * Result of a remediation attempt
 */
export interface RemediationResult {
  success: boolean;
  taskResult?: TaskWorkflowResult;
  remediationPlan?: string;
  consensusResult?: ConsensusProcessResult;
  failureAnalysis?: string;
  attempt: number;
  maxAttempts: number;
  error?: string;
  rateLimitPaused?: boolean;
}

/**
 * Options for remediation
 */
export interface RemediationOptions {
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  onProgress?: (phase: string, message: string) => void;
}

/**
 * Update a task in state with new data
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
 * Build comprehensive failure context for reviewers
 * Gathers all available information about why a task failed
 *
 * @param task - The failed task
 * @param milestone - The parent milestone
 * @param taskResult - The task workflow result with failure details
 * @param state - Current project state
 * @param projectDir - Project directory for reading docs
 * @returns Structured markdown string with full failure context
 */
export async function buildFailureContext(
  task: Task,
  milestone: Milestone,
  taskResult: TaskWorkflowResult,
  state: ProjectState,
  projectDir: string
): Promise<string> {
  const sections: string[] = [];

  // Section 1: Task info
  sections.push(`## Failed Task
- **Name**: ${task.name}
- **Description**: ${task.description}
- **Milestone**: ${milestone.name}
- **Task ID**: ${task.id}`);

  if (task.plan) {
    sections.push(`### Task Plan (that was executed)
${task.plan.slice(0, 2000)}`);
  }

  // Section 2: Error details
  sections.push(`## Error Details
${taskResult.error || 'No error message available'}`);

  // Section 3: Test results (if available)
  if (taskResult.testResult) {
    const tr = taskResult.testResult;
    const isCrash = tr.passed === 0 && tr.failed > 20;

    sections.push(`## Test Results
- **Status**: ${tr.success ? 'PASSED' : 'FAILED'}
- **Passed**: ${tr.passed}
- **Failed**: ${tr.failed}
- **Total**: ${tr.total}
${isCrash ? '- **CRASH DETECTED**: 0 passed with many failures indicates a startup/import error' : ''}`);

    if (tr.failedTests && tr.failedTests.length > 0) {
      sections.push(`### Failed Tests
${tr.failedTests.slice(0, 10).map(t => `- ${t}`).join('\n')}`);
    }

    if (tr.output) {
      sections.push(`### Test Output (truncated)
\`\`\`
${tr.output.slice(0, 3000)}
\`\`\``);
    }
  }

  // Section 4: Consensus history (if available)
  if (taskResult.consensusResult) {
    const cr = taskResult.consensusResult;
    if (cr.finalConcerns.length > 0 || cr.finalRecommendations.length > 0) {
      sections.push(`## Previous Consensus Feedback
### Concerns Raised by Reviewers
${cr.finalConcerns.map(c => `- ${c}`).join('\n') || 'None'}

### Recommendations from Reviewers
${cr.finalRecommendations.map(r => `- ${r}`).join('\n') || 'None'}`);
    }
  }

  // Section 5: Previous remediation attempts
  if (task.remediationAttempts && task.remediationAttempts > 0) {
    sections.push(`## Previous Remediation Attempts (${task.remediationAttempts})
### Previous Root Cause Analysis
${task.lastFailureAnalysis || 'Not available'}

### Previous Fix Plan (did not resolve the issue)
${task.lastRemediationPlan || 'Not available'}

**IMPORTANT**: The previous fix did not work. The new fix must take a DIFFERENT approach.`);
  }

  // Section 6: Read disk docs if they exist
  if (task.planDoc) {
    try {
      const planDocPath = path.join(projectDir, task.planDoc);
      const planContent = await fs.readFile(planDocPath, 'utf-8');
      sections.push(`## Task Plan Document
${planContent.slice(0, 1500)}`);
    } catch {
      // File may not exist, skip
    }
  }

  if (task.testResultsDoc) {
    try {
      const testDocPath = path.join(projectDir, task.testResultsDoc);
      const testContent = await fs.readFile(testDocPath, 'utf-8');
      sections.push(`## Test Results Document
${testContent.slice(0, 1500)}`);
    } catch {
      // File may not exist, skip
    }
  }

  // Section 7: Milestone context
  const completedTasks = milestone.tasks.filter(t => t.status === 'complete');
  const remainingTasks = milestone.tasks.filter(
    t => t.status !== 'complete' && t.id !== task.id
  );

  sections.push(`## Milestone Context
- **Project**: ${state.name}
- **Language**: ${state.language}
- **Completed Tasks**: ${completedTasks.map(t => t.name).join(', ') || 'None'}
- **Remaining Tasks**: ${remainingTasks.map(t => t.name).join(', ') || 'None'}`);

  return sections.join('\n\n');
}

/**
 * Use Claude to analyze the failure and create a remediation plan
 *
 * @param failureContext - Full failure context markdown
 * @param task - The failed task
 * @param state - Current project state
 * @param onProgress - Progress callback
 * @returns The remediation plan
 */
export async function buildRemediationPlan(
  failureContext: string,
  task: Task,
  state: ProjectState,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Analyzing failure and creating remediation plan...');

  const prompt = `
You are analyzing a task failure and must create a remediation plan.

${failureContext}

Based on the failure context above, provide:

### Root Cause Analysis
Identify the specific root cause of the failure. Be precise - don't just restate the error.

### Fix Plan
Step-by-step plan to fix the issue:
1. [Specific action]
2. [Specific action]
...

### Files to Modify
List the exact files that need to be changed and what changes are needed.

### Verification Steps
How to verify the fix works:
1. [Verification step]
2. [Verification step]

${task.remediationAttempts && task.remediationAttempts > 0
    ? '\nIMPORTANT: Previous remediation attempts failed. You MUST take a DIFFERENT approach this time.'
    : ''}

Be specific and actionable. This plan will be reviewed before implementation.
`.trim();

  const context = `
Project: ${state.name}
Language: ${state.language}
Phase: REMEDIATION
`.trim();

  const result = await claudeCreatePlan(prompt, context, state.language, onProgress);

  if (!result.success) {
    // If Claude analysis fails (e.g., rate limit), return a basic plan
    // based on the available failure context
    onProgress?.('Analysis failed, creating basic remediation plan from available context');
    return `### Root Cause Analysis
Based on error: ${task.error || 'Unknown error'}

### Fix Plan
1. Review the error output and identify the failing component
2. Fix the identified issue
3. Re-run tests to verify

### Files to Modify
See task plan for relevant files.

### Verification Steps
1. Run tests and verify they pass
2. Check that no regressions were introduced`;
  }

  return result.response;
}

/**
 * Get consensus on the remediation plan with full failure context
 *
 * @param plan - The remediation plan
 * @param failureContext - Full failure context for reviewers
 * @param task - The failed task
 * @param milestone - Parent milestone
 * @param state - Current project state
 * @param options - Remediation options
 * @returns Consensus process result
 */
export async function runRemediationConsensus(
  plan: string,
  failureContext: string,
  task: Task,
  milestone: Milestone,
  state: ProjectState,
  options: RemediationOptions
): Promise<ConsensusProcessResult> {
  const { projectDir, consensusConfig, onProgress } = options;

  const attempt = (task.remediationAttempts || 0) + 1;

  // Build context that includes failure information for reviewers
  const context = `
Project: ${state.name}
Language: ${state.language}
Phase: REMEDIATION (attempt ${attempt}/${MAX_REMEDIATION_ATTEMPTS})
Milestone: ${milestone.name}
Task: ${task.name}

## FAILURE CONTEXT (Why this task needs remediation)
${failureContext.slice(0, 4000)}
`.trim();

  const useOptimized = consensusConfig?.useOptimizedConsensus !== false;

  if (useOptimized) {
    onProgress?.('remediation-consensus', 'Getting consensus on remediation plan (optimized)...');
    const result = await runOptimizedConsensusProcess(
      plan,
      context,
      {
        projectDir,
        config: consensusConfig,
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        taskId: task.id,
        taskName: `${task.name} - Remediation ${attempt}`,
        parallelReviews: true,
        isFullstack: isWorkspace(state.language),
        onIteration: (iteration, result) => {
          onProgress?.('remediation-consensus', `Remediation consensus iteration ${iteration}: ${result.score}%`);
        },
        onProgress,
      }
    );
    // runOptimizedConsensusProcess returns ConsensusProcessResult or FullstackConsensusProcessResult
    // Both satisfy ConsensusProcessResult
    return result as ConsensusProcessResult;
  }

  onProgress?.('remediation-consensus', 'Getting consensus on remediation plan...');
  return iterateUntilConsensus(
    plan,
    context,
    {
      projectDir,
      config: consensusConfig,
      isFullstack: isWorkspace(state.language),
      language: state.language,
      onIteration: (iteration, result) => {
        onProgress?.('remediation-consensus', `Remediation consensus iteration ${iteration}: ${result.score}%`);
      },
      onProgress,
    }
  );
}

/**
 * Implement the approved remediation fix
 *
 * @param task - The task to fix
 * @param plan - The approved remediation plan
 * @param projectDir - Project directory
 * @param onProgress - Progress callback
 * @returns Code generation result
 */
export async function executeRemediation(
  task: Task,
  plan: string,
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; rateLimitPaused?: boolean; rateLimitInfo?: { message?: string }; error?: string }> {
  onProgress?.('Implementing remediation fix...');

  const prompt = `
## Remediation Fix Required

### Task: ${task.name}
${task.description}

### Approved Fix Plan
${plan}

### Instructions
1. Implement the fix plan above
2. Focus only on the changes specified in the plan
3. Do NOT make unrelated changes
4. Ensure the fix addresses the root cause
`.trim();

  const context = `Remediation fix for task: ${task.name}`;

  const result = await generateCode(prompt, context, {
    cwd: projectDir,
    onProgress,
  });

  if (result.rateLimitPaused) {
    return {
      success: false,
      rateLimitPaused: true,
      rateLimitInfo: result.rateLimitInfo,
    };
  }

  return {
    success: result.success,
    error: result.error,
  };
}

/**
 * Document a remediation attempt to disk
 *
 * @param projectDir - Project directory
 * @param milestone - Parent milestone
 * @param task - The task
 * @param attempt - Attempt number
 * @param failureAnalysis - Root cause analysis
 * @param remediationPlan - The fix plan
 * @param consensusScore - Consensus score for the plan
 * @param success - Whether the remediation succeeded
 */
export async function documentRemediationAttempt(
  projectDir: string,
  milestone: Milestone,
  task: Task,
  attempt: number,
  failureAnalysis: string,
  remediationPlan: string,
  consensusScore: number,
  success: boolean
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs', 'remediation');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const taskNum = task.id.split('-task-')[1] || '1';
  const filename = `milestone_${milestoneNum}_task_${taskNum}_remediation_${attempt}.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# Remediation Attempt ${attempt}: ${task.name}

## Metadata
- **Milestone**: ${milestone.name}
- **Task ID**: ${task.id}
- **Attempt**: ${attempt}/${MAX_REMEDIATION_ATTEMPTS}
- **Consensus Score**: ${consensusScore}%
- **Result**: ${success ? 'SUCCESS' : 'FAILED'}
- **Timestamp**: ${new Date().toISOString()}

## Failure Analysis
${failureAnalysis}

## Remediation Plan
${remediationPlan}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/remediation/${filename}`;
}

/**
 * Orchestrate a complete remediation attempt for a failed task
 *
 * Flow:
 * 1. Check attempt count < MAX
 * 2. Build failure context
 * 3. Create fix plan via Claude
 * 4. Get consensus with full failure context
 * 5. Document the attempt
 * 6. Implement the fix
 * 7. Reset task state and re-run task workflow
 *
 * @param milestone - Parent milestone
 * @param task - The failed task
 * @param taskResult - The failed task result
 * @param options - Remediation options
 * @returns Remediation result
 */
export async function attemptRemediation(
  milestone: Milestone,
  task: Task,
  taskResult: TaskWorkflowResult,
  options: RemediationOptions
): Promise<RemediationResult> {
  const { projectDir, consensusConfig, onProgress } = options;

  // Load fresh state
  let state = await loadProject(projectDir);

  // Get current task from state (may have been updated)
  const currentMilestone = state.milestones.find(m => m.id === milestone.id);
  const currentTask = currentMilestone?.tasks.find(t => t.id === task.id);
  const attempts = currentTask?.remediationAttempts || 0;

  // Check if max attempts reached
  if (attempts >= MAX_REMEDIATION_ATTEMPTS) {
    onProgress?.('remediation', `Max remediation attempts (${MAX_REMEDIATION_ATTEMPTS}) reached for: ${task.name}`);
    return {
      success: false,
      attempt: attempts,
      maxAttempts: MAX_REMEDIATION_ATTEMPTS,
      error: `Max remediation attempts (${MAX_REMEDIATION_ATTEMPTS}) reached`,
    };
  }

  const currentAttempt = attempts + 1;
  onProgress?.('remediation-analysis', `Remediation attempt ${currentAttempt}/${MAX_REMEDIATION_ATTEMPTS} for: ${task.name}`);

  // Increment attempt counter in state
  state = await updateTaskInState(projectDir, task.id, {
    remediationAttempts: currentAttempt,
  });

  // Step 1: Build failure context
  onProgress?.('remediation-analysis', 'Gathering failure context...');
  const failureContext = await buildFailureContext(
    currentTask || task,
    currentMilestone || milestone,
    taskResult,
    state,
    projectDir
  );

  // Step 2: Create fix plan via Claude
  onProgress?.('remediation-plan', 'Creating remediation plan...');
  const remediationPlan = await buildRemediationPlan(
    failureContext,
    currentTask || task,
    state,
    (msg) => onProgress?.('remediation-plan', msg)
  );

  // Extract failure analysis from the plan (first section)
  const analysisMatch = remediationPlan.match(/### Root Cause Analysis\n([\s\S]*?)(?=\n### |$)/);
  const failureAnalysis = analysisMatch ? analysisMatch[1].trim() : remediationPlan.slice(0, 500);

  // Save analysis to state
  state = await updateTaskInState(projectDir, task.id, {
    lastFailureAnalysis: failureAnalysis,
    lastRemediationPlan: remediationPlan,
  });

  // Step 3: Get consensus on remediation plan
  onProgress?.('remediation-consensus', 'Getting consensus on remediation plan...');
  let consensusResult: ConsensusProcessResult;

  try {
    consensusResult = await runRemediationConsensus(
      remediationPlan,
      failureContext,
      currentTask || task,
      currentMilestone || milestone,
      state,
      options
    );
  } catch (consensusError) {
    const errorMsg = consensusError instanceof Error ? consensusError.message : 'Unknown error';
    onProgress?.('remediation-consensus', `Consensus failed: ${errorMsg}`);
    return {
      success: false,
      remediationPlan,
      failureAnalysis,
      attempt: currentAttempt,
      maxAttempts: MAX_REMEDIATION_ATTEMPTS,
      error: `Consensus failed: ${errorMsg}`,
    };
  }

  // Check if consensus was rejected
  if (!consensusResult.approved) {
    onProgress?.('remediation-consensus', `Remediation plan not approved (${consensusResult.finalScore}%)`);

    // Document the rejected attempt
    await documentRemediationAttempt(
      projectDir,
      currentMilestone || milestone,
      currentTask || task,
      currentAttempt,
      failureAnalysis,
      remediationPlan,
      consensusResult.finalScore,
      false
    );

    return {
      success: false,
      remediationPlan,
      consensusResult,
      failureAnalysis,
      attempt: currentAttempt,
      maxAttempts: MAX_REMEDIATION_ATTEMPTS,
      error: `Remediation plan not approved. Score: ${consensusResult.finalScore}%`,
    };
  }

  onProgress?.('remediation-consensus', `Remediation plan approved (${consensusResult.finalScore}%)`);

  // Step 4: Document the attempt
  onProgress?.('remediation-doc', 'Documenting remediation attempt...');
  await documentRemediationAttempt(
    projectDir,
    currentMilestone || milestone,
    currentTask || task,
    currentAttempt,
    failureAnalysis,
    consensusResult.bestPlan,
    consensusResult.finalScore,
    false // Not yet known - will update if successful
  );

  // Step 5: Implement the fix
  onProgress?.('remediation-fix', 'Implementing remediation fix...');
  const fixResult = await executeRemediation(
    currentTask || task,
    consensusResult.bestPlan,
    projectDir,
    (msg) => onProgress?.('remediation-fix', msg)
  );

  // Handle rate limit pause
  if (fixResult.rateLimitPaused) {
    onProgress?.('remediation-fix', 'Rate limit during remediation - pausing gracefully');

    // Save state for resume
    await updateTaskInState(projectDir, task.id, {
      status: 'paused',
      error: `Rate limit during remediation. ${fixResult.rateLimitInfo?.message || ''}`,
    });

    return {
      success: false,
      remediationPlan: consensusResult.bestPlan,
      consensusResult,
      failureAnalysis,
      attempt: currentAttempt,
      maxAttempts: MAX_REMEDIATION_ATTEMPTS,
      rateLimitPaused: true,
      error: `Rate limit during remediation fix`,
    };
  }

  // Handle fix failure
  if (!fixResult.success) {
    onProgress?.('remediation-fix', `Remediation fix failed: ${fixResult.error}`);
    return {
      success: false,
      remediationPlan: consensusResult.bestPlan,
      consensusResult,
      failureAnalysis,
      attempt: currentAttempt,
      maxAttempts: MAX_REMEDIATION_ATTEMPTS,
      error: `Remediation fix implementation failed: ${fixResult.error}`,
    };
  }

  // Step 6: Reset task state and re-run task workflow
  onProgress?.('remediation-retry', 'Retrying task after remediation fix...');

  // Reset task for retry: keep consensus (plan is still valid), reset implementation
  state = await updateTaskInState(projectDir, task.id, {
    status: 'pending',
    implementationComplete: false,
    testsPassed: undefined,
    error: undefined,
    // Keep consensusApproved, plan, consensusScore (the original plan is still valid)
    // Keep remediationAttempts, lastFailureAnalysis, lastRemediationPlan (for tracking)
  });

  // Re-run the task workflow (gets fresh 3 test retries)
  const retryResult = await runTaskWorkflow(
    currentMilestone || milestone,
    currentTask || task,
    {
      projectDir,
      consensusConfig,
      onProgress,
    }
  );

  // Update documentation if successful
  if (retryResult.success) {
    onProgress?.('remediation-retry', `Remediation successful - task "${task.name}" now passes`);

    // Rewrite doc as successful
    await documentRemediationAttempt(
      projectDir,
      currentMilestone || milestone,
      currentTask || task,
      currentAttempt,
      failureAnalysis,
      consensusResult.bestPlan,
      consensusResult.finalScore,
      true
    );
  } else {
    onProgress?.('remediation-retry', `Task still failing after remediation attempt ${currentAttempt}`);
  }

  return {
    success: retryResult.success,
    taskResult: retryResult,
    remediationPlan: consensusResult.bestPlan,
    consensusResult,
    failureAnalysis,
    attempt: currentAttempt,
    maxAttempts: MAX_REMEDIATION_ATTEMPTS,
    error: retryResult.success ? undefined : retryResult.error,
    rateLimitPaused: retryResult.rateLimitPaused,
  };
}
