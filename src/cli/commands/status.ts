/**
 * Status command
 * Shows project status and progress
 */

import { Command } from 'commander';
import path from 'node:path';
import {
  getWorkflowStatus,
  getWorkflowSummary,
  validateReadyForExecution,
} from '../../workflow/index.js';
import {
  printHeader,
  printSection,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  printProgress,
  printProjectState,
  startSpinner,
  succeedSpinner,
  failSpinner,
} from '../output.js';

/**
 * Create the status command
 */
export function createStatusCommand(): Command {
  const status = new Command('status')
    .description('Show project status')
    .argument('[directory]', 'Project directory', '.')
    .option('-v, --verbose', 'Show detailed status')
    .option('--json', 'Output as JSON')
    .action(async (directory: string, options) => {
      const projectDir = path.resolve(directory);

      startSpinner('Loading project status...');

      try {
        const status = await getWorkflowStatus(projectDir);

        if (!status.exists) {
          failSpinner('No project found');
          printInfo(`No Popeye project found at: ${projectDir}`);
          printInfo('Run "popeye-cli create <idea>" to create a new project');
          process.exit(1);
        }

        succeedSpinner('Status loaded');

        // JSON output
        if (options.json) {
          console.log(JSON.stringify({ status, progress: status.progress }, null, 2));
          return;
        }

        // Verbose output
        if (options.verbose && status.state) {
          printProjectState(status.state);
          return;
        }

        // Standard output
        const state = status.state!;
        const progress = status.progress!;

        printHeader(`Project: ${state.name}`);

        printSection('Status');
        printKeyValue('Phase', state.phase);
        printKeyValue('Status', state.status);
        printKeyValue('Language', state.language);

        printSection('Progress');
        printKeyValue('Milestones', `${progress.completedMilestones}/${progress.totalMilestones}`);
        printKeyValue('Tasks', `${progress.completedTasks}/${progress.totalTasks}`);
        printProgress(progress.completedTasks, progress.totalTasks);

        // Show current work
        if (state.currentMilestone) {
          const milestone = state.milestones.find((m) => m.id === state.currentMilestone);
          if (milestone) {
            printSection('Current Work');
            printKeyValue('Milestone', milestone.name);

            if (state.currentTask) {
              const task = milestone.tasks.find((t) => t.id === state.currentTask);
              if (task) {
                printKeyValue('Task', task.name);
              }
            }
          }
        }

        // Show consensus info
        if (state.consensusHistory && state.consensusHistory.length > 0) {
          const lastConsensus = state.consensusHistory[state.consensusHistory.length - 1];
          printSection('Consensus');
          printKeyValue('Last Score', `${lastConsensus.result.score}%`);
          printKeyValue('Iterations', state.consensusHistory.length.toString());
        }

        // Show errors
        if (state.error) {
          printSection('Error');
          printError(state.error);
        }

        // Show next steps
        console.log();
        if (state.status === 'complete') {
          printSuccess('Project is complete!');
        } else if (state.status === 'failed') {
          printWarning('Project failed. Run "popeye-cli resume" to retry.');
        } else if (state.phase === 'plan') {
          printInfo('Run "popeye-cli resume" to continue planning.');
        } else {
          printInfo('Run "popeye-cli resume" to continue execution.');
        }
      } catch (error) {
        failSpinner('Failed to load status');
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return status;
}

/**
 * Create the validate command
 */
export function createValidateCommand(): Command {
  const validate = new Command('validate')
    .description('Validate project is ready for execution')
    .argument('[directory]', 'Project directory', '.')
    .action(async (directory: string) => {
      const projectDir = path.resolve(directory);

      startSpinner('Validating project...');

      try {
        const result = await validateReadyForExecution(projectDir);

        if (result.ready) {
          succeedSpinner('Project is valid and ready for execution');
          printSuccess('All validation checks passed');
        } else {
          failSpinner('Project validation failed');
          printSection('Issues Found');
          for (const issue of result.issues) {
            printWarning(issue);
          }
          process.exit(1);
        }
      } catch (error) {
        failSpinner('Validation failed');
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return validate;
}

/**
 * Create the summary command
 */
export function createSummaryCommand(): Command {
  const summary = new Command('summary')
    .description('Show detailed project summary')
    .argument('[directory]', 'Project directory', '.')
    .action(async (directory: string) => {
      const projectDir = path.resolve(directory);

      try {
        const summaryText = await getWorkflowSummary(projectDir);
        console.log(summaryText);
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return summary;
}
