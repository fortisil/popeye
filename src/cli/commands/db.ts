/**
 * Database CLI command
 * Provides subcommands: status, configure, apply
 */

import { Command } from 'commander';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadProject, updateState } from '../../state/index.js';
import { DEFAULT_DB_CONFIG } from '../../types/database.js';
import type { DbConfig, DbMode } from '../../types/database.js';
import { transitionDbStatus } from '../../workflow/db-state-machine.js';
import {
  runDbSetupPipeline,
  resolveBackendDir,
} from '../../workflow/db-setup-runner.js';
import {
  printHeader,
  printSection,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  startSpinner,
  succeedSpinner,
  failSpinner,
} from '../output.js';

/**
 * Prompt the user for a line of input
 */
function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Display DB status from project state
 */
async function handleDbStatus(directory: string): Promise<void> {
  const projectDir = path.resolve(directory);

  try {
    const state = await loadProject(projectDir);
    const dbConfig: DbConfig = state.dbConfig || { ...DEFAULT_DB_CONFIG, designed: false };

    printHeader('Database Status');

    printKeyValue('Designed', dbConfig.designed ? 'Yes' : 'No');
    printKeyValue('Status', dbConfig.status);
    printKeyValue('Mode', dbConfig.mode || 'not set');
    printKeyValue('Vector Required', dbConfig.vectorRequired ? 'Yes' : 'No');
    printKeyValue('Migrations Applied', String(dbConfig.migrationsApplied));

    if (dbConfig.lastError) {
      printSection('Last Error');
      printError(dbConfig.lastError);
    }

    if (dbConfig.readinessCheckedAt) {
      printKeyValue('Last Readiness Check', dbConfig.readinessCheckedAt);
    }

    // Show next steps based on status
    console.log();
    switch (dbConfig.status) {
      case 'unconfigured':
        printInfo('Run "popeye db configure" to set up database connection.');
        break;
      case 'configured':
        printInfo('Run "popeye db apply" to apply migrations and finalize setup.');
        break;
      case 'error':
        printWarning('Database setup failed. Run "popeye db apply" to retry.');
        break;
      case 'ready':
        printSuccess('Database is ready.');
        break;
      case 'applying':
        printInfo('Database setup is in progress...');
        break;
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Failed to load project');
    process.exit(1);
  }
}

/**
 * Configure database mode and connection URL
 */
async function handleDbConfigure(directory: string): Promise<void> {
  const projectDir = path.resolve(directory);

  try {
    const state = await loadProject(projectDir);
    const dbConfig: DbConfig = state.dbConfig || { ...DEFAULT_DB_CONFIG };

    printHeader('Database Configuration');

    // Prompt for mode
    console.log();
    console.log('  Choose database mode:');
    console.log('    1. local_docker  - PostgreSQL via Docker Compose (recommended for dev)');
    console.log('    2. managed       - External managed database (Neon, Supabase, etc.)');
    console.log();

    const modeChoice = await promptLine('  Enter choice [1-2]: ');
    let mode: DbMode;
    if (modeChoice === '2' || modeChoice === 'managed') {
      mode = 'managed';
    } else {
      mode = 'local_docker';
    }

    printKeyValue('Mode', mode);

    // For managed mode, prompt for DATABASE_URL
    if (mode === 'managed') {
      const dbUrl = await promptLine('  Enter DATABASE_URL: ');

      if (!dbUrl) {
        printError('DATABASE_URL is required for managed mode.');
        process.exit(1);
      }

      // Write DATABASE_URL to apps/backend/.env
      const backendDir = resolveBackendDir(projectDir);
      const envPath = path.join(backendDir, '.env');

      let envContent = '';
      try {
        envContent = await fsPromises.readFile(envPath, 'utf-8');
      } catch {
        // File doesn't exist yet
      }

      // Replace or add DATABASE_URL
      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL=${dbUrl}`);
      } else {
        envContent += `\nDATABASE_URL=${dbUrl}\n`;
      }

      await fsPromises.writeFile(envPath, envContent, 'utf-8');
      printSuccess(`DATABASE_URL written to ${envPath}`);
    } else {
      printInfo('Local Docker mode: PostgreSQL starts with "docker-compose up".');
      printInfo('DATABASE_URL is set automatically in docker-compose.yml.');
    }

    // Update state: transition to configured
    const newStatus = transitionDbStatus(dbConfig.status, 'configured');
    await updateState(projectDir, {
      dbConfig: {
        ...dbConfig,
        mode,
        status: newStatus,
      },
    });

    printSuccess('Database configured successfully.');
    printInfo('Run "popeye db apply" to apply migrations.');
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Configuration failed');
    process.exit(1);
  }
}

/**
 * Apply database setup (migrations, extensions, readiness)
 */
async function handleDbApply(directory: string, options: { skipSeed?: boolean }): Promise<void> {
  const projectDir = path.resolve(directory);

  try {
    const state = await loadProject(projectDir);
    const dbConfig: DbConfig = state.dbConfig || { ...DEFAULT_DB_CONFIG };

    printHeader('Database Setup');

    // Transition to applying
    let currentStatus = dbConfig.status;
    if (currentStatus === 'unconfigured') {
      printError('Database not configured. Run "popeye db configure" first.');
      process.exit(1);
    }

    startSpinner('Running database setup pipeline...');

    const result = await runDbSetupPipeline(projectDir, {
      skipSeed: options.skipSeed,
      onStep: (step, status, message) => {
        if (status === 'start') {
          startSpinner(`[${step}] ${message}`);
        } else if (status === 'success') {
          succeedSpinner(`[${step}] ${message}`);
        } else {
          failSpinner(`[${step}] ${message}`);
        }
      },
    });

    // Print summary
    console.log();
    printSection('Setup Summary');
    for (const step of result.steps) {
      const icon = step.success ? '  [PASS]' : '  [FAIL]';
      const duration = `(${step.durationMs}ms)`;
      if (step.success) {
        printSuccess(`${icon} ${step.step} ${duration}`);
      } else {
        printError(`${icon} ${step.step} ${duration}`);
        if (step.error) {
          printError(`         ${step.error}`);
        }
      }
    }

    printKeyValue('Total Duration', `${result.totalDurationMs}ms`);

    // Update state with result
    const newStatus = result.success ? 'ready' : 'error';
    const now = new Date().toISOString();
    await updateState(projectDir, {
      dbConfig: {
        ...dbConfig,
        status: newStatus as DbConfig['status'],
        lastError: result.error,
        readinessCheckedAt: result.success ? now : dbConfig.readinessCheckedAt,
      },
    });

    if (result.success) {
      console.log();
      printSuccess('Database setup complete. Status: READY');
    } else {
      console.log();
      printError(`Database setup failed: ${result.error}`);
      printInfo('Fix the issue and run "popeye db apply" to retry.');
      process.exit(1);
    }
  } catch (error) {
    failSpinner('Setup failed');
    printError(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Create the db command with subcommands
 */
export function createDbCommand(): Command {
  const db = new Command('db')
    .description('Database management commands');

  db.command('status')
    .description('Show database configuration status')
    .argument('[directory]', 'Project directory', '.')
    .action(handleDbStatus);

  db.command('configure')
    .description('Configure database mode and connection')
    .argument('[directory]', 'Project directory', '.')
    .action(handleDbConfigure);

  db.command('apply')
    .description('Apply database setup (migrations, extensions, readiness)')
    .argument('[directory]', 'Project directory', '.')
    .option('--skip-seed', 'Skip seed step')
    .action(handleDbApply);

  return db;
}
