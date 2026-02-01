/**
 * Test runner module
 * Handles running tests for Python and TypeScript projects
 */

import { runTests as claudeRunTests } from '../adapters/claude.js';
import type { OutputLanguage } from '../types/project.js';

/**
 * Test result from running tests
 */
export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  total: number;
  output: string;
  failedTests?: string[];
  error?: string;
  noTestsFound?: boolean;  // True when no tests were found (still counts as success)
}

/**
 * Test configuration
 */
export interface TestConfig {
  language: OutputLanguage;
  testDir?: string;
  coverage?: boolean;
  verbose?: boolean;
  timeout?: number;
}

/**
 * Default test commands by language
 */
export const DEFAULT_TEST_COMMANDS: Record<OutputLanguage, string> = {
  python: 'python -m pytest tests/ -v',
  typescript: 'npm test',
};

/**
 * Build the test command for a language
 *
 * @param config - Test configuration
 * @returns The test command to run
 */
export function buildTestCommand(config: TestConfig): string {
  const { language, testDir, coverage, verbose } = config;

  switch (language) {
    case 'python': {
      const parts = ['python', '-m', 'pytest'];

      if (testDir) {
        parts.push(testDir);
      } else {
        parts.push('tests/');
      }

      if (verbose) {
        parts.push('-v');
      }

      if (coverage) {
        parts.push('--cov=src', '--cov-report=term-missing');
      }

      return parts.join(' ');
    }

    case 'typescript': {
      const parts = ['npm', 'test'];

      if (coverage) {
        parts.push('--', '--coverage');
      }

      return parts.join(' ');
    }
  }
}

/**
 * Parse test output to extract results
 *
 * @param output - The test command output
 * @param language - The project language
 * @returns Parsed test result
 */
export function parseTestOutput(output: string, language: OutputLanguage): TestResult {
  let passed = 0;
  let failed = 0;
  let total = 0;
  const failedTests: string[] = [];

  switch (language) {
    case 'python': {
      // Parse pytest output
      // Example: "5 passed, 2 failed, 1 skipped in 2.34s"
      const summaryMatch = output.match(/(\d+)\s+passed/);
      const failedMatch = output.match(/(\d+)\s+failed/);

      if (summaryMatch) {
        passed = parseInt(summaryMatch[1], 10);
      }

      if (failedMatch) {
        failed = parseInt(failedMatch[1], 10);
      }

      total = passed + failed;

      // Extract failed test names
      const failedTestMatches = output.matchAll(/FAILED\s+([^\s]+)/g);
      for (const match of failedTestMatches) {
        failedTests.push(match[1]);
      }
      break;
    }

    case 'typescript': {
      // Parse Jest/Vitest output
      // Example: "Tests: 2 failed, 5 passed, 7 total"
      const summaryMatch = output.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/);

      if (summaryMatch) {
        failed = summaryMatch[1] ? parseInt(summaryMatch[1], 10) : 0;
        passed = parseInt(summaryMatch[2], 10);
        total = parseInt(summaryMatch[3], 10);
      }

      // Extract failed test names
      const failedTestMatches = output.matchAll(/✕\s+(.+)/g);
      for (const match of failedTestMatches) {
        failedTests.push(match[1].trim());
      }
      break;
    }
  }

  // Success if no failures - treat "no tests found" as success (not a failure)
  // If total === 0, there are no tests to fail, so it's technically a pass
  const success = failed === 0;

  return {
    success,
    passed,
    failed,
    total,
    output,
    failedTests: failedTests.length > 0 ? failedTests : undefined,
    // Flag to indicate no tests were found (for informational purposes)
    noTestsFound: total === 0,
  };
}

/**
 * Run Python tests
 *
 * @param cwd - Working directory
 * @param config - Test configuration
 * @returns Test result
 */
export async function runPythonTests(
  cwd: string,
  config: Partial<TestConfig> = {}
): Promise<TestResult> {
  const testCommand = buildTestCommand({
    language: 'python',
    ...config,
  });

  try {
    const result = await claudeRunTests(testCommand, cwd);

    if (!result.success && result.error) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        total: 0,
        output: result.response,
        error: result.error,
      };
    }

    return parseTestOutput(result.response, 'python');
  } catch (error) {
    return {
      success: false,
      passed: 0,
      failed: 0,
      total: 0,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error running tests',
    };
  }
}

/**
 * Run TypeScript tests
 *
 * @param cwd - Working directory
 * @param config - Test configuration
 * @returns Test result
 */
export async function runTypeScriptTests(
  cwd: string,
  config: Partial<TestConfig> = {}
): Promise<TestResult> {
  const testCommand = buildTestCommand({
    language: 'typescript',
    ...config,
  });

  try {
    const result = await claudeRunTests(testCommand, cwd);

    if (!result.success && result.error) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        total: 0,
        output: result.response,
        error: result.error,
      };
    }

    return parseTestOutput(result.response, 'typescript');
  } catch (error) {
    return {
      success: false,
      passed: 0,
      failed: 0,
      total: 0,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error running tests',
    };
  }
}

/**
 * Run tests for a project
 *
 * @param cwd - Working directory
 * @param language - Project language
 * @param config - Test configuration
 * @returns Test result
 */
export async function runTests(
  cwd: string,
  language: OutputLanguage,
  config: Partial<TestConfig> = {}
): Promise<TestResult> {
  switch (language) {
    case 'python':
      return runPythonTests(cwd, config);
    case 'typescript':
      return runTypeScriptTests(cwd, config);
  }
}

/**
 * Check if tests exist in a project
 *
 * @param cwd - Working directory
 * @param language - Project language
 * @returns True if tests exist
 */
export async function testsExist(
  cwd: string,
  language: OutputLanguage
): Promise<boolean> {
  const { promises: fs } = await import('node:fs');
  const path = await import('node:path');

  try {
    switch (language) {
      case 'python': {
        // Check for tests/ directory or test_*.py files
        const testsDir = path.join(cwd, 'tests');
        try {
          await fs.access(testsDir);
          return true;
        } catch {
          // Check for test files in root
          const files = await fs.readdir(cwd);
          return files.some((f) => f.startsWith('test_') && f.endsWith('.py'));
        }
      }

      case 'typescript': {
        // Check for tests/, __tests__, or *.test.ts files
        const testsDir = path.join(cwd, 'tests');
        const testsDirAlt = path.join(cwd, '__tests__');

        try {
          await fs.access(testsDir);
          return true;
        } catch {
          try {
            await fs.access(testsDirAlt);
            return true;
          } catch {
            // Check for test files in src
            const srcDir = path.join(cwd, 'src');
            try {
              const files = await fs.readdir(srcDir, { recursive: true });
              return files.some(
                (f) =>
                  (f.toString().endsWith('.test.ts') || f.toString().endsWith('.spec.ts'))
              );
            } catch {
              return false;
            }
          }
        }
      }
    }
  } catch {
    return false;
  }
}

/**
 * Get test summary string
 *
 * @param result - Test result
 * @returns Human-readable summary
 */
export function getTestSummary(result: TestResult): string {
  if (result.error) {
    return `Tests failed to run: ${result.error}`;
  }

  if (result.total === 0 || result.noTestsFound) {
    return 'No tests found (OK)';
  }

  const status = result.success ? 'PASS' : 'FAIL';
  let summary = `${status}: ${result.passed}/${result.total} tests passed`;

  if (result.failed > 0) {
    summary += ` (${result.failed} failed)`;
  }

  return summary;
}
