/**
 * Debug command
 * Interactive debugging session that primes Claude with project context
 * and lets users paste errors for AI-assisted diagnosis and fixes.
 */

import { Command } from 'commander';
import * as readline from 'node:readline';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  printListItem,
  startSpinner,
  succeedSpinner,
  failSpinner,
  theme,
} from '../output.js';
import { getProjectStructureSummary } from '../../workflow/project-structure.js';
import { readPriorityDocs } from '../../workflow/audit-scanner.js';
import { executePrompt, DEFAULT_ALLOWED_TOOLS } from '../../adapters/claude.js';
import type { FileIndexEntry } from './debug-context.js';
import {
  extractPathsFromError,
  detectTechFromError,
  selectRelevantFiles,
  isConfigFile,
  extractImagePaths,
} from './debug-context.js';
import {
  getDebugSystemPrompt,
  formatConversationHistory,
} from './debug-prompts.js';
import type { DebugMessage } from './debug-prompts.js';

/** Directories to skip when building the file index */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv',
  '.next', '.turbo', '.cache', 'coverage', 'out', '.vercel', '.tox',
]);

/** Max file content size to include per file (chars) */
const MAX_FILE_CONTENT = 8000;

/** Max conversation history exchanges to keep */
const MAX_HISTORY_EXCHANGES = 20;

/** Max length of a single history message (chars) */
const MAX_HISTORY_MESSAGE_LENGTH = 2000;

/**
 * Context gathered about the project for debug sessions.
 */
export interface DebugContext {
  projectDir: string;
  structureSummary: string;
  purpose: string;
  claudeMd?: string;
  readme?: string;
  anchorFiles: Record<string, string>;
  fileIndex: FileIndexEntry[];
  language: string;
}

/**
 * Options for starting a debug session.
 */
export interface DebugSessionOptions {
  projectDir: string;
  language: string;
}

/**
 * Build a lightweight file index of the project (paths + metadata, no content).
 *
 * @param dir - Directory to scan.
 * @param baseDir - Project root for computing relative paths.
 * @param index - Accumulator array.
 * @param depth - Current recursion depth.
 */
async function buildFileIndex(
  dir: string,
  baseDir: string,
  index: FileIndexEntry[],
  depth: number = 0
): Promise<void> {
  if (depth > 8) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await buildFileIndex(fullPath, baseDir, index, depth + 1);
      }
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        index.push({
          relativePath,
          size: stat.size,
          mtime: stat.mtimeMs,
          isConfig: isConfigFile(relativePath),
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }
}

/**
 * Read an anchor config file, returning its content or undefined.
 *
 * @param projectDir - Project root directory.
 * @param filename - File name to read.
 * @returns File content or undefined if not found.
 */
async function readAnchorFile(projectDir: string, filename: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(path.join(projectDir, filename), 'utf-8');
    return content.slice(0, MAX_FILE_CONTENT);
  } catch {
    return undefined;
  }
}

/**
 * Gather debug context for the project. Builds a lightweight index and
 * reads anchor documents (CLAUDE.md, README, config files).
 *
 * @param projectDir - Project root directory.
 * @param language - Project language/type.
 * @returns DebugContext with project metadata and file index.
 */
export async function gatherDebugContext(
  projectDir: string,
  language: string
): Promise<DebugContext> {
  // Get project structure summary
  let structureSummary = '';
  try {
    const summary = await getProjectStructureSummary(projectDir, language);
    structureSummary = summary.formatted;
  } catch {
    structureSummary = '(Could not scan project structure)';
  }

  // Read priority docs (CLAUDE.md, README)
  let claudeMd: string | undefined;
  let readme: string | undefined;
  try {
    const docs = await readPriorityDocs(projectDir);
    claudeMd = docs.claudeMd;
    readme = docs.readme;
  } catch {
    // Non-fatal
  }

  // Extract purpose from README or CLAUDE.md
  let purpose = '';
  if (readme) {
    const firstParagraph = readme.split('\n\n')[0] || '';
    purpose = firstParagraph.replace(/^#.*\n?/, '').trim().slice(0, 300);
  }
  if (!purpose && claudeMd) {
    purpose = claudeMd.slice(0, 300);
  }

  // Read anchor config files
  const anchorFileNames = [
    'package.json', 'pyproject.toml', 'docker-compose.yml',
    'docker-compose.yaml', '.env.example', 'tsconfig.json',
    'alembic.ini', 'requirements.txt',
  ];
  const anchorFiles: Record<string, string> = {};
  for (const name of anchorFileNames) {
    const content = await readAnchorFile(projectDir, name);
    if (content) {
      anchorFiles[name] = content;
    }
  }

  // Build lightweight file index
  const fileIndex: FileIndexEntry[] = [];
  await buildFileIndex(projectDir, projectDir, fileIndex);

  return {
    projectDir,
    structureSummary,
    purpose,
    claudeMd: claudeMd?.slice(0, MAX_FILE_CONTENT),
    readme: readme?.slice(0, MAX_FILE_CONTENT),
    anchorFiles,
    fileIndex,
    language,
  };
}

/**
 * Display project summary to the user at the start of a debug session.
 *
 * @param context - The gathered debug context.
 */
export function displayProjectSummary(context: DebugContext): void {
  console.log();
  printHeader('Debug Session');
  console.log();

  if (context.purpose) {
    printKeyValue('Project', context.purpose);
  }
  printKeyValue('Language', context.language);
  printKeyValue('Files indexed', String(context.fileIndex.length));

  const configCount = context.fileIndex.filter((f) => f.isConfig).length;
  printKeyValue('Config files', String(configCount));

  if (Object.keys(context.anchorFiles).length > 0) {
    console.log();
    printInfo('Anchor files loaded:');
    for (const name of Object.keys(context.anchorFiles)) {
      printListItem(name);
    }
  }
  if (context.claudeMd) printListItem('CLAUDE.md');
  if (context.readme) printListItem('README.md');

  console.log();
  printInfo('Paste an error, describe a bug, or include a screenshot path. Sub-commands:');
  printListItem('/back  - Return to main Popeye session');
  printListItem('/clear - Reset conversation history');
  printListItem('/context - Re-display project summary');
  printListItem('/fix   - Apply last proposed fix via Popeye pipeline');
  console.log();
  printInfo('Tip: Include screenshot paths and Claude will read them visually.');
  console.log();
}

/**
 * Build the full debug prompt for Claude, combining project context,
 * relevant file contents, conversation history, and the current message.
 *
 * @param context - Debug context with project metadata.
 * @param history - Conversation history.
 * @param userMessage - Current user message/error.
 * @param relevantFileContents - Map of file path -> content for relevant files.
 * @param imagePaths - Optional array of image/screenshot paths to read.
 * @returns Assembled prompt string.
 */
export function buildDebugPrompt(
  context: DebugContext,
  history: DebugMessage[],
  userMessage: string,
  relevantFileContents: Record<string, string>,
  imagePaths: string[] = []
): string {
  const sections: string[] = [];

  // Project overview (always included, small)
  sections.push('## Project Context');
  if (context.purpose) {
    sections.push(`**Purpose:** ${context.purpose}`);
  }
  sections.push(`**Language/Type:** ${context.language}`);
  sections.push(`**Structure:**\n${context.structureSummary}`);

  // Anchor configs (always included)
  if (Object.keys(context.anchorFiles).length > 0) {
    sections.push('## Anchor Config Files');
    for (const [name, content] of Object.entries(context.anchorFiles)) {
      sections.push(`### ${name}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  // CLAUDE.md (always included if present)
  if (context.claudeMd) {
    sections.push(`## CLAUDE.md\n\`\`\`\n${context.claudeMd}\n\`\`\``);
  }

  // Relevant files (loaded on-demand per error)
  if (Object.keys(relevantFileContents).length > 0) {
    sections.push('## Relevant Source Files');
    for (const [filePath, content] of Object.entries(relevantFileContents)) {
      sections.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  // Conversation history
  const historyText = formatConversationHistory(history);
  if (historyText) {
    sections.push(historyText);
  }

  // Screenshot/image instructions
  if (imagePaths.length > 0) {
    const imageList = imagePaths.map((p) => `- \`${p}\``).join('\n');
    sections.push(
      `## Screenshots Attached\n\nThe user referenced these image files. ` +
      `Use the Read tool to view each one and include visual findings in your diagnosis:\n${imageList}`
    );
  }

  // Current user message
  sections.push(`## Current Error / Question\n\n${userMessage}`);

  return sections.join('\n\n');
}

/**
 * Read file contents for the selected relevant files.
 *
 * @param projectDir - Project root directory.
 * @param filePaths - Relative paths to read.
 * @returns Map of relative path -> file content.
 */
async function loadRelevantFileContents(
  projectDir: string,
  filePaths: string[]
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};

  for (const relPath of filePaths) {
    try {
      const fullPath = path.join(projectDir, relPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      contents[relPath] = content.slice(0, MAX_FILE_CONTENT);
    } catch {
      // Skip unreadable files
    }
  }

  return contents;
}

/** Timeout (ms) for single-line input (typing). Feels instant. */
const SINGLE_LINE_TIMEOUT_MS = 150;

/** Timeout (ms) after paste is detected (2+ lines). Generous for large pastes. */
const PASTE_TIMEOUT_MS = 2000;

/** Maximum input size (chars) to prevent terminal lockup on extremely large pastes. */
const MAX_INPUT_SIZE = 50000;

/**
 * Collect input from the user. Creates a fresh readline per call to avoid
 * stdin corruption after executePrompt subprocess usage.
 *
 * Uses adaptive timeout:
 * - Single line (typing): 150ms wait after Enter -> submit (feels instant)
 * - Multi-line (paste detected): 2s wait after last line -> submit (handles large logs)
 *
 * @returns The collected input string, or null on EOF.
 */
function collectInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let submitTimer: ReturnType<typeof setTimeout> | null = null;
    let totalChars = 0;
    let resolved = false;

    // Reason: Create a fresh readline per input to avoid stdin corruption.
    // executePrompt spawns a Claude subprocess that can disrupt a persistent
    // readline's stdin stream, causing silent exit on the next read.
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    const prompt = theme.dim('| ') + theme.primary('debug') + theme.dim(' > ');
    process.stdout.write(prompt);

    const cleanup = (): void => {
      if (submitTimer) clearTimeout(submitTimer);
      rl.removeListener('line', onLine);
      rl.removeListener('close', onClose);
      rl.close();
    };

    const finish = (value: string | null): void => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const submit = (): void => {
      finish(lines.join('\n').trim());
    };

    const onLine = (line: string): void => {
      lines.push(line);
      totalChars += line.length + 1;

      // Reason: Adaptive timeout. First line uses short timeout (typing feels instant).
      // Once 2+ lines arrive (paste detected), use long timeout so the terminal has
      // time to deliver all chunks of a large paste without mid-paste submission.
      const isPaste = lines.length > 1;
      const timeout = isPaste ? PASTE_TIMEOUT_MS : SINGLE_LINE_TIMEOUT_MS;

      if (submitTimer) clearTimeout(submitTimer);
      submitTimer = setTimeout(submit, timeout);

      // Safety: cap input size to prevent terminal lockup
      if (totalChars > MAX_INPUT_SIZE) {
        printWarning(`Input truncated at ${MAX_INPUT_SIZE} chars. Submitting what we have.`);
        submit();
      }
    };

    const onClose = (): void => {
      // Reason: If stdin closes unexpectedly, submit whatever we have
      // rather than returning null (which exits the session).
      if (lines.length > 0) {
        finish(lines.join('\n').trim());
      } else {
        finish(null);
      }
    };

    rl.on('line', onLine);
    rl.once('close', onClose);
  });
}

/**
 * Run the interactive debug session sub-REPL.
 *
 * @param options - Debug session options (projectDir, language).
 */
export async function runDebugSession(options: DebugSessionOptions): Promise<void> {
  const { projectDir, language } = options;

  // Phase 1: Gather context
  startSpinner('Scanning project for debug context...');
  let context: DebugContext;
  try {
    context = await gatherDebugContext(projectDir, language);
    succeedSpinner(`Indexed ${context.fileIndex.length} files`);
  } catch (err) {
    failSpinner('Failed to scan project');
    throw err;
  }

  // Phase 2: Display summary
  displayProjectSummary(context);

  // Phase 3: Sub-REPL
  const history: DebugMessage[] = [];
  let lastAssistantResponse = '';
  let running = true;

  while (running) {
    const input = await collectInput();

    if (input === null) {
      // EOF / stream closed
      running = false;
      break;
    }

    if (!input) continue;

    const trimmed = input.trim();

    // Handle sub-commands
    if (trimmed.startsWith('/')) {
      const subCmd = trimmed.toLowerCase().split(/\s+/)[0];

      switch (subCmd) {
        case '/back':
        case '/done':
          running = false;
          continue;

        case '/clear':
          history.length = 0;
          lastAssistantResponse = '';
          printSuccess('Conversation history cleared.');
          console.log();
          continue;

        case '/context':
          displayProjectSummary(context);
          continue;

        case '/fix':
          if (!lastAssistantResponse) {
            printWarning('No diagnosis to apply. Paste an error first.');
            console.log();
            continue;
          }
          printInfo('Bridging to Popeye execution pipeline...');
          await bridgeToExecution(context, lastAssistantResponse);
          continue;

        default:
          printWarning(`Unknown debug sub-command: ${subCmd}`);
          printInfo('Available: /back, /clear, /context, /fix');
          console.log();
          continue;
      }
    }

    // Phase 3a: Analyze the error text
    const errorPaths = extractPathsFromError(trimmed);
    const { tags } = detectTechFromError(trimmed);
    const imagePaths = extractImagePaths(trimmed);

    // Phase 3b: Select and load relevant files
    const relevantPaths = selectRelevantFiles(context.fileIndex, errorPaths, tags);
    const relevantContents = await loadRelevantFileContents(projectDir, relevantPaths);

    if (relevantPaths.length > 0) {
      printInfo(`Loaded ${relevantPaths.length} relevant file(s) for analysis`);
    }
    if (imagePaths.length > 0) {
      printInfo(`Detected ${imagePaths.length} screenshot(s) -- Claude will read them`);
    }

    // Phase 3c: Build prompt
    const prompt = buildDebugPrompt(context, history, trimmed, relevantContents, imagePaths);
    const systemPrompt = getDebugSystemPrompt();

    // Phase 3d: Execute
    startSpinner('Analyzing...');
    try {
      const result = await executePrompt(prompt, {
        cwd: projectDir,
        systemPrompt,
        allowedTools: DEFAULT_ALLOWED_TOOLS,
        permissionMode: 'default',
      });

      if (result.success && result.response) {
        succeedSpinner('Analysis complete');
        console.log();
        console.log(result.response);
        console.log();

        // Update history
        lastAssistantResponse = result.response;
        history.push({ role: 'user', content: truncateForHistory(trimmed) });
        history.push({ role: 'assistant', content: truncateForHistory(result.response) });

        // Trim history if too long
        while (history.length > MAX_HISTORY_EXCHANGES * 2) {
          history.shift();
        }
      } else {
        failSpinner('Analysis failed');
        if (result.error) {
          printError(result.error);
        }
        console.log();
      }
    } catch (err) {
      failSpinner('Analysis failed');
      printError(err instanceof Error ? err.message : 'Unknown error during analysis');
      console.log();
    }
  }
}

/**
 * Bridge the last debug proposal to the Popeye execution pipeline.
 * Converts the diagnosis into a task for consensus/execution.
 *
 * @param context - Debug context.
 * @param proposal - Last assistant response with the proposed fix.
 */
async function bridgeToExecution(context: DebugContext, proposal: string): Promise<void> {
  const fixPrompt = `Apply the following fix to the project at ${context.projectDir}:\n\n${proposal}`;

  console.log();
  startSpinner('Applying fix...');

  try {
    const result = await executePrompt(fixPrompt, {
      cwd: context.projectDir,
      allowedTools: DEFAULT_ALLOWED_TOOLS,
      permissionMode: 'default',
    });

    if (result.success) {
      succeedSpinner('Fix applied');
      if (result.response) {
        console.log();
        console.log(result.response);
      }
    } else {
      failSpinner('Fix failed');
      if (result.error) {
        printError(result.error);
      }
    }
  } catch (err) {
    failSpinner('Fix failed');
    printError(err instanceof Error ? err.message : 'Unknown error applying fix');
  }

  console.log();
}

/**
 * Truncate a message for conversation history storage.
 *
 * @param text - Message text.
 * @returns Truncated text.
 */
function truncateForHistory(text: string): string {
  if (text.length <= MAX_HISTORY_MESSAGE_LENGTH) return text;
  return text.slice(0, MAX_HISTORY_MESSAGE_LENGTH) + '\n... (truncated)';
}

/**
 * Create the Commander.js debug command for CLI usage.
 *
 * @returns Commander Command instance.
 */
export function createDebugCommand(): Command {
  return new Command('debug')
    .description('Start interactive debugging session for a Popeye project')
    .argument('[projectDir]', 'Project directory to debug', '.')
    .option('-l, --language <lang>', 'Project language/type', 'backend')
    .action(async (projectDir: string, opts: { language: string }) => {
      const resolvedDir = path.resolve(projectDir);

      try {
        await fs.access(resolvedDir);
      } catch {
        printError(`Directory not found: ${resolvedDir}`);
        process.exit(1);
      }

      try {
        await runDebugSession({
          projectDir: resolvedDir,
          language: opts.language,
        });
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Debug session failed');
        process.exit(1);
      }
    });
}
