/**
 * Tests for test runner module
 */

import { describe, it, expect } from 'vitest';
import {
  buildTestCommand,
  parseTestOutput,
  getTestSummary,
  DEFAULT_TEST_COMMANDS,
} from '../../src/workflow/test-runner.js';

describe('buildTestCommand', () => {
  describe('Python', () => {
    it('should build basic pytest command', () => {
      const command = buildTestCommand({ language: 'python' });
      expect(command).toBe('python -m pytest tests/');
    });

    it('should include verbose flag', () => {
      const command = buildTestCommand({ language: 'python', verbose: true });
      expect(command).toContain('-v');
    });

    it('should include coverage flag', () => {
      const command = buildTestCommand({ language: 'python', coverage: true });
      expect(command).toContain('--cov=src');
      expect(command).toContain('--cov-report=term-missing');
    });

    it('should use custom test directory', () => {
      const command = buildTestCommand({ language: 'python', testDir: 'my_tests/' });
      expect(command).toContain('my_tests/');
    });
  });

  describe('TypeScript', () => {
    it('should build basic npm test command', () => {
      const command = buildTestCommand({ language: 'typescript' });
      expect(command).toBe('npm test');
    });

    it('should include coverage flag', () => {
      const command = buildTestCommand({ language: 'typescript', coverage: true });
      expect(command).toContain('--coverage');
    });
  });
});

describe('parseTestOutput', () => {
  describe('Python/pytest', () => {
    it('should parse successful pytest output', () => {
      const output = `
============================= test session starts ==============================
collected 10 items

tests/test_main.py ..........                                           [100%]

============================== 10 passed in 2.34s ==============================
`;

      const result = parseTestOutput(output, 'python');

      expect(result.success).toBe(true);
      expect(result.passed).toBe(10);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(10);
    });

    it('should parse pytest output with failures', () => {
      const output = `
============================= test session starts ==============================
collected 5 items

tests/test_main.py ...F.                                               [100%]

=================================== FAILURES ===================================
FAILED tests/test_main.py::test_something
================================ 1 failed, 4 passed in 1.23s ==============================
`;

      const result = parseTestOutput(output, 'python');

      expect(result.success).toBe(false);
      expect(result.passed).toBe(4);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(5);
      expect(result.failedTests).toContain('tests/test_main.py::test_something');
    });

    it('should handle no tests collected', () => {
      const output = 'collected 0 items';

      const result = parseTestOutput(output, 'python');

      // No tests found is treated as success (no failures)
      expect(result.success).toBe(true);
      expect(result.total).toBe(0);
      expect(result.noTestsFound).toBe(true);
    });
  });

  describe('TypeScript/Jest', () => {
    it('should parse successful Jest output', () => {
      const output = `
 PASS  tests/index.test.ts
  MyComponent
    v should render correctly (25 ms)
    v should handle click events (12 ms)

Tests: 2 passed, 2 total
`;

      const result = parseTestOutput(output, 'typescript');

      expect(result.success).toBe(true);
      expect(result.passed).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should parse Jest output with failures', () => {
      const output = `
 FAIL  tests/index.test.ts
  MyComponent
    v should render correctly (25 ms)
    x should handle click events (12 ms)

Tests: 1 failed, 1 passed, 2 total
`;

      const result = parseTestOutput(output, 'typescript');

      expect(result.success).toBe(false);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(2);
    });
  });
});

describe('getTestSummary', () => {
  it('should summarize successful tests', () => {
    const result = {
      success: true,
      passed: 10,
      failed: 0,
      total: 10,
      output: '',
    };

    const summary = getTestSummary(result);

    expect(summary).toContain('10/10 tests passed');
    expect(summary).toContain('PASS');
  });

  it('should summarize failed tests', () => {
    const result = {
      success: false,
      passed: 8,
      failed: 2,
      total: 10,
      output: '',
    };

    const summary = getTestSummary(result);

    expect(summary).toContain('8/10 tests passed');
    expect(summary).toContain('2 failed');
    expect(summary).toContain('FAIL');
  });

  it('should handle error case', () => {
    const result = {
      success: false,
      passed: 0,
      failed: 0,
      total: 0,
      output: '',
      error: 'Tests crashed',
    };

    const summary = getTestSummary(result);

    expect(summary).toContain('Tests crashed');
  });

  it('should handle no tests found', () => {
    const result = {
      success: false,
      passed: 0,
      failed: 0,
      total: 0,
      output: '',
    };

    const summary = getTestSummary(result);

    expect(summary).toContain('No tests found');
  });
});

describe('DEFAULT_TEST_COMMANDS', () => {
  it('should have commands for both languages', () => {
    expect(DEFAULT_TEST_COMMANDS.python).toBeDefined();
    expect(DEFAULT_TEST_COMMANDS.typescript).toBeDefined();
  });

  it('should have valid pytest command for Python', () => {
    expect(DEFAULT_TEST_COMMANDS.python).toContain('pytest');
  });

  it('should have valid npm command for TypeScript', () => {
    expect(DEFAULT_TEST_COMMANDS.typescript).toContain('npm');
  });
});
