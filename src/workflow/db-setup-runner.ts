/**
 * Database setup pipeline runner
 * Executes sequential steps to configure, migrate, and verify a database
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { DbStatus, DbSetupStep } from '../types/database.js';
import type { SetupStepResult, SetupResult } from '../types/database-runtime.js';
import { transitionDbStatus } from './db-state-machine.js';

const execAsync = promisify(exec);

/**
 * Options for the setup pipeline
 */
export interface SetupPipelineOptions {
  /** Skip seed step */
  skipSeed?: boolean;
  /** Callback for step progress */
  onStep?: (step: DbSetupStep, status: 'start' | 'success' | 'fail', message: string) => void;
}

/**
 * Read and parse a .env file for key=value pairs
 *
 * @param envPath - Path to .env file
 * @returns Map of environment variable key-value pairs
 */
export async function readEnvFile(envPath: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const content = await fs.readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch {
    // File doesn't exist or isn't readable
  }
  return result;
}

/**
 * Scan migration files for prerequisite extension comments
 * Looks for lines like: # popeye:requires_extension=vector
 *
 * @param migrationsDir - Path to migrations/versions/ directory
 * @returns Array of required extension names
 */
export async function parseMigrationPrereqs(migrationsDir: string): Promise<string[]> {
  const extensions: string[] = [];
  const versionsDir = path.join(migrationsDir, 'versions');

  try {
    const files = await fs.readdir(versionsDir);
    for (const file of files) {
      if (!file.endsWith('.py')) continue;
      const content = await fs.readFile(path.join(versionsDir, file), 'utf-8');
      const matches = content.matchAll(/# popeye:requires_extension=(\w+)/g);
      for (const match of matches) {
        if (!extensions.includes(match[1])) {
          extensions.push(match[1]);
        }
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return extensions;
}

/**
 * Derive the snake_case package name from the project state
 *
 * @param projectDir - Project root directory
 * @returns Python package name
 */
export async function getPackageName(projectDir: string): Promise<string> {
  try {
    const statePath = path.join(projectDir, '.popeye', 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    const name: string = state.name || 'project';
    return name.toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
  } catch {
    return 'backend';
  }
}

/**
 * Resolve the backend directory path
 *
 * @param projectDir - Project root directory
 * @returns Absolute path to apps/backend
 */
export function resolveBackendDir(projectDir: string): string {
  return path.join(projectDir, 'apps', 'backend');
}

/**
 * Execute a single pipeline step and track timing
 */
async function executeStep(
  step: DbSetupStep,
  fn: () => Promise<string>,
  options?: SetupPipelineOptions
): Promise<SetupStepResult> {
  options?.onStep?.(step, 'start', `Starting ${step}...`);
  const start = Date.now();

  try {
    const message = await fn();
    const durationMs = Date.now() - start;
    options?.onStep?.(step, 'success', message);
    return { step, success: true, message, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    options?.onStep?.(step, 'fail', error);
    return { step, success: false, message: `Step failed: ${step}`, durationMs, error };
  }
}

/**
 * Step 1: Check database connection
 */
async function checkConnection(backendDir: string): Promise<string> {
  const env = await readEnvFile(path.join(backendDir, '.env'));
  const dbUrl = env['DATABASE_URL'] || '';

  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL not found in apps/backend/.env. ' +
      'Run "popeye db configure" to set it up.'
    );
  }

  // Test connectivity using Python asyncpg
  const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg, os
async def check():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    await conn.execute('SELECT 1')
    await conn.close()
asyncio.run(check())
"`;

  try {
    await execAsync(cmd, { timeout: 15000 });
    return 'Database connection verified successfully';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Database connection failed: ${msg}`);
  }
}

/**
 * Step 2: Ensure required extensions
 */
async function ensureExtensions(backendDir: string): Promise<string> {
  const migrationsDir = path.join(backendDir, 'migrations');
  const extensions = await parseMigrationPrereqs(migrationsDir);

  if (extensions.length === 0) {
    return 'No prerequisite extensions required';
  }

  const env = await readEnvFile(path.join(backendDir, '.env'));
  const dbUrl = env['DATABASE_URL'] || '';

  for (const ext of extensions) {
    const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg
async def ensure():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    await conn.execute('CREATE EXTENSION IF NOT EXISTS ${ext}')
    await conn.close()
asyncio.run(ensure())
"`;

    try {
      await execAsync(cmd, { timeout: 15000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create extension '${ext}': ${msg}`);
    }
  }

  return `Extensions verified: ${extensions.join(', ')}`;
}

/**
 * Step 3: Apply Alembic migrations
 */
async function applyMigrations(backendDir: string): Promise<string> {
  const cmd = `cd "${backendDir}" && alembic upgrade head 2>&1`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    // Count applied migrations from output
    const appliedMatches = stdout.match(/Running upgrade/g);
    const count = appliedMatches ? appliedMatches.length : 0;
    return count > 0
      ? `Applied ${count} migration(s) successfully`
      : 'All migrations already up to date';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration failed: ${msg}`);
  }
}

/**
 * Step 4: Run seed script (if exists)
 */
async function seedMinimal(backendDir: string): Promise<string> {
  const seedPaths = [
    path.join(backendDir, 'scripts', 'seed.py'),
    path.join(backendDir, 'seed.py'),
  ];

  let seedPath: string | null = null;
  for (const p of seedPaths) {
    try {
      await fs.access(p);
      seedPath = p;
      break;
    } catch {
      // Try next
    }
  }

  if (!seedPath) {
    return 'No seed script found (skipped)';
  }

  const cmd = `cd "${backendDir}" && python3 "${seedPath}" 2>&1`;

  try {
    await execAsync(cmd, { timeout: 30000 });
    return 'Seed script executed successfully';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Seed script failed: ${msg}`);
  }
}

/**
 * Step 5: Run readiness tests
 */
async function runReadinessTests(backendDir: string): Promise<string> {
  const env = await readEnvFile(path.join(backendDir, '.env'));
  const dbUrl = env['DATABASE_URL'] || '';

  const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg
async def check():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    # Verify connectivity
    await conn.execute('SELECT 1')
    # Verify alembic_version table exists and has a version
    row = await conn.fetchrow('SELECT version_num FROM alembic_version LIMIT 1')
    if row is None:
        raise Exception('No migration version found in alembic_version table')
    await conn.close()
    return row['version_num']
asyncio.run(check())
"`;

  try {
    await execAsync(cmd, { timeout: 15000 });
    return 'Readiness tests passed: connectivity and migration version verified';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Readiness tests failed: ${msg}`);
  }
}

/**
 * Run the complete database setup pipeline
 *
 * Steps execute sequentially. Pipeline stops on first failure.
 *
 * @param projectDir - Project root directory
 * @param options - Pipeline options
 * @returns Full pipeline result
 */
export async function runDbSetupPipeline(
  projectDir: string,
  options: SetupPipelineOptions = {}
): Promise<SetupResult> {
  const backendDir = resolveBackendDir(projectDir);
  const steps: SetupStepResult[] = [];
  const pipelineStart = Date.now();

  // Step 1: Check connection
  const connResult = await executeStep('check_connection', () => checkConnection(backendDir), options);
  steps.push(connResult);
  if (!connResult.success) {
    return buildResult(steps, pipelineStart, 'error');
  }

  // Step 2: Ensure extensions
  const extResult = await executeStep('ensure_extensions', () => ensureExtensions(backendDir), options);
  steps.push(extResult);
  if (!extResult.success) {
    return buildResult(steps, pipelineStart, 'error');
  }

  // Step 3: Apply migrations
  const migResult = await executeStep('apply_migrations', () => applyMigrations(backendDir), options);
  steps.push(migResult);
  if (!migResult.success) {
    return buildResult(steps, pipelineStart, 'error');
  }

  // Step 4: Seed (optional)
  if (!options.skipSeed) {
    const seedResult = await executeStep('seed_minimal', () => seedMinimal(backendDir), options);
    steps.push(seedResult);
    if (!seedResult.success) {
      return buildResult(steps, pipelineStart, 'error');
    }
  }

  // Step 5: Readiness tests
  const readyResult = await executeStep('readiness_tests', () => runReadinessTests(backendDir), options);
  steps.push(readyResult);
  if (!readyResult.success) {
    return buildResult(steps, pipelineStart, 'error');
  }

  // Step 6: Mark ready (always succeeds if we got here)
  const markResult = await executeStep('mark_ready', async () => {
    return 'Database marked as ready';
  }, options);
  steps.push(markResult);

  return buildResult(steps, pipelineStart, 'ready');
}

/**
 * Build a SetupResult from accumulated steps
 */
function buildResult(
  steps: SetupStepResult[],
  pipelineStart: number,
  finalStatus: DbStatus
): SetupResult {
  const totalDurationMs = Date.now() - pipelineStart;
  const success = finalStatus === 'ready';
  const failedStep = steps.find((s) => !s.success);

  return {
    success,
    steps,
    totalDurationMs,
    finalStatus,
    error: failedStep?.error,
  };
}

/**
 * Compute the new DB status after a pipeline run and validate the transition
 *
 * @param currentStatus - Current DB status from state
 * @param pipelineResult - Result of the pipeline run
 * @returns New DB status after validated transition
 */
export function computePostPipelineStatus(
  currentStatus: DbStatus,
  pipelineResult: SetupResult
): DbStatus {
  // Transition to 'applying' first
  const applying = transitionDbStatus(currentStatus, 'applying');
  // Then transition to final status
  return transitionDbStatus(applying, pipelineResult.finalStatus);
}
