/**
 * Tests for the Tester (QA) workflow module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  discoverTestCommands,
  getComponentPlaybook,
  buildTestPlanPrompt,
  buildTestRunReviewPrompt,
  buildTestFixPlanPrompt,
  isQaEnabled,
} from '../../src/workflow/tester.js';
import type { ProjectState, Task, Milestone } from '../../src/types/workflow.js';
import type { TestRunReview } from '../../src/types/tester.js';
import type { TestResult } from '../../src/workflow/test-runner.js';

// Mock fs for discoverTestCommands
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    promises: {
      ...(actual as Record<string, unknown>).promises,
      readFile: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

const mockReadFile = vi.mocked(fs.readFile);

function makeState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    id: 'test-project',
    name: 'Test Project',
    idea: 'Test idea',
    language: 'typescript',
    openaiModel: 'gpt-4o',
    phase: 'execution',
    status: 'in-progress',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'milestone-1-task-1',
    name: 'Implement login endpoint',
    description: 'Create POST /auth/login with JWT token generation',
    status: 'in-progress',
    ...overrides,
  };
}

function makeMilestone(overrides?: Partial<Milestone>): Milestone {
  return {
    id: 'milestone-1',
    name: 'Authentication',
    description: 'Implement auth system',
    status: 'in-progress',
    tasks: [makeTask()],
    ...overrides,
  };
}

function makeTestResult(overrides?: Partial<TestResult>): TestResult {
  return {
    success: true,
    total: 10,
    passed: 10,
    failed: 0,
    output: 'All 10 tests passed',
    ...overrides,
  };
}

describe('discoverTestCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover commands from package.json', async () => {
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit' },
        });
      }
      throw new Error('ENOENT');
    });

    const result = await discoverTestCommands('/project', 'typescript');
    expect(result.testCmd).toBe('npm test');
    expect(result.lintCmd).toBe('npm run lint');
    expect(result.buildCmd).toBe('npm run build');
    expect(result.typecheckCmd).toBe('npm run typecheck');
  });

  it('should discover commands from pyproject.toml', async () => {
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).endsWith('pyproject.toml')) {
        return '[tool.pytest]\n[tool.ruff]\n[tool.mypy]\n';
      }
      throw new Error('ENOENT');
    });

    const result = await discoverTestCommands('/project', 'python');
    expect(result.testCmd).toBe('pytest');
    expect(result.lintCmd).toBe('ruff check .');
    expect(result.typecheckCmd).toBe('mypy .');
  });

  it('should discover commands from Makefile', async () => {
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).endsWith('Makefile')) {
        return 'test:\n\tpytest\nlint:\n\truff\nbuild:\n\tdocker build .\n';
      }
      throw new Error('ENOENT');
    });

    const result = await discoverTestCommands('/project', 'python');
    expect(result.testCmd).toBe('make test');
    expect(result.lintCmd).toBe('make lint');
    expect(result.buildCmd).toBe('make build');
  });

  it('should use fallback defaults when no config files exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const tsResult = await discoverTestCommands('/project', 'typescript');
    expect(tsResult.testCmd).toBe('npx vitest run');
    expect(tsResult.lintCmd).toBe('npx eslint .');
    expect(tsResult.buildCmd).toBe('npm run build');

    const pyResult = await discoverTestCommands('/project', 'python');
    expect(pyResult.testCmd).toBe('pytest');
    expect(pyResult.lintCmd).toBe('ruff check .');
  });

  it('should handle missing files gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await discoverTestCommands('/project', 'website');
    // Should not throw
    expect(result).toBeDefined();
    expect(result.testCmd).toBeDefined(); // Falls back to defaults
  });
});

describe('getComponentPlaybook', () => {
  it('should return Python-specific guidance for python language', () => {
    const playbook = getComponentPlaybook('python');
    expect(playbook).toContain('pytest');
    expect(playbook).toContain('FastAPI TestClient');
    expect(playbook).not.toContain('Vitest');
  });

  it('should return TypeScript-specific guidance for typescript language', () => {
    const playbook = getComponentPlaybook('typescript');
    expect(playbook).toContain('Vitest');
    expect(playbook).toContain('React Testing Library');
    expect(playbook).not.toContain('pytest');
  });

  it('should return combined guidance for website language', () => {
    const playbook = getComponentPlaybook('website');
    expect(playbook).toContain('Vitest');
    expect(playbook).toContain('axe-core');
    expect(playbook).toContain('SEO meta tags');
  });

  it('should return comprehensive playbook for fullstack/all', () => {
    const playbook = getComponentPlaybook('fullstack');
    expect(playbook).toContain('pytest');
    expect(playbook).toContain('Vitest');
    expect(playbook).toContain('API Contract');

    const allPlaybook = getComponentPlaybook('all');
    expect(allPlaybook).toContain('pytest');
    expect(allPlaybook).toContain('Vitest');
  });

  it('should return non-empty content for every language', () => {
    const languages = ['python', 'typescript', 'website', 'fullstack', 'all'] as const;
    for (const lang of languages) {
      const playbook = getComponentPlaybook(lang);
      expect(playbook.length).toBeGreaterThan(50);
    }
  });
});

describe('buildTestPlanPrompt', () => {
  it('should include approved code plan in the prompt', () => {
    const prompt = buildTestPlanPrompt(
      makeTask(), makeMilestone(), makeState(),
      'Implement login with bcrypt hashing',
      { testCmd: 'npm test', lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    expect(prompt).toContain('Implement login with bcrypt hashing');
    expect(prompt).toContain('Approved Code Plan');
  });

  it('should include language-specific playbook', () => {
    const prompt = buildTestPlanPrompt(
      makeTask(), makeMilestone(), makeState({ language: 'python' }),
      'code plan',
      { testCmd: 'pytest', lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    expect(prompt).toContain('pytest');
    expect(prompt).toContain('Python Testing Playbook');
  });

  it('should include discovered commands', () => {
    const prompt = buildTestPlanPrompt(
      makeTask(), makeMilestone(), makeState(),
      'plan',
      { testCmd: 'vitest run', lintCmd: 'eslint .', buildCmd: 'tsc', typecheckCmd: null },
    );
    expect(prompt).toContain('Test: vitest run');
    expect(prompt).toContain('Lint: eslint .');
    expect(prompt).toContain('Build: tsc');
  });

  it('should include task context', () => {
    const prompt = buildTestPlanPrompt(
      makeTask({ name: 'Implement OAuth' }),
      makeMilestone(),
      makeState({ name: 'MyApp' }),
      'plan',
      { testCmd: null, lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    expect(prompt).toContain('Implement OAuth');
    expect(prompt).toContain('MyApp');
  });

  it('should refer to "the Tester", not "Claude"', () => {
    const prompt = buildTestPlanPrompt(
      makeTask(), makeMilestone(), makeState(), 'plan',
      { testCmd: null, lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    expect(prompt).toContain('the Tester');
    expect(prompt.toLowerCase()).not.toContain('claude');
  });

  it('should include completed tasks for context', () => {
    const milestone = makeMilestone({
      tasks: [
        makeTask({ id: 't1', name: 'Setup DB', status: 'complete' }),
        makeTask({ id: 't2', name: 'Current task', status: 'in-progress' }),
      ],
    });
    const prompt = buildTestPlanPrompt(
      makeTask(), milestone, makeState(), 'plan',
      { testCmd: null, lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    expect(prompt).toContain('Setup DB');
  });

  it('should handle empty task description', () => {
    const task = makeTask({ description: '' });
    const prompt = buildTestPlanPrompt(
      task, makeMilestone(), makeState(), 'plan',
      { testCmd: null, lintCmd: null, buildCmd: null, typecheckCmd: null },
    );
    // Should not throw and should still contain the task name
    expect(prompt).toContain(task.name);
  });
});

describe('buildTestRunReviewPrompt', () => {
  it('should include test plan criteria and actual output', () => {
    const prompt = buildTestRunReviewPrompt(
      makeTask(),
      'Test plan with acceptance criteria',
      makeTestResult({ output: 'PASS: login test', passed: 5, total: 5 }),
      makeState(),
    );
    expect(prompt).toContain('Test plan with acceptance criteria');
    expect(prompt).toContain('PASS: login test');
    expect(prompt).toContain('Passed: 5');
  });

  it('should include failed test names', () => {
    const prompt = buildTestRunReviewPrompt(
      makeTask(),
      'test plan',
      makeTestResult({
        success: false,
        failed: 2,
        passed: 3,
        total: 5,
        failedTests: ['test_login_invalid', 'test_login_expired'],
      }),
      makeState(),
    );
    expect(prompt).toContain('test_login_invalid');
    expect(prompt).toContain('test_login_expired');
  });

  it('should handle empty test output', () => {
    const prompt = buildTestRunReviewPrompt(
      makeTask(),
      'test plan',
      makeTestResult({ output: '' }),
      makeState(),
    );
    expect(prompt).toBeDefined();
    expect(prompt).toContain('the Tester');
  });

  it('should truncate long output to 5000 chars', () => {
    const longOutput = 'x'.repeat(10000);
    const prompt = buildTestRunReviewPrompt(
      makeTask(), 'plan',
      makeTestResult({ output: longOutput }),
      makeState(),
    );
    // The prompt should not contain all 10000 chars of output
    expect(prompt.length).toBeLessThan(longOutput.length);
  });
});

describe('buildTestFixPlanPrompt', () => {
  const review: TestRunReview = {
    verdict: 'FAIL',
    summary: 'Login test failed due to missing hash',
    evidenceReviewed: ['test output'],
    failures: ['test_login_valid: AssertionError'],
    gaps: [],
    recommendations: ['Add bcrypt import'],
    requiresConsensus: true,
  };

  it('should include root cause from review', () => {
    const prompt = buildTestFixPlanPrompt(
      makeTask(), 'test plan',
      makeTestResult({ success: false, failed: 1 }),
      review,
      makeState(),
    );
    expect(prompt).toContain('Login test failed due to missing hash');
    expect(prompt).toContain('test_login_valid: AssertionError');
  });

  it('should detect test runner crash', () => {
    const crashResult = makeTestResult({
      success: false, passed: 0, failed: 50, output: 'ImportError: cannot import bcrypt',
    });
    const prompt = buildTestFixPlanPrompt(
      makeTask(), 'test plan', crashResult, review, makeState(),
    );
    expect(prompt).toContain('test runner crash');
  });

  it('should refer to "the Tester", not "Claude"', () => {
    const prompt = buildTestFixPlanPrompt(
      makeTask(), 'plan',
      makeTestResult({ success: false, failed: 1 }),
      review, makeState(),
    );
    expect(prompt).toContain('the Tester');
    expect(prompt.toLowerCase()).not.toContain('claude');
  });

  it('should handle no tests needed scenario', () => {
    const emptyReview: TestRunReview = {
      ...review,
      failures: [],
      summary: 'No test failures to fix',
    };
    const prompt = buildTestFixPlanPrompt(
      makeTask(), 'plan',
      makeTestResult({ success: true, failed: 0 }),
      emptyReview, makeState(),
    );
    expect(prompt).toContain('No test failures to fix');
  });
});

describe('isQaEnabled', () => {
  it('should return true when qaEnabled is true', () => {
    expect(isQaEnabled(makeState({ qaEnabled: true }))).toBe(true);
  });

  it('should return false when qaEnabled is false', () => {
    expect(isQaEnabled(makeState({ qaEnabled: false }))).toBe(false);
  });

  it('should return false when qaEnabled is undefined (existing projects)', () => {
    expect(isQaEnabled(makeState())).toBe(false);
  });
});
