/**
 * Tester (QA) skill module
 * Provides test planning, review, and fix plan capabilities.
 * Provider-agnostic -- uses whichever AI provider is configured.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState, Task, Milestone } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import type {
  TestPlanOutput,
  TestRunReview,
  DiscoveredTestCommands,
} from '../types/tester.js';
import type { OutputLanguage } from '../types/project.js';
import { isWorkspace } from '../types/project.js';
import { createPlan as claudeCreatePlan } from '../adapters/claude.js';
import { runOptimizedConsensusProcess, iterateUntilConsensus, type ConsensusProcessResult } from './consensus.js';
import type { TestResult } from './test-runner.js';

// ============================================================================
// Command Discovery
// ============================================================================

/**
 * Inspect the project directory to discover available test/lint/build commands.
 * Checks package.json scripts, pyproject.toml, Makefile, and common config files.
 *
 * @param projectDir - Root of the project
 * @param language - Project language
 * @returns Discovered command references
 */
export async function discoverTestCommands(
  projectDir: string,
  language: OutputLanguage,
): Promise<DiscoveredTestCommands> {
  const result: DiscoveredTestCommands = {
    testCmd: null,
    lintCmd: null,
    buildCmd: null,
    typecheckCmd: null,
  };

  // Check package.json for JS/TS projects
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts || {};
    if (scripts.test) result.testCmd = 'npm test';
    if (scripts.lint) result.lintCmd = 'npm run lint';
    if (scripts.build) result.buildCmd = 'npm run build';
    if (scripts.typecheck || scripts['type-check']) {
      result.typecheckCmd = scripts.typecheck ? 'npm run typecheck' : 'npm run type-check';
    }
  } catch {
    // No package.json or invalid JSON -- not a JS project at root
  }

  // Check pyproject.toml for Python projects
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  try {
    const raw = await fs.readFile(pyprojectPath, 'utf-8');
    if (raw.includes('[tool.pytest')) result.testCmd = result.testCmd || 'pytest';
    if (raw.includes('ruff') || raw.includes('flake8')) result.lintCmd = result.lintCmd || 'ruff check .';
    if (raw.includes('mypy')) result.typecheckCmd = result.typecheckCmd || 'mypy .';
  } catch {
    // No pyproject.toml
  }

  // Check Makefile for any project
  const makefilePath = path.join(projectDir, 'Makefile');
  try {
    const raw = await fs.readFile(makefilePath, 'utf-8');
    if (!result.testCmd && /^test:/m.test(raw)) result.testCmd = 'make test';
    if (!result.lintCmd && /^lint:/m.test(raw)) result.lintCmd = 'make lint';
    if (!result.buildCmd && /^build:/m.test(raw)) result.buildCmd = 'make build';
  } catch {
    // No Makefile
  }

  // Fallback defaults by language
  if (!result.testCmd) {
    if (language === 'python') result.testCmd = 'pytest';
    if (language === 'typescript') result.testCmd = 'npx vitest run';
  }
  if (!result.lintCmd) {
    if (language === 'python') result.lintCmd = 'ruff check .';
    if (language === 'typescript') result.lintCmd = 'npx eslint .';
  }
  if (!result.buildCmd) {
    if (language === 'typescript') result.buildCmd = 'npm run build';
  }

  return result;
}

// ============================================================================
// Component Playbooks
// ============================================================================

/**
 * Return language-specific testing guidance for the Tester persona.
 *
 * @param language - Project output language
 * @returns Playbook text to embed in the Tester prompt
 */
export function getComponentPlaybook(language: OutputLanguage): string {
  const pythonPlaybook = `
### Python Testing Playbook
- Use pytest with fixtures and conftest.py for shared setup
- Use FastAPI TestClient for API endpoint testing
- Use unittest.mock / pytest-mock for mocking external dependencies
- Structure: tests/ mirroring src/ with test_ prefix per file
- Coverage: pytest --cov for coverage reports
- Async tests: use pytest-asyncio for async function testing
`.trim();

  const tsPlaybook = `
### TypeScript Testing Playbook
- Use Vitest or Jest as the test runner
- Use React Testing Library for component testing
- Use MSW (Mock Service Worker) for API mocking
- Structure: tests/ or __tests__/ directories alongside source
- Type checking: tsc --noEmit for compile-time validation
- Coverage: vitest run --coverage or jest --coverage
`.trim();

  const websitePlaybook = `
### Website Testing Playbook
- Use Next.js test utilities for page/component testing
- Use axe-core or @axe-core/react for accessibility testing
- Verify SEO meta tags with custom assertions (title, description, OG tags)
- Test responsive layouts with viewport size assertions
- Lighthouse CI for performance regression testing
`.trim();

  if (language === 'python') return pythonPlaybook;
  if (language === 'typescript') return tsPlaybook;
  if (language === 'website') return `${tsPlaybook}\n\n${websitePlaybook}`;
  if (isWorkspace(language)) {
    return `${pythonPlaybook}\n\n${tsPlaybook}\n\n${websitePlaybook}\n\n### API Contract Testing\n- Validate frontend API calls match backend endpoint schemas\n- Use shared type definitions or OpenAPI specs for contract alignment`;
  }
  // Default fallback
  return pythonPlaybook;
}

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build the prompt for the Tester to create a TestPlan.
 * Provider-agnostic -- refers to "the Tester", not any specific AI.
 */
export function buildTestPlanPrompt(
  task: Task,
  milestone: Milestone,
  state: ProjectState,
  approvedCodePlan: string,
  discoveredCommands: DiscoveredTestCommands,
): string {
  const playbook = getComponentPlaybook(state.language);
  const completedTasks = milestone.tasks
    .filter(t => t.status === 'complete')
    .map(t => `- ${t.name}`)
    .join('\n') || 'None yet';

  const cmdSummary = [
    discoveredCommands.testCmd ? `Test: ${discoveredCommands.testCmd}` : null,
    discoveredCommands.lintCmd ? `Lint: ${discoveredCommands.lintCmd}` : null,
    discoveredCommands.buildCmd ? `Build: ${discoveredCommands.buildCmd}` : null,
    discoveredCommands.typecheckCmd ? `Typecheck: ${discoveredCommands.typecheckCmd}` : null,
  ].filter(Boolean).join('\n');

  return `
You are the Tester -- a dedicated QA engineer responsible for designing a comprehensive test plan.
Your job is to ensure code quality, catch regressions, and verify that the implementation meets its requirements.

## Project Context
Project: ${state.name}
Language: ${state.language}

## Milestone: ${milestone.name}
${milestone.description}

## Completed Tasks
${completedTasks}

## Task Under Test
**${task.name}**
${task.description}

## Approved Code Plan (read-only context -- DO NOT modify this)
${approvedCodePlan}

## Discovered Test Infrastructure
${cmdSummary || 'No test commands discovered -- the Tester should specify commands explicitly.'}

${playbook}

## Instructions
Based on the approved code plan above, design a structured test plan. Output valid JSON matching this schema:

\`\`\`json
{
  "summary": "What risks this plan targets",
  "scope": ["frontend" | "backend" | "db" | "infra"],
  "testMatrix": [
    {
      "id": "TC-1",
      "category": "unit | integration | e2e | smoke | lint | build",
      "description": "What is being tested",
      "acceptanceCriteria": "What must be true to pass",
      "evidenceRequired": "What output/log proves it passed",
      "priority": "critical | high | medium | low"
    }
  ],
  "commands": [
    {
      "command": "exact shell command",
      "cwd": "optional relative path",
      "purpose": "why this command is needed",
      "required": true
    }
  ],
  "riskFocus": ["top risks being tested"],
  "evidenceRequired": ["logs/reports to capture"],
  "minimumVerification": ["build check", "lint check", "smoke test"]
}
\`\`\`

Rules:
- Always include minimumVerification (build, lint, basic smoke test)
- Commands must be concrete and executable (no placeholders)
- Each test case needs clear acceptance criteria
- Focus on risks introduced by the code plan, not general testing
- If no custom tests are needed beyond minimum verification, include "noTestsRationale" explaining why
`.trim();
}

/**
 * Build the prompt for the Tester to review test execution results.
 * Provider-agnostic.
 */
export function buildTestRunReviewPrompt(
  task: Task,
  approvedTestPlan: string,
  testResult: TestResult,
  state: ProjectState,
): string {
  const output = testResult.output.slice(0, 5000);
  const failedTests = testResult.failedTests?.map(t => `- ${t}`).join('\n') || 'None';

  return `
You are the Tester -- a dedicated QA engineer reviewing the test execution results.
ONLY the Tester decides whether tests pass or fail. The coder cannot override this verdict.

## Project Context
Project: ${state.name}
Language: ${state.language}

## Task: ${task.name}
${task.description}

## Approved Test Plan
${approvedTestPlan}

## Test Execution Results
- Success: ${testResult.success}
- Total: ${testResult.total}
- Passed: ${testResult.passed}
- Failed: ${testResult.failed}

### Failed Tests
${failedTests}

### Output (truncated to 5000 chars)
\`\`\`
${output}
\`\`\`

## Instructions
Review the test results against the approved test plan's acceptance criteria.
Output valid JSON matching this schema:

\`\`\`json
{
  "verdict": "PASS | PASS_WITH_NOTES | FAIL",
  "summary": "Brief summary of the review",
  "evidenceReviewed": ["list of evidence checked"],
  "failures": ["specific failures found, empty if PASS"],
  "gaps": ["missing evidence or coverage gaps"],
  "recommendations": ["suggestions for improvement"],
  "requiresConsensus": false
}
\`\`\`

Rules:
- PASS: All critical and high-priority acceptance criteria met, evidence present
- PASS_WITH_NOTES: Criteria met but with caveats or minor gaps (recommendations logged)
- FAIL: Any critical acceptance criteria not met, or required commands failed
- Set requiresConsensus to true ONLY when verdict is FAIL
- Be specific about which acceptance criteria passed/failed
`.trim();
}

/**
 * Build the prompt for the Tester to create a fix plan after test failures.
 * Provider-agnostic.
 */
export function buildTestFixPlanPrompt(
  task: Task,
  approvedTestPlan: string,
  testResult: TestResult,
  review: TestRunReview,
  state: ProjectState,
): string {
  const output = testResult.output.slice(0, 4000);
  const isCrash = testResult.passed === 0 && testResult.failed > 20;

  return `
You are the Tester -- a dedicated QA engineer creating a fix plan for test failures.
Your root cause analysis guides the coder's fix implementation.

## Project Context
Project: ${state.name}
Language: ${state.language}

## Task: ${task.name}
${task.description}

## Approved Test Plan
${approvedTestPlan}

## Tester's Review
Verdict: ${review.verdict}
Summary: ${review.summary}
Failures: ${review.failures.join('; ')}

## Test Output
\`\`\`
${output}
\`\`\`

${isCrash ? '**WARNING: This appears to be a test runner crash (0 passed), not individual test failures. Focus on the root import/syntax/config error.**\n' : ''}

## Instructions
Create a fix plan. Output valid JSON matching this schema:

\`\`\`json
{
  "failedCriteria": ["which acceptance criteria failed"],
  "rootCauseAnalysis": "detailed root cause analysis",
  "fixSteps": [
    { "file": "path/to/file", "change": "what to change", "reason": "why" }
  ],
  "regressionRisks": ["risks of introducing new bugs"],
  "retestStrategy": "how to verify the fix"
}
\`\`\`

Rules:
- Identify the root cause, not just symptoms
- Fix steps should be minimal and focused
- Consider regression risks for each change
- Retest strategy must reference the original acceptance criteria
`.trim();
}

// ============================================================================
// Orchestration Functions
// ============================================================================

/**
 * Result of the test planning phase
 */
export interface TestPlanningResult {
  testPlanText: string;
  testPlanParsed: TestPlanOutput | null;
  consensusResult: ConsensusProcessResult;
  error?: string;
}

/**
 * Run the test planning phase: discover commands -> create test plan -> consensus.
 *
 * @param task - The task to plan tests for
 * @param milestone - Parent milestone
 * @param state - Current project state
 * @param approvedCodePlan - The consensus-approved code plan
 * @param options - Workflow options (projectDir, consensusConfig, onProgress)
 * @returns Test plan result with consensus outcome
 */
export async function runTestPlanningPhase(
  task: Task,
  milestone: Milestone,
  state: ProjectState,
  approvedCodePlan: string,
  options: {
    projectDir: string;
    consensusConfig?: Partial<ConsensusConfig>;
    onProgress?: (phase: string, message: string) => void;
  },
): Promise<TestPlanningResult> {
  const { projectDir, consensusConfig, onProgress } = options;

  // Step 1: Discover test infrastructure
  onProgress?.('test-planning', 'Discovering test infrastructure...');
  const discoveredCommands = await discoverTestCommands(projectDir, state.language);

  // Step 2: Build the test plan prompt
  const testPlanPrompt = buildTestPlanPrompt(
    task, milestone, state, approvedCodePlan, discoveredCommands,
  );

  // Step 3: Generate test plan via AI (provider-agnostic)
  onProgress?.('test-planning', 'Tester is designing the test plan...');
  const planResult = await claudeCreatePlan(
    testPlanPrompt,
    `Project: ${state.name}\nLanguage: ${state.language}`,
    state.language,
    (msg) => onProgress?.('test-planning', msg),
  );

  if (!planResult.success) {
    return {
      testPlanText: '',
      testPlanParsed: null,
      consensusResult: {
        approved: false, finalPlan: '', finalScore: 0, bestPlan: '', bestScore: 0,
        bestIteration: 0, totalIterations: 0, iterations: [], finalConcerns: [],
        finalRecommendations: [], arbitrated: false,
      },
      error: `Tester failed to create test plan: ${planResult.error}`,
    };
  }

  const testPlanText = planResult.response;

  // Step 4: Parse structured test plan (best-effort)
  let testPlanParsed: TestPlanOutput | null = null;
  try {
    const jsonMatch = testPlanText.match(/```json\s*([\s\S]*?)```/) ||
                      testPlanText.match(/\{[\s\S]*"summary"[\s\S]*\}/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      testPlanParsed = JSON.parse(raw) as TestPlanOutput;
    }
  } catch {
    // Structured parsing failed -- plan text still usable for consensus
    onProgress?.('test-planning', 'Could not parse structured test plan; using text-based plan for consensus.');
  }

  // Step 5: Submit for consensus with BOTH code plan and test plan as context
  onProgress?.('test-planning', 'Submitting test plan for consensus review...');

  const combinedPlanForConsensus = `## Approved Code Plan (read-only, for reviewer context)\n${approvedCodePlan}\n\n## Proposed Test Plan (subject to consensus review)\n${testPlanText}`;
  const consensusContext = `Project: ${state.name}\nLanguage: ${state.language}\nMilestone: ${milestone.name}\nTask: ${task.name}\nPhase: Test Plan Review`;

  // Use configurable threshold (default 90 for test plans, lower than code plans)
  const testPlanThreshold = consensusConfig?.testPlanThreshold ?? 90;
  const testPlanConfig = {
    ...consensusConfig,
    threshold: testPlanThreshold,
  };

  const useOptimized = consensusConfig?.useOptimizedConsensus !== false;
  let consensusResult: ConsensusProcessResult;

  if (useOptimized) {
    consensusResult = await runOptimizedConsensusProcess(
      combinedPlanForConsensus,
      consensusContext,
      {
        projectDir,
        config: testPlanConfig,
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        taskId: task.id,
        taskName: `${task.name} - Test Plan`,
        parallelReviews: true,
        isFullstack: isWorkspace(state.language),
        onIteration: (iteration, result) => {
          onProgress?.('test-planning', `Test plan consensus iteration ${iteration}: ${result.score}%`);
        },
        onProgress,
      },
    ) as ConsensusProcessResult;
  } else {
    consensusResult = await iterateUntilConsensus(
      combinedPlanForConsensus,
      consensusContext,
      {
        projectDir,
        config: testPlanConfig,
        isFullstack: isWorkspace(state.language),
        language: state.language,
        onIteration: (iteration, result) => {
          onProgress?.('test-planning', `Test plan consensus iteration ${iteration}: ${result.score}%`);
        },
        onProgress,
      },
    ) as ConsensusProcessResult;
  }

  return { testPlanText, testPlanParsed, consensusResult };
}

/**
 * Run the test review phase: AI reviews test results and issues a verdict.
 * ONLY the Tester decides PASS/FAIL -- the coder cannot bypass this.
 *
 * @param task - The task whose tests were run
 * @param approvedTestPlan - The approved test plan text
 * @param testResult - Test execution results
 * @param state - Current project state
 * @param onProgress - Progress callback
 * @returns Structured TestRunReview
 */
export async function runTestReviewPhase(
  task: Task,
  approvedTestPlan: string,
  testResult: TestResult,
  state: ProjectState,
  onProgress?: (phase: string, message: string) => void,
): Promise<TestRunReview> {
  onProgress?.('test-review', 'Tester is reviewing test results...');

  const reviewPrompt = buildTestRunReviewPrompt(task, approvedTestPlan, testResult, state);

  const result = await claudeCreatePlan(
    reviewPrompt,
    `Project: ${state.name}\nLanguage: ${state.language}`,
    state.language,
    (msg) => onProgress?.('test-review', msg),
  );

  if (!result.success) {
    // If AI fails, default to a conservative review based on raw results
    return {
      verdict: testResult.success ? 'PASS_WITH_NOTES' : 'FAIL',
      summary: result.error || 'Tester review unavailable; falling back to raw test results.',
      evidenceReviewed: ['raw test output'],
      failures: testResult.success ? [] : [`${testResult.failed} test(s) failed`],
      gaps: ['Full tester review could not be generated'],
      recommendations: [],
      requiresConsensus: !testResult.success,
    };
  }

  // Parse the structured review
  try {
    const jsonMatch = result.response.match(/```json\s*([\s\S]*?)```/) ||
                      result.response.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(raw) as TestRunReview;
    }
  } catch {
    // Parse failed -- construct from text
  }

  // Fallback: construct review from raw AI response
  return {
    verdict: testResult.success ? 'PASS_WITH_NOTES' : 'FAIL',
    summary: result.response.slice(0, 500),
    evidenceReviewed: ['test output', 'AI review response'],
    failures: testResult.success ? [] : [`${testResult.failed} test(s) failed`],
    gaps: ['Structured review could not be parsed'],
    recommendations: [],
    requiresConsensus: !testResult.success,
  };
}

/**
 * Create a fix plan from the Tester when tests fail.
 *
 * @param task - The task whose tests failed
 * @param approvedTestPlan - The approved test plan text
 * @param testResult - Test execution results
 * @param review - The Tester's review with verdict
 * @param state - Current project state
 * @param onProgress - Progress callback
 * @returns Fix plan text for consensus review
 */
export async function createTesterFixPlan(
  task: Task,
  approvedTestPlan: string,
  testResult: TestResult,
  review: TestRunReview,
  state: ProjectState,
  onProgress?: (phase: string, message: string) => void,
): Promise<string> {
  onProgress?.('test-review', 'Tester is creating a fix plan...');

  const fixPrompt = buildTestFixPlanPrompt(task, approvedTestPlan, testResult, review, state);

  const result = await claudeCreatePlan(
    fixPrompt,
    `Project: ${state.name}\nLanguage: ${state.language}`,
    state.language,
    (msg) => onProgress?.('test-review', msg),
  );

  if (!result.success) {
    return `## Tester Fix Plan (auto-generated fallback)\n\nThe Tester could not generate a structured fix plan.\n\nReview summary: ${review.summary}\nFailures: ${review.failures.join('; ')}\n\nPlease address the test failures listed above.`;
  }

  return result.response;
}

// ============================================================================
// Documentation
// ============================================================================

/**
 * Document an approved test plan to docs/qa/test-plans/
 *
 * @param projectDir - Project root
 * @param milestone - Parent milestone
 * @param task - The task
 * @param testPlan - Test plan text
 * @param consensusResult - Consensus outcome
 * @returns Relative path to the doc
 */
export async function documentTestPlan(
  projectDir: string,
  milestone: Milestone,
  task: Task,
  testPlan: string,
  consensusResult: ConsensusProcessResult,
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs', 'qa', 'test-plans');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const taskNum = task.id.split('-task-')[1] || '1';
  const filename = `milestone_${milestoneNum}_task_${taskNum}.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# QA Test Plan: ${task.name}

## Metadata
- **Milestone**: ${milestone.name}
- **Task ID**: ${task.id}
- **Consensus Score**: ${consensusResult.finalScore}%
- **Iterations**: ${consensusResult.totalIterations}
- **Status**: ${consensusResult.approved ? 'APPROVED' : 'NOT APPROVED'}
- **Generated**: ${new Date().toISOString()}

## Task Description
${task.description}

## Test Plan
${testPlan}

${consensusResult.finalConcerns.length > 0 ? `## Review Notes\n${consensusResult.finalConcerns.map(c => `- ${c}`).join('\n')}\n` : ''}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/qa/test-plans/${filename}`;
}

/**
 * Document a test run review to docs/qa/test-runs/
 *
 * @param projectDir - Project root
 * @param milestone - Parent milestone
 * @param task - The task
 * @param review - Tester's review
 * @returns Relative path to the doc
 */
export async function documentTestReview(
  projectDir: string,
  milestone: Milestone,
  task: Task,
  review: TestRunReview,
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs', 'qa', 'test-runs');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const taskNum = task.id.split('-task-')[1] || '1';
  const filename = `milestone_${milestoneNum}_task_${taskNum}.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# QA Test Review: ${task.name}

## Verdict: ${review.verdict}

## Summary
${review.summary}

## Evidence Reviewed
${review.evidenceReviewed.map(e => `- ${e}`).join('\n')}

${review.failures.length > 0 ? `## Failures\n${review.failures.map(f => `- ${f}`).join('\n')}\n` : ''}
${review.gaps.length > 0 ? `## Gaps\n${review.gaps.map(g => `- ${g}`).join('\n')}\n` : ''}
${review.recommendations.length > 0 ? `## Recommendations\n${review.recommendations.map(r => `- ${r}`).join('\n')}\n` : ''}

- **Generated**: ${new Date().toISOString()}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/qa/test-runs/${filename}`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check whether QA is enabled for the given project state.
 * Defaults to false for existing projects (undefined), true only when explicitly set.
 *
 * @param state - Current project state
 * @returns Whether the QA Tester skill is active
 */
export function isQaEnabled(state: ProjectState): boolean {
  return state.qaEnabled === true;
}
