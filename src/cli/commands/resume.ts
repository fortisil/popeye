/**
 * Resume command
 * Resume an interrupted workflow
 */

import { Command } from 'commander';
import path from 'node:path';
import { requireAuth } from '../../auth/index.js';
import {
  resumeWorkflow,
  getWorkflowStatus,
  resetWorkflow,
  cancelWorkflow,
} from '../../workflow/index.js';
import { readPopeyeMdConfig } from '../../config/popeye-md.js';
import type { WorkflowPhase } from '../../types/workflow.js';
import {
  printHeader,
  printSection,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
} from '../output.js';

/**
 * Create the resume command
 */
export function createResumeCommand(): Command {
  const resume = new Command('resume')
    .description('Resume an interrupted project workflow')
    .argument('[directory]', 'Project directory', '.')
    .option(
      '--threshold <percent>',
      'Consensus threshold percentage',
      '95'
    )
    .option(
      '--max-iterations <count>',
      'Maximum consensus iterations',
      '5'
    )
    .option(
      '--max-retries <count>',
      'Maximum task retries',
      '3'
    )
    .action(async (directory: string, options) => {
      const projectDir = path.resolve(directory);
      const threshold = parseInt(options.threshold, 10);
      const maxIterations = parseInt(options.maxIterations, 10);
      const maxRetries = parseInt(options.maxRetries, 10);

      try {
        // Check project exists
        const status = await getWorkflowStatus(projectDir);

        if (!status.exists || !status.state) {
          printError('No project found at this location');
          printInfo('Run "popeye-cli create <idea>" to create a new project');
          process.exit(1);
        }

        printHeader(`Resuming: ${status.state.name}`);

        printSection('Current State');
        printKeyValue('Phase', status.state.phase);
        printKeyValue('Status', status.state.status);

        if (status.progress) {
          printKeyValue('Progress', `${status.progress.percentComplete}%`);
        }

        if (status.state.status === 'complete') {
          printSuccess('Project is already complete!');
          return;
        }

        // Require authentication
        printSection('Authentication');
        startSpinner('Checking authentication...');

        try {
          await requireAuth();
          succeedSpinner('Authentication verified');
        } catch (error) {
          failSpinner('Authentication required');
          printError(error instanceof Error ? error.message : 'Authentication failed');
          process.exit(1);
        }

        // Resume workflow — merge CLI flags with popeye.md config
        printSection('Resuming Workflow');

        const popeyeConfig = await readPopeyeMdConfig(projectDir);
        const result = await resumeWorkflow(projectDir, {
          consensusConfig: {
            threshold,
            maxIterations,
            reviewer: popeyeConfig?.reviewer ?? 'openai',
            arbitrator: popeyeConfig?.arbitrator,
            enableArbitration: popeyeConfig?.enableArbitration ?? false,
            openaiModel: popeyeConfig?.openaiModel,
            geminiModel: popeyeConfig?.geminiModel,
            grokModel: popeyeConfig?.grokModel,
          },
          maxRetries,
          onProgress: (phase, message) => {
            handleProgressUpdate(phase, message);
          },
        });

        // Stop any running spinner
        stopSpinner();

        // Print results
        console.log();
        if (result.success) {
          printHeader('Workflow Complete!');

          printSection('Summary');
          printKeyValue('Phase', result.state.phase);
          printKeyValue('Status', result.state.status);

          if (result.executionResult) {
            printKeyValue('Tasks Completed', result.executionResult.completedTasks.toString());
          }

          printSuccess('Project workflow completed successfully!');
        } else {
          printHeader('Workflow Failed');

          if (result.error) {
            printError(result.error);
          }

          printWarning('Run "popeye-cli resume" to try again');
          process.exit(1);
        }
      } catch (error) {
        stopSpinner();
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return resume;
}

/**
 * Create the reset command
 */
export function createResetCommand(): Command {
  const reset = new Command('reset')
    .description('Reset project to a specific phase')
    .argument('[directory]', 'Project directory', '.')
    .option('-p, --phase <phase>', 'Phase to reset to (plan, execution)', 'plan')
    .option('-f, --force', 'Force reset without confirmation')
    .action(async (directory: string, options) => {
      const projectDir = path.resolve(directory);
      const phase = options.phase as WorkflowPhase;

      if (!['plan', 'execution'].includes(phase)) {
        printError(`Invalid phase: ${phase}. Use 'plan' or 'execution'.`);
        process.exit(1);
      }

      try {
        // Check project exists
        const status = await getWorkflowStatus(projectDir);

        if (!status.exists || !status.state) {
          printError('No project found at this location');
          process.exit(1);
        }

        if (!options.force) {
          printWarning(`This will reset the project to the '${phase}' phase.`);
          printWarning('A backup will be created before reset.');
          printInfo('Use --force to skip this warning.');
          // In a real implementation, we'd prompt for confirmation here
        }

        startSpinner(`Resetting to ${phase} phase...`);

        await resetWorkflow(projectDir, phase);

        succeedSpinner(`Reset to ${phase} phase`);
        printSuccess('Project has been reset');
        printInfo('Run "popeye-cli resume" to continue');
      } catch (error) {
        failSpinner('Reset failed');
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return reset;
}

/**
 * Create the cancel command
 */
export function createCancelCommand(): Command {
  const cancel = new Command('cancel')
    .description('Cancel and delete a project')
    .argument('[directory]', 'Project directory', '.')
    .option('-f, --force', 'Force cancel without confirmation')
    .action(async (directory: string, options) => {
      const projectDir = path.resolve(directory);

      try {
        // Check project exists
        const status = await getWorkflowStatus(projectDir);

        if (!status.exists) {
          printError('No project found at this location');
          process.exit(1);
        }

        if (!options.force) {
          printWarning('This will delete all project state and cannot be undone.');
          printInfo('Use --force to skip this warning.');
          // In a real implementation, we'd prompt for confirmation here
        }

        startSpinner('Cancelling project...');

        const deleted = await cancelWorkflow(projectDir);

        if (deleted) {
          succeedSpinner('Project cancelled');
          printSuccess('Project state has been deleted');
        } else {
          failSpinner('No state to delete');
        }
      } catch (error) {
        failSpinner('Cancel failed');
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cancel;
}

/**
 * Handle progress updates from the workflow
 */
let currentSpinner: ReturnType<typeof startSpinner> | null = null;
let lastPhase = '';

function handleProgressUpdate(phase: string, message: string): void {
  const phaseNames: Record<string, string> = {
    'plan-init': 'Initializing',
    'expand-idea': 'Expanding Idea',
    'get-context': 'Analyzing Context',
    'create-plan': 'Creating Plan',
    'consensus': 'Consensus Review',
    'execution-start': 'Starting Execution',
    'task-start': 'Executing Task',
    'task-complete': 'Task Complete',
    'task-failed': 'Task Failed',
    'execution-complete': 'Execution Complete',
    'complete': 'Complete',
    'failed': 'Failed',
    'error': 'Error',
    'workflow': 'Workflow',
  };

  const phaseName = phaseNames[phase] || phase;

  if (phase !== lastPhase) {
    if (currentSpinner) {
      if (phase === 'error' || phase === 'failed') {
        failSpinner();
      } else {
        succeedSpinner();
      }
    }

    if (!['complete', 'failed', 'error', 'task-complete', 'task-failed'].includes(phase)) {
      currentSpinner = startSpinner(`${phaseName}: ${message}`);
    }

    lastPhase = phase;
  } else if (currentSpinner) {
    updateSpinner(`${phaseName}: ${message}`);
  }

  if (phase === 'complete') {
    if (currentSpinner) {
      succeedSpinner(message);
      currentSpinner = null;
    } else {
      printSuccess(message);
    }
  } else if (phase === 'failed' || phase === 'error') {
    if (currentSpinner) {
      failSpinner(message);
      currentSpinner = null;
    } else {
      printError(message);
    }
  }
}
