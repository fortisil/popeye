/**
 * CLI output utilities
 * Handles formatted output, spinners, and progress display
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { ProjectState, Milestone, Task } from '../types/workflow.js';
import type { ConsensusResult } from '../types/consensus.js';
import type { TestResult } from '../workflow/test-runner.js';

/**
 * Output theme colors
 */
export const theme = {
  primary: chalk.cyan,
  secondary: chalk.gray,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  highlight: chalk.bold.white,
  dim: chalk.dim,
};

/**
 * Spinner instance for progress display
 */
let spinner: Ora | null = null;

/**
 * Start a spinner with a message
 *
 * @param message - Initial message
 * @returns Spinner instance
 */
export function startSpinner(message: string): Ora {
  if (spinner) {
    spinner.stop();
  }
  spinner = ora({
    text: message,
    spinner: 'dots',
  }).start();
  return spinner;
}

/**
 * Update spinner message
 *
 * @param message - New message
 */
export function updateSpinner(message: string): void {
  if (spinner) {
    spinner.text = message;
  }
}

/**
 * Stop spinner with success
 *
 * @param message - Success message
 */
export function succeedSpinner(message?: string): void {
  if (spinner) {
    spinner.succeed(message);
    spinner = null;
  }
}

/**
 * Stop spinner with failure
 *
 * @param message - Failure message
 */
export function failSpinner(message?: string): void {
  if (spinner) {
    spinner.fail(message);
    spinner = null;
  }
}

/**
 * Stop spinner without status
 */
export function stopSpinner(): void {
  if (spinner) {
    spinner.stop();
    spinner = null;
  }
}

/**
 * Print a header
 *
 * @param title - Header title
 */
export function printHeader(title: string): void {
  console.log();
  console.log(theme.primary.bold(`=== ${title} ===`));
  console.log();
}

/**
 * Print a section header
 *
 * @param title - Section title
 */
export function printSection(title: string): void {
  console.log();
  console.log(theme.highlight(`--- ${title} ---`));
}

/**
 * Print a success message
 *
 * @param message - Success message
 */
export function printSuccess(message: string): void {
  console.log(theme.success(`[OK] ${message}`));
}

/**
 * Print a warning message
 *
 * @param message - Warning message
 */
export function printWarning(message: string): void {
  console.log(theme.warning(`[WARN] ${message}`));
}

/**
 * Print an error message
 *
 * @param message - Error message
 */
export function printError(message: string): void {
  console.log(theme.error(`[ERROR] ${message}`));
}

/**
 * Print an info message
 *
 * @param message - Info message
 */
export function printInfo(message: string): void {
  console.log(theme.info(`[INFO] ${message}`));
}

/**
 * Print a key-value pair
 *
 * @param key - Key
 * @param value - Value
 */
export function printKeyValue(key: string, value: string | number | boolean): void {
  console.log(`  ${theme.secondary(key + ':')} ${value}`);
}

/**
 * Print a list item
 *
 * @param item - List item
 * @param indent - Indentation level
 */
export function printListItem(item: string, indent: number = 0): void {
  const prefix = '  '.repeat(indent) + '- ';
  console.log(theme.secondary(prefix) + item);
}

/**
 * Print project state summary
 *
 * @param state - Project state
 */
export function printProjectState(state: ProjectState): void {
  printHeader(`Project: ${state.name}`);

  printKeyValue('ID', state.id);
  printKeyValue('Language', state.language);
  printKeyValue('Phase', state.phase);
  printKeyValue('Status', state.status);
  printKeyValue('Created', state.createdAt);
  printKeyValue('Updated', state.updatedAt);

  if (state.error) {
    printSection('Error');
    printError(state.error);
  }

  if (state.milestones.length > 0) {
    printSection('Milestones');
    for (const milestone of state.milestones) {
      printMilestone(milestone);
    }
  }
}

/**
 * Print milestone summary
 *
 * @param milestone - Milestone
 */
export function printMilestone(milestone: Milestone): void {
  const statusIcon = getStatusIcon(milestone.status);
  console.log(`\n  ${statusIcon} ${theme.highlight(milestone.name)}`);

  if (milestone.tasks.length > 0) {
    for (const task of milestone.tasks) {
      printTask(task, 2);
    }
  }
}

/**
 * Print task summary
 *
 * @param task - Task
 * @param indent - Indentation level
 */
export function printTask(task: Task, indent: number = 0): void {
  const statusIcon = getStatusIcon(task.status);
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${statusIcon} ${task.name}`);
}

/**
 * Get status icon
 *
 * @param status - Status
 * @returns Status icon
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'complete':
      return theme.success('[OK]');
    case 'in-progress':
      return theme.warning('[..]');
    case 'failed':
      return theme.error('[X]');
    default:
      return theme.dim('[ ]');
  }
}

/**
 * Print consensus result
 *
 * @param result - Consensus result
 */
export function printConsensusResult(result: ConsensusResult): void {
  const scoreColor = result.score >= 95 ? theme.success :
                     result.score >= 80 ? theme.warning : theme.error;

  printSection('Consensus Review');
  console.log(`  Score: ${scoreColor(`${result.score}%`)}`);
  console.log(`  Status: ${result.approved ? theme.success('APPROVED') : theme.warning('PENDING')}`);

  if (result.strengths && result.strengths.length > 0) {
    console.log();
    console.log(theme.success('  Strengths:'));
    for (const strength of result.strengths.slice(0, 3)) {
      printListItem(strength, 2);
    }
  }

  if (result.concerns && result.concerns.length > 0) {
    console.log();
    console.log(theme.warning('  Concerns:'));
    for (const concern of result.concerns.slice(0, 3)) {
      printListItem(concern, 2);
    }
  }
}

/**
 * Print test result
 *
 * @param result - Test result
 */
export function printTestResult(result: TestResult): void {
  printSection('Test Results');

  if (result.error) {
    printError(result.error);
    return;
  }

  const statusIcon = result.success ? theme.success('[PASS]') : theme.error('[FAIL]');
  console.log(`  ${statusIcon} ${result.passed}/${result.total} tests passed`);

  if (result.failedTests && result.failedTests.length > 0) {
    console.log();
    console.log(theme.error('  Failed tests:'));
    for (const test of result.failedTests.slice(0, 5)) {
      printListItem(test, 2);
    }
  }
}

/**
 * Print progress bar
 *
 * @param current - Current value
 * @param total - Total value
 * @param label - Label
 */
export function printProgress(current: number, total: number, label?: string): void {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((percent / 100) * barWidth);
  const empty = barWidth - filled;

  const bar = theme.success('#'.repeat(filled)) + theme.dim('-'.repeat(empty));
  const percentStr = `${percent}%`.padStart(4);

  console.log(`  [${bar}] ${percentStr}${label ? ` - ${label}` : ''}`);
}

/**
 * Print authentication status
 *
 * @param status - Authentication status
 */
export function printAuthStatus(status: {
  claude: { authenticated: boolean; user?: string };
  openai: { authenticated: boolean; keyLastFour?: string };
}): void {
  printSection('Authentication Status');

  // Claude status
  const claudeIcon = status.claude.authenticated ? theme.success('[OK]') : theme.error('[X]');
  const claudeInfo = status.claude.user || 'Not authenticated';
  console.log(`  ${claudeIcon} Claude CLI: ${claudeInfo}`);

  // OpenAI status
  const openaiIcon = status.openai.authenticated ? theme.success('[OK]') : theme.error('[X]');
  const openaiInfo = status.openai.keyLastFour
    ? `Authenticated (****${status.openai.keyLastFour})`
    : 'Not authenticated';
  console.log(`  ${openaiIcon} OpenAI API: ${openaiInfo}`);
}

/**
 * Print help for a command
 *
 * @param command - Command name
 * @param description - Command description
 * @param usage - Usage string
 * @param options - Command options
 */
export function printHelp(
  command: string,
  description: string,
  usage: string,
  options?: Array<{ flag: string; description: string }>
): void {
  printHeader(command);
  console.log(description);
  console.log();
  console.log(theme.highlight('Usage:'));
  console.log(`  ${usage}`);

  if (options && options.length > 0) {
    console.log();
    console.log(theme.highlight('Options:'));
    for (const opt of options) {
      console.log(`  ${theme.primary(opt.flag.padEnd(20))} ${opt.description}`);
    }
  }
}

/**
 * Print a table
 *
 * @param headers - Table headers
 * @param rows - Table rows
 */
export function printTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRow);
  });

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(theme.highlight(headerLine));
  console.log(theme.dim('-'.repeat(headerLine.length)));

  // Print rows
  for (const row of rows) {
    const rowLine = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
    console.log(rowLine);
  }
}

/**
 * Clear the console
 */
export function clearConsole(): void {
  console.clear();
}

/**
 * Print a blank line
 */
export function printBlank(): void {
  console.log();
}
