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
  fullstack: 'npm run test:all',  // Runs both frontend and backend tests via workspace.json
  website: 'npm test',  // Next.js testing
  all: 'npm run test:all',  // Runs all app tests via workspace.json
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

    case 'fullstack': {
      // Fullstack projects use workspace.json commands
      // Default to running both frontend and backend tests
      return 'npm run test:all';
    }

    case 'website': {
      // Website projects use Next.js testing (Vitest/Jest)
      const parts = ['npm', 'test'];

      if (coverage) {
        parts.push('--', '--coverage');
      }

      return parts.join(' ');
    }

    case 'all': {
      // All projects use workspace.json commands
      // Runs frontend, backend, and website tests
      return 'npm run test:all';
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

    case 'fullstack': {
      // Fullstack combines pytest and jest output
      // Parse both formats
      const pytestMatch = output.match(/(\d+)\s+passed/);
      const pytestFailedMatch = output.match(/(\d+)\s+failed/);
      const jestMatch = output.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/);

      if (pytestMatch) {
        passed += parseInt(pytestMatch[1], 10);
      }
      if (pytestFailedMatch) {
        failed += parseInt(pytestFailedMatch[1], 10);
      }
      if (jestMatch) {
        failed += jestMatch[1] ? parseInt(jestMatch[1], 10) : 0;
        passed += parseInt(jestMatch[2], 10);
      }

      total = passed + failed;

      // Extract failed test names from both pytest and jest
      const pytestFailedMatches = output.matchAll(/FAILED\s+([^\s]+)/g);
      for (const match of pytestFailedMatches) {
        failedTests.push(match[1]);
      }
      const jestFailedMatches = output.matchAll(/✕\s+(.+)/g);
      for (const match of jestFailedMatches) {
        failedTests.push(match[1].trim());
      }
      break;
    }

    case 'website': {
      // Website uses same parsing as typescript (Jest/Vitest)
      const summaryMatchWeb = output.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/);

      if (summaryMatchWeb) {
        failed = summaryMatchWeb[1] ? parseInt(summaryMatchWeb[1], 10) : 0;
        passed = parseInt(summaryMatchWeb[2], 10);
        total = parseInt(summaryMatchWeb[3], 10);
      }

      // Extract failed test names
      const failedTestMatchesWeb = output.matchAll(/✕\s+(.+)/g);
      for (const match of failedTestMatchesWeb) {
        failedTests.push(match[1].trim());
      }
      break;
    }

    case 'all': {
      // All projects combine pytest, frontend jest, and website jest output
      // Parse all formats
      const pytestMatchAll = output.match(/(\d+)\s+passed/);
      const pytestFailedMatchAll = output.match(/(\d+)\s+failed/);
      // Match multiple jest outputs
      const jestMatchesAll = output.matchAll(/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/g);

      if (pytestMatchAll) {
        passed += parseInt(pytestMatchAll[1], 10);
      }
      if (pytestFailedMatchAll) {
        failed += parseInt(pytestFailedMatchAll[1], 10);
      }
      for (const jestMatchAll of jestMatchesAll) {
        failed += jestMatchAll[1] ? parseInt(jestMatchAll[1], 10) : 0;
        passed += parseInt(jestMatchAll[2], 10);
      }

      total = passed + failed;

      // Extract failed test names from all test frameworks
      const pytestFailedMatchesAll = output.matchAll(/FAILED\s+([^\s]+)/g);
      for (const match of pytestFailedMatchesAll) {
        failedTests.push(match[1]);
      }
      const jestFailedMatchesAll = output.matchAll(/✕\s+(.+)/g);
      for (const match of jestFailedMatchesAll) {
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
 * Run fullstack tests (both frontend and backend)
 *
 * @param cwd - Working directory
 * @param config - Test configuration
 * @returns Combined test result
 */
export async function runFullstackTests(
  cwd: string,
  config: Partial<TestConfig> = {}
): Promise<TestResult> {
  const path = await import('node:path');

  // Run backend tests first
  const backendCwd = path.join(cwd, 'apps', 'backend');
  const backendResult = await runPythonTests(backendCwd, config);

  // Run frontend tests
  const frontendCwd = path.join(cwd, 'apps', 'frontend');
  const frontendResult = await runTypeScriptTests(frontendCwd, config);

  // Combine results
  const combinedOutput = `=== Backend Tests ===\n${backendResult.output}\n\n=== Frontend Tests ===\n${frontendResult.output}`;

  return {
    success: backendResult.success && frontendResult.success,
    passed: backendResult.passed + frontendResult.passed,
    failed: backendResult.failed + frontendResult.failed,
    total: backendResult.total + frontendResult.total,
    output: combinedOutput,
    failedTests: [
      ...(backendResult.failedTests || []).map((t) => `[backend] ${t}`),
      ...(frontendResult.failedTests || []).map((t) => `[frontend] ${t}`),
    ].length > 0 ? [
      ...(backendResult.failedTests || []).map((t) => `[backend] ${t}`),
      ...(frontendResult.failedTests || []).map((t) => `[frontend] ${t}`),
    ] : undefined,
    error: backendResult.error || frontendResult.error,
    noTestsFound: backendResult.noTestsFound && frontendResult.noTestsFound,
  };
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
    case 'fullstack':
      return runFullstackTests(cwd, config);
    case 'website':
      // Website uses same testing as TypeScript (Next.js with Jest/Vitest)
      return runTypeScriptTests(cwd, config);
    case 'all':
      // All projects use fullstack testing (runs all app tests)
      return runFullstackTests(cwd, config);
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

      case 'fullstack': {
        // Check for tests in both frontend and backend
        const backendTestsDir = path.join(cwd, 'apps', 'backend', 'tests');
        const frontendTestsDir = path.join(cwd, 'apps', 'frontend', 'src');

        let hasBackendTests = false;
        let hasFrontendTests = false;

        try {
          await fs.access(backendTestsDir);
          hasBackendTests = true;
        } catch {
          // No backend tests directory
        }

        try {
          const files = await fs.readdir(frontendTestsDir, { recursive: true });
          hasFrontendTests = files.some(
            (f) => f.toString().endsWith('.test.ts') || f.toString().endsWith('.spec.ts')
          );
        } catch {
          // No frontend test files
        }

        return hasBackendTests || hasFrontendTests;
      }

      case 'website': {
        // Check for tests in website app (similar to TypeScript)
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
                  (f.toString().endsWith('.test.ts') ||
                    f.toString().endsWith('.test.tsx') ||
                    f.toString().endsWith('.spec.ts') ||
                    f.toString().endsWith('.spec.tsx'))
              );
            } catch {
              return false;
            }
          }
        }
      }

      case 'all': {
        // Check for tests in frontend, backend, and website
        const backendTestsDir = path.join(cwd, 'apps', 'backend', 'tests');
        const frontendSrcDir = path.join(cwd, 'apps', 'frontend', 'src');
        const websiteSrcDir = path.join(cwd, 'apps', 'website', 'src');

        let hasBackendTests = false;
        let hasFrontendTests = false;
        let hasWebsiteTests = false;

        try {
          await fs.access(backendTestsDir);
          hasBackendTests = true;
        } catch {
          // No backend tests directory
        }

        try {
          const files = await fs.readdir(frontendSrcDir, { recursive: true });
          hasFrontendTests = files.some(
            (f) => f.toString().endsWith('.test.ts') || f.toString().endsWith('.spec.ts')
          );
        } catch {
          // No frontend test files
        }

        try {
          const files = await fs.readdir(websiteSrcDir, { recursive: true });
          hasWebsiteTests = files.some(
            (f) =>
              f.toString().endsWith('.test.ts') ||
              f.toString().endsWith('.test.tsx') ||
              f.toString().endsWith('.spec.ts') ||
              f.toString().endsWith('.spec.tsx')
          );
        } catch {
          // No website test files
        }

        return hasBackendTests || hasFrontendTests || hasWebsiteTests;
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
