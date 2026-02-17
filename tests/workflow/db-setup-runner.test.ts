/**
 * Tests for database setup pipeline runner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  readEnvFile,
  parseMigrationPrereqs,
  getPackageName,
  resolveBackendDir,
  computePostPipelineStatus,
} from '../../src/workflow/db-setup-runner.js';
import type { SetupResult } from '../../src/types/database-runtime.js';

// Mock fs for controlled tests
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      readdir: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readEnvFile', () => {
  it('should parse key=value pairs from .env content', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'DEBUG=true\nDATABASE_URL=postgresql://localhost/db\nPOSTGRES_USER=postgres\n'
    );

    const result = await readEnvFile('/some/path/.env');
    expect(result).toEqual({
      DEBUG: 'true',
      DATABASE_URL: 'postgresql://localhost/db',
      POSTGRES_USER: 'postgres',
    });
  });

  it('should skip comments and empty lines', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      '# This is a comment\n\nDATABASE_URL=postgres://host/db\n# Another comment\n'
    );

    const result = await readEnvFile('/some/path/.env');
    expect(result).toEqual({
      DATABASE_URL: 'postgres://host/db',
    });
  });

  it('should strip surrounding quotes from values', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'FOO="bar"\nBAZ=\'qux\'\n'
    );

    const result = await readEnvFile('/some/path/.env');
    expect(result).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    });
  });

  it('should return empty object when file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await readEnvFile('/nonexistent/.env');
    expect(result).toEqual({});
  });

  it('should handle values containing equals signs', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'DATABASE_URL=postgresql://user:pass@host/db?sslmode=require\n'
    );

    const result = await readEnvFile('/some/.env');
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@host/db?sslmode=require');
  });
});

describe('parseMigrationPrereqs', () => {
  it('should extract extension names from migration comments', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['001_initial.py'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      '"""\nInitial migration.\n\n# popeye:requires_extension=vector\n"""\nfrom alembic import op\n'
    );

    const result = await parseMigrationPrereqs('/project/apps/backend/migrations');
    expect(result).toEqual(['vector']);
  });

  it('should handle multiple extensions across multiple files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['001_initial.py', '002_search.py'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('# popeye:requires_extension=vector\n')
      .mockResolvedValueOnce('# popeye:requires_extension=pg_trgm\n');

    const result = await parseMigrationPrereqs('/project/apps/backend/migrations');
    expect(result).toEqual(['vector', 'pg_trgm']);
  });

  it('should not duplicate extension names', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['001_initial.py', '002_more.py'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('# popeye:requires_extension=vector\n')
      .mockResolvedValueOnce('# popeye:requires_extension=vector\n');

    const result = await parseMigrationPrereqs('/project/apps/backend/migrations');
    expect(result).toEqual(['vector']);
  });

  it('should return empty array when no extensions required', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['001_initial.py'] as any);
    vi.mocked(fs.readFile).mockResolvedValue('from alembic import op\n');

    const result = await parseMigrationPrereqs('/project/apps/backend/migrations');
    expect(result).toEqual([]);
  });

  it('should return empty array when directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await parseMigrationPrereqs('/nonexistent/migrations');
    expect(result).toEqual([]);
  });

  it('should skip non-.py files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['README.md', '001_initial.py'] as any);
    vi.mocked(fs.readFile).mockResolvedValue('# popeye:requires_extension=vector\n');

    const result = await parseMigrationPrereqs('/project/migrations');
    // readFile called only once (for .py file, not .md)
    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['vector']);
  });
});

describe('getPackageName', () => {
  it('should derive snake_case name from project state', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ name: 'my-cool-project' })
    );

    const result = await getPackageName('/project');
    expect(result).toBe('my_cool_project');
  });

  it('should strip non-alphanumeric characters', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ name: 'My-Project!@#' })
    );

    const result = await getPackageName('/project');
    expect(result).toBe('my_project');
  });

  it('should return "backend" as fallback when state is unreadable', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await getPackageName('/nonexistent');
    expect(result).toBe('backend');
  });
});

describe('resolveBackendDir', () => {
  it('should return apps/backend path', () => {
    expect(resolveBackendDir('/project')).toBe(path.join('/project', 'apps', 'backend'));
  });
});

describe('computePostPipelineStatus', () => {
  it('should transition configured -> applying -> ready on success', () => {
    const result: SetupResult = {
      success: true,
      steps: [],
      totalDurationMs: 100,
      finalStatus: 'ready',
    };
    expect(computePostPipelineStatus('configured', result)).toBe('ready');
  });

  it('should transition configured -> applying -> error on failure', () => {
    const result: SetupResult = {
      success: false,
      steps: [],
      totalDurationMs: 50,
      finalStatus: 'error',
      error: 'Connection refused',
    };
    expect(computePostPipelineStatus('configured', result)).toBe('error');
  });

  it('should throw when starting from unconfigured', () => {
    const result: SetupResult = {
      success: true,
      steps: [],
      totalDurationMs: 0,
      finalStatus: 'ready',
    };
    expect(() => computePostPipelineStatus('unconfigured', result)).toThrow(
      /Invalid DB status transition/
    );
  });
});
