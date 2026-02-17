/**
 * Doctor command
 * Runs comprehensive readiness checks on database and project health
 */

import { Command } from 'commander';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { loadProject } from '../../state/index.js';
import { DEFAULT_DB_CONFIG } from '../../types/database.js';
import type { ReadinessCheck, ReadinessResult } from '../../types/database-runtime.js';
import {
  readEnvFile,
  resolveBackendDir,
} from '../../workflow/db-setup-runner.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from '../output.js';

/**
 * Run all readiness checks and return structured results
 *
 * @param projectDir - Project root directory
 * @returns ReadinessResult with all check outcomes
 */
export async function runDoctorChecks(projectDir: string): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];

  // Check 1: Project state exists
  try {
    await loadProject(projectDir);
    checks.push({
      name: 'Project State',
      passed: true,
      message: 'Project state loaded successfully',
      severity: 'critical',
    });
  } catch {
    checks.push({
      name: 'Project State',
      passed: false,
      message: 'No valid project state found at this directory',
      severity: 'critical',
    });
    return { healthy: false, checks, timestamp: new Date().toISOString() };
  }

  const state = await loadProject(projectDir);
  const dbConfig = state.dbConfig || { ...DEFAULT_DB_CONFIG, designed: false };
  const backendDir = resolveBackendDir(projectDir);

  // Check 2: DB layer generated
  checks.push({
    name: 'DB Layer Generated',
    passed: dbConfig.designed === true,
    message: dbConfig.designed
      ? 'Database layer files are present'
      : 'Database layer not generated (dbConfig.designed = false)',
    severity: 'critical',
  });

  // Check 3: Docker compose includes postgres service
  let composeHasPostgres = false;
  try {
    const composePath = path.join(projectDir, 'docker-compose.yml');
    const composeContent = await fsPromises.readFile(composePath, 'utf-8');
    composeHasPostgres = composeContent.includes('postgres:') && composeContent.includes('pg_isready');
  } catch {
    // File doesn't exist
  }
  checks.push({
    name: 'Docker Compose Postgres',
    passed: composeHasPostgres,
    message: composeHasPostgres
      ? 'docker-compose.yml includes postgres service with healthcheck'
      : 'docker-compose.yml missing or does not include postgres service',
    severity: 'warning',
  });

  // Check 4: .env has DATABASE_URL (not placeholder)
  const env = await readEnvFile(path.join(backendDir, '.env'));
  const dbUrl = env['DATABASE_URL'] || '';
  const hasRealDbUrl = dbUrl.length > 0 && !dbUrl.includes('sqlite');
  checks.push({
    name: 'DATABASE_URL Configured',
    passed: hasRealDbUrl,
    message: hasRealDbUrl
      ? 'DATABASE_URL is set to a PostgreSQL connection string'
      : 'DATABASE_URL is missing or still using SQLite placeholder',
    severity: 'critical',
  });

  // Check 5: DB connection reachable (only if URL is set)
  if (hasRealDbUrl) {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg
async def check():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    await conn.execute('SELECT 1')
    await conn.close()
asyncio.run(check())
"`;
      await execAsync(cmd, { timeout: 10000 });
      checks.push({
        name: 'DB Connection',
        passed: true,
        message: 'Database is reachable',
        severity: 'critical',
      });
    } catch {
      checks.push({
        name: 'DB Connection',
        passed: false,
        message: 'Cannot connect to database - check DATABASE_URL and server status',
        severity: 'critical',
      });
    }
  } else {
    checks.push({
      name: 'DB Connection',
      passed: false,
      message: 'Skipped - DATABASE_URL not configured',
      severity: 'info',
    });
  }

  // Check 6: pgvector extension available (only if connected)
  if (hasRealDbUrl && checks.find((c) => c.name === 'DB Connection')?.passed) {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg
async def check():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    row = await conn.fetchrow(\"SELECT extname FROM pg_extension WHERE extname = 'vector'\")
    await conn.close()
    if row is None:
        raise Exception('pgvector extension not found')
asyncio.run(check())
"`;
      await execAsync(cmd, { timeout: 10000 });
      checks.push({
        name: 'pgvector Extension',
        passed: true,
        message: 'pgvector extension is installed',
        severity: 'warning',
      });
    } catch {
      checks.push({
        name: 'pgvector Extension',
        passed: false,
        message: 'pgvector extension not available - vector features will be disabled',
        severity: 'warning',
      });
    }
  }

  // Check 7: Migrations applied
  if (hasRealDbUrl && checks.find((c) => c.name === 'DB Connection')?.passed) {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      const cmd = `cd "${backendDir}" && python3 -c "
import asyncio, asyncpg
async def check():
    conn = await asyncpg.connect('${dbUrl.replace(/'/g, "\\'")}')
    row = await conn.fetchrow('SELECT version_num FROM alembic_version LIMIT 1')
    await conn.close()
    if row is None:
        raise Exception('No migrations applied')
asyncio.run(check())
"`;
      await execAsync(cmd, { timeout: 10000 });
      checks.push({
        name: 'Migrations Applied',
        passed: true,
        message: 'Alembic migrations have been applied',
        severity: 'critical',
      });
    } catch {
      checks.push({
        name: 'Migrations Applied',
        passed: false,
        message: 'No migrations applied - run "popeye db apply" or "alembic upgrade head"',
        severity: 'critical',
      });
    }
  }

  // Check 8: /health/db endpoint (optional - only if server is running)
  try {
    const response = await fetch('http://localhost:8000/health/db', {
      signal: AbortSignal.timeout(3000),
    });
    checks.push({
      name: 'Health Endpoint',
      passed: response.status === 200,
      message: response.status === 200
        ? '/health/db returns 200 OK'
        : `/health/db returns ${response.status}`,
      severity: 'info',
    });
  } catch {
    checks.push({
      name: 'Health Endpoint',
      passed: false,
      message: 'Backend server not running (optional check)',
      severity: 'info',
    });
  }

  const healthy = checks
    .filter((c) => c.severity === 'critical')
    .every((c) => c.passed);

  return {
    healthy,
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create the doctor command
 */
export function createDoctorCommand(): Command {
  const doctor = new Command('doctor')
    .description('Run comprehensive database and project readiness checks')
    .argument('[directory]', 'Project directory', '.')
    .action(async (directory: string) => {
      const projectDir = path.resolve(directory);

      printHeader('Popeye Doctor');
      console.log();

      const result = await runDoctorChecks(projectDir);

      for (const check of result.checks) {
        const statusLabel = check.passed ? '[PASS]' : check.severity === 'info' ? '[SKIP]' : '[FAIL]';

        if (check.passed) {
          printSuccess(`  ${statusLabel} ${check.name}: ${check.message}`);
        } else if (check.severity === 'info') {
          printInfo(`  ${statusLabel} ${check.name}: ${check.message}`);
        } else if (check.severity === 'warning') {
          printWarning(`  ${statusLabel} ${check.name}: ${check.message}`);
        } else {
          printError(`  ${statusLabel} ${check.name}: ${check.message}`);
        }
      }

      console.log();
      if (result.healthy) {
        printSuccess('All critical checks passed. Database is healthy.');
      } else {
        printError('Some critical checks failed. Fix the issues above and re-run.');
        process.exit(1);
      }
    });

  return doctor;
}
