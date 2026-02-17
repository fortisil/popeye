/**
 * Create command
 * One-shot project creation from an idea
 */

import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ProjectSpecSchema, type OutputLanguage, type OpenAIModel } from '../../types/project.js';
import { requireAuth } from '../../auth/index.js';
import { runWorkflow } from '../../workflow/index.js';
import { generateProject, projectDirExists, cleanupProject } from '../../generators/index.js';
import {
  printHeader,
  printSection,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  printConsensusResult,
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
} from '../output.js';

/**
 * Create the create command
 */
export function createCreateCommand(): Command {
  const create = new Command('create')
    .description('Create a new project from an idea')
    .argument('<idea>', 'Project idea or description')
    .option('-n, --name <name>', 'Project name')
    .option(
      '-l, --language <lang>',
      'Output language (python/be, typescript/fe, fullstack/fs, website/web, all)',
      'python'
    )
    .option(
      '-m, --model <model>',
      'OpenAI model for consensus (gpt-4o, gpt-4o-mini, o1-preview)',
      'gpt-4o'
    )
    .option(
      '-o, --output <dir>',
      'Output directory',
      process.cwd()
    )
    .option(
      '--threshold <percent>',
      'Consensus threshold percentage',
      '95'
    )
    .option(
      '--max-iterations <count>',
      'Maximum consensus iterations',
      '5'
    )
    .option(
      '--skip-scaffold',
      'Skip initial project scaffolding'
    )
    .action(async (idea: string, options) => {
      try {
        // Map language aliases and validate
        const langAliases: Record<string, OutputLanguage> = {
          // Backend aliases
          'py': 'python',
          'python': 'python',
          'be': 'python',
          'backend': 'python',
          // Frontend aliases
          'ts': 'typescript',
          'typescript': 'typescript',
          'fe': 'typescript',
          'frontend': 'typescript',
          // Fullstack aliases
          'fs': 'fullstack',
          'fullstack': 'fullstack',
          // Website aliases
          'web': 'website',
          'website': 'website',
          // All aliases
          'all': 'all',
        };
        const language = langAliases[options.language.toLowerCase()];
        if (!language) {
          printError(`Invalid language: ${options.language}. Use 'be', 'fe', 'fs', 'web', or 'all'.`);
          process.exit(1);
        }

        const model = options.model as OpenAIModel;
        const validModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'];
        if (!validModels.includes(model)) {
          printError(`Invalid model: ${model}. Use one of: ${validModels.join(', ')}`);
          process.exit(1);
        }

        // Generate project name from idea if not provided
        const outputDir = path.resolve(options.output);
        const projectName = options.name || await generateProjectName(idea, outputDir);
        const projectDir = path.join(outputDir, projectName);
        const threshold = parseInt(options.threshold, 10);
        const maxIterations = parseInt(options.maxIterations, 10);

        // Validate project spec
        const specResult = ProjectSpecSchema.safeParse({
          idea,
          name: projectName,
          language,
          openaiModel: model,
          outputDir,
        });

        if (!specResult.success) {
          printError(`Invalid project specification: ${specResult.error.message}`);
          process.exit(1);
        }

        const spec = specResult.data;

        // Print header
        printHeader('Popeye CLI - Project Creation');

        printSection('Project Configuration');
        printKeyValue('Name', projectName);
        printKeyValue('Language', language);
        printKeyValue('Model', model);
        printKeyValue('Output', projectDir);
        printKeyValue('Threshold', `${threshold}%`);
        console.log();

        printSection('Idea');
        console.log(`  ${idea}`);
        console.log();

        // Check if directory exists
        if (await projectDirExists(projectDir)) {
          printWarning(`Directory already exists: ${projectDir}`);
          printInfo('Use a different name or output directory');
          process.exit(1);
        }

        // Require authentication
        printSection('Authentication');
        startSpinner('Checking authentication...');

        try {
          await requireAuth();
          succeedSpinner('Authentication verified');
        } catch (error) {
          failSpinner('Authentication required');
          printError(error instanceof Error ? error.message : 'Authentication failed');
          process.exit(1);
        }

        // Generate project scaffold
        if (!options.skipScaffold) {
          printSection('Project Scaffolding');
          startSpinner('Creating project structure...');

          const scaffoldResult = await generateProject(spec, outputDir);

          if (!scaffoldResult.success) {
            failSpinner('Scaffolding failed');
            printError(scaffoldResult.error || 'Failed to create project structure');
            process.exit(1);
          }

          succeedSpinner(`Created ${scaffoldResult.filesCreated.length} files`);
        }

        // Run the workflow
        printSection('Workflow Execution');

        const workflowResult = await runWorkflow(spec, {
          projectDir,
          consensusConfig: {
            threshold,
            maxIterations,
            openaiModel: model,
          },
          onProgress: (phase, message) => {
            handleProgressUpdate(phase, message);
          },
        });

        // Stop any running spinner
        stopSpinner();

        // Print results
        console.log();
        if (workflowResult.success) {
          printHeader('Project Created Successfully!');

          printSection('Summary');
          printKeyValue('Location', projectDir);
          printKeyValue('Language', language);

          if (workflowResult.planResult?.consensusResult) {
            printKeyValue('Final Consensus', `${workflowResult.planResult.consensusResult.finalScore}%`);
            printKeyValue('Iterations', workflowResult.planResult.consensusResult.totalIterations.toString());
          }

          if (workflowResult.executionResult) {
            printKeyValue('Tasks Completed', workflowResult.executionResult.completedTasks.toString());
          }

          console.log();
          printSuccess('Your project is ready!');
          console.log();
          printInfo(`cd ${projectDir}`);
          if (language === 'python') {
            printInfo('python -m pytest tests/');
          } else if (language === 'typescript') {
            printInfo('npm test');
          } else if (language === 'fullstack') {
            printInfo('docker-compose up  # Run both frontend and backend');
            printInfo('# Or run separately:');
            printInfo('cd apps/frontend && npm install && npm run dev');
            printInfo('cd apps/backend && pip install -e . && uvicorn src.backend.main:app --reload');
          }
        } else {
          printHeader('Project Creation Failed');

          if (workflowResult.error) {
            printError(workflowResult.error);
          }

          if (workflowResult.planResult?.consensusResult) {
            printSection('Consensus Status');
            printConsensusResult(
              workflowResult.planResult.consensusResult.iterations[
                workflowResult.planResult.consensusResult.iterations.length - 1
              ]?.result || { score: 0, analysis: '', approved: false, rawResponse: '' }
            );
          }

          // Cleanup on failure
          printWarning('Cleaning up failed project...');
          await cleanupProject(projectDir);

          process.exit(1);
        }
      } catch (error) {
        stopSpinner();
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return create;
}

/**
 * Directories that are too generic to use as project names
 */
const GENERIC_DIR_NAMES = new Set([
  'home', 'desktop', 'documents', 'downloads', 'projects', 'project',
  'repos', 'code', 'dev', 'workspace', 'workspaces', 'src', 'tmp',
  'temp', 'users', 'user', 'root', 'var', 'opt',
]);

/**
 * Generate a project name, preferring CWD-derived names over prompt text.
 *
 * Priority: docs in CWD -> CWD basename -> idea text extraction
 *
 * @param idea - The user's project idea text
 * @param cwd - Optional directory for context-aware naming
 * @returns A kebab-case project name
 */
async function generateProjectName(idea: string, cwd?: string): Promise<string> {
  const toKebab = (name: string): string =>
    name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  if (cwd) {
    // Check for doc-derived name
    try {
      const entries = await fs.readdir(cwd, { withFileTypes: true });
      const mdFiles = entries
        .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.toLowerCase().startsWith('readme'))
        .map(e => path.join(cwd, e.name));

      for (const mdFile of mdFiles) {
        try {
          const content = await fs.readFile(mdFile, 'utf-8');
          const headingMatch = content.match(/^#\s+([A-Z][a-zA-Z0-9]+)/m);
          if (headingMatch && headingMatch[1] && headingMatch[1].length >= 3 && headingMatch[1].length <= 30) {
            return toKebab(headingMatch[1]);
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory not readable
    }

    // Check CWD basename
    const dirName = path.basename(cwd);
    if (dirName.length >= 3 && !GENERIC_DIR_NAMES.has(dirName.toLowerCase())) {
      return toKebab(dirName);
    }
  }

  // Fallback: extract from idea text
  return idea
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('-')
    .substring(0, 30) || 'my-project';
}

/**
 * Handle progress updates from the workflow
 */
let currentSpinner: ReturnType<typeof startSpinner> | null = null;
let lastPhase = '';

function handleProgressUpdate(phase: string, message: string): void {
  // Map phases to user-friendly names
  const phaseNames: Record<string, string> = {
    'plan-init': 'Initializing',
    'expand-idea': 'Expanding Idea',
    'get-context': 'Analyzing Context',
    'create-plan': 'Creating Plan',
    'consensus': 'Consensus Review',
    'execution-start': 'Starting Execution',
    'task-start': 'Executing Task',
    'task-complete': 'Task Complete',
    'task-failed': 'Task Failed',
    'execution-complete': 'Execution Complete',
    'complete': 'Complete',
    'failed': 'Failed',
    'error': 'Error',
    'workflow': 'Workflow',
  };

  const phaseName = phaseNames[phase] || phase;

  // Handle phase transitions
  if (phase !== lastPhase) {
    if (currentSpinner) {
      if (phase === 'error' || phase === 'failed') {
        failSpinner();
      } else {
        succeedSpinner();
      }
    }

    if (!['complete', 'failed', 'error', 'task-complete', 'task-failed'].includes(phase)) {
      currentSpinner = startSpinner(`${phaseName}: ${message}`);
    }

    lastPhase = phase;
  } else if (currentSpinner) {
    updateSpinner(`${phaseName}: ${message}`);
  }

  // Handle terminal phases
  if (phase === 'complete') {
    if (currentSpinner) {
      succeedSpinner(message);
      currentSpinner = null;
    } else {
      printSuccess(message);
    }
  } else if (phase === 'failed' || phase === 'error') {
    if (currentSpinner) {
      failSpinner(message);
      currentSpinner = null;
    } else {
      printError(message);
    }
  } else if (phase === 'task-complete') {
    printSuccess(message);
  } else if (phase === 'task-failed') {
    printError(message);
  }
}
