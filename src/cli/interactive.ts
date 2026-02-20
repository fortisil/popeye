/**
 * Interactive mode
 * Claude Code-style interface for Popeye CLI
 */

import * as readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Get package version
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const VERSION: string = packageJson.version;
import {
  getAuthStatusForDisplay,
  authenticateClaude,
  authenticateOpenAI,
  authenticateGemini,
  authenticateGrok,
  isClaudeCLIInstalled,
  checkClaudeCLIAuth,
  checkGeminiAuth,
  checkGrokAuth,
} from '../auth/index.js';
import {
  runWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  getWorkflowSummary,
  resetWorkflow,
} from '../workflow/index.js';
import {
  analyzeProjectProgress,
  verifyProjectCompletion,
  storeSpecification,
} from '../state/index.js';
import { generateProject } from '../generators/index.js';
import {
  discoverProjects,
  formatProjectForDisplay,
} from '../state/registry.js';
import { loadConfig, saveConfig } from '../config/index.js';
import { getValidUpgradeTargets, getTransitionDetails } from '../upgrade/transitions.js';
import { upgradeProject } from '../upgrade/index.js';
import { buildUpgradeContext } from '../upgrade/context.js';
import { OutputLanguageSchema, KNOWN_OPENAI_MODELS } from '../types/project.js';
import type { ProjectSpec, OutputLanguage, OpenAIModel } from '../types/project.js';
import { GeminiModelSchema, KNOWN_GEMINI_MODELS, KNOWN_GROK_MODELS } from '../types/consensus.js';
import { OpenAIModelSchema } from '../types/project.js';
import type { AIProvider, GeminiModel, GrokModel } from '../types/consensus.js';
import {
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  startSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
  theme,
} from './output.js';

/**
 * Project-local configuration stored in popeye.md
 */
interface PopeyeProjectConfig {
  language: OutputLanguage;
  reviewer: AIProvider;
  arbitrator: AIProvider;
  enableArbitration: boolean;
  created: string;
  lastRun: string;
  projectName?: string;
  description?: string;
  notes?: string;
  openaiModel?: OpenAIModel;
  geminiModel?: GeminiModel;
  grokModel?: GrokModel;
}

/**
 * Read popeye.md from project directory
 * Returns null if file doesn't exist
 */
async function readPopeyeConfig(projectDir: string): Promise<PopeyeProjectConfig | null> {
  const configPath = path.join(projectDir, 'popeye.md');

  try {
    const content = await fs.readFile(configPath, 'utf-8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const config: Partial<PopeyeProjectConfig> = {};

    // Parse each line of YAML
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.trim();

        switch (key) {
          case 'language':
            if (OutputLanguageSchema.safeParse(cleanValue).success) {
              config.language = cleanValue as OutputLanguage;
            }
            break;
          case 'reviewer':
            if (['openai', 'gemini', 'grok'].includes(cleanValue)) {
              config.reviewer = cleanValue as AIProvider;
            }
            break;
          case 'arbitrator':
            if (['openai', 'gemini', 'grok', 'off'].includes(cleanValue)) {
              if (cleanValue === 'off') {
                config.enableArbitration = false;
              } else {
                config.arbitrator = cleanValue as AIProvider;
                config.enableArbitration = true;
              }
            }
            break;
          case 'created':
            config.created = cleanValue;
            break;
          case 'lastRun':
            config.lastRun = cleanValue;
            break;
          case 'projectName':
            config.projectName = cleanValue;
            break;
          case 'openaiModel':
            if (OpenAIModelSchema.safeParse(cleanValue).success) {
              config.openaiModel = cleanValue as OpenAIModel;
            }
            break;
          case 'geminiModel':
            if (GeminiModelSchema.safeParse(cleanValue).success) {
              config.geminiModel = cleanValue as GeminiModel;
            }
            break;
          case 'grokModel':
            if (cleanValue.length > 0) {
              config.grokModel = cleanValue;
            }
            break;
        }
      }
    }

    // Extract notes section if present
    const notesMatch = content.match(/## Notes\n([\s\S]*?)(?=\n## |$)/);
    if (notesMatch) {
      config.notes = notesMatch[1].trim();
    }

    // Return config only if we have the essential fields
    if (config.language && config.reviewer) {
      return {
        language: config.language,
        reviewer: config.reviewer,
        arbitrator: config.arbitrator || 'gemini',
        enableArbitration: config.enableArbitration ?? true,
        created: config.created || new Date().toISOString(),
        lastRun: config.lastRun || new Date().toISOString(),
        projectName: config.projectName,
        description: config.description,
        notes: config.notes,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write popeye.md to project directory
 */
async function writePopeyeConfig(
  projectDir: string,
  config: PopeyeProjectConfig
): Promise<void> {
  const configPath = path.join(projectDir, 'popeye.md');

  const modelLines = [
    config.openaiModel ? `openaiModel: ${config.openaiModel}` : '',
    config.geminiModel ? `geminiModel: ${config.geminiModel}` : '',
    config.grokModel ? `grokModel: ${config.grokModel}` : '',
  ].filter(Boolean).join('\n');

  const content = `---
# Popeye Project Configuration
language: ${config.language}
reviewer: ${config.reviewer}
arbitrator: ${config.enableArbitration ? config.arbitrator : 'off'}
created: ${config.created}
lastRun: ${new Date().toISOString()}
${config.projectName ? `projectName: ${config.projectName}` : ''}
${modelLines}
---

# ${config.projectName || 'Popeye Project'}

${config.description ? `## Description\n${config.description}\n` : ''}
## Notes
${config.notes || 'Add any guidance or notes for Claude here...'}

## Configuration
- **Language**: ${config.language}
- **Reviewer**: ${config.reviewer}
- **Arbitrator**: ${config.enableArbitration ? config.arbitrator : 'disabled'}

## Session History
- ${config.created.split('T')[0]}: Project created
- ${new Date().toISOString().split('T')[0]}: Last session
`;

  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Update lastRun in popeye.md without changing other content
 */
async function updatePopeyeLastRun(projectDir: string): Promise<void> {
  const configPath = path.join(projectDir, 'popeye.md');

  try {
    let content = await fs.readFile(configPath, 'utf-8');

    // Update lastRun in frontmatter
    content = content.replace(
      /lastRun:\s*.+/,
      `lastRun: ${new Date().toISOString()}`
    );

    await fs.writeFile(configPath, content, 'utf-8');
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Apply popeye.md config to session state
 */
function applyPopeyeConfig(state: SessionState, config: PopeyeProjectConfig): void {
  state.language = config.language;
  state.reviewer = config.reviewer;
  state.arbitrator = config.arbitrator;
  state.enableArbitration = config.enableArbitration;
  if (config.openaiModel) state.openaiModel = config.openaiModel;
  if (config.geminiModel) state.geminiModel = config.geminiModel;
  if (config.grokModel) state.grokModel = config.grokModel;
}

// Note: startSpinner, succeedSpinner, failSpinner, stopSpinner are used in handleIdea

/**
 * Box drawing characters for Claude Code-style UI
 */
const box = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  leftT: '├',
  rightT: '┤',
};

/**
 * Interactive session state
 */
interface SessionState {
  projectDir: string | null;
  language: OutputLanguage;
  openaiModel: OpenAIModel;
  geminiModel: GeminiModel;
  grokModel: GrokModel;
  claudeAuth: boolean;
  openaiAuth: boolean;
  geminiAuth: boolean;
  grokAuth: boolean;
  reviewer: AIProvider;
  arbitrator: AIProvider;
  enableArbitration: boolean;
}

/**
 * Get terminal width
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Get a human-readable build label for the project language type
 */
function getBuildLabel(language: string): string {
  switch (language) {
    case 'typescript': return 'Frontend (TypeScript)';
    case 'javascript': return 'Frontend (JavaScript)';
    case 'python': return 'Python';
    case 'fullstack': return 'Fullstack (FE + BE)';
    case 'website': return 'Website';
    case 'all': return 'Fullstack + Website';
    default: return language;
  }
}

/**
 * Draw the header box
 */
function drawHeader(): void {
  const width = getTerminalWidth();
  const title = ` Popeye CLI v${VERSION} `;
  const subtitle = ' Autonomous Code Generation with AI Consensus ';

  // Top border
  console.log(theme.dim(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));

  // Title line
  const titlePadding = Math.floor((width - title.length - 2) / 2);
  console.log(
    theme.dim(box.vertical) +
    ' '.repeat(titlePadding) +
    theme.primary.bold(title) +
    ' '.repeat(width - titlePadding - title.length - 2) +
    theme.dim(box.vertical)
  );

  // Subtitle line
  const subPadding = Math.floor((width - subtitle.length - 2) / 2);
  console.log(
    theme.dim(box.vertical) +
    ' '.repeat(subPadding) +
    theme.secondary(subtitle) +
    ' '.repeat(width - subPadding - subtitle.length - 2) +
    theme.dim(box.vertical)
  );

  // Bottom border
  console.log(theme.dim(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
}

/**
 * Draw hints line and top of input box
 */
function drawInputBoxTop(state: SessionState): void {
  const width = Math.min(getTerminalWidth(), 100);

  // Hints line (above the box)
  const hints = [
    theme.dim('/lang ') +
      theme.primary('be') + theme.dim('|') +
      theme.primary('fe') + theme.dim('|') +
      theme.primary('fs') + theme.dim('|') +
      theme.primary('web') + theme.dim('|') +
      theme.primary('all'),
    theme.dim('/config'),
    theme.dim('/help'),
    theme.dim('/exit'),
  ];
  console.log('  ' + hints.join('   '));

  // Status items for the top line
  const langShortcuts: Record<OutputLanguage, string> = {
    python: 'be',
    typescript: 'fe',
    fullstack: 'fs',
    website: 'web',
    all: 'all',
  };
  const langStatus = langShortcuts[state.language] || state.language;
  const reviewerStatus = state.reviewer === 'openai' ? 'O' : state.reviewer === 'grok' ? 'X' : 'G';
  const arbitratorStatus = state.enableArbitration
    ? (state.arbitrator === 'openai' ? 'O' : state.arbitrator === 'grok' ? 'X' : 'G')
    : '-';
  // Check auth based on which providers are configured
  const reviewerAuthed = state.reviewer === 'openai' ? state.openaiAuth
    : state.reviewer === 'grok' ? state.grokAuth : state.geminiAuth;
  const arbitratorAuthed = !state.enableArbitration ? true
    : state.arbitrator === 'openai' ? state.openaiAuth
    : state.arbitrator === 'grok' ? state.grokAuth : state.geminiAuth;
  const allAuth = state.claudeAuth && reviewerAuthed && arbitratorAuthed;
  const authIcon = allAuth ? '●' : '○';
  const authColor = allAuth ? theme.success : theme.warning;

  // Build status text
  const statusParts = [
    theme.primary(langStatus),
    theme.dim('R:') + theme.secondary(reviewerStatus),
    theme.dim('A:') + theme.secondary(arbitratorStatus),
    authColor(authIcon),
  ];
  const statusText = statusParts.join(theme.dim(' │ '));

  // Calculate visible length (without ANSI codes)
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
  const statusLen = stripAnsi(statusText).length;

  // Top line: ╭─ status ─────────────────────────────────────────╮
  const paddingLen = Math.max(0, width - statusLen - 6);
  console.log(
    theme.dim(box.topLeft + box.horizontal + ' ') +
    statusText +
    theme.dim(' ' + box.horizontal.repeat(paddingLen) + box.topRight)
  );
}

/**
 * Draw bottom of input box after user presses enter
 */
function drawInputBoxBottom(): void {
  const width = Math.min(getTerminalWidth(), 100);
  console.log(theme.dim(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));
}

/**
 * Clear screen and redraw UI
 */
function redrawUI(_state: SessionState): void {
  console.clear();
  drawHeader();
  console.log();
}

/**
 * Prompt for input with styled prompt (inside box)
 */
function getPrompt(): string {
  return theme.dim(box.vertical + ' ') + theme.primary('popeye') + theme.dim(' > ');
}

/**
 * Prompt user to select an option
 * Uses terminal: false to prevent echo issues when nested with main readline
 */
async function promptSelection(
  question: string,
  options: { label: string; value: string }[],
  defaultValue: string
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false, // Prevent terminal mode to avoid echo issues
    });

    console.log();
    console.log(theme.primary(`  ${question}`));
    options.forEach((opt, i) => {
      const isDefault = opt.value === defaultValue;
      console.log(`    ${theme.dim(`${i + 1}.`)} ${opt.label}${isDefault ? theme.dim(' (default)') : ''}`);
    });
    console.log();

    // Print prompt manually since terminal: false disables it
    process.stdout.write(`  Enter choice [1-${options.length}] or press Enter for default: `);

    rl.once('line', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed) {
        resolve(defaultValue);
        return;
      }
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= options.length) {
        resolve(options[num - 1].value);
      } else {
        resolve(defaultValue);
      }
    });
  });
}

/**
 * Prompt yes/no question
 * Uses terminal: false to prevent echo issues when nested with main readline
 */
async function promptYesNo(question: string, defaultYes: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false, // Prevent terminal mode to avoid echo issues
    });

    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    process.stdout.write(`  ${question} ${theme.dim(hint)} `);

    rl.once('line', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultYes);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

/**
 * Check if reviewer/arbitrator has been configured (saved to config)
 */
async function isConsensusConfigured(): Promise<boolean> {
  const config = await loadConfig();
  // Consider configured if enable_arbitration is true or if arbitrator is explicitly set to a provider
  // (Default is arbitrator='off' and enable_arbitration=false, so any change indicates user configured it)
  return config.consensus.enable_arbitration || config.consensus.arbitrator !== 'off';
}

/**
 * Save reviewer/arbitrator settings to config file
 */
async function saveConsensusConfig(state: SessionState): Promise<void> {
  try {
    // Load existing config and merge with new consensus settings
    const existingConfig = await loadConfig();
    const updatedConsensus = {
      ...existingConfig.consensus,
      reviewer: state.reviewer,
      arbitrator: state.enableArbitration ? state.arbitrator : 'off' as const,
      enable_arbitration: state.enableArbitration,
    };
    await saveConfig({
      consensus: updatedConsensus,
    }, true); // Save to global config
  } catch (err) {
    printWarning(`Could not save config: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Check and perform authentication
 */
async function ensureAuthentication(state: SessionState): Promise<boolean> {
  const status = await getAuthStatusForDisplay();
  state.claudeAuth = status.claude.authenticated;
  state.openaiAuth = status.openai.authenticated;
  state.geminiAuth = status.gemini?.authenticated || false;
  const grokStatus = await checkGrokAuth();
  state.grokAuth = grokStatus.authenticated;

  console.log();
  printInfo('Checking authentication...');
  console.log();

  // Authenticate Claude if needed
  if (!state.claudeAuth) {
    console.log(theme.dim(box.vertical) + ' ' + theme.primary('Claude Code CLI') + theme.dim(' - Required for code generation'));
    console.log(theme.dim(box.vertical));

    try {
      const success = await authenticateClaude();
      if (success) {
        printSuccess('Claude Code CLI ready');
        state.claudeAuth = true;
      } else {
        printWarning('Claude Code CLI not authenticated - run "claude login" to authenticate');
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Authentication failed');
    }
    console.log();
  } else {
    printSuccess('Claude Code CLI ready');
  }

  // Authenticate OpenAI if needed
  if (!state.openaiAuth) {
    console.log(theme.dim(box.vertical) + ' ' + theme.primary('OpenAI API') + theme.dim(' - Required for consensus review'));
    console.log(theme.dim(box.vertical));

    try {
      const success = await authenticateOpenAI();
      if (success) {
        printSuccess('OpenAI API ready');
        state.openaiAuth = true;
      } else {
        printWarning('OpenAI API not authenticated');
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Authentication failed');
    }
    console.log();
  } else {
    printSuccess('OpenAI API ready');
  }

  // Check if reviewer/arbitrator is already configured
  const alreadyConfigured = await isConsensusConfigured();

  // Only ask about reviewer/arbitrator if not already configured
  if (state.claudeAuth && state.openaiAuth && !alreadyConfigured) {
    console.log();
    console.log(theme.primary.bold('  AI Configuration'));
    console.log(theme.dim('  Claude generates code. Choose who reviews and arbitrates:'));

    // Ask who should review plans
    state.reviewer = await promptSelection(
      'Who should review Claude\'s plans?',
      [
        { label: theme.secondary('OpenAI') + theme.dim(' - GPT-4o reviews plans'), value: 'openai' },
        { label: theme.secondary('Gemini') + theme.dim(' - Gemini 2.0 reviews plans'), value: 'gemini' },
        { label: theme.secondary('Grok') + theme.dim(' - xAI Grok reviews plans'), value: 'grok' },
      ],
      'openai'
    ) as AIProvider;

    // Ask about arbitration
    console.log();
    state.enableArbitration = await promptYesNo(
      theme.primary('Enable arbitration when consensus is stuck?'),
      true
    );

    if (state.enableArbitration) {
      // Auto-select a different provider as arbitrator
      const defaultArbitrator = state.reviewer === 'openai' ? 'gemini'
        : state.reviewer === 'gemini' ? 'openai' : 'gemini';

      state.arbitrator = await promptSelection(
        'Who should arbitrate when stuck?',
        [
          { label: theme.secondary('Gemini') + theme.dim(' - Google Gemini breaks deadlocks'), value: 'gemini' },
          { label: theme.secondary('OpenAI') + theme.dim(' - OpenAI breaks deadlocks'), value: 'openai' },
          { label: theme.secondary('Grok') + theme.dim(' - xAI Grok breaks deadlocks'), value: 'grok' },
        ],
        defaultArbitrator
      ) as AIProvider;

      // Authenticate Gemini if needed for reviewer or arbitrator
      const needsGemini = state.reviewer === 'gemini' || state.arbitrator === 'gemini';
      if (needsGemini && !state.geminiAuth) {
        console.log();
        console.log(theme.dim(box.vertical) + ' ' + theme.primary('Gemini API') + theme.dim(' - Required for ' + (state.reviewer === 'gemini' ? 'review' : 'arbitration')));
        console.log(theme.dim(box.vertical));

        try {
          const success = await authenticateGemini();
          if (success) {
            printSuccess('Gemini API ready');
            state.geminiAuth = true;
          } else {
            printWarning('Gemini API not authenticated - arbitration disabled');
            state.enableArbitration = false;
          }
        } catch (err) {
          printError(err instanceof Error ? err.message : 'Authentication failed');
          state.enableArbitration = false;
        }
      }

      // Authenticate Grok if needed for reviewer or arbitrator
      const needsGrok = state.reviewer === 'grok' || state.arbitrator === 'grok';
      if (needsGrok && !state.grokAuth) {
        console.log();
        console.log(theme.dim(box.vertical) + ' ' + theme.primary('Grok API') + theme.dim(' - Required for ' + (state.reviewer === 'grok' ? 'review' : 'arbitration')));
        console.log(theme.dim(box.vertical));

        try {
          const success = await authenticateGrok();
          if (success) {
            printSuccess('Grok API ready');
            state.grokAuth = true;
          } else {
            printWarning('Grok API not authenticated');
            if (state.reviewer === 'grok') {
              printWarning('Falling back to OpenAI as reviewer');
              state.reviewer = 'openai';
            }
            if (state.arbitrator === 'grok') {
              state.enableArbitration = false;
            }
          }
        } catch (err) {
          printError(err instanceof Error ? err.message : 'Authentication failed');
          if (state.reviewer === 'grok') {
            state.reviewer = 'openai';
          }
          if (state.arbitrator === 'grok') {
            state.enableArbitration = false;
          }
        }
      }
    }

    // Also check if reviewer is gemini and we need to auth
    if (state.reviewer === 'gemini' && !state.geminiAuth) {
      console.log();
      console.log(theme.dim(box.vertical) + ' ' + theme.primary('Gemini API') + theme.dim(' - Required for review'));
      console.log(theme.dim(box.vertical));

      try {
        const success = await authenticateGemini();
        if (success) {
          printSuccess('Gemini API ready');
          state.geminiAuth = true;
        } else {
          printWarning('Gemini API not authenticated - falling back to OpenAI');
          state.reviewer = 'openai';
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Authentication failed');
        state.reviewer = 'openai';
      }
    }

    // Also check if reviewer is grok and we need to auth
    if (state.reviewer === 'grok' && !state.grokAuth) {
      console.log();
      console.log(theme.dim(box.vertical) + ' ' + theme.primary('Grok API') + theme.dim(' - Required for review'));
      console.log(theme.dim(box.vertical));

      try {
        const success = await authenticateGrok();
        if (success) {
          printSuccess('Grok API ready');
          state.grokAuth = true;
        } else {
          printWarning('Grok API not authenticated - falling back to OpenAI');
          state.reviewer = 'openai';
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Authentication failed');
        state.reviewer = 'openai';
      }
    }

    // Save the configuration to persist between sessions
    await saveConsensusConfig(state);

    // Show summary
    console.log();
    console.log(theme.secondary('  Configuration saved. Use /config to change later.'));
    const reviewerName = state.reviewer === 'openai' ? 'OpenAI (GPT-4o)' : state.reviewer === 'grok' ? 'Grok' : 'Gemini';
    const arbitratorName = state.arbitrator === 'openai' ? 'OpenAI' : state.arbitrator === 'grok' ? 'Grok' : 'Gemini';
    console.log(`    ${theme.dim('Reviewer:')}    ${theme.primary(reviewerName)}`);
    console.log(`    ${theme.dim('Arbitrator:')}  ${state.enableArbitration ? theme.primary(arbitratorName) : theme.dim('Disabled')}`);
    console.log();
  } else if (state.claudeAuth && state.openaiAuth && alreadyConfigured) {
    // Show loaded configuration
    console.log();
    console.log(theme.secondary('  Using saved configuration (use /config to change):'));
    const savedReviewerName = state.reviewer === 'openai' ? 'OpenAI (GPT-4o)' : state.reviewer === 'grok' ? 'Grok' : 'Gemini';
    const savedArbitratorName = state.arbitrator === 'openai' ? 'OpenAI' : state.arbitrator === 'grok' ? 'Grok' : 'Gemini';
    console.log(`    ${theme.dim('Reviewer:')}    ${theme.primary(savedReviewerName)}`);
    console.log(`    ${theme.dim('Arbitrator:')}  ${state.enableArbitration ? theme.primary(savedArbitratorName) : theme.dim('Disabled')}`);
    console.log();

    // Authenticate Gemini if needed based on saved config
    const needsGemini = state.reviewer === 'gemini' || (state.enableArbitration && state.arbitrator === 'gemini');
    if (needsGemini && !state.geminiAuth) {
      console.log(theme.dim(box.vertical) + ' ' + theme.primary('Gemini API') + theme.dim(' - Required for ' + (state.reviewer === 'gemini' ? 'review' : 'arbitration')));
      console.log(theme.dim(box.vertical));

      try {
        const success = await authenticateGemini();
        if (success) {
          printSuccess('Gemini API ready');
          state.geminiAuth = true;
        } else {
          printWarning('Gemini API not authenticated');
          if (state.reviewer === 'gemini') {
            printWarning('Falling back to OpenAI as reviewer');
            state.reviewer = 'openai';
          }
          if (state.enableArbitration && state.arbitrator === 'gemini') {
            printWarning('Disabling arbitration');
            state.enableArbitration = false;
          }
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Gemini authentication failed');
      }
      console.log();
    }

    // Authenticate Grok if needed based on saved config
    const needsGrok = state.reviewer === 'grok' || (state.enableArbitration && state.arbitrator === 'grok');
    if (needsGrok && !state.grokAuth) {
      console.log(theme.dim(box.vertical) + ' ' + theme.primary('Grok API') + theme.dim(' - Required for ' + (state.reviewer === 'grok' ? 'review' : 'arbitration')));
      console.log(theme.dim(box.vertical));

      try {
        const success = await authenticateGrok();
        if (success) {
          printSuccess('Grok API ready');
          state.grokAuth = true;
        } else {
          printWarning('Grok API not authenticated');
          if (state.reviewer === 'grok') {
            printWarning('Falling back to OpenAI as reviewer');
            state.reviewer = 'openai';
          }
          if (state.enableArbitration && state.arbitrator === 'grok') {
            printWarning('Disabling arbitration');
            state.enableArbitration = false;
          }
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Grok authentication failed');
      }
      console.log();
    }
  }

  return state.claudeAuth && state.openaiAuth;
}

/**
 * Display help
 */
function showHelp(): void {
  console.log();
  console.log(theme.primary.bold('  Commands:'));
  console.log();

  const commands = [
    ['/help', 'Show this help message'],
    ['/info', 'Show system info (Claude CLI status, etc.)'],
    ['/status', 'Show current project status'],
    ['/auth', 'Re-authenticate services'],
    ['/config', 'Show/change configuration'],
    ['/config reviewer', 'Set reviewer (openai/gemini/grok)'],
    ['/config arbitrator', 'Set arbitrator (openai/gemini/grok/off)'],
    ['/lang <lang>', 'Set language (be/fe/fs/web/all)'],
    ['/model [provider] [model]', 'Show/set AI model (openai/gemini/grok)'],
    ['/upgrade [target]', 'Upgrade project type (e.g., fullstack -> all)'],
    ['/new <idea>', 'Force start a new project (skips existing check)'],
    ['/resume', 'Resume interrupted project'],
    ['/overview [fix]', 'Project review with analysis; fix to auto-discover docs'],
    ['/db [action]', 'Database management (status/configure/apply)'],
    ['/doctor', 'Run database and project readiness checks'],
    ['/review', 'Run post-build audit/review with findings and recovery'],
    ['/debug', 'Start interactive debugging session (use /back to return)'],
    ['/clear', 'Clear screen'],
    ['/exit', 'Exit Popeye'],
  ];

  for (const [cmd, desc] of commands) {
    console.log(`  ${theme.primary(cmd.padEnd(20))} ${theme.dim(desc)}`);
  }

  console.log();
  console.log(theme.secondary('  Type your project idea to get started!'));
  console.log(theme.secondary('  Example: "A REST API for managing todo items"'));
  console.log();
}

/**
 * Handle /info command - show system info
 */
async function handleInfo(): Promise<void> {
  console.log();
  console.log(theme.primary.bold('  System Info:'));
  console.log();

  // Check Claude CLI
  const claudeInstalled = await isClaudeCLIInstalled();
  const claudeStatus = await checkClaudeCLIAuth();

  console.log(theme.secondary('  Claude Code:'));
  console.log(`    ${theme.dim('Installed:')}      ${claudeInstalled ? theme.success('Yes') : theme.error('No')}`);

  if (claudeInstalled) {
    console.log(`    ${theme.dim('Authenticated:')}  ${claudeStatus.authenticated ? theme.success('Yes') : theme.warning('No')}`);
    console.log(`    ${theme.dim('Model:')}          ${theme.primary('Uses your Claude Code settings')}`);
    console.log(`    ${theme.dim('MCPs:')}           ${theme.primary('Uses your configured MCP servers')}`);

    if (!claudeStatus.authenticated) {
      console.log();
      console.log(`    ${theme.warning('Run:')} ${theme.primary('claude login')} ${theme.warning('to authenticate')}`);
    }
  } else {
    console.log();
    console.log(`    ${theme.warning('Install:')} ${theme.primary('npm install -g @anthropic-ai/claude-code')}`);
  }

  console.log();
  console.log(theme.secondary('  OpenAI:'));
  const authStatus = await getAuthStatusForDisplay();
  console.log(`    ${theme.dim('Authenticated:')}  ${authStatus.openai.authenticated ? theme.success('Yes') : theme.warning('No')}`);
  if (authStatus.openai.authenticated && authStatus.openai.keyLastFour) {
    console.log(`    ${theme.dim('API Key:')}        ${theme.dim(authStatus.openai.keyLastFour)}`);
  }

  console.log();
  console.log(theme.secondary('  Gemini:'));
  const geminiStatus = await checkGeminiAuth();
  console.log(`    ${theme.dim('Authenticated:')}  ${geminiStatus.authenticated ? theme.success('Yes') : theme.dim('No')}`);
  if (geminiStatus.authenticated && geminiStatus.keyLastFour) {
    console.log(`    ${theme.dim('API Key:')}        ${theme.dim(geminiStatus.keyLastFour)}`);
  }

  console.log();
  console.log(theme.secondary('  Grok:'));
  const grokStatus = await checkGrokAuth();
  console.log(`    ${theme.dim('Authenticated:')}  ${grokStatus.authenticated ? theme.success('Yes') : theme.dim('No')}`);
  if (grokStatus.authenticated && grokStatus.keyLastFour) {
    console.log(`    ${theme.dim('API Key:')}        ${theme.dim(grokStatus.keyLastFour)}`);
  }

  console.log();
  console.log(theme.secondary('  Environment:'));
  console.log(`    ${theme.dim('Node.js:')}        ${process.version}`);
  console.log(`    ${theme.dim('Platform:')}       ${process.platform}`);
  console.log(`    ${theme.dim('Working Dir:')}    ${process.cwd()}`);
  console.log();

  console.log(theme.dim('  Tip: Claude Code model and MCP settings are configured in your'));
  console.log(theme.dim('  Claude Code CLI. Run "claude config" to see/change them.'));
  console.log();
}

/**
 * Handle a command or idea
 */
async function handleInput(input: string, state: SessionState): Promise<boolean> {
  const trimmed = input.trim();

  if (!trimmed) return true;

  // Check for common words that should be commands (without /)
  const lowerTrimmed = trimmed.toLowerCase();
  if (['help', 'exit', 'quit', 'info', 'status', 'config'].includes(lowerTrimmed)) {
    printWarning(`Did you mean /${lowerTrimmed}? Use / prefix for commands.`);
    return true;
  }

  // Handle commands
  if (trimmed.startsWith('/')) {
    const [cmd, ...args] = trimmed.split(/\s+/);
    const command = cmd.toLowerCase();

    switch (command) {
      case '/help':
      case '/h':
      case '/?':
        showHelp();
        break;

      case '/info':
      case '/check':
        await handleInfo();
        break;

      case '/exit':
      case '/quit':
      case '/q':
        console.log();
        printInfo('Goodbye!');
        return false;

      case '/clear':
      case '/cls':
        redrawUI(state);
        break;

      case '/status':
        await handleStatus(state);
        break;

      case '/auth':
        await ensureAuthentication(state);
        break;

      case '/config':
        await handleConfig(state, args);
        break;

      case '/language':
      case '/lang':
      case '/l':
        handleLanguage(args, state);
        break;

      case '/model':
      case '/m':
        handleModel(args, state);
        break;

      case '/resume':
        await handleResume(state, args);
        break;

      case '/upgrade':
        await handleUpgrade(state, args);
        break;

      case '/overview':
        await handleOverview(state, args);
        break;

      case '/new':
        // Force start a new project even if existing projects found
        if (args.length === 0) {
          printError('Usage: /new <project idea>');
          printInfo('Example: /new todo app with user authentication');
        } else {
          await handleNewProject(args.join(' '), state);
        }
        break;

      case '/db':
        await handleDbSlashCommand(state, args);
        break;

      case '/doctor':
        await handleDoctorSlashCommand(state);
        break;

      case '/review':
      case '/audit':
        await handleReviewSlashCommand(state, args);
        break;

      case '/debug':
      case '/dbg':
        await handleDebugSlashCommand(state);
        break;

      default:
        printError(`Unknown command: ${cmd}`);
        printInfo('Type /help for available commands');
    }

    return true;
  }

  // Warn if input is too short (likely accidental)
  if (trimmed.length < 10) {
    printWarning(`Input "${trimmed}" is very short. Did you mean to type a command?`);
    printInfo('Type /help for commands, or enter a longer project description.');
    return true;
  }

  // Handle as project idea
  await handleIdea(trimmed, state);
  return true;
}

/**
 * Handle /status command
 */
async function handleStatus(state: SessionState): Promise<void> {
  console.log();

  if (!state.projectDir) {
    printInfo('No active project');
    return;
  }

  const status = await getWorkflowStatus(state.projectDir);

  if (!status.exists) {
    printInfo('No project found in current directory');
    printKeyValue('Directory', state.projectDir);
    return;
  }

  const summary = await getWorkflowSummary(state.projectDir);
  console.log(summary);
}

/**
 * Handle /db slash command - database management
 */
async function handleDbSlashCommand(state: SessionState, args: string[]): Promise<void> {
  if (!state.projectDir) {
    printError('No active project. Create or resume a project first.');
    return;
  }

  const action = args[0] || 'status';

  switch (action) {
    case 'status': {
      try {
        const { loadProject } = await import('../state/index.js');
        const { DEFAULT_DB_CONFIG } = await import('../types/database.js');
        const projectState = await loadProject(state.projectDir);
        const dbConfig = projectState.dbConfig || { ...DEFAULT_DB_CONFIG, designed: false };

        console.log();
        printInfo('Database Status:');
        console.log(`  Designed:     ${dbConfig.designed ? 'Yes' : 'No'}`);
        console.log(`  Status:       ${dbConfig.status}`);
        console.log(`  Mode:         ${dbConfig.mode || 'not set'}`);
        console.log(`  Vector:       ${dbConfig.vectorRequired ? 'Yes' : 'No'}`);
        console.log(`  Migrations:   ${dbConfig.migrationsApplied}`);
        if (dbConfig.lastError) {
          printError(`  Last Error:   ${dbConfig.lastError}`);
        }
        console.log();
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Failed to load project state');
      }
      break;
    }
    case 'configure': {
      printInfo('Use "popeye db configure" from the CLI for interactive configuration.');
      printInfo('Or set DATABASE_URL in apps/backend/.env manually.');
      break;
    }
    case 'apply': {
      printInfo('Use "popeye db apply" from the CLI to run the setup pipeline.');
      break;
    }
    default:
      printError(`Unknown db action: ${action}`);
      printInfo('Usage: /db [status|configure|apply]');
  }
}

/**
 * Handle /doctor slash command - readiness checks
 */
async function handleDoctorSlashCommand(state: SessionState): Promise<void> {
  if (!state.projectDir) {
    printError('No active project. Create or resume a project first.');
    return;
  }

  try {
    const { runDoctorChecks } = await import('./commands/doctor.js');

    console.log();
    printInfo('Running readiness checks...');
    console.log();

    const result = await runDoctorChecks(state.projectDir);

    for (const check of result.checks) {
      const label = check.passed ? '[PASS]' : check.severity === 'info' ? '[SKIP]' : '[FAIL]';
      if (check.passed) {
        printSuccess(`  ${label} ${check.name}: ${check.message}`);
      } else if (check.severity === 'info') {
        printInfo(`  ${label} ${check.name}: ${check.message}`);
      } else if (check.severity === 'warning') {
        printWarning(`  ${label} ${check.name}: ${check.message}`);
      } else {
        printError(`  ${label} ${check.name}: ${check.message}`);
      }
    }

    console.log();
    if (result.healthy) {
      printSuccess('All critical checks passed.');
    } else {
      printWarning('Some critical checks failed. See above for details.');
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Doctor checks failed');
  }
}

/**
 * Handle /review or /audit slash command - post-build project audit
 */
async function handleReviewSlashCommand(state: SessionState, args: string[] = []): Promise<void> {
  if (!state.projectDir) {
    printError('No active project. Create or resume a project first.');
    return;
  }

  // Parse CLI-style flags from args
  const options: {
    depth?: number;
    strict?: boolean;
    format?: 'json' | 'md' | 'both';
    recover?: boolean;
    target?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--depth' || arg === '-d') && args[i + 1]) {
      options.depth = parseInt(args[++i], 10);
    } else if (arg === '--strict' || arg === '-s') {
      options.strict = true;
    } else if ((arg === '--format' || arg === '-f') && args[i + 1]) {
      options.format = args[++i] as 'json' | 'md' | 'both';
    } else if (arg === '--no-recover') {
      options.recover = false;
    } else if (arg === '--recover') {
      options.recover = true;
    } else if ((arg === '--target' || arg === '-t') && args[i + 1]) {
      options.target = args[++i];
    }
  }

  try {
    // Check if project is pipeline-managed — route through bridge
    const { loadProject } = await import('../state/index.js');
    const projectState = await loadProject(state.projectDir);
    const { isPipelineManaged, runReviewBridge } = await import('../pipeline/bridges/review-bridge.js');

    if (isPipelineManaged(projectState)) {
      printInfo('Pipeline-managed project detected — routing through pipeline bridge');
      console.log();

      const bridgeResult = await runReviewBridge({
        projectDir: state.projectDir,
        depth: options.depth,
        strict: options.strict,
        onProgress: (_stage, msg) => printInfo(msg),
      });

      if (bridgeResult.success) {
        printSuccess(`Audit score: ${bridgeResult.overallScore}% — ${bridgeResult.recommendation}`);
        printInfo(`${bridgeResult.findingsCount} finding(s), ${bridgeResult.changeRequestCount} CR(s) created, ${bridgeResult.artifactsCreated} artifact(s) stored`);
        if (bridgeResult.changeRequestCount > 0) {
          printInfo('Change Requests filed — run /resume to let the pipeline process them');
        }
      } else {
        printError(bridgeResult.error ?? 'Review bridge failed');
      }
      return;
    }

    // Non-pipeline project — use legacy audit-mode
    const { runReview } = await import('./commands/review.js');

    console.log();
    await runReview(state.projectDir, options);
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Audit failed');
  }
}

/**
 * Handle /debug slash command - start interactive debugging session
 */
async function handleDebugSlashCommand(state: SessionState): Promise<void> {
  if (!state.projectDir) {
    printError('No active project. Create or resume a project first.');
    return;
  }

  try {
    const { runDebugSession } = await import('./commands/debug.js');
    await runDebugSession({
      projectDir: state.projectDir,
      language: state.language,
    });
    printInfo('Returned to main Popeye session.');
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Debug session failed');
  }
}

/**
 * Handle /overview command - full project plan and milestone review
 */
async function handleOverview(state: SessionState, args: string[] = []): Promise<void> {
  if (!state.projectDir) {
    printInfo('No active project. Start or resume a project first.');
    return;
  }

  const subcommand = args[0]?.toLowerCase();

  try {
    if (subcommand === 'fix') {
      // Run fix mode: re-discover docs, find brand assets, update website content
      const { fixOverviewIssues, generateOverview, formatOverview } = await import('../workflow/overview.js');

      printInfo('Running overview fix...');
      const fixResult = await fixOverviewIssues(state.projectDir, (msg) => {
        printInfo(msg);
      });

      // Show fix results
      console.log('');
      for (const msg of fixResult.messages) {
        printInfo(msg);
      }
      console.log('');

      // Show updated overview after fix
      const overview = await generateOverview(state.projectDir);
      console.log(formatOverview(overview));
    } else {
      // Display-only mode: show overview with analysis
      const { generateOverview, formatOverview } = await import('../workflow/overview.js');
      const overview = await generateOverview(state.projectDir);
      console.log(formatOverview(overview));
    }
  } catch (error) {
    printInfo(`Could not generate overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle /config command
 */
async function handleConfig(state: SessionState, args: string[] = []): Promise<void> {
  const config = await loadConfig();

  // Handle config subcommands
  if (args.length > 0) {
    const subcommand = args[0].toLowerCase();

    switch (subcommand) {
      case 'reviewer':
        if (args.length > 1) {
          const newReviewer = args[1].toLowerCase();
          if (newReviewer === 'openai' || newReviewer === 'gemini' || newReviewer === 'grok') {
            if (newReviewer === 'gemini' && !state.geminiAuth) {
              printWarning('Gemini API not authenticated. Run /auth first.');
              return;
            }
            if (newReviewer === 'grok' && !state.grokAuth) {
              printWarning('Grok API not authenticated. Run /auth first.');
              return;
            }
            state.reviewer = newReviewer as AIProvider;
            // Save to config
            await saveConsensusConfig(state);
            printSuccess(`Reviewer set to ${newReviewer}`);
          } else {
            printError('Invalid reviewer. Use: openai, gemini, or grok');
          }
        } else {
          printKeyValue('Reviewer', state.reviewer);
          printInfo('Use: /config reviewer <openai|gemini|grok>');
        }
        return;

      case 'arbitrator':
        if (args.length > 1) {
          const newArbitrator = args[1].toLowerCase();
          if (newArbitrator === 'openai' || newArbitrator === 'gemini' || newArbitrator === 'grok') {
            if (newArbitrator === 'gemini' && !state.geminiAuth) {
              printWarning('Gemini API not authenticated. Run /auth first.');
              return;
            }
            if (newArbitrator === 'grok' && !state.grokAuth) {
              printWarning('Grok API not authenticated. Run /auth first.');
              return;
            }
            state.arbitrator = newArbitrator as AIProvider;
            state.enableArbitration = true;
            // Save to config
            await saveConsensusConfig(state);
            printSuccess(`Arbitrator set to ${newArbitrator}`);
          } else if (newArbitrator === 'off' || newArbitrator === 'none') {
            state.enableArbitration = false;
            // Save to config
            await saveConsensusConfig(state);
            printSuccess('Arbitration disabled');
          } else {
            printError('Invalid arbitrator. Use: openai, gemini, grok, or off');
          }
        } else {
          printKeyValue('Arbitrator', state.enableArbitration ? state.arbitrator : 'disabled');
          printInfo('Use: /config arbitrator <openai|gemini|grok|off>');
        }
        return;

      case 'language':
      case 'lang':
        if (args.length > 1) {
          // Map shortcuts to full language names
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
          const input = args[1].toLowerCase();
          const lang = langAliases[input];
          if (lang) {
            state.language = lang;
            printSuccess(`Language set to ${lang}`);
          } else {
            printError('Invalid language. Use: be, fe, fs, web, all (or python, typescript, fullstack, website, all)');
          }
        } else {
          printKeyValue('Language', state.language);
        }
        return;

      case 'model':
        handleModel(args.slice(1), state);
        return;

      default:
        printError(`Unknown config option: ${subcommand}`);
        printInfo('Options: reviewer, arbitrator, language, model');
        return;
    }
  }

  // Show full config
  console.log();
  console.log(theme.primary.bold('  Session:'));
  console.log(`    ${theme.dim('Directory:')}  ${state.projectDir || 'Not set'}`);
  console.log(`    ${theme.dim('Language:')}   ${theme.primary(state.language)}`);
  console.log();
  console.log(theme.primary.bold('  Authentication:'));
  console.log(`    ${theme.dim('Claude:')}     ${state.claudeAuth ? theme.success('● Ready') : theme.error('○ Not authenticated')}`);
  console.log(`    ${theme.dim('OpenAI:')}     ${state.openaiAuth ? theme.success('● Ready') : theme.error('○ Not authenticated')}`);
  console.log(`    ${theme.dim('Gemini:')}     ${state.geminiAuth ? theme.success('● Ready') : theme.dim('○ Not configured')}`);
  console.log(`    ${theme.dim('Grok:')}       ${state.grokAuth ? theme.success('● Ready') : theme.dim('○ Not configured')}`);
  console.log();
  console.log(theme.primary.bold('  AI Configuration:'));
  const configReviewerName = state.reviewer === 'openai' ? `OpenAI (${state.openaiModel})` : state.reviewer === 'grok' ? `Grok (${state.grokModel})` : `Gemini (${state.geminiModel})`;
  const configArbitratorName = state.arbitrator === 'openai' ? 'OpenAI' : state.arbitrator === 'grok' ? 'Grok' : 'Gemini';
  console.log(`    ${theme.dim('Reviewer:')}   ${theme.primary(configReviewerName)}`);
  console.log(`    ${theme.dim('Arbitrator:')} ${state.enableArbitration ? theme.primary(configArbitratorName) : theme.dim('Disabled')}`);
  console.log();
  console.log(theme.primary.bold('  Models:'));
  console.log(`    ${theme.dim('OpenAI:')}     ${theme.primary(state.openaiModel)}`);
  console.log(`    ${theme.dim('Gemini:')}     ${theme.primary(state.geminiModel)}`);
  console.log(`    ${theme.dim('Grok:')}       ${theme.primary(state.grokModel)}`);
  console.log();
  console.log(theme.primary.bold('  Consensus:'));
  console.log(`    ${theme.dim('Threshold:')}  ${config.consensus.threshold}%`);
  console.log(`    ${theme.dim('Max Iters:')}  ${config.consensus.max_disagreements}`);
  console.log();
  console.log(theme.secondary('  Change settings:'));
  console.log(theme.dim('    /config reviewer <openai|gemini|grok>'));
  console.log(theme.dim('    /config arbitrator <openai|gemini|grok|off>'));
  console.log(theme.dim('    /config language <be|fe|fs|web|all>'));
  console.log(theme.dim('    /config model <provider> <model>'));
  console.log();
}

/**
 * Handle /language command
 */
function handleLanguage(args: string[], state: SessionState): void {
  if (args.length === 0) {
    console.log();
    printKeyValue('Current language', state.language);
    printInfo('Use /language <be|fe|fs|web|all> to change');
    console.log(theme.dim('    be/backend   - Python (FastAPI)'));
    console.log(theme.dim('    fe/frontend  - TypeScript (React/Vite)'));
    console.log(theme.dim('    fs/fullstack - FE + BE monorepo'));
    console.log(theme.dim('    web/website  - Next.js marketing site'));
    console.log(theme.dim('    all          - FE + BE + Website'));
    return;
  }

  // Map shortcuts to full language names
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

  const input = args[0].toLowerCase();
  const lang = langAliases[input];

  if (!lang) {
    printError('Invalid language. Use: be, fe, fs, web, all');
    return;
  }

  state.language = lang;
  console.log();
  printSuccess(`Language set to ${lang}`);
}

/**
 * Available models per provider for display
 */
const KNOWN_MODELS: Record<string, readonly string[]> = {
  openai: KNOWN_OPENAI_MODELS,
  gemini: KNOWN_GEMINI_MODELS,
  grok: KNOWN_GROK_MODELS,
};

/**
 * Handle /model command - multi-provider model switching
 */
function handleModel(args: string[], state: SessionState): void {
  // /model (no args) -> show all provider models
  if (args.length === 0) {
    console.log();
    console.log(theme.primary.bold('  Models:'));
    console.log(`    ${theme.dim('OpenAI:')}  ${theme.primary(state.openaiModel)}`);
    console.log(`    ${theme.dim('Gemini:')}  ${theme.primary(state.geminiModel)}`);
    console.log(`    ${theme.dim('Grok:')}    ${theme.primary(state.grokModel)}`);
    console.log();
    console.log(theme.secondary('  Usage:'));
    console.log(theme.dim('    /model <provider> <model>    Set model for provider'));
    console.log(theme.dim('    /model <provider> list       Show available models'));
    console.log(theme.dim('    /model <openai-model>        Set OpenAI model (shortcut)'));
    return;
  }

  const firstArg = args[0].toLowerCase();

  // Check if first arg is a provider
  if (firstArg === 'openai' || firstArg === 'gemini' || firstArg === 'grok') {
    const provider = firstArg;

    // /model <provider> or /model <provider> list -> show known models
    if (args.length === 1 || args[1]?.toLowerCase() === 'list') {
      console.log();
      const currentModel = provider === 'openai' ? state.openaiModel
        : provider === 'gemini' ? state.geminiModel : state.grokModel;
      console.log(theme.primary.bold(`  ${provider} models:`));
      console.log(`    ${theme.dim('Current:')} ${theme.primary(currentModel)}`);
      console.log(`    ${theme.dim('Known models:')}`);
      for (const m of KNOWN_MODELS[provider]) {
        const marker = m === currentModel ? theme.success(' (active)') : '';
        console.log(`      ${theme.secondary(m)}${marker}`);
      }
      console.log();
      console.log(theme.dim('    Custom models are also accepted (e.g., gpt-5, gemini-2.5-pro)'));
      return;
    }

    // /model <provider> <model> -> set model (warn if unknown but accept)
    const newModel = args[1];

    if (!newModel || newModel.length === 0) {
      printError('Model name must not be empty.');
      return;
    }

    const isKnown = KNOWN_MODELS[provider].includes(newModel);

    if (provider === 'openai') {
      state.openaiModel = newModel;
    } else if (provider === 'gemini') {
      state.geminiModel = newModel;
    } else if (provider === 'grok') {
      state.grokModel = newModel;
    }

    console.log();
    if (isKnown) {
      printSuccess(`${provider} model set to ${newModel}`);
    } else {
      printSuccess(`${provider} model set to ${newModel}`);
      printInfo(`Note: '${newModel}' is not in the known models list. Make sure it's a valid ${provider} model.`);
    }
    return;
  }

  // Backward compat: /model <known-openai-model> (auto-detect known OpenAI model name)
  if ((KNOWN_OPENAI_MODELS as readonly string[]).includes(firstArg)) {
    state.openaiModel = firstArg;
    console.log();
    printSuccess(`OpenAI model set to ${firstArg}`);
    return;
  }

  printError(`Unknown provider: ${firstArg}`);
  printInfo('Use: /model <openai|gemini|grok> <model>');
}

/**
 * Handle /upgrade command - upgrade project type
 */
async function handleUpgrade(state: SessionState, args: string[]): Promise<void> {
  if (!state.projectDir) {
    printError('No active project. Start or resume a project first.');
    return;
  }

  // Load current state to get language
  const status = await getWorkflowStatus(state.projectDir);
  if (!status.exists || !status.state) {
    printError('No project state found in current directory.');
    return;
  }

  const currentLanguage = status.state.language;
  const validTargets = getValidUpgradeTargets(currentLanguage);

  if (validTargets.length === 0) {
    printInfo(`Project type '${currentLanguage}' is already at maximum scope. No upgrades available.`);
    return;
  }

  // Determine target
  let targetLanguage: OutputLanguage | null = null;

  if (args.length > 0) {
    const langAliases: Record<string, OutputLanguage> = {
      'py': 'python', 'python': 'python', 'be': 'python', 'backend': 'python',
      'ts': 'typescript', 'typescript': 'typescript', 'fe': 'typescript', 'frontend': 'typescript',
      'fs': 'fullstack', 'fullstack': 'fullstack',
      'web': 'website', 'website': 'website',
      'all': 'all',
    };
    const resolved = langAliases[args[0].toLowerCase()];
    if (resolved && validTargets.includes(resolved)) {
      targetLanguage = resolved;
    } else if (resolved) {
      printError(`Cannot upgrade from '${currentLanguage}' to '${resolved}'.`);
      printInfo(`Valid targets: ${validTargets.join(', ')}`);
      return;
    } else {
      printError(`Unknown target: ${args[0]}`);
      printInfo(`Valid targets: ${validTargets.join(', ')}`);
      return;
    }
  } else {
    // Prompt selection
    const target = await promptSelection(
      `Upgrade '${currentLanguage}' project to:`,
      validTargets.map((t) => {
        const details = getTransitionDetails(currentLanguage, t);
        return {
          value: t,
          label: `${t} - ${details?.description || ''}`,
        };
      }),
      validTargets[0],
    );
    targetLanguage = target as OutputLanguage;
  }

  if (!targetLanguage) return;

  const transition = getTransitionDetails(currentLanguage, targetLanguage);
  if (!transition) return;

  // Show dry-run summary
  console.log();
  console.log(theme.primary.bold('  Upgrade Summary:'));
  console.log(`    ${theme.dim('From:')}          ${theme.primary(currentLanguage)}`);
  console.log(`    ${theme.dim('To:')}            ${theme.primary(targetLanguage)}`);
  console.log(`    ${theme.dim('New apps:')}      ${transition.newApps.join(', ') || 'none'}`);
  console.log(`    ${theme.dim('Restructure:')}   ${transition.requiresRestructure ? 'Yes - code will be moved to apps/' : 'No'}`);
  console.log(`    ${theme.dim('Description:')}   ${transition.description}`);
  console.log();

  // Confirm
  const confirmed = await promptYesNo(
    theme.primary('Proceed with upgrade?'),
    true,
  );

  if (!confirmed) {
    printInfo('Upgrade cancelled.');
    return;
  }

  // Execute upgrade
  console.log();
  startSpinner(`Upgrading ${currentLanguage} -> ${targetLanguage}...`);

  const result = await upgradeProject(state.projectDir, targetLanguage);

  if (result.success) {
    succeedSpinner(`Upgraded to ${targetLanguage}`);
    state.language = targetLanguage;

    console.log();
    if (result.filesCreated.length > 0) {
      printInfo(`Created ${result.filesCreated.length} new files`);
    }
    if (result.filesMoved.length > 0) {
      printInfo(`Moved ${result.filesMoved.length} items`);
    }
    printSuccess(`Project upgraded from '${currentLanguage}' to '${targetLanguage}'`);

    // Build upgrade context for planning
    console.log();
    startSpinner('Building expansion context...');

    const upgradeContext = await buildUpgradeContext(
      state.projectDir,
      transition,
      status.state!.idea || 'Project expansion',
      currentLanguage,
    );

    succeedSpinner('Expansion context ready');

    // Show what will be planned
    console.log();
    console.log(theme.primary.bold('  Expansion Planning:'));
    console.log(`    ${theme.dim('Existing apps:')}  ${upgradeContext.existingApps.join(', ')} (already built)`);
    console.log(`    ${theme.dim('New apps:')}       ${upgradeContext.newApps.join(', ')} (will be planned)`);
    console.log();

    // Ask user if they want to start planning now
    const startPlanning = await promptYesNo(
      theme.primary('Start planning the new apps now?'),
      true,
    );

    if (!startPlanning) {
      printInfo('You can start planning later with /resume');
      return;
    }

    // Reset state to plan phase so workflow re-plans for the expanded project
    // This clears old plan/milestones but keeps the idea and project metadata
    await resetWorkflow(state.projectDir, 'plan');

    // Clear old specification so the idea gets re-expanded for the new project scope
    // The upgrade context will guide the planner to focus on new apps
    await storeSpecification(state.projectDir, '');

    console.log();
    printInfo('Starting expansion planning...');
    console.log();

    const workflowResult = await resumeWorkflow(state.projectDir, {
      consensusConfig: {
        reviewer: state.reviewer,
        arbitrator: state.arbitrator,
        enableArbitration: state.enableArbitration,
        openaiModel: state.openaiModel,
        geminiModel: state.geminiModel,
        grokModel: state.grokModel,
      },
      additionalContext: upgradeContext.summary,
      onProgress: (phase, message) => {
        console.log(`  ${theme.dim(`[${phase}]`)} ${message}`);
      },
    });

    console.log();
    if (workflowResult.success) {
      printSuccess('Expansion planning and implementation complete!');
      console.log(`    ${theme.dim('Location:')} ${state.projectDir}`);
    } else if (workflowResult.rateLimitPaused) {
      console.log(`  ${theme.warning('Rate Limit Reached')}`);
      console.log(`  ${theme.dim(workflowResult.error || 'API rate limit exceeded')}`);
      console.log();
      console.log(`  ${theme.info('Your progress has been saved.')}`);
      console.log(`  ${theme.dim('Run')} ${theme.highlight('/resume')} ${theme.dim('after the rate limit resets to continue.')}`);
    } else {
      printError(workflowResult.error || 'Expansion workflow failed');
      printInfo('Use /resume to retry.');
    }
  } else {
    failSpinner('Upgrade failed');
    printError(result.error || 'Unknown error during upgrade');
    printInfo('All changes have been rolled back.');
  }
}

/**
 * Prompt for additional context
 * Uses terminal: false to prevent echo issues when nested with main readline
 */
async function promptForContext(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false, // Prevent terminal mode to avoid echo issues
    });

    console.log();
    console.log(theme.primary(`  ${prompt}`));
    console.log(theme.dim('  (Press Enter to skip, or type your guidance)'));
    console.log();

    process.stdout.write('  > ');

    rl.once('line', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Discovered project context from docs/ folder
 */
interface DiscoveredProject {
  found: boolean;
  name?: string;
  idea?: string;
  plan?: string;
  planFile?: string;
  readme?: string;
  language?: OutputLanguage;
  hasCode: boolean;
  codeFiles: string[];
}

/**
 * Discover project context from docs/ and codebase
 */
async function discoverProjectContext(projectDir: string): Promise<DiscoveredProject> {
  const result: DiscoveredProject = {
    found: false,
    hasCode: false,
    codeFiles: [],
  };

  const docsDir = path.join(projectDir, 'docs');

  // Try to read plan files
  const planFiles = ['PLAN.md', 'PLAN-DRAFT.md'];
  for (const planFile of planFiles) {
    try {
      const planPath = path.join(docsDir, planFile);
      const content = await fs.readFile(planPath, 'utf-8');
      result.plan = content;
      result.planFile = planFile;
      result.found = true;

      // Try to extract project name from plan
      const nameMatch = content.match(/^#\s*(?:Development Plan|Project):\s*(.+)$/mi) ||
                       content.match(/^#\s*(.+)$/m);
      if (nameMatch) {
        result.name = nameMatch[1].replace(/Development Plan/i, '').trim();
      }

      // Try to extract idea/overview from plan
      const overviewMatch = content.match(/(?:Overview|Summary|Description)[:\s]*\n+([\s\S]*?)(?=\n#|\n\*\*|$)/i);
      if (overviewMatch) {
        result.idea = overviewMatch[1].trim().slice(0, 500);
      }
      break;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Try to read README
  try {
    const readmePath = path.join(projectDir, 'README.md');
    const content = await fs.readFile(readmePath, 'utf-8');
    result.readme = content;
    result.found = true;

    // Extract project name from README if not already found
    if (!result.name) {
      const nameMatch = content.match(/^#\s*(.+)$/m);
      if (nameMatch) {
        result.name = nameMatch[1].trim();
      }
    }

    // Extract idea from README if not found in plan
    if (!result.idea) {
      const lines = content.split('\n').slice(1, 10).join('\n').trim();
      if (lines.length > 20) {
        result.idea = lines.slice(0, 500);
      }
    }
  } catch {
    // README doesn't exist
  }

  // Scan for code files to detect language
  try {
    const files = await fs.readdir(projectDir, { recursive: true });
    const codeExtensions = {
      python: ['.py'],
      typescript: ['.ts', '.tsx', '.js', '.jsx'],
    };

    let pyCount = 0;
    let tsCount = 0;

    for (const file of files) {
      const fileName = String(file);
      if (fileName.includes('node_modules') || fileName.includes('.git') || fileName.includes('__pycache__')) {
        continue;
      }

      if (codeExtensions.python.some(ext => fileName.endsWith(ext))) {
        pyCount++;
        result.codeFiles.push(fileName);
      }
      if (codeExtensions.typescript.some(ext => fileName.endsWith(ext))) {
        tsCount++;
        result.codeFiles.push(fileName);
      }
    }

    result.hasCode = result.codeFiles.length > 0;

    // Determine language from code files
    if (pyCount > tsCount) {
      result.language = 'python';
    } else if (tsCount > 0) {
      result.language = 'typescript';
    }
  } catch {
    // Can't read directory
  }

  return result;
}

/**
 * Handle /resume command
 */
async function handleResume(state: SessionState, args: string[]): Promise<void> {
  if (!state.claudeAuth || !state.openaiAuth) {
    printError('Authentication required. Run /auth first.');
    return;
  }

  // Reason: If there's already an active project with pending work (e.g., from /review recovery),
  // skip project discovery and go straight to resuming.
  if (state.projectDir) {
    const activeStatus = await getWorkflowStatus(state.projectDir);
    if (activeStatus.exists && activeStatus.state) {
      const { phase, status: pStatus } = activeStatus.state;
      const hasPendingWork = phase !== 'complete' || pStatus !== 'complete';
      if (hasPendingWork) {
        printInfo(`Resuming active project: ${activeStatus.state.name}`);
        // Fall through to the resume logic below (skip discovery)
      }
    }
  }

  // Only discover projects if no active project with pending work
  if (!state.projectDir || (await getWorkflowStatus(state.projectDir)).state?.phase === 'complete') {
    // Discover all projects (registered + scanned in current directory)
    console.log();
    printInfo('Scanning for projects...');

    const { all: allProjects } = await discoverProjects(state.projectDir || process.cwd());

  // If projects found, let user select one
  if (allProjects.length > 0) {
    console.log();
    console.log(theme.primary.bold('  Found Projects:'));
    console.log();

    // Show project list with numbers
    const displayProjects = allProjects.slice(0, 10); // Limit to 10
    for (let i = 0; i < displayProjects.length; i++) {
      const project = displayProjects[i];
      const info = formatProjectForDisplay(project);
      const statusColor = project.status === 'complete' ? theme.success :
                         project.status === 'failed' ? theme.error :
                         project.status === 'in-progress' ? theme.warning : theme.dim;

      console.log(`    ${theme.primary(`${i + 1}.`)} ${theme.secondary(info.name)}`);
      console.log(`       ${statusColor(info.status)} ${theme.dim('|')} ${info.age}`);
      console.log(`       ${theme.dim(info.path)}`);
      if (project.idea) {
        console.log(`       ${theme.dim(project.idea.slice(0, 60))}${project.idea.length > 60 ? '...' : ''}`);
      }
      console.log();
    }

    if (allProjects.length > 10) {
      console.log(theme.dim(`    ... and ${allProjects.length - 10} more projects`));
      console.log();
    }

    // Let user select
    const selection = await promptSelection(
      'Select a project to resume:',
      [
        ...displayProjects.map((p, i) => ({
          value: String(i),
          label: `${p.name} (${formatProjectForDisplay(p).age})`,
        })),
        { value: 'scan', label: 'Scan for more projects...' },
        { value: 'cancel', label: 'Cancel' },
      ],
      '0'
    );

    if (selection === 'cancel') {
      printInfo('Cancelled');
      return;
    }

    if (selection === 'scan') {
      // Scan deeper in current directory
      printInfo('Scanning subdirectories...');
      const { all: deepScan } = await discoverProjects(state.projectDir || process.cwd());
      if (deepScan.length === allProjects.length) {
        printWarning('No additional projects found');
      } else {
        printSuccess(`Found ${deepScan.length - allProjects.length} additional projects`);
      }
      // Recursively call handleResume to show updated list
      await handleResume(state, args);
      return;
    }

    const selectedIndex = parseInt(selection, 10);
    const selectedProject = displayProjects[selectedIndex];

    if (!selectedProject) {
      printError('Invalid selection');
      return;
    }

    // Set the project directory and continue
    state.projectDir = selectedProject.path;
    console.log();
    printInfo(`Selected: ${selectedProject.name}`);
  }
  } // end: project discovery block

  // Now check for formal project state at the selected/current directory
  if (!state.projectDir) {
    printError('No project directory set');
    return;
  }

  // Check for popeye.md and load project-specific configuration
  const popeyeConfig = await readPopeyeConfig(state.projectDir);
  if (popeyeConfig) {
    applyPopeyeConfig(state, popeyeConfig);
    await updatePopeyeLastRun(state.projectDir);
    printInfo(`Loaded config from popeye.md (${popeyeConfig.language}, reviewer: ${popeyeConfig.reviewer})`);
  }

  const status = await getWorkflowStatus(state.projectDir);

  if (status.exists && status.state) {
    // Formal project state exists - analyze actual progress before resuming
    // Update session state to reflect project's language (preserves language on resume)
    state.language = status.state.language;

    // Get detailed progress analysis
    const progressAnalysis = await analyzeProjectProgress(state.projectDir);
    const verification = await verifyProjectCompletion(state.projectDir);

    console.log();
    console.log(theme.primary.bold('  Project Status:'));
    console.log(`    ${theme.dim('Name:')}      ${status.state.name}`);
    console.log(`    ${theme.dim('Language:')}  ${theme.primary(status.state.language)}`);
    console.log(`    ${theme.dim('Phase:')}     ${theme.primary(status.state.phase)}`);
    console.log(`    ${theme.dim('Status:')}    ${status.state.status}`);

    // Show detailed progress comparison
    console.log();
    console.log(theme.primary.bold('  Progress Analysis:'));
    console.log(`    ${theme.dim('Milestones:')} ${progressAnalysis.completedMilestones}/${progressAnalysis.totalMilestones} complete`);
    console.log(`    ${theme.dim('Tasks:')}      ${progressAnalysis.completedTasks}/${progressAnalysis.totalTasks} complete (${progressAnalysis.percentComplete}%)`);

    if (progressAnalysis.inProgressTasks > 0) {
      console.log(`    ${theme.dim('In Progress:')} ${theme.warning(String(progressAnalysis.inProgressTasks))} task(s)`);
    }
    if (progressAnalysis.failedTasks > 0) {
      console.log(`    ${theme.dim('Failed:')}     ${theme.error(String(progressAnalysis.failedTasks))} task(s)`);
    }
    if (progressAnalysis.pendingTasks > 0) {
      console.log(`    ${theme.dim('Pending:')}    ${progressAnalysis.pendingTasks} task(s)`);
    }

    // Show build verification status
    const projectExplicitlyCompleted = status.state.status === 'complete' && status.state.phase === 'complete';
    const buildLabel = getBuildLabel(status.state.language);
    if (projectExplicitlyCompleted) {
      console.log(`    ${theme.dim('Build:')}      ${theme.success(`${buildLabel} build passed`)}`);
    } else if (status.state.error && /build/i.test(status.state.error)) {
      console.log(`    ${theme.dim('Build:')}      ${theme.error(`${buildLabel} build failed`)}`);
    } else if (verification.isComplete && !projectExplicitlyCompleted) {
      console.log(`    ${theme.dim('Build:')}      ${theme.warning(`${buildLabel} build not verified`)}`);
    }

    // Show plan file comparison
    if (progressAnalysis.planTaskCount > 0) {
      console.log();
      console.log(theme.primary.bold('  Plan Comparison (from docs/PLAN.md):'));
      console.log(`    ${theme.dim('Plan Tasks:')}   ${progressAnalysis.planTaskCount} tasks found in plan`);
      console.log(`    ${theme.dim('State Tasks:')}  ${progressAnalysis.totalTasks} tasks in state`);

      // Show plan mismatch warning (critical - plan has more tasks than state)
      if (progressAnalysis.planMismatch) {
        console.log();
        console.log(theme.error.bold('  CRITICAL: Plan Mismatch Detected!'));
        console.log(theme.error(`    The plan file has ${progressAnalysis.planTaskCount} tasks but state only has ${progressAnalysis.totalTasks}.`));
        console.log(theme.error(`    This means the plan was not fully parsed into tasks.`));
        console.log(theme.error(`    True progress: ${progressAnalysis.completedTasks}/${progressAnalysis.planTaskCount} tasks (${progressAnalysis.percentComplete}%)`));

        // Show some missing tasks
        if (progressAnalysis.missingFromState.length > 0) {
          console.log();
          console.log(theme.warning('  Tasks in plan but missing from state:'));
          for (const task of progressAnalysis.missingFromState.slice(0, 8)) {
            console.log(`    ${theme.dim('-')} ${task.slice(0, 70)}${task.length > 70 ? '...' : ''}`);
          }
          if (progressAnalysis.missingFromState.length > 8) {
            console.log(`    ${theme.dim(`... and ${progressAnalysis.missingFromState.length - 8} more tasks`)}`);
          }
        }

        console.log();
        console.log(theme.secondary('    The plan needs to be re-parsed to capture all tasks.'));
        console.log(theme.secondary('    Consider running the workflow again or manually adding tasks.'));
      }
    } else if (progressAnalysis.planParseError) {
      console.log();
      console.log(theme.dim(`  Plan file: ${progressAnalysis.planParseError}`));
    }

    // Check for status mismatch (status says complete but state tasks are incomplete)
    if (progressAnalysis.statusMismatch && !progressAnalysis.planMismatch) {
      console.log();
      console.log(theme.warning.bold('  WARNING: Status Mismatch Detected!'));
      console.log(theme.warning(`    Project status says '${status.state.status}' but work is incomplete.`));
      console.log(theme.warning(`    ${progressAnalysis.progressSummary}`));
      console.log(theme.secondary('    Will reset status and continue execution.'));
    }

    // Show next items to work on
    if (progressAnalysis.nextMilestone || progressAnalysis.nextTask) {
      console.log();
      console.log(theme.secondary('  Next Up:'));
      if (progressAnalysis.nextMilestone) {
        console.log(`    ${theme.dim('Milestone:')} ${progressAnalysis.nextMilestone.name}`);
      }
      if (progressAnalysis.nextTask) {
        console.log(`    ${theme.dim('Task:')}      ${progressAnalysis.nextTask.name}`);
      }
    }

    // Show incomplete milestones
    if (progressAnalysis.incompleteMilestones.length > 0 && !verification.isComplete) {
      console.log();
      console.log(theme.secondary('  Remaining Milestones:'));
      for (const m of progressAnalysis.incompleteMilestones.slice(0, 5)) {
        console.log(`    ${theme.dim('-')} ${m.name} (${m.tasksRemaining} tasks remaining)`);
      }
      if (progressAnalysis.incompleteMilestones.length > 5) {
        console.log(`    ${theme.dim(`... and ${progressAnalysis.incompleteMilestones.length - 5} more`)}`);
      }
    }

    if (status.state.consensusHistory && status.state.consensusHistory.length > 0) {
      const lastConsensus = status.state.consensusHistory[status.state.consensusHistory.length - 1];
      console.log();
      console.log(theme.secondary('  Consensus History:'));
      console.log(`    ${theme.dim('Last Score:')} ${lastConsensus.result.score}%`);
      console.log(`    ${theme.dim('Iterations:')} ${status.state.consensusHistory.length}`);

      // Show last concerns
      if (lastConsensus.result.concerns && lastConsensus.result.concerns.length > 0) {
        console.log();
        console.log(theme.secondary('  Last Concerns:'));
        for (const concern of lastConsensus.result.concerns.slice(0, 3)) {
          console.log(`    ${theme.dim('-')} ${concern.slice(0, 80)}${concern.length > 80 ? '...' : ''}`);
        }
      }
    }

    if (status.state.error) {
      console.log();
      console.log(theme.error(`  Error: ${status.state.error}`));
    }

    // A project is only truly complete if completeProject() was called after
    // successful build verification (sets status='complete', phase='complete').
    // If all tasks are done but status is still 'in-progress', the final
    // verification phase (build, tests, README) never completed successfully.
    if (verification.isComplete && projectExplicitlyCompleted) {
      console.log();
      printSuccess('Project is fully complete!');
      console.log();
      console.log(theme.primary.bold('  Project Summary:'));
      console.log(`    ${theme.dim('Milestones:')} ${progressAnalysis.totalMilestones}/${progressAnalysis.totalMilestones} complete`);
      console.log(`    ${theme.dim('Tasks:')}      ${progressAnalysis.totalTasks}/${progressAnalysis.totalTasks} complete (100%)`);
      console.log(`    ${theme.dim('Build:')}      ${theme.success(`${buildLabel} build passed`)}`);
      console.log(`    ${theme.dim('Location:')}   ${state.projectDir}`);
      return;
    }

    // All tasks complete but project was never explicitly marked complete
    // This means final verification (build, tests, etc.) never passed
    if (verification.isComplete && !projectExplicitlyCompleted) {
      console.log();
      printInfo('All tasks complete but final verification (build/tests) has not passed yet - re-running...');
    }

    // Check if user provided context as argument
    let additionalContext = args.join(' ').trim();

    // If no context provided, ask if they want to add guidance
    if (!additionalContext) {
      console.log();
      const wantsContext = await promptYesNo(
        theme.primary('Would you like to add guidance before resuming?'),
        false
      );

      if (wantsContext) {
        additionalContext = await promptForContext(
          'What guidance would you like to give? (e.g., "Focus on simplicity", "Use SQLite instead of PostgreSQL")'
        );
      }
    }

    console.log();
    printInfo('Resuming workflow...');
    if (additionalContext) {
      console.log(`    ${theme.dim('With guidance:')} ${additionalContext.slice(0, 60)}${additionalContext.length > 60 ? '...' : ''}`);
    }
    console.log();

    const result = await resumeWorkflow(state.projectDir, {
      consensusConfig: {
        reviewer: state.reviewer,
        arbitrator: state.arbitrator,
        enableArbitration: state.enableArbitration,
        openaiModel: state.openaiModel,
        geminiModel: state.geminiModel,
        grokModel: state.grokModel,
      },
      additionalContext,
      onProgress: (phase, message) => {
        console.log(`  ${theme.dim(`[${phase}]`)} ${message}`);
      },
    });

    console.log();
    if (result.success) {
      // Update README with project description on completion
      await updateReadmeOnCompletion(
        state.projectDir,
        status.state.name,
        status.state.idea,
        status.state.language
      );

      // Show full project completion summary
      const execResult = result.executionResult;
      const completedState = result.state;
      const totalMilestones = completedState?.milestones?.length || progressAnalysis.totalMilestones;
      const totalTasks = completedState?.milestones?.reduce((sum, m) => sum + m.tasks.length, 0) || progressAnalysis.totalTasks;
      const bLabel = getBuildLabel(status.state.language);

      printSuccess('Project Complete!');
      console.log();
      console.log(theme.primary.bold('  Project Summary:'));
      console.log(`    ${theme.dim('Name:')}       ${status.state.name}`);
      console.log(`    ${theme.dim('Language:')}   ${theme.primary(status.state.language)}`);
      console.log(`    ${theme.dim('Location:')}   ${state.projectDir}`);
      console.log(`    ${theme.dim('Milestones:')} ${totalMilestones}/${totalMilestones} complete`);
      console.log(`    ${theme.dim('Tasks:')}      ${totalTasks}/${totalTasks} complete (100%)`);

      // Build status
      const buildSt = execResult?.buildStatus || 'passed';
      if (buildSt === 'passed') {
        console.log(`    ${theme.dim('Build:')}      ${theme.success(`${bLabel} build passed`)}`);
      } else {
        console.log(`    ${theme.dim('Build:')}      ${theme.error(`${bLabel} build failed`)}`);
      }

      // Test status
      const testSt = execResult?.testStatus || 'skipped';
      if (testSt === 'passed') {
        console.log(`    ${theme.dim('Tests:')}      ${theme.success('All tests passed')}`);
      } else if (testSt === 'failed') {
        console.log(`    ${theme.dim('Tests:')}      ${theme.error('Some tests failed')}`);
      } else if (testSt === 'no-tests') {
        console.log(`    ${theme.dim('Tests:')}      ${theme.dim('No tests found')}`);
      }
    } else if (result.rateLimitPaused) {
      // Rate limit pause - show friendly message, not an error
      console.log();
      console.log(`  ${theme.warning('Rate Limit Reached')}`);
      console.log(`  ${theme.dim(result.error || 'API rate limit exceeded')}`);
      console.log();
      console.log(`  ${theme.info('Your progress has been saved.')}`);
      console.log(`  ${theme.dim('Run')} ${theme.highlight('/resume')} ${theme.dim('after the rate limit resets to continue.')}`);
      console.log();
    } else {
      printError(result.error || 'Workflow failed');

      // Show build status if available (helps user understand what failed)
      const failExec = result.executionResult;
      if (failExec?.buildStatus === 'failed') {
        const failBuildLabel = getBuildLabel(status.state.language);
        console.log(`    ${theme.dim('Build:')} ${theme.error(`${failBuildLabel} build failed`)}`);
      }

      printInfo('You can run /resume again with additional guidance');
    }
    return;
  }

  // No formal project state - try to discover context from docs/
  printInfo('No project state found in selected directory. Scanning for project context...');
  console.log();

  const discovered = await discoverProjectContext(state.projectDir);

  if (!discovered.found) {
    console.log(theme.secondary('  No project context found in this directory.'));
    console.log();
    console.log(theme.dim('  To start a new project, simply type your idea:'));
    console.log(theme.dim('    Example: "Build a REST API for task management"'));
    console.log();
    console.log(theme.dim('  Or navigate to a directory with existing plans:'));
    console.log(theme.dim('    - docs/PLAN.md or docs/PLAN-DRAFT.md'));
    console.log(theme.dim('    - README.md'));
    return;
  }

  // Show what we discovered
  console.log(theme.primary.bold('  Discovered Project Context:'));
  console.log();

  if (discovered.name) {
    console.log(`    ${theme.dim('Name:')}     ${discovered.name}`);
  }

  if (discovered.language) {
    console.log(`    ${theme.dim('Language:')} ${theme.primary(discovered.language)}`);
  }

  if (discovered.planFile) {
    console.log(`    ${theme.dim('Plan:')}     docs/${discovered.planFile}`);
  }

  if (discovered.hasCode) {
    console.log(`    ${theme.dim('Code:')}     ${discovered.codeFiles.length} source files found`);
  }

  if (discovered.idea) {
    console.log();
    console.log(theme.secondary('  Project Overview:'));
    const ideaLines = discovered.idea.split('\n').slice(0, 4);
    for (const line of ideaLines) {
      console.log(`    ${theme.dim(line.slice(0, 80))}`);
    }
    if (discovered.idea.split('\n').length > 4) {
      console.log(theme.dim('    ...'));
    }
  }

  if (discovered.plan) {
    // Show plan summary
    console.log();
    console.log(theme.secondary('  Plan Summary:'));
    const planLines = discovered.plan.split('\n').filter(l => l.trim().startsWith('#') || l.trim().startsWith('-')).slice(0, 8);
    for (const line of planLines) {
      console.log(`    ${theme.dim(line.slice(0, 80))}`);
    }
  }

  console.log();

  // Ask user what they want to do
  const action = await promptSelection(
    'What would you like to do?',
    [
      { value: 'continue', label: 'Continue with this plan - use existing and continue development' },
      { value: 'refine', label: 'Refine the plan - review and improve with consensus' },
      { value: 'new', label: 'Start fresh - provide a new idea' },
      { value: 'cancel', label: 'Cancel' },
    ],
    'continue'
  );

  if (action === 'cancel') {
    printInfo('Cancelled');
    return;
  }

  if (action === 'new') {
    console.log();
    printInfo('Type your project idea to start a new workflow');
    return;
  }

  // Get additional context/guidance
  let additionalContext = args.join(' ').trim();

  if (!additionalContext && action === 'refine') {
    additionalContext = await promptForContext(
      'What changes or improvements would you like? (e.g., "Add authentication", "Simplify the architecture")'
    );
  } else if (!additionalContext) {
    console.log();
    const wantsContext = await promptYesNo(
      theme.primary('Would you like to add any guidance?'),
      false
    );

    if (wantsContext) {
      additionalContext = await promptForContext(
        'What guidance would you like to give?'
      );
    }
  }

  // Create project spec from discovered context
  const projectName = discovered.name ||
    path.basename(state.projectDir)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 30) ||
    'my-project';

  const spec: ProjectSpec = {
    idea: discovered.idea || discovered.plan?.slice(0, 500) || `Continue developing ${projectName}`,
    name: projectName,
    language: discovered.language || state.language,
    openaiModel: state.openaiModel,
    outputDir: state.projectDir,
  };

  console.log();
  printInfo(`Starting workflow for "${projectName}"...`);
  if (additionalContext) {
    console.log(`    ${theme.dim('With guidance:')} ${additionalContext.slice(0, 60)}${additionalContext.length > 60 ? '...' : ''}`);
  }
  console.log();

  // Run the workflow
  const result = await runWorkflow(spec, {
    projectDir: state.projectDir,
    consensusConfig: {
      reviewer: state.reviewer,
      arbitrator: state.arbitrator,
      enableArbitration: state.enableArbitration,
      openaiModel: state.openaiModel,
      geminiModel: state.geminiModel,
      grokModel: state.grokModel,
    },
    onProgress: (phase, message) => {
      console.log(`  ${theme.dim(`[${phase}]`)} ${message}`);
    },
  });

  console.log();
  if (result.success) {
    // Update README with project description on completion
    if (state.projectDir) {
      await updateReadmeOnCompletion(
        state.projectDir,
        spec.name || 'my-project',
        spec.idea,
        spec.language
      );
    }

    printSuccess('Workflow completed!');
    console.log(`    ${theme.dim('Location:')} ${state.projectDir}`);
  } else {
    printError(result.error || 'Workflow failed');
    printInfo('You can run /resume again with additional guidance');
  }
}

/**
 * Directories that are too generic to use as project names.
 * If the CWD basename matches one of these, we skip CWD-based naming.
 */
const GENERIC_DIR_NAMES = new Set([
  'home', 'desktop', 'documents', 'downloads', 'projects', 'project',
  'repos', 'code', 'dev', 'workspace', 'workspaces', 'src', 'tmp',
  'temp', 'users', 'user', 'root', 'var', 'opt',
]);

/**
 * Try to extract a product name from .md files in a directory.
 * Looks for top-level headings (# ProductName) in markdown files.
 *
 * @param dir - Directory to scan for .md files
 * @returns Product name if found, null otherwise
 */
export async function extractNameFromDocs(dir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.toLowerCase().startsWith('readme'))
      .map(e => path.join(dir, e.name));

    for (const mdFile of mdFiles) {
      try {
        const content = await fs.readFile(mdFile, 'utf-8');
        // Look for a top-level heading like "# Gateco" or "# Gateco - Subtitle"
        const headingMatch = content.match(/^#\s+([A-Z][a-zA-Z0-9]+)/m);
        if (headingMatch && headingMatch[1]) {
          const name = headingMatch[1];
          // Validate: must be a reasonable product name (3-30 chars, not a generic word)
          if (name.length >= 3 && name.length <= 30 && !GENERIC_DIR_NAMES.has(name.toLowerCase())) {
            return name;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory not readable
  }
  return null;
}

/**
 * Generate a meaningful project name from an idea, with CWD-aware logic.
 *
 * Priority chain:
 * 1. If CWD contains .md docs with a "# ProductName" heading, use that
 * 2. If CWD basename is a meaningful name (not generic), use it
 * 3. Fall back to extracting a name from the idea text
 *
 * @param idea - The user's project idea text
 * @param cwd - Optional current working directory for context-aware naming
 * @returns A kebab-case project name
 */
export async function generateProjectName(idea: string, cwd?: string): Promise<string> {
  // Normalize to kebab-case helper
  const toKebab = (name: string): string =>
    name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  if (cwd) {
    // Priority 1: Check for doc-derived name in CWD
    const docName = await extractNameFromDocs(cwd);
    if (docName) {
      return toKebab(docName);
    }

    // Priority 2: Use CWD basename if it's meaningful
    const dirName = path.basename(cwd);
    if (dirName.length >= 3 && !GENERIC_DIR_NAMES.has(dirName.toLowerCase())) {
      return toKebab(dirName);
    }
  }

  // Priority 3: Extract from idea text (original logic)
  return generateProjectNameFromIdea(idea);
}

/**
 * Extract a project name from the idea text alone.
 * This is the original generateProjectName logic, used as a fallback.
 *
 * @param idea - The user's project idea text
 * @returns A kebab-case project name
 */
export function generateProjectNameFromIdea(idea: string): string {
  // 1. First, try to find explicit project name patterns
  const explicitPatterns = [
    /(?:called|named|for|planning|project)\s+["']?([A-Z][a-zA-Z0-9]+)["']?/i,
    /["']([A-Z][a-zA-Z0-9]+)["']/,  // Quoted names
    /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/,  // CamelCase names like "TodoMaster"
  ];

  for (const pattern of explicitPatterns) {
    const match = idea.match(pattern);
    if (match && match[1] && match[1].length >= 3 && match[1].length <= 30) {
      // Convert to kebab-case
      return match[1]
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }
  }

  // 2. Look for standalone capitalized words (potential project names)
  // Exclude common capitalized words at sentence start
  const capitalizedWords = idea.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  const excludeCapitalized = new Set([
    'Build', 'Create', 'Make', 'Develop', 'Write', 'Implement', 'Design',
    'Read', 'Start', 'Help', 'Please', 'Want', 'Need', 'Use', 'Add',
    'The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why',
  ]);

  const projectNameCandidates = capitalizedWords.filter(
    w => !excludeCapitalized.has(w) && w.length >= 3
  );

  if (projectNameCandidates.length > 0) {
    // Use the first non-excluded capitalized word
    return projectNameCandidates[0].toLowerCase();
  }

  // 3. Fall back to extracting meaningful words
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'create', 'build', 'make', 'develop', 'write', 'implement',
    'want', 'like', 'please', 'help', 'me', 'i', 'my', 'we', 'our', 'you',
    'your', 'that', 'which', 'who', 'what', 'where', 'when', 'why', 'how',
    'this', 'these', 'those', 'it', 'its', 'simple', 'basic', 'new',
    // Action verbs that shouldn't be project names
    'read', 'start', 'planning', 'reading', 'starting', 'begin', 'beginning',
    'all', 'files', 'file', 'directory', 'folder', 'also',
  ]);

  // Extract meaningful words
  const words = idea
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Take first 2-3 meaningful words
  const nameWords = words.slice(0, 3);

  if (nameWords.length === 0) {
    // Fallback: use first words from original idea
    const fallback = idea
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .slice(0, 2);
    return fallback.join('-') || 'my-project';
  }

  return nameWords.join('-').substring(0, 40);
}

/**
 * Update README.md with project description and usage instructions
 */
async function updateReadmeOnCompletion(
  projectDir: string,
  projectName: string,
  idea: string,
  language: OutputLanguage
): Promise<void> {
  const readmePath = path.join(projectDir, 'README.md');

  try {
    // Read existing README
    let content = await fs.readFile(readmePath, 'utf-8');

    // Check if it still has the placeholder description
    if (content.includes('Generated by Popeye CLI')) {
      // Generate a better description based on the idea
      const description = `${idea}\n\nThis project was automatically generated and implemented using [Popeye CLI](https://github.com/popeye-cli).`;

      // Replace the placeholder
      content = content.replace(
        /Generated by Popeye CLI/g,
        description
      );

      // Add a "Getting Started" section if it doesn't exist
      if (!content.includes('## Getting Started')) {
        const gettingStarted = language === 'python'
          ? `
## Getting Started

1. Create and activate a virtual environment:
   \`\`\`bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   pip install -e ".[dev]"
   \`\`\`

3. Run the application:
   \`\`\`bash
   python -m src.${projectName.replace(/-/g, '_')}.main
   \`\`\`
`
          : `
## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Build the project:
   \`\`\`bash
   npm run build
   \`\`\`

3. Run the application:
   \`\`\`bash
   npm start
   \`\`\`
`;

        // Insert before "## Development" or at the end
        if (content.includes('## Development')) {
          content = content.replace('## Development', gettingStarted + '\n## Development');
        } else {
          content += gettingStarted;
        }
      }

      await fs.writeFile(readmePath, content, 'utf-8');
    }
  } catch {
    // Silently ignore if README doesn't exist or can't be updated
  }
}

/**
 * Handle project idea input
 */
async function handleIdea(idea: string, state: SessionState): Promise<void> {
  const cwd = state.projectDir || process.cwd();

  // Check for existing Popeye projects in the current directory
  const { all: existingProjects } = await discoverProjects(cwd);
  const localProjects = existingProjects.filter(p => p.path.startsWith(cwd));

  if (localProjects.length > 0) {
    console.log();
    printWarning('Existing Popeye projects found in this directory:');
    console.log();

    for (const project of localProjects.slice(0, 5)) {
      const display = formatProjectForDisplay(project);
      console.log(`    ${theme.primary(display.name)} ${theme.dim(`(${display.age})`)}`);
      console.log(`    ${theme.dim(display.status)} - ${theme.dim(project.path)}`);
      console.log();
    }

    printInfo('Consider running /resume to continue an existing project.');
    printInfo('To start a new project anyway, run: /new ' + idea);
    return;
  }

  if (!state.claudeAuth || !state.openaiAuth) {
    console.log();
    printError('Authentication required');
    printInfo('Running authentication flow...');
    console.log();

    const authenticated = await ensureAuthentication(state);
    if (!authenticated) {
      printWarning('Skipping project creation - authentication incomplete');
      return;
    }
  }

  // Generate a meaningful project name (CWD-aware: checks docs and dir name first)
  const projectName = await generateProjectName(idea, cwd);
  const projectDir = path.join(cwd, projectName);

  console.log();
  console.log(theme.primary.bold('  Creating Project'));
  console.log(`    ${theme.dim('Idea:')} ${idea}`);
  console.log(`    ${theme.dim('Name:')} ${theme.primary(projectName)}`);
  console.log(`    ${theme.dim('Language:')} ${theme.primary(state.language)}`);
  console.log(`    ${theme.dim('Model:')} ${theme.secondary(state.openaiModel)}`);
  console.log();

  const spec: ProjectSpec = {
    idea,
    name: projectName,
    language: state.language,
    openaiModel: state.openaiModel,
    outputDir: cwd,
  };

  // Generate scaffold
  startSpinner('Creating project structure...');
  const scaffoldResult = await generateProject(spec, cwd);

  if (!scaffoldResult.success) {
    failSpinner('Scaffolding failed');
    printError(scaffoldResult.error || 'Failed to create project');
    return;
  }

  succeedSpinner(`Created ${scaffoldResult.filesCreated.length} files`);

  // Create popeye.md with project configuration
  await writePopeyeConfig(projectDir, {
    language: state.language,
    reviewer: state.reviewer,
    arbitrator: state.arbitrator,
    enableArbitration: state.enableArbitration,
    created: new Date().toISOString(),
    lastRun: new Date().toISOString(),
    projectName,
    description: idea,
    openaiModel: state.openaiModel,
    geminiModel: state.geminiModel,
    grokModel: state.grokModel,
  });
  printInfo('Created popeye.md with project configuration');

  // Run workflow with reviewer/arbitrator settings
  console.log();
  printInfo('Starting AI workflow...');
  console.log(`    ${theme.dim('Reviewer:')} ${theme.primary(state.reviewer)}`);
  if (state.enableArbitration) {
    console.log(`    ${theme.dim('Arbitrator:')} ${theme.primary(state.arbitrator)}`);
  }
  console.log();

  const workflowResult = await runWorkflow(spec, {
    projectDir,
    consensusConfig: {
      reviewer: state.reviewer,
      arbitrator: state.arbitrator,
      enableArbitration: state.enableArbitration,
      openaiModel: state.openaiModel,
      geminiModel: state.geminiModel,
      grokModel: state.grokModel,
    },
    onProgress: (phase, message) => {
      console.log(`  ${theme.dim(`[${phase}]`)} ${message}`);
    },
  });

  stopSpinner();

  console.log();
  if (workflowResult.success) {
    // Update README with project description
    await updateReadmeOnCompletion(projectDir, projectName, idea, state.language);

    printSuccess('Project created successfully!');
    console.log(`    ${theme.dim('Location:')} ${projectDir}`);
    state.projectDir = projectDir;
  } else if (workflowResult.rateLimitPaused) {
    // Rate limit pause - show friendly message, not an error
    console.log();
    console.log(`  ${theme.warning('Rate Limit Reached')}`);
    console.log(`  ${theme.dim(workflowResult.error || 'API rate limit exceeded')}`);
    console.log();
    console.log(`  ${theme.info('Your progress has been saved.')}`);
    console.log(`  ${theme.dim('Run')} ${theme.highlight('/resume')} ${theme.dim('after the rate limit resets to continue.')}`);
    console.log();
    state.projectDir = projectDir;
  } else {
    printError(workflowResult.error || 'Workflow failed');
  }
}

/**
 * Handle /new command - force create a new project (skips existing project check)
 */
async function handleNewProject(idea: string, state: SessionState): Promise<void> {
  if (!state.claudeAuth || !state.openaiAuth) {
    console.log();
    printError('Authentication required');
    printInfo('Running authentication flow...');
    console.log();

    const authenticated = await ensureAuthentication(state);
    if (!authenticated) {
      printWarning('Skipping project creation - authentication incomplete');
      return;
    }
  }

  const cwd = state.projectDir || process.cwd();

  // Generate a meaningful project name (CWD-aware: checks docs and dir name first)
  const projectName = await generateProjectName(idea, cwd);
  const projectDir = path.join(cwd, projectName);

  console.log();
  console.log(theme.primary.bold('  Creating New Project'));
  console.log(`    ${theme.dim('Idea:')} ${idea}`);
  console.log(`    ${theme.dim('Name:')} ${theme.primary(projectName)}`);
  console.log(`    ${theme.dim('Language:')} ${theme.primary(state.language)}`);
  console.log(`    ${theme.dim('Model:')} ${theme.secondary(state.openaiModel)}`);
  console.log();

  const spec: ProjectSpec = {
    idea,
    name: projectName,
    language: state.language,
    openaiModel: state.openaiModel,
    outputDir: cwd,
  };

  // Generate scaffold
  startSpinner('Creating project structure...');
  const scaffoldResult = await generateProject(spec, cwd);

  if (!scaffoldResult.success) {
    failSpinner('Scaffolding failed');
    printError(scaffoldResult.error || 'Failed to create project');
    return;
  }

  succeedSpinner(`Created ${scaffoldResult.filesCreated.length} files`);

  // Create popeye.md with project configuration
  await writePopeyeConfig(projectDir, {
    language: state.language,
    reviewer: state.reviewer,
    arbitrator: state.arbitrator,
    enableArbitration: state.enableArbitration,
    created: new Date().toISOString(),
    lastRun: new Date().toISOString(),
    projectName,
    description: idea,
    openaiModel: state.openaiModel,
    geminiModel: state.geminiModel,
    grokModel: state.grokModel,
  });
  printInfo('Created popeye.md with project configuration');

  // Run workflow with reviewer/arbitrator settings
  console.log();
  printInfo('Starting AI workflow...');
  console.log(`    ${theme.dim('Reviewer:')} ${theme.primary(state.reviewer)}`);
  if (state.enableArbitration) {
    console.log(`    ${theme.dim('Arbitrator:')} ${theme.primary(state.arbitrator)}`);
  }
  console.log();

  const workflowResult = await runWorkflow(spec, {
    projectDir,
    consensusConfig: {
      reviewer: state.reviewer,
      arbitrator: state.arbitrator,
      enableArbitration: state.enableArbitration,
      openaiModel: state.openaiModel,
      geminiModel: state.geminiModel,
      grokModel: state.grokModel,
    },
    onProgress: (phase, message) => {
      console.log(`  ${theme.dim(`[${phase}]`)} ${message}`);
    },
  });

  stopSpinner();

  console.log();
  if (workflowResult.success) {
    // Update README with project description
    await updateReadmeOnCompletion(projectDir, projectName, idea, state.language);

    printSuccess('Project created successfully!');
    console.log(`    ${theme.dim('Location:')} ${projectDir}`);
    state.projectDir = projectDir;
  } else if (workflowResult.rateLimitPaused) {
    // Rate limit pause - show friendly message, not an error
    console.log();
    console.log(`  ${theme.warning('Rate Limit Reached')}`);
    console.log(`  ${theme.dim(workflowResult.error || 'API rate limit exceeded')}`);
    console.log();
    console.log(`  ${theme.info('Your progress has been saved.')}`);
    console.log(`  ${theme.dim('Run')} ${theme.highlight('/resume')} ${theme.dim('after the rate limit resets to continue.')}`);
    console.log();
    state.projectDir = projectDir;
  } else {
    printError(workflowResult.error || 'Workflow failed');
  }
}

/**
 * Start interactive mode with auto-authentication
 */
export async function startInteractiveMode(): Promise<void> {
  console.clear();

  // Initialize state from saved config
  const config = await loadConfig();
  const state: SessionState = {
    projectDir: process.cwd(),
    language: config.project.default_language,
    openaiModel: config.apis.openai.model,
    geminiModel: 'gemini-2.5-flash',
    grokModel: config.apis.grok.model,
    claudeAuth: false,
    openaiAuth: false,
    geminiAuth: false,
    grokAuth: false,
    // Load saved reviewer/arbitrator settings from config
    reviewer: config.consensus.reviewer,
    arbitrator: config.consensus.arbitrator === 'off' ? 'openai' : config.consensus.arbitrator,
    enableArbitration: config.consensus.enable_arbitration,
  };

  // Draw header
  drawHeader();
  console.log();

  // Show how Popeye works
  console.log(theme.secondary('  How Popeye works:'));
  console.log(theme.dim('  ├─ ') + theme.primary('Claude Code CLI') + theme.dim(' - Generates code (uses your model & MCP settings)'));
  console.log(theme.dim('  ├─ ') + theme.secondary('Reviewer (configurable)') + theme.dim(' - Reviews plans until consensus'));
  console.log(theme.dim('  └─ ') + theme.secondary('Arbitrator (optional)') + theme.dim(' - Breaks deadlocks when stuck'));
  console.log();
  console.log(theme.dim('  You can choose OpenAI, Gemini, or Grok as reviewer/arbitrator during setup.'));
  console.log(theme.dim('  Plans are saved to docs/ folder in markdown format.'));
  console.log();

  // Check and perform authentication
  const isAuthenticated = await ensureAuthentication(state);

  if (!isAuthenticated) {
    console.log();
    printWarning('Some services are not authenticated. Some features may not work.');
    printInfo('You can authenticate later with /auth');
  } else {
    console.log();
    printSuccess('Ready! Type your project idea or /help for commands');
  }

  console.log();

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Input loop
  const promptUser = (): void => {
    drawInputBoxTop(state);

    rl.question(getPrompt(), async (input) => {
      // Draw bottom of input box after user presses enter
      drawInputBoxBottom();

      const shouldContinue = await handleInput(input, state);

      if (shouldContinue) {
        console.log();
        promptUser();
      } else {
        rl.close();
        process.exit(0);
      }
    });
  };

  promptUser();
}
