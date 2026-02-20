/**
 * Check Runner tests — sanitization, timeout, result capture, placeholder scan.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCheck, runAllChecks, runPlaceholderScan } from '../../src/pipeline/check-runner.js';

const TEST_DIR = join(process.cwd(), '.test-check-runner');

describe('CheckRunner', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('runCheck', () => {
    it('should return pass for successful commands', async () => {
      const result = await runCheck('test', 'echo "ok"', TEST_DIR);
      expect(result.check_type).toBe('test');
      expect(result.status).toBe('pass');
      expect(result.exit_code).toBe(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should return fail for unsuccessful commands', async () => {
      const result = await runCheck('build', 'exit 1', TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.exit_code).not.toBe(0);
    });

    it('should reject dangerous commands', async () => {
      const result = await runCheck('test', 'rm -rf /', TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.exit_code).toBe(-1);
      expect(result.stderr_summary).toContain('Command rejected');
    });

    it('should reject sudo commands', async () => {
      const result = await runCheck('build', 'sudo apt install something', TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.stderr_summary).toContain('Command rejected');
    });

    it('should respect timeout', async () => {
      const result = await runCheck('test', 'sleep 10', TEST_DIR, 500);
      // Should either timeout or be killed
      expect(result.status).toBe('fail');
    }, 10000);

    it('should capture stderr summary', async () => {
      const result = await runCheck('lint', 'echo "error" >&2 && exit 1', TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.stderr_summary).toContain('error');
    });
  });

  describe('runAllChecks', () => {
    it('should run all provided commands', async () => {
      const results = await runAllChecks({
        build: 'echo "build ok"',
        test: 'echo "test ok"',
        lint: 'echo "lint ok"',
        resolved_from: 'test',
      }, TEST_DIR);

      expect(results.length).toBe(5); // build, test, lint, typecheck(skip), migration(skip)
      expect(results.filter((r) => r.status === 'pass')).toHaveLength(3);
      expect(results.filter((r) => r.status === 'skip')).toHaveLength(2);
    });

    it('should skip missing commands', async () => {
      const results = await runAllChecks({
        resolved_from: 'test',
      }, TEST_DIR);

      expect(results.every((r) => r.status === 'skip')).toBe(true);
    });
  });

  describe('runPlaceholderScan', () => {
    it('should detect TODO in source files', () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'src', 'app.ts'),
        '// TODO: implement this\nconst x = 1;\n',
      );

      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.check_type).toBe('placeholder_scan');
      expect(result.stderr_summary).toContain('TODO');
    });

    it('should detect FIXME in source files', () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'src', 'util.ts'),
        'const value = 0; // FIXME: broken\n',
      );

      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('fail');
      expect(result.stderr_summary).toContain('FIXME');
    });

    it('should detect lorem ipsum', () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'src', 'page.tsx'),
        'const text = "Lorem ipsum dolor sit amet";\n',
      );

      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('fail');
    });

    it('should pass when no placeholders found', () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'src', 'clean.ts'),
        'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      );

      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('pass');
      expect(result.exit_code).toBe(0);
    });

    it('should respect allowlist', () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'src', 'app.ts'),
        '// TODO: allowed\n',
      );
      writeFileSync(
        join(TEST_DIR, '.popeye-placeholder-allowlist'),
        'src/app.ts\n',
      );

      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('pass');
    });

    it('should handle missing scan directories gracefully', () => {
      // No src, app, pages, etc. directories
      const result = runPlaceholderScan(TEST_DIR);
      expect(result.status).toBe('pass');
    });
  });
});
