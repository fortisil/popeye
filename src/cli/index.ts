/**
 * CLI module index
 * Main entry point for the CLI interface
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import {
  createAuthCommand,
  createCreateCommand,
  createStatusCommand,
  createValidateCommand,
  createSummaryCommand,
  createResumeCommand,
  createResetCommand,
  createCancelCommand,
  createConfigCommand,
  createDbCommand,
  createDoctorCommand,
  createReviewCommand,
  createDebugCommand,
} from './commands/index.js';
import { startInteractiveMode } from './interactive.js';
import { printError } from './output.js';

// Re-export
export * from './output.js';
export * from './interactive.js';
export * from './commands/index.js';

/**
 * Package version - read from package.json
 */
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
export const VERSION: string = packageJson.version;

/**
 * Create the main CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('popeye-cli')
    .description('Fully autonomous code generation powered by Claude CLI and OpenAI consensus')
    .version(VERSION)
    .option('-v, --verbose', 'Enable verbose output')
    .option('--no-color', 'Disable colored output');

  // Add commands
  program.addCommand(createAuthCommand());
  program.addCommand(createCreateCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createValidateCommand());
  program.addCommand(createSummaryCommand());
  program.addCommand(createResumeCommand());
  program.addCommand(createResetCommand());
  program.addCommand(createCancelCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createDbCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createReviewCommand());
  program.addCommand(createDebugCommand());

  // Interactive mode command
  program
    .command('interactive')
    .alias('i')
    .description('Start interactive mode')
    .action(async () => {
      await startInteractiveMode();
    });

  // Default action (no command specified) - start interactive mode
  program.action(async (_options, command) => {
    if (command.args.length === 0) {
      // No command specified - start interactive mode with auto-auth
      await startInteractiveMode();
    }
  });

  return program;
}

/**
 * Run the CLI
 */
export async function runCLI(args: string[] = process.argv): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(args);
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
