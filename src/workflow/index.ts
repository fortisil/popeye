/**
 * Workflow orchestration module
 * Main entry point for managing the complete project workflow
 */

import type { ProjectSpec } from '../types/project.js';
import type { ProjectState, WorkflowPhase } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import {
  loadProject,
  projectExists,
  getProgress,
  resetToPhase,
  deleteProject,
  verifyProjectCompletion,
  resetIncompleteProject,
} from '../state/index.js';
import {
  runPlanMode,
  resumePlanMode,
  type PlanModeResult,
} from './plan-mode.js';
import {
  runExecutionMode,
  resumeExecutionMode,
  executeSingleTask,
  type ExecutionModeResult,
  type TaskExecutionResult,
} from './execution-mode.js';
import { getWorkflowLogger } from './workflow-logger.js';
// Types are re-exported via export * from statements below

// Re-export submodules
export * from './consensus.js';
export * from './plan-mode.js';
export * from './execution-mode.js';
export * from './test-runner.js';
export * from './workflow-logger.js';
export * from './ui-setup.js';
export * from './ui-designer.js';
export * from './ui-verification.js';
export * from './project-verification.js';
export * from './auto-fix.js';
export * from './auto-fix-bundler.js';
export * from './project-structure.js';
// Note: plan-parser.js exports are accessible but have naming conflicts with plan-mode.js
// Import directly from './plan-parser.js' if you need the extended TaskAppTag type (includes 'WEB')
export * from './separation-guard.js';
export * from './seo-tests.js';
export * from './task-workflow.js';
export * from './tester.js';
export * from './milestone-workflow.js';
export * from './plan-storage.js';
export * from './workspace-manager.js';
export * from './website-updater.js';
export * from './website-strategy.js';
export * from './overview.js';

/**
 * Workflow options
 */
export interface WorkflowOptions {
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  maxRetries?: number;
  onProgress?: (phase: string, message: string) => void;
}

/**
 * Complete workflow result
 */
export interface WorkflowResult {
  success: boolean;
  state: ProjectState;
  planResult?: PlanModeResult;
  executionResult?: ExecutionModeResult;
  error?: string;
  /** True if workflow paused due to rate limiting (not a failure) */
  rateLimitPaused?: boolean;
}

/**
 * Run the complete workflow from idea to deployed code
 *
 * @param spec - Project specification
 * @param options - Workflow options
 * @returns Workflow result
 */
export async function runWorkflow(
  spec: ProjectSpec,
  options: WorkflowOptions
): Promise<WorkflowResult> {
  const { projectDir, consensusConfig, maxRetries, onProgress } = options;

  // Initialize workflow logger
  const logger = getWorkflowLogger(projectDir);

  try {
    await logger.stageStart('init', 'Starting complete workflow', {
      projectName: spec.name,
      idea: spec.idea.slice(0, 200),
      language: spec.language,
    });

    // Phase 1: Plan Mode
    onProgress?.('workflow', 'Starting Plan Mode...');

    const planResult = await runPlanMode(spec, {
      projectDir,
      consensusConfig,
      onProgress,
    });

    if (!planResult.success) {
      await logger.stageFailed('init', 'Workflow failed in Plan Mode', planResult.error || 'Plan mode failed');
      return {
        success: false,
        state: planResult.state,
        planResult,
        error: planResult.error || 'Plan mode failed to reach consensus',
      };
    }

    // Post-plan: Update website content with project context
    if (spec.language === 'website' || spec.language === 'all' || spec.language === 'fullstack') {
      try {
        onProgress?.('website-update', 'Updating website with project context...');
        const { updateWebsiteContent } = await import('./website-updater.js');
        await updateWebsiteContent(projectDir, planResult.state, spec.language, (msg) => onProgress?.('website-update', msg));
      } catch {
        // Non-blocking: website content update failure should not stop workflow
      }
    }

    // Phase 2: Execution Mode
    onProgress?.('workflow', 'Starting Execution Mode...');

    const executionResult = await runExecutionMode({
      projectDir,
      maxRetries,
      onProgress,
    });

    if (executionResult.success) {
      await logger.stageComplete('completion', 'Complete workflow finished successfully', {
        completedTasks: executionResult.completedTasks,
        failedTasks: executionResult.failedTasks,
      });
    } else if (executionResult.rateLimitPaused) {
      // Rate limit pause is not a failure - log info instead of error
      await logger.info('completion', 'workflow_paused', 'Workflow paused due to rate limit', {
        completedTasks: executionResult.completedTasks,
        error: executionResult.error,
      });
    } else {
      await logger.stageFailed('completion', 'Workflow failed in Execution Mode', executionResult.error || 'Execution failed');
    }

    return {
      success: executionResult.success,
      state: executionResult.state,
      planResult,
      executionResult,
      rateLimitPaused: executionResult.rateLimitPaused,
      error: executionResult.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logger.stageFailed('init', 'Workflow failed with exception', errorMessage, {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    return {
      success: false,
      state: await loadProject(projectDir).catch(() => ({} as ProjectState)),
      error: errorMessage,
    };
  }
}

/**
 * Resume workflow options with additional context
 */
export interface ResumeWorkflowOptions extends Omit<WorkflowOptions, 'projectDir'> {
  additionalContext?: string;
}

/**
 * Resume an existing workflow from where it left off
 *
 * @param projectDir - Project directory
 * @param options - Workflow options with optional additional context
 * @returns Workflow result
 */
export async function resumeWorkflow(
  projectDir: string,
  options: ResumeWorkflowOptions
): Promise<WorkflowResult> {
  const { consensusConfig, maxRetries, onProgress, additionalContext } = options;

  // Initialize workflow logger
  const logger = getWorkflowLogger(projectDir);

  try {
    // Check if project exists
    if (!(await projectExists(projectDir))) {
      throw new Error(`No project found at ${projectDir}`);
    }

    const state = await loadProject(projectDir);

    await logger.info('init', 'workflow_resume', 'Resuming workflow', {
      projectName: state.name,
      currentPhase: state.phase,
      currentStatus: state.status,
      hasAdditionalContext: !!additionalContext,
    });

    // Determine which phase to resume
    switch (state.phase) {
      case 'plan': {
        onProgress?.('workflow', 'Resuming Plan Mode...');
        if (additionalContext) {
          onProgress?.('workflow', `Additional guidance: ${additionalContext}`);
        }

        const planResult = await resumePlanMode(projectDir, {
          consensusConfig,
          additionalContext,
          onProgress,
        });

        if (!planResult.success) {
          return {
            success: false,
            state: planResult.state,
            planResult,
            error: planResult.error || 'Plan mode failed to reach consensus',
          };
        }

        // Post-plan: Update website content with project context
        if (state.language === 'website' || state.language === 'all' || state.language === 'fullstack') {
          try {
            onProgress?.('website-update', 'Updating website with project context...');
            const { updateWebsiteContent } = await import('./website-updater.js');
            await updateWebsiteContent(projectDir, planResult.state, state.language, (msg) => onProgress?.('website-update', msg));
          } catch {
            // Non-blocking
          }
        }

        // Continue to execution
        onProgress?.('workflow', 'Starting Execution Mode...');

        const executionResult = await runExecutionMode({
          projectDir,
          maxRetries,
          onProgress,
        });

        return {
          success: executionResult.success,
          state: executionResult.state,
          planResult,
          executionResult,
          rateLimitPaused: executionResult.rateLimitPaused,
          error: executionResult.error,
        };
      }

      case 'execution': {
        // Update website content before resuming execution
        if (state.language === 'website' || state.language === 'all' || state.language === 'fullstack') {
          try {
            onProgress?.('website-update', 'Updating website with project context before execution resume...');
            const { updateWebsiteContent } = await import('./website-updater.js');
            await updateWebsiteContent(projectDir, state, state.language, (msg) => onProgress?.('website-update', msg));
          } catch {
            // Non-blocking: website content update failure should not stop workflow
          }
        }

        onProgress?.('workflow', 'Resuming Execution Mode...');

        const executionResult = await resumeExecutionMode({
          projectDir,
          maxRetries,
          onProgress,
        });

        return {
          success: executionResult.success,
          state: executionResult.state,
          executionResult,
          rateLimitPaused: executionResult.rateLimitPaused,
          error: executionResult.error,
        };
      }

      case 'complete': {
        // Verify actual completion - don't trust status alone
        const verification = await verifyProjectCompletion(projectDir);

        if (verification.isComplete) {
          onProgress?.('workflow', 'Project is fully complete');
          onProgress?.('workflow', verification.progress.progressSummary);
          return {
            success: true,
            state,
          };
        }

        // Status says complete but work is incomplete - allow resume
        onProgress?.(
          'workflow',
          `Project status is 'complete' but work is incomplete: ${verification.reason}`
        );
        onProgress?.(
          'workflow',
          `Progress: ${verification.progress.progressSummary}`
        );

        // Reset project to correct state and continue execution
        onProgress?.('workflow', 'Resetting project status to allow resuming...');
        const resetState = await resetIncompleteProject(projectDir);

        onProgress?.('workflow', `Resuming Execution Mode (${resetState.phase} phase)...`);

        const executionResult = await resumeExecutionMode({
          projectDir,
          maxRetries,
          consensusConfig,
          onProgress,
        });

        return {
          success: executionResult.success,
          state: executionResult.state,
          executionResult,
          rateLimitPaused: executionResult.rateLimitPaused,
          error: executionResult.error,
        };
      }

      default:
        throw new Error(`Unknown phase: ${state.phase}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      state: await loadProject(projectDir).catch(() => ({} as ProjectState)),
      error: errorMessage,
    };
  }
}

/**
 * Get workflow status and progress
 *
 * @param projectDir - Project directory
 * @returns Status information
 */
export async function getWorkflowStatus(projectDir: string): Promise<{
  exists: boolean;
  state?: ProjectState;
  progress?: {
    totalMilestones: number;
    completedMilestones: number;
    totalTasks: number;
    completedTasks: number;
    percentComplete: number;
  };
}> {
  if (!(await projectExists(projectDir))) {
    return { exists: false };
  }

  const state = await loadProject(projectDir);
  const progress = await getProgress(projectDir);

  return {
    exists: true,
    state,
    progress,
  };
}

/**
 * Reset workflow to a specific phase
 *
 * @param projectDir - Project directory
 * @param phase - Phase to reset to
 * @returns Updated state
 */
export async function resetWorkflow(
  projectDir: string,
  phase: WorkflowPhase
): Promise<ProjectState> {
  return resetToPhase(projectDir, phase);
}

/**
 * Cancel and delete a workflow
 *
 * @param projectDir - Project directory
 * @returns True if deleted
 */
export async function cancelWorkflow(projectDir: string): Promise<boolean> {
  return deleteProject(projectDir);
}

/**
 * Get a human-readable summary of the workflow status
 *
 * @param projectDir - Project directory
 * @returns Summary string
 */
export async function getWorkflowSummary(projectDir: string): Promise<string> {
  const status = await getWorkflowStatus(projectDir);

  if (!status.exists || !status.state) {
    return 'No project found';
  }

  const { state, progress } = status;
  const lines: string[] = [];

  lines.push(`# Project: ${state.name}`);
  lines.push('');
  lines.push(`**Phase:** ${state.phase}`);
  lines.push(`**Status:** ${state.status}`);
  lines.push(`**Language:** ${state.language}`);
  lines.push('');

  if (progress) {
    lines.push(`## Progress`);
    lines.push(`- Milestones: ${progress.completedMilestones}/${progress.totalMilestones}`);
    lines.push(`- Tasks: ${progress.completedTasks}/${progress.totalTasks}`);
    lines.push(`- Complete: ${progress.percentComplete}%`);
    lines.push('');
  }

  if (state.consensusHistory && state.consensusHistory.length > 0) {
    const lastConsensus = state.consensusHistory[state.consensusHistory.length - 1];
    lines.push(`## Last Consensus`);
    lines.push(`- Score: ${lastConsensus.result.score}%`);
    lines.push(`- Iteration: ${lastConsensus.iteration}`);
    lines.push('');
  }

  if (state.error) {
    lines.push(`## Error`);
    lines.push(state.error);
    lines.push('');
  }

  if (state.currentMilestone) {
    const milestone = state.milestones.find((m) => m.id === state.currentMilestone);
    if (milestone) {
      lines.push(`## Current Milestone`);
      lines.push(`**${milestone.name}**`);

      if (state.currentTask) {
        const task = milestone.tasks.find((t) => t.id === state.currentTask);
        if (task) {
          lines.push(`- Current Task: ${task.name}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Execute a single task manually
 *
 * @param projectDir - Project directory
 * @param taskId - Task ID
 * @param options - Execution options
 * @returns Task result
 */
export async function executeTask(
  projectDir: string,
  taskId: string,
  options?: { maxRetries?: number; onProgress?: (message: string) => void }
): Promise<TaskExecutionResult> {
  return executeSingleTask(projectDir, taskId, {
    projectDir,
    maxRetries: options?.maxRetries,
    onProgress: options?.onProgress ? (_, msg) => options.onProgress!(msg) : undefined,
  });
}

/**
 * Validate that a project is ready for execution
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validateReadyForExecution(projectDir: string): Promise<{
  ready: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  if (!(await projectExists(projectDir))) {
    return { ready: false, issues: ['No project found'] };
  }

  const state = await loadProject(projectDir);

  if (!state.plan) {
    issues.push('No approved plan');
  }

  if (state.milestones.length === 0) {
    issues.push('No milestones defined');
  }

  const allTasks = state.milestones.flatMap((m) => m.tasks);
  if (allTasks.length === 0) {
    issues.push('No tasks defined');
  }

  if (state.phase === 'plan' && state.consensusHistory.length === 0) {
    issues.push('Plan has not been through consensus review');
  }

  const lastConsensus = state.consensusHistory[state.consensusHistory.length - 1];
  if (lastConsensus && lastConsensus.result.score < 95) {
    issues.push(`Consensus score (${lastConsensus.result.score}%) below 95% threshold`);
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}
