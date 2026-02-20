/**
 * Start & Env Checks tests — application start check,
 * environment variable validation from .env.example.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runStartCheck, runEnvCheck } from '../../src/pipeline/check-runner.js';

const TEST_DIR = join(process.cwd(), 'tmp-start-env-test');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('runStartCheck', () => {
  it('should pass when process stays alive past timeout', async () => {
    // 'sleep 10' will stay alive for 10s, well past our 1s timeout
    const result = await runStartCheck('sleep 10', TEST_DIR, { timeoutMs: 1000 });
    expect(result.check_type).toBe('start');
    expect(result.status).toBe('pass');
    expect(result.exit_code).toBe(0);
  }, 10000);

  it('should fail when process crashes immediately', async () => {
    const result = await runStartCheck('exit 1', TEST_DIR, { timeoutMs: 3000 });
    expect(result.check_type).toBe('start');
    expect(result.status).toBe('fail');
  }, 10000);

  it('should fail for dangerous commands', async () => {
    const result = await runStartCheck('sudo rm -rf /', TEST_DIR);
    expect(result.status).toBe('fail');
    expect(result.stderr_summary).toContain('rejected');
  });

  it('should return start check type', async () => {
    const result = await runStartCheck('echo hello', TEST_DIR, { timeoutMs: 1000 });
    expect(result.check_type).toBe('start');
  }, 5000);
});

describe('runEnvCheck', () => {
  it('should pass when no .env.example exists', () => {
    const result = runEnvCheck(TEST_DIR);
    expect(result.check_type).toBe('env_check');
    expect(result.status).toBe('pass');
    expect(result.stderr_summary).toContain('No .env.example');
  });

  it('should fail when .env.example exists but .env is missing', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), 'API_KEY=\nDB_URL=');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('fail');
    expect(result.stderr_summary).toContain('.env file not found');
    expect(result.stderr_summary).toContain('API_KEY');
    expect(result.stderr_summary).toContain('DB_URL');
  });

  it('should pass when all required vars are present', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), 'API_KEY=your-key\nDB_URL=postgres://');
    writeFileSync(join(TEST_DIR, '.env'), 'API_KEY=real-key\nDB_URL=postgres://localhost/db');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('pass');
  });

  it('should fail when required vars are missing from .env', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), 'API_KEY=\nDB_URL=\nSECRET=');
    writeFileSync(join(TEST_DIR, '.env'), 'API_KEY=real-key');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('fail');
    expect(result.stderr_summary).toContain('Missing vars');
    expect(result.stderr_summary).toContain('DB_URL');
    expect(result.stderr_summary).toContain('SECRET');
  });

  it('should warn about empty vars but still pass', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), 'API_KEY=\nOPTIONAL_VAR=');
    writeFileSync(join(TEST_DIR, '.env'), 'API_KEY=real-key\nOPTIONAL_VAR=');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('pass');
    expect(result.stderr_summary).toContain('Empty vars');
    expect(result.stderr_summary).toContain('OPTIONAL_VAR');
  });

  it('should skip comments in .env.example', () => {
    writeFileSync(
      join(TEST_DIR, '.env.example'),
      '# Database config\nDB_URL=postgres://\n# API keys\nAPI_KEY=',
    );
    writeFileSync(join(TEST_DIR, '.env'), 'DB_URL=postgres://localhost\nAPI_KEY=key123');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('pass');
  });

  it('should handle quoted values in .env', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), 'SECRET=');
    writeFileSync(join(TEST_DIR, '.env'), 'SECRET="my-secret-value"');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('pass');
  });

  it('should skip empty lines in .env.example', () => {
    writeFileSync(join(TEST_DIR, '.env.example'), '\nAPI_KEY=\n\nDB_URL=\n\n');
    writeFileSync(join(TEST_DIR, '.env'), 'API_KEY=key\nDB_URL=url');

    const result = runEnvCheck(TEST_DIR);
    expect(result.status).toBe('pass');
  });
});
