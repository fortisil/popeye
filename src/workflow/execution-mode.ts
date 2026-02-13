/**
 * Execution Mode workflow
 * Handles task execution with hierarchical consensus:
 * Milestone Plan → Consensus → (Task Plan → Consensus → Implement → Test) → Milestone Review
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState, Task, Milestone } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { generateCode, createPlan as claudeCreatePlan, type ClaudeExecuteResult } from '../adapters/claude.js';
import {
  loadProject,
  updateState,
  setCurrentMilestone,
  completeProject,
  verifyProjectCompletion,
  comprehensiveProjectVerification,
} from '../state/index.js';
import {
  runTests,
  testsExist,
  getTestSummary,
  type TestResult,
} from './test-runner.js';
import { getWorkflowLogger } from './workflow-logger.js';
import { buildWithAutoFix } from './auto-fix.js';
import { runComprehensiveVerification, autoFixIssues, resolveProjectPaths } from './project-verification.js';
import { setupUI } from './ui-setup.js';
import { designUI, saveUISpecification, loadUISpecification } from './ui-designer.js';
import { iterateUntilConsensus, runOptimizedConsensusProcess, type ConsensusProcessResult } from './consensus.js';
import { isWorkspace } from '../types/project.js';
import { getProjectStructureSummary } from './project-structure.js';

/**
 * Parse unique file paths from TypeScript error output
 * Handles both TS formats: `path(line,col): error TS` and `path:line:col - error TS`
 *
 * @param buildOutput - Raw build error output
 * @returns Array of unique, normalized file paths
 */
export function parseErrorFilePaths(buildOutput: string): string[] {
  // Strip ANSI color codes
  const clean = buildOutput.replace(/\x1b\[[0-9;]*m/g, '');
  const paths = new Set<string>();

  // Format 1: path(line,col): error TS
  const pattern1 = /^(?:ERROR in\s+)?(.+?)\(\d+,\d+\): error TS/gm;
  // Format 2: path:line:col - error TS
  const pattern2 = /^(?:ERROR in\s+)?(.+?):\d+:\d+\s*-\s*error TS/gm;

  for (const pattern of [pattern1, pattern2]) {
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      let filePath = match[1].trim();
      // Normalize backslashes to forward slashes
      filePath = filePath.replace(/\\/g, '/');
      paths.add(filePath);
    }
  }

  // Filter out virtual/non-project paths
  const filtered = Array.from(paths).filter(p => {
    const excluded = ['node_modules/', 'vite/', '@types/', 'virtual:', '__generated__'];
    if (excluded.some(ex => p.includes(ex))) return false;
    // Only include paths that look project-relative
    const projectPrefixes = ['src/', 'apps/', 'packages/', './', 'lib/', 'components/'];
    return projectPrefixes.some(prefix => p.startsWith(prefix)) || p.startsWith('/');
  });

  return filtered;
}

/**
 * Check which file paths exist on disk and which are missing
 *
 * @param projectDir - Project root directory
 * @param filePaths - File paths to check (relative or absolute)
 * @returns Analysis of existing vs missing files with summary
 */
export async function analyzeFileExistence(
  projectDir: string,
  filePaths: string[]
): Promise<{ existing: string[]; missing: string[]; summary: string }> {
  const existing: string[] = [];
  const missing: string[] = [];

  for (const filePath of filePaths) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectDir, filePath);

    try {
      await fs.access(absolutePath);
      existing.push(filePath);
    } catch {
      missing.push(filePath);
    }
  }

  const total = filePaths.length;
  const summary = total === 0
    ? 'No error files to check'
    : `${existing.length}/${total} error files exist, ${missing.length}/${total} MISSING from disk`;

  return { existing, missing, summary };
}

/**
 * Options for execution mode
 */
export interface ExecutionModeOptions {
  projectDir: string;
  maxRetries?: number;
  consensusConfig?: Partial<ConsensusConfig>;  // For per-task and per-milestone consensus
  onProgress?: (phase: string, message: string) => void;
  onTaskStart?: (milestone: Milestone, task: Task) => void;
  onTaskComplete?: (milestone: Milestone, task: Task, success: boolean) => void;
  onTestResult?: (result: TestResult) => void;
}

/**
 * Result of task execution
 */
export interface TaskExecutionResult {
  success: boolean;
  task: Task;
  response?: string;
  testResult?: TestResult;
  error?: string;
  retries: number;
}

/**
 * Result of execution mode
 */
export interface ExecutionModeResult {
  success: boolean;
  state: ProjectState;
  completedTasks: number;
  failedTasks: number;
  error?: string;
  /** True if execution paused due to rate limiting (not a failure) */
  rateLimitPaused?: boolean;
  /** Build verification status */
  buildStatus?: 'passed' | 'failed' | 'skipped';
  /** Test verification status */
  testStatus?: 'passed' | 'failed' | 'skipped' | 'no-tests';
}

/**
 * Maximum number of retries for failed tests
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Generate a comprehensive README.md for the completed project
 * This provides users with setup and run instructions
 *
 * @param projectDir - Project directory
 * @param state - Project state
 * @returns Path to generated README or error
 */
async function generateProjectReadme(
  projectDir: string,
  state: ProjectState
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const readmePath = path.join(projectDir, 'README.md');

    // Extract features from completed milestones
    const features = state.milestones
      .filter(m => m.status === 'complete')
      .map(m => ({
        name: m.name,
        description: m.description,
        tasks: m.tasks.filter(t => t.status === 'complete').map(t => t.name),
      }));

    // Determine run commands based on language
    const isTypeScript = state.language === 'typescript';
    const installCmd = isTypeScript ? 'npm install' : 'pip install -r requirements.txt';
    const devCmd = isTypeScript ? 'npm run dev' : 'python src/main.py';
    const testCmd = isTypeScript ? 'npm test' : 'pytest tests/ -v';
    const buildCmd = isTypeScript ? 'npm run build' : 'python -m py_compile src/**/*.py';

    // Build README content
    const readmeContent = `# ${state.name}

${state.specification ? extractDescriptionFromSpec(state.specification) : 'A project generated by Popeye CLI.'}

## Features

${features.map(f => `### ${f.name}
${f.description || ''}
${f.tasks.length > 0 ? f.tasks.map(t => `- ${t}`).join('\n') : ''}`).join('\n\n')}

## Prerequisites

${isTypeScript ? `- Node.js 18.0 or higher
- npm 8.0 or higher` : `- Python 3.9 or higher
- pip (Python package manager)`}

## Installation

\`\`\`bash
# Clone the repository (if applicable)
cd ${state.name}

# Install dependencies
${installCmd}
\`\`\`

## Environment Setup

1. Copy the example environment file:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Edit \`.env\` and fill in the required values.

## Running the Application

### Development Mode

\`\`\`bash
${devCmd}
\`\`\`

### Running Tests

\`\`\`bash
${testCmd}
\`\`\`

### Build for Production

\`\`\`bash
${buildCmd}
\`\`\`

${isTypeScript ? `### Start Production Server

\`\`\`bash
npm start
\`\`\`
` : ''}
## Project Structure

\`\`\`
${state.name}/
├── src/                    # Source code
${isTypeScript ? `│   └── index.ts           # Main entry point` : `│   ├── __init__.py
│   └── main.py            # Main entry point`}
├── tests/                  # Test files
├── docs/                   # Documentation
│   ├── PLAN.md            # Development plan
│   └── WORKFLOW_LOG.md    # Execution log
${isTypeScript ? `├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration` : `├── requirements.txt       # Python dependencies
├── pyproject.toml         # Project configuration`}
├── .env.example           # Environment template
├── .gitignore
├── Dockerfile
└── README.md
\`\`\`

## Development

This project was generated using [Popeye CLI](https://github.com/your-org/popeye-cli), an autonomous code generation tool.

### Development Plan

See [docs/PLAN.md](docs/PLAN.md) for the complete development plan used to build this project.

### Workflow Log

See [docs/WORKFLOW_LOG.md](docs/WORKFLOW_LOG.md) for detailed execution logs.

## License

MIT
`;

    await fs.writeFile(readmePath, readmeContent, 'utf-8');

    return { success: true, path: readmePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate README',
    };
  }
}

/**
 * Extract a brief description from the specification
 *
 * @param spec - Full specification text
 * @returns Brief description (first paragraph or summary)
 */
function extractDescriptionFromSpec(spec: string): string {
  // Try to find a summary section
  const summaryMatch = spec.match(/(?:##?\s*(?:Summary|Overview|Description)[\s\S]*?\n)([\s\S]*?)(?:\n##|\n\n##|$)/i);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    if (summary.length > 0 && summary.length < 500) {
      return summary;
    }
  }

  // Fall back to first paragraph
  const lines = spec.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const firstParagraph = lines.slice(0, 3).join(' ').trim();

  if (firstParagraph.length > 500) {
    return firstParagraph.slice(0, 497) + '...';
  }

  return firstParagraph || 'A project generated by Popeye CLI.';
}

// Note: runCommand and runFinalBuildVerification replaced by buildWithAutoFix from auto-fix.ts
// which provides automatic error fixing capabilities

/**
 * Build the execution context for a task
 *
 * @param state - Current project state
 * @param milestone - Current milestone
 * @param task - Current task
 * @returns Context string for code generation
 */
function buildTaskContext(
  state: ProjectState,
  milestone: Milestone,
  _task: Task,
  uiDesignContext?: string
): string {
  const lines: string[] = [];

  lines.push(`## Project: ${state.name}`);
  lines.push(`Language: ${state.language}`);
  lines.push('');

  if (state.specification) {
    lines.push('## Specification');
    lines.push(state.specification.slice(0, 2000));
    lines.push('');
  }

  if (state.plan) {
    lines.push('## Development Plan');
    lines.push(state.plan.slice(0, 2000));
    lines.push('');
  }

  // Include UI design context if available
  if (uiDesignContext) {
    lines.push(uiDesignContext);
    lines.push('');
  }

  lines.push('## Current Milestone');
  lines.push(`Name: ${milestone.name}`);
  lines.push(`Description: ${milestone.description}`);
  lines.push('');

  // Add completed tasks for context
  const completedTasks = milestone.tasks.filter((t) => t.status === 'complete');
  if (completedTasks.length > 0) {
    lines.push('## Completed Tasks in This Milestone');
    for (const t of completedTasks) {
      lines.push(`- ${t.name}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Execute a single task
 *
 * @param task - The task to execute
 * @param context - Execution context
 * @param projectDir - Project directory
 * @param onProgress - Progress callback for Claude activity
 * @returns Execution result
 */
export async function executeTask(
  task: Task,
  context: string,
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<ClaudeExecuteResult> {
  const prompt = `
## Task
${task.name}

## Description
${task.description || task.name}

${task.testPlan ? `## Test Requirements\n${task.testPlan}\n` : ''}

Please implement this task completely. After implementing:
1. Create appropriate tests if needed
2. Ensure code follows best practices
3. Document any complex logic
`.trim();

  return generateCode(prompt, context, { cwd: projectDir, onProgress });
}

/**
 * Handle a test failure by attempting to fix the code
 *
 * @param task - The failed task
 * @param testResult - The test result
 * @param context - Execution context
 * @param projectDir - Project directory
 * @param onProgress - Progress callback for Claude activity
 * @returns Fix attempt result
 */
export async function handleTestFailure(
  task: Task,
  testResult: TestResult,
  context: string,
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<ClaudeExecuteResult> {
  const prompt = `
## Test Failure Fix Required

The tests for the following task have failed:

### Task
${task.name}

### Test Output
\`\`\`
${testResult.output.slice(0, 3000)}
\`\`\`

### Failed Tests
${testResult.failedTests?.map((t) => `- ${t}`).join('\n') || 'See output above'}

Please:
1. Analyze the test failures
2. Fix the code to make all tests pass
3. Do NOT modify the tests unless they are incorrect
`.trim();

  return generateCode(prompt, context, { cwd: projectDir, onProgress });
}

/**
 * Execute a task with retry logic for test failures
 *
 * @param milestone - The milestone containing the task
 * @param task - The task to execute
 * @param state - Current project state
 * @param options - Execution options
 * @returns Task execution result
 */
async function executeTaskWithRetry(
  milestone: Milestone,
  task: Task,
  state: ProjectState,
  options: ExecutionModeOptions
): Promise<TaskExecutionResult> {
  const {
    projectDir,
    maxRetries = DEFAULT_MAX_RETRIES,
    onTestResult,
    onProgress,
  } = options;

  // Load UI design context if available
  let uiDesignContext: string | undefined;
  try {
    const uiSpec = await loadUISpecification(projectDir);
    if (uiSpec) {
      const { generateDesignSystemPrompt } = await import('./ui-designer.js');
      uiDesignContext = generateDesignSystemPrompt(uiSpec);
    }
  } catch {
    // UI spec not available, continue without it
  }

  const context = buildTaskContext(state, milestone, task, uiDesignContext);
  let retries = 0;

  // Create a progress handler that prefixes messages with [claude]
  const claudeProgress = onProgress
    ? (msg: string) => onProgress('claude', msg)
    : undefined;

  // Execute the task
  const execResult = await executeTask(task, context, projectDir, claudeProgress);

  if (!execResult.success) {
    return {
      success: false,
      task,
      error: execResult.error || 'Task execution failed',
      retries: 0,
    };
  }

  // Check if tests exist
  const hasTests = await testsExist(projectDir, state.language);

  if (!hasTests) {
    // No tests to run, mark as complete
    return {
      success: true,
      task,
      response: execResult.response,
      retries: 0,
    };
  }

  // Run tests with retry loop
  while (retries <= maxRetries) {
    const testResult = await runTests(projectDir, state.language);

    if (onTestResult) {
      onTestResult(testResult);
    }

    if (testResult.success) {
      return {
        success: true,
        task,
        response: execResult.response,
        testResult,
        retries,
      };
    }

    // Tests failed
    if (retries >= maxRetries) {
      return {
        success: false,
        task,
        response: execResult.response,
        testResult,
        error: `Tests failed after ${retries} retries: ${getTestSummary(testResult)}`,
        retries,
      };
    }

    // Attempt to fix
    retries++;
    const fixResult = await handleTestFailure(task, testResult, context, projectDir);

    if (!fixResult.success) {
      return {
        success: false,
        task,
        testResult,
        error: `Fix attempt failed: ${fixResult.error}`,
        retries,
      };
    }
  }

  // Should not reach here
  return {
    success: false,
    task,
    error: 'Unexpected error in retry loop',
    retries,
  };
}

/**
 * Run execution mode for a project using hierarchical consensus workflow
 * Each milestone and task goes through: Plan → Consensus → Implement → Test → Review
 *
 * @param options - Execution options
 * @returns Execution mode result
 */
export async function runExecutionMode(
  options: ExecutionModeOptions
): Promise<ExecutionModeResult> {
  const {
    projectDir,
    onProgress,
    onTaskStart,
    onTaskComplete,
  } = options;

  // Initialize workflow logger
  const logger = getWorkflowLogger(projectDir);

  let completedTasks = 0;
  let failedTasks = 0;
  let completedMilestones = 0;

  try {
    let state = await loadProject(projectDir);

    await logger.stageStart('execution', 'Execution Mode started', {
      projectName: state.name,
      phase: state.phase,
      totalMilestones: state.milestones.length,
      totalTasks: state.milestones.reduce((sum, m) => sum + m.tasks.length, 0),
    });

    // Ensure we're in execution phase
    if (state.phase !== 'execution') {
      return {
        success: false,
        state,
        completedTasks: 0,
        failedTasks: 0,
        error: `Cannot run execution mode: project is in ${state.phase} phase`,
      };
    }

    // Update status
    state = await updateState(projectDir, { status: 'in-progress' });

    onProgress?.('execution-start', 'Starting hierarchical execution mode...');
    onProgress?.('execution-start', `Processing ${state.milestones.length} milestones with per-task consensus`);

    // Import milestone workflow dynamically to avoid circular dependencies
    const { runMilestoneWorkflow } = await import('./milestone-workflow.js');

    // Process each milestone
    for (const milestone of state.milestones) {
      // Skip completed milestones
      if (milestone.status === 'complete' && milestone.completionApproved) {
        onProgress?.('milestone-skip', `Skipping completed milestone: ${milestone.name}`);
        completedMilestones++;
        completedTasks += milestone.tasks.filter(t => t.status === 'complete').length;
        continue;
      }

      // Set current milestone
      state = await setCurrentMilestone(projectDir, milestone.id);

      onProgress?.(
        'milestone-start',
        `Starting milestone: ${milestone.name} (${milestone.tasks.length} tasks)`
      );

      await logger.stageStart('milestone', `Starting milestone: ${milestone.name}`, {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        taskCount: milestone.tasks.length,
        taskNames: milestone.tasks.map(t => t.name),
      });

      // Run the complete milestone workflow
      const milestoneResult = await runMilestoneWorkflow(milestone, {
        projectDir,
        consensusConfig: options.consensusConfig,
        onProgress,
        onTaskStart: (task) => {
          if (onTaskStart) {
            onTaskStart(milestone, task);
          }
        },
        onTaskComplete: (task, success) => {
          if (success) {
            completedTasks++;
          } else {
            failedTasks++;
          }
          if (onTaskComplete) {
            onTaskComplete(milestone, task, success);
          }
        },
      });

      if (milestoneResult.success) {
        completedMilestones++;
        onProgress?.(
          'milestone-complete',
          `Milestone complete: ${milestone.name} (Score: ${milestoneResult.completionConsensus?.finalScore}%)`
        );

        await logger.stageComplete('milestone', `Milestone completed: ${milestone.name}`, {
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          consensusScore: milestoneResult.completionConsensus?.finalScore,
          tasksCompleted: milestone.tasks.filter(t => t.status === 'complete').length,
        });
      } else {
        // Check if this is a rate limit pause (not a real failure)
        if (milestoneResult.rateLimitPaused) {
          onProgress?.(
            'milestone-paused',
            `Milestone paused (rate limit): ${milestone.name}`
          );
          onProgress?.(
            'milestone-paused',
            'Your progress is saved. Run /resume after the rate limit resets to continue.'
          );

          await logger.info('milestone', 'milestone_paused', `Milestone paused due to rate limit: ${milestone.name}`, {
            milestoneId: milestone.id,
            milestoneName: milestone.name,
          });

          // Reload state to get latest
          state = await loadProject(projectDir);

          return {
            success: false,
            state,
            completedTasks,
            failedTasks,
            rateLimitPaused: true,
            error: milestoneResult.error,
          };
        }

        // Actual failure
        onProgress?.(
          'milestone-failed',
          `Milestone failed: ${milestone.name} - ${milestoneResult.error}`
        );

        await logger.stageFailed('milestone', `Milestone failed: ${milestone.name}`, milestoneResult.error || 'Unknown error', {
          milestoneId: milestone.id,
          milestoneName: milestone.name,
        });

        // Reload state to get latest
        state = await loadProject(projectDir);

        return {
          success: false,
          state,
          completedTasks,
          failedTasks,
          error: `Milestone "${milestone.name}" failed: ${milestoneResult.error}`,
        };
      }
    }

    // ============================================
    // UI SETUP PHASE
    // ============================================
    onProgress?.('ui-setup', 'Running UI setup and design system configuration...');
    await logger.stageStart('ui-setup', 'Starting UI setup');

    // Check if this is a frontend project (resolve correct path based on language)
    const uiPaths = await resolveProjectPaths(projectDir, state.language);
    const hasFrontend = !!uiPaths.frontendDir;

    if (hasFrontend) {
      try {
        // Load or generate UI specification
        let uiSpec = await loadUISpecification(projectDir);

        if (!uiSpec && state.idea) {
          onProgress?.('ui-setup', 'Designing UI from project idea...');
          uiSpec = await designUI(state.idea, (msg) => onProgress?.('ui-setup', msg));
          await saveUISpecification(projectDir, uiSpec);
          onProgress?.('ui-setup', `UI design complete: ${uiSpec.themeName} theme selected`);
        }

        // Run UI setup to install components and configure styling
        onProgress?.('ui-setup', 'Setting up component library and styling...');
        const uiResult = await setupUI(
          projectDir,
          {
            theme: uiSpec?.themeName || 'modern',
            idea: state.idea,
            frontendDir: uiPaths.frontendDir || undefined,
          },
          (msg) => onProgress?.('ui-setup', msg)
        );

        if (uiResult.success) {
          onProgress?.('ui-setup', `UI setup complete: ${uiResult.componentsInstalled.length} components installed`);
          await logger.success('ui-setup', 'ui_setup_complete', 'UI setup completed successfully', {
            theme: uiResult.theme,
            components: uiResult.componentsInstalled,
          });
        } else {
          onProgress?.('ui-setup', `UI setup warning: ${uiResult.error}`);
          await logger.warn('ui-setup', 'ui_setup_warning', 'UI setup had issues', {
            error: uiResult.error,
          });
        }
      } catch (uiError) {
        // Non-blocking - UI setup failures shouldn't stop the project
        onProgress?.('ui-setup', `UI setup skipped: ${uiError instanceof Error ? uiError.message : 'Unknown error'}`);
        await logger.warn('ui-setup', 'ui_setup_skipped', 'UI setup was skipped', {
          error: uiError instanceof Error ? uiError.message : 'Unknown error',
        });
      }
    } else {
      onProgress?.('ui-setup', 'No frontend detected, skipping UI setup');
    }

    // ============================================
    // FINAL VERIFICATION PHASE
    // ============================================
    onProgress?.('verification', 'Running final verification...');
    await logger.stageStart('verification', 'Starting final verification');

    // Reload state to get latest
    state = await loadProject(projectDir);

    // Verify all milestones are complete
    const incompleteMilestones = state.milestones.filter(m => m.status !== 'complete');
    if (incompleteMilestones.length > 0) {
      const incompleteNames = incompleteMilestones.map(m => m.name).join(', ');
      onProgress?.(
        'verification-warning',
        `Warning: ${incompleteMilestones.length} milestone(s) not marked complete: ${incompleteNames}`
      );
    }

    // Verify all tasks are complete
    const allTasks = state.milestones.flatMap(m => m.tasks);
    const incompleteTasks = allTasks.filter(t => t.status !== 'complete');
    if (incompleteTasks.length > 0) {
      const incompleteTaskNames = incompleteTasks.slice(0, 5).map(t => t.name).join(', ');
      onProgress?.(
        'verification-warning',
        `Warning: ${incompleteTasks.length} task(s) not complete: ${incompleteTaskNames}${incompleteTasks.length > 5 ? '...' : ''}`
      );
    }

    // Run final build verification with auto-fix
    onProgress?.('verification', 'Running final build verification...');
    const buildResult = await buildWithAutoFix(
      projectDir,
      state.language,
      3, // max fix attempts
      (msg) => onProgress?.('verification', `[auto-fix] ${msg}`)
    );

    if (!buildResult.success) {
      onProgress?.(
        'verification-error',
        `Build verification failed${buildResult.autoFixed ? ' (after auto-fix attempts)' : ''}: Build errors remain`
      );
      await logger.error('verification', 'build_failed', 'Build verification failed', {
        output: buildResult.output.slice(0, 2000),
        autoFixed: buildResult.autoFixed,
      });

      // Attempt consensus-driven build fix before giving up
      onProgress?.('build-fix', 'Analyzing project structure...');
      const buildErrors = buildResult.output.slice(0, 4000);

      // Gather project structure context for informed fix analysis
      const structureSummary = await getProjectStructureSummary(projectDir, state.language);
      const buildErrorFiles = parseErrorFilePaths(buildErrors);
      const fileExistenceAnalysis = await analyzeFileExistence(projectDir, buildErrorFiles);

      // CLI banner for structural issues
      if (buildResult.structuralIssue) {
        onProgress?.(
          'build-fix',
          `STRUCTURAL ISSUE: ${buildResult.missingFileCount}/${buildResult.totalErrorFiles} TypeScript error files do not exist on disk. Likely wrong paths or missing generated project files.`
        );
      }

      onProgress?.('build-fix', 'Creating build fix plan for consensus review...');

      // Build structural context sections for prompts
      const structureSection = `## Project Structure\n${structureSummary.formatted}`;
      const existenceSection = `## File Existence Analysis\n${fileExistenceAnalysis.summary}\n${
        fileExistenceAnalysis.missing.length > 0
          ? `Missing files (${Math.min(fileExistenceAnalysis.missing.length, 20)} of ${fileExistenceAnalysis.missing.length}):\n${fileExistenceAnalysis.missing.slice(0, 20).map(f => `  - ${f}`).join('\n')}`
          : 'All error files exist on disk.'
      }`;

      // Build structural issue guidance if applicable
      let structuralIssueSection = '';
      if (buildResult.structuralIssue) {
        structuralIssueSection = `## STRUCTURAL ISSUE DETECTED
This is a MISSING FILES problem, not a code bugs problem.
${fileExistenceAnalysis.missing.length} of ${buildErrorFiles.length} error files do not exist on disk.

### Common Root Causes
- Wrong project type/template generated (expected app folder not created)
- Wrong working directory / baseDir
- Wrong import paths after refactor
- tsconfig includes non-existent folders
- Generator wrote files to a different root

### Strategy Guidance
The fix MUST create missing files or fix import/generation paths, NOT edit non-existent files.
Pay special attention to WHY files don't exist - the root cause is almost always a path or generation issue.`;
      }

      // For structural issues, reduce raw error dump and show targeted info instead
      const errorDumpSection = buildResult.structuralIssue
        ? `## Build Errors (representative sample - ${buildErrorFiles.length} files with errors, ${fileExistenceAnalysis.missing.length} missing)\n\`\`\`\n${buildErrors.slice(0, 1500)}\n\`\`\``
        : `## Build Output (errors)\n\`\`\`\n${buildErrors}\n\`\`\``;

      // Step 1: Have Claude analyze build errors and create a fix plan
      const fixPlanPrompt = `Analyze the following build errors and create a detailed fix plan.

${errorDumpSection}

${structureSection}

${existenceSection}

${structuralIssueSection}

## Project: ${state.name}
## Language: ${state.language}

Provide:

### Root Cause Analysis
Identify each distinct build error and its root cause.
Pay special attention to WHY files don't exist if files are missing.

### Fix Plan
For each error:
1. The specific file and line causing the error
2. What change is needed
3. Why this change fixes it

### Files to Modify
List each file with the exact changes needed.

### Verification
How to verify the fixes work (build command to run).

Be specific and actionable. Do NOT suggest deleting or gutting files.`;

      const fixPlanResult = await claudeCreatePlan(
        fixPlanPrompt,
        `Build fix analysis for: ${state.name}`,
        state.language,
        (msg) => onProgress?.('build-fix', `[analysis] ${msg}`)
      );

      if (!fixPlanResult.success) {
        // If plan creation fails (rate limit), handle gracefully
        if (fixPlanResult.rateLimitPaused) {
          onProgress?.('build-fix', 'Build fix paused due to rate limit. Run /resume to retry.');
          await updateState(projectDir, { status: 'paused', error: 'Build fix paused due to rate limit' });
          return { success: false, state, completedTasks, failedTasks, error: 'Build fix paused due to rate limit', rateLimitPaused: true, buildStatus: 'failed' };
        }

        onProgress?.('build-fix', `Build fix analysis failed: ${fixPlanResult.error}`);
        await updateState(projectDir, { status: 'failed', error: 'Build verification failed - could not analyze errors' });
        return { success: false, state, completedTasks, failedTasks, error: 'Build verification failed - project not complete', buildStatus: 'failed' };
      }

      // Step 2: Get consensus on the build fix plan
      onProgress?.('build-fix-consensus', 'Getting consensus on build fix plan...');

      // Build enriched consensus context with structure awareness
      const consensusMissingList = fileExistenceAnalysis.missing.length > 0
        ? `\nMissing files (${Math.min(fileExistenceAnalysis.missing.length, 15)} of ${fileExistenceAnalysis.missing.length}):\n${fileExistenceAnalysis.missing.slice(0, 15).map(f => `  - ${f}`).join('\n')}`
        : '';

      const buildFixContext = `
Project: ${state.name}
Language: ${state.language}
Phase: BUILD FIX VERIFICATION
Reason: All tasks complete but build is failing

${structureSection}

## File Existence Analysis
${fileExistenceAnalysis.summary}${consensusMissingList}
${buildResult.structuralIssue ? '\nSTRUCTURAL ISSUE: Majority of error files are missing from disk. This is a missing files problem, not a code bugs problem.' : ''}

## Build Errors
\`\`\`
${buildResult.structuralIssue ? buildErrors.slice(0, 1500) : buildErrors.slice(0, 2000)}
\`\`\`
`.trim();

      const consensusConfig = options.consensusConfig;
      const useOptimized = consensusConfig?.useOptimizedConsensus !== false;
      let buildFixConsensus: ConsensusProcessResult;

      try {
        if (useOptimized) {
          buildFixConsensus = await runOptimizedConsensusProcess(
            fixPlanResult.response,
            buildFixContext,
            {
              projectDir,
              config: consensusConfig,
              milestoneId: 'build-fix',
              milestoneName: 'Build Fix Verification',
              parallelReviews: true,
              isFullstack: isWorkspace(state.language),
              onIteration: (iteration, result) => {
                onProgress?.('build-fix-consensus', `Build fix consensus iteration ${iteration}: ${result.score}%`);
              },
              onProgress,
            }
          ) as ConsensusProcessResult;
        } else {
          buildFixConsensus = await iterateUntilConsensus(
            fixPlanResult.response,
            buildFixContext,
            {
              projectDir,
              config: consensusConfig,
              isFullstack: isWorkspace(state.language),
              language: state.language,
              onIteration: (iteration, result) => {
                onProgress?.('build-fix-consensus', `Build fix consensus iteration ${iteration}: ${result.score}%`);
              },
              onProgress,
            }
          );
        }
      } catch (consensusError) {
        const errMsg = consensusError instanceof Error ? consensusError.message : 'Unknown error';
        onProgress?.('build-fix-consensus', `Build fix consensus failed: ${errMsg}`);
        await updateState(projectDir, { status: 'failed', error: `Build fix consensus failed: ${errMsg}` });
        return { success: false, state, completedTasks, failedTasks, error: 'Build verification failed - project not complete' };
      }

      if (!buildFixConsensus.approved) {
        onProgress?.('build-fix-consensus', `Build fix plan not approved (${buildFixConsensus.finalScore}%)`);
        await updateState(projectDir, { status: 'failed', error: `Build fix not approved (${buildFixConsensus.finalScore}%)` });
        return { success: false, state, completedTasks, failedTasks, error: 'Build verification failed - project not complete' };
      }

      onProgress?.('build-fix-consensus', `Build fix plan approved (${buildFixConsensus.finalScore}%)`);

      // Step 3: Implement the consensus-approved fix
      onProgress?.('build-fix', 'Implementing consensus-approved build fix...');

      // Enrich implementation context with structure + file existence awareness
      const implementationContext = [
        `Build fix for project: ${state.name}`,
        structureSection,
        `File existence: ${fileExistenceAnalysis.summary}`,
      ].join('\n\n');

      const claudeFixResult = await generateCode(
        `Implement this consensus-approved build fix plan:\n\n${buildFixConsensus.bestPlan}`,
        implementationContext,
        {
          cwd: projectDir,
          onProgress: (msg) => onProgress?.('build-fix', `[fix] ${msg}`),
        }
      );

      if (claudeFixResult.rateLimitPaused) {
        onProgress?.('build-fix', 'Build fix paused due to rate limit. Run /resume to retry.');
        await updateState(projectDir, { status: 'paused', error: 'Build fix paused due to rate limit' });
        return { success: false, state, completedTasks, failedTasks, error: 'Build fix paused due to rate limit', rateLimitPaused: true, buildStatus: 'failed' };
      }

      if (!claudeFixResult.success) {
        onProgress?.('build-fix', `Build fix implementation failed: ${claudeFixResult.error}`);
        await updateState(projectDir, { status: 'failed', error: 'Build fix implementation failed' });
        return { success: false, state, completedTasks, failedTasks, error: 'Build verification failed - project not complete', buildStatus: 'failed' };
      }

      // Step 4: Re-run build to verify the fix worked
      onProgress?.('verification', 'Consensus-approved fix applied, re-running build verification...');
      const retryBuild = await buildWithAutoFix(
        projectDir,
        state.language,
        2,
        (msg) => onProgress?.('verification', `[retry-build] ${msg}`)
      );

      if (retryBuild.success) {
        onProgress?.('verification', 'Build now passes after consensus-approved fix');
        await logger.success('verification', 'build_fixed_by_consensus', 'Build fixed via consensus-approved plan', {
          consensusScore: buildFixConsensus.finalScore,
          autoFixed: true,
        });
      } else {
        // Still failing after consensus-approved fix - mark in state so resume knows
        onProgress?.(
          'verification-error',
          'BLOCKING: Build still failing after consensus-approved fix. Run /resume to retry.'
        );

        await updateState(projectDir, {
          status: 'failed',
          error: 'Build verification failed - build errors remain after consensus-approved fix',
        });

        return {
          success: false,
          state,
          completedTasks,
          failedTasks,
          error: 'Build verification failed - project not complete',
          buildStatus: 'failed',
        };
      }
    } else {
      onProgress?.('verification', `Build verification passed${buildResult.autoFixed ? ' (after auto-fix)' : ''}`);
      await logger.success('verification', 'build_passed', 'Build verification passed', {
        autoFixed: buildResult.autoFixed,
      });
    }

    // Run final test verification
    const hasTests = await testsExist(projectDir, state.language);
    let finalTestStatus: 'passed' | 'failed' | 'skipped' | 'no-tests' = hasTests ? 'skipped' : 'no-tests';
    if (hasTests) {
      onProgress?.('verification', 'Running final test verification...');
      const testResult = await runTests(projectDir, state.language);
      if (!testResult.success) {
        finalTestStatus = 'failed';
        onProgress?.(
          'verification-warning',
          `Final test verification failed: ${testResult.failed} test(s) failed`
        );
        await logger.warn('verification', 'tests_failed', 'Final test verification failed', {
          passed: testResult.passed,
          failed: testResult.failed,
          total: testResult.total,
          failedTests: testResult.failedTests,
        });
      } else {
        finalTestStatus = 'passed';
        onProgress?.(
          'verification',
          `All tests passed: ${testResult.passed}/${testResult.total}`
        );
        await logger.success('verification', 'tests_passed', 'All tests passed', {
          passed: testResult.passed,
          total: testResult.total,
        });
      }
    }

    // Run comprehensive code quality verification
    onProgress?.('verification', 'Running code quality verification...');
    const codeVerification = await comprehensiveProjectVerification(projectDir);

    // Log comprehensive verification results
    await logger.info('verification', 'code_quality_check', 'Code quality verification results', {
      totalSourceFiles: codeVerification.codeVerification.totalSourceFiles,
      totalLinesOfCode: codeVerification.codeVerification.totalLinesOfCode,
      hasMainEntryPoint: codeVerification.codeVerification.hasMainEntryPoint,
      hasTests: codeVerification.codeVerification.hasTests,
      hasSubstantiveCode: codeVerification.codeVerification.hasSubstantiveCode,
      issues: codeVerification.codeVerification.issues,
      warnings: codeVerification.codeVerification.warnings,
    });

    // Display code quality results
    onProgress?.(
      'verification',
      `Code: ${codeVerification.codeVerification.totalSourceFiles} files, ` +
      `${codeVerification.codeVerification.totalLinesOfCode} lines of code`
    );

    if (codeVerification.codeVerification.issues.length > 0) {
      for (const issue of codeVerification.codeVerification.issues) {
        onProgress?.('verification-warning', `Code Issue: ${issue}`);
      }
    }

    if (codeVerification.codeVerification.warnings.length > 0) {
      for (const warning of codeVerification.codeVerification.warnings.slice(0, 3)) {
        onProgress?.('verification-info', `Code Warning: ${warning}`);
      }
    }

    // Summary
    onProgress?.(
      'verification-summary',
      `Verification complete: ${completedMilestones}/${state.milestones.length} milestones, ` +
      `${completedTasks}/${allTasks.length} tasks, ` +
      `${codeVerification.codeVerification.totalLinesOfCode} lines of code`
    );

    // Check if genuinely complete
    if (!codeVerification.isGenuinelyComplete) {
      onProgress?.(
        'verification-warning',
        'WARNING: Project may not be genuinely complete. Code verification found issues.'
      );
      await logger.warn('verification', 'incomplete_code', 'Project may not be genuinely complete', {
        taskComplete: codeVerification.taskVerification.isComplete,
        codeQualityPassed: codeVerification.codeVerification.passed,
        summary: codeVerification.summary,
      });
    }

    // ============================================
    // COMPREHENSIVE PROJECT VERIFICATION
    // ============================================
    onProgress?.('verification', 'Running comprehensive project verification...');

    const comprehensiveReport = await runComprehensiveVerification(
      projectDir,
      state.language,
      (msg) => onProgress?.('verification', msg)
    );

    // Log verification results
    for (const result of comprehensiveReport.results) {
      if (!result.passed) {
        const level = result.severity === 'error' ? 'verification-error' : 'verification-warning';
        onProgress?.(level, `[${result.category}] ${result.message}`);
      }
    }

    // Auto-fix fixable issues
    if (comprehensiveReport.failedChecks > 0) {
      const fixableCount = comprehensiveReport.results.filter(r => !r.passed && r.autoFixable).length;
      if (fixableCount > 0) {
        onProgress?.('verification', `Attempting to auto-fix ${fixableCount} issue(s)...`);
        const fixed = await autoFixIssues(comprehensiveReport, (msg) => onProgress?.('verification', msg));
        onProgress?.('verification', `Auto-fixed ${fixed} issue(s)`);

        // Re-run verification after fixes
        if (fixed > 0) {
          onProgress?.('verification', 'Re-running verification after fixes...');
          const reVerifyReport = await runComprehensiveVerification(projectDir, state.language);

          if (reVerifyReport.failedChecks > 0) {
            onProgress?.(
              'verification-error',
              `${reVerifyReport.failedChecks} critical issue(s) remain after auto-fix`
            );
          }
        }
      }
    }

    // Block completion if critical issues remain
    if (comprehensiveReport.criticalIssues.length > 0) {
      onProgress?.(
        'verification-error',
        `BLOCKING: ${comprehensiveReport.criticalIssues.length} critical issue(s) found`
      );

      for (const issue of comprehensiveReport.criticalIssues) {
        onProgress?.('verification-error', `  - ${issue}`);
      }

      await logger.error('verification', 'critical_issues', 'Critical verification issues found', {
        issues: comprehensiveReport.criticalIssues,
      });

      return {
        success: false,
        state,
        completedTasks,
        failedTasks,
        error: `Project verification failed: ${comprehensiveReport.criticalIssues.length} critical issues`,
      };
    }

    onProgress?.(
      'verification',
      `Verification complete: ${comprehensiveReport.passedChecks}/${comprehensiveReport.totalChecks} checks passed`
    );

    // ============================================
    // GENERATE PROJECT README
    // ============================================
    onProgress?.('readme', 'Generating project README with setup and run instructions...');
    const readmeResult = await generateProjectReadme(projectDir, state);

    if (readmeResult.success) {
      onProgress?.('readme', `README.md generated successfully`);
      await logger.success('completion', 'readme_generated', 'Project README generated', {
        path: readmeResult.path,
      });
    } else {
      onProgress?.('readme-warning', `Failed to generate README: ${readmeResult.error}`);
      await logger.warn('completion', 'readme_failed', 'Failed to generate README', {
        error: readmeResult.error,
      });
    }

    // All milestones complete
    state = await completeProject(projectDir);

    onProgress?.(
      'execution-complete',
      `Project complete! ${completedMilestones} milestones, ${completedTasks} tasks executed successfully.`
    );

    await logger.stageComplete('completion', 'Project execution completed successfully', {
      completedMilestones: completedMilestones,
      totalMilestones: state.milestones.length,
      completedTasks: completedTasks,
      totalTasks: state.milestones.reduce((sum, m) => sum + m.tasks.length, 0),
      buildPassed: buildResult.success,
      testsPassed: hasTests ? (await runTests(projectDir, state.language)).success : true,
    });

    return {
      success: true,
      state,
      completedTasks,
      failedTasks: 0,
      buildStatus: 'passed',
      testStatus: finalTestStatus,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.('error', errorMessage);

    await logger.stageFailed('execution', 'Execution Mode failed', errorMessage, {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      completedTasks: completedTasks,
      failedTasks: failedTasks,
      completedMilestones: completedMilestones,
    });

    return {
      success: false,
      state: await loadProject(projectDir).catch(() => ({} as ProjectState)),
      completedTasks,
      failedTasks,
      error: errorMessage,
    };
  }
}

/**
 * Resume execution mode from where it left off
 *
 * @param options - Execution options
 * @returns Execution mode result
 */
export async function resumeExecutionMode(
  options: ExecutionModeOptions
): Promise<ExecutionModeResult> {
  const { projectDir, onProgress } = options;
  let state = await loadProject(projectDir);

  // Verify actual completion - don't trust status alone
  const verification = await verifyProjectCompletion(projectDir);
  const progress = verification.progress;

  // Log current progress
  onProgress?.(
    'resume-analysis',
    `Current progress: ${progress.progressSummary}`
  );

  // Check if actually complete - only trust explicit completion (completeProject() sets both)
  const projectExplicitlyCompleted = state.status === 'complete' && state.phase === 'complete';

  if (projectExplicitlyCompleted) {
    if (verification.isComplete) {
      onProgress?.('resume-complete', 'Project is genuinely complete (all tasks done, build verified)');
      return {
        success: true,
        state,
        completedTasks: progress.completedTasks,
        failedTasks: 0,
        buildStatus: 'passed',
      };
    }

    // Status says complete but work is incomplete
    onProgress?.(
      'resume-mismatch',
      `Status mismatch detected: status='complete' but ${progress.completedTasks}/${progress.totalTasks} tasks done`
    );

    // Reset incorrect status
    state = await updateState(projectDir, {
      status: 'in-progress',
      phase: 'execution',
      error: undefined,
    });

    onProgress?.(
      'resume-reset',
      `Reset project status. Will continue with ${progress.pendingTasks + progress.failedTasks} remaining tasks`
    );
  }

  // All tasks done but project never explicitly completed - need to run build verification
  if (verification.isComplete && !projectExplicitlyCompleted) {
    onProgress?.(
      'resume-verification',
      'All tasks complete but final verification (build/tests) has not passed yet - re-running...'
    );

    // Reset error/failed status so execution mode proceeds to verification
    if (state.status === 'failed' || state.status === 'paused') {
      state = await updateState(projectDir, {
        status: 'in-progress',
        error: undefined,
      });
    }
  }

  // Reset failed tasks to pending so they can be retried
  if (state.status === 'failed' || progress.failedTasks > 0) {
    const updatedMilestones = state.milestones.map((m) => ({
      ...m,
      // Also reset milestone status if needed
      status: m.tasks.every(t => t.status === 'complete')
        ? 'complete' as const
        : m.tasks.some(t => t.status === 'complete' || t.status === 'in-progress')
          ? 'in-progress' as const
          : 'pending' as const,
      tasks: m.tasks.map((t) =>
        t.status === 'failed' ? { ...t, status: 'pending' as const, error: undefined } : t
      ),
    }));

    await updateState(projectDir, {
      milestones: updatedMilestones,
      status: 'in-progress',
      error: undefined,
    });

    if (progress.failedTasks > 0) {
      onProgress?.(
        'resume-retry',
        `Reset ${progress.failedTasks} failed task(s) to pending for retry`
      );
    }
  }

  // Show what will be worked on
  if (progress.nextMilestone) {
    onProgress?.(
      'resume-next',
      `Next milestone: ${progress.nextMilestone.name}`
    );
  }
  if (progress.nextTask) {
    onProgress?.(
      'resume-next',
      `Next task: ${progress.nextTask.name} (in ${progress.nextTask.milestone})`
    );
  }

  return runExecutionMode(options);
}

/**
 * Execute a single task by ID
 *
 * @param projectDir - Project directory
 * @param taskId - Task ID to execute
 * @param options - Execution options
 * @returns Task execution result
 */
export async function executeSingleTask(
  projectDir: string,
  taskId: string,
  options: Partial<ExecutionModeOptions> = {}
): Promise<TaskExecutionResult> {
  const state = await loadProject(projectDir);

  // Find the task
  let foundTask: Task | undefined;
  let foundMilestone: Milestone | undefined;

  for (const milestone of state.milestones) {
    const task = milestone.tasks.find((t) => t.id === taskId);
    if (task) {
      foundTask = task;
      foundMilestone = milestone;
      break;
    }
  }

  if (!foundTask || !foundMilestone) {
    return {
      success: false,
      task: { id: taskId, name: 'Unknown', status: 'pending', description: '' },
      error: `Task ${taskId} not found`,
      retries: 0,
    };
  }

  return executeTaskWithRetry(
    foundMilestone,
    foundTask,
    state,
    { projectDir, ...options }
  );
}
