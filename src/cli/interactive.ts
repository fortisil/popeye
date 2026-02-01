/**
 * Interactive mode
 * Claude Code-style interface for Popeye CLI
 */

import * as readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getAuthStatusForDisplay,
  authenticateClaude,
  authenticateOpenAI,
  authenticateGemini,
  isClaudeCLIInstalled,
  checkClaudeCLIAuth,
  checkGeminiAuth,
} from '../auth/index.js';
import {
  runWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  getWorkflowSummary,
} from '../workflow/index.js';
import {
  analyzeProjectProgress,
  verifyProjectCompletion,
} from '../state/index.js';
import { generateProject } from '../generators/index.js';
import {
  discoverProjects,
  formatProjectForDisplay,
} from '../state/registry.js';
import { loadConfig, saveConfig } from '../config/index.js';
import type { ProjectSpec, OutputLanguage, OpenAIModel } from '../types/project.js';
import type { AIProvider, GeminiModel } from '../types/consensus.js';
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
  model: OpenAIModel;
  geminiModel: GeminiModel;
  claudeAuth: boolean;
  openaiAuth: boolean;
  geminiAuth: boolean;
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
 * Draw the header box
 */
function drawHeader(): void {
  const width = getTerminalWidth();
  const title = ' Popeye CLI ';
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
    theme.dim('/lang ') + theme.primary('py') + theme.dim('|') + theme.primary('ts'),
    theme.dim('/config'),
    theme.dim('/help'),
    theme.dim('/exit'),
  ];
  console.log('  ' + hints.join('   '));

  // Status items for the top line
  const langStatus = state.language;
  const reviewerStatus = state.reviewer === 'openai' ? 'O' : 'G';
  const arbitratorStatus = state.enableArbitration ? (state.arbitrator === 'openai' ? 'O' : 'G') : '-';
  const allAuth = state.claudeAuth && state.openaiAuth && (state.enableArbitration ? state.geminiAuth : true);
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
      // Auto-select the other provider as arbitrator
      const defaultArbitrator = state.reviewer === 'openai' ? 'gemini' : 'openai';

      state.arbitrator = await promptSelection(
        'Who should arbitrate when stuck?',
        [
          { label: theme.secondary('Gemini') + theme.dim(' - Google Gemini breaks deadlocks'), value: 'gemini' },
          { label: theme.secondary('OpenAI') + theme.dim(' - OpenAI breaks deadlocks'), value: 'openai' },
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

    // Save the configuration to persist between sessions
    await saveConsensusConfig(state);

    // Show summary
    console.log();
    console.log(theme.secondary('  Configuration saved. Use /config to change later.'));
    console.log(`    ${theme.dim('Reviewer:')}    ${theme.primary(state.reviewer === 'openai' ? 'OpenAI (GPT-4o)' : 'Gemini')}`);
    console.log(`    ${theme.dim('Arbitrator:')}  ${state.enableArbitration ? theme.primary(state.arbitrator === 'openai' ? 'OpenAI' : 'Gemini') : theme.dim('Disabled')}`);
    console.log();
  } else if (state.claudeAuth && state.openaiAuth && alreadyConfigured) {
    // Show loaded configuration
    console.log();
    console.log(theme.secondary('  Using saved configuration (use /config to change):'));
    console.log(`    ${theme.dim('Reviewer:')}    ${theme.primary(state.reviewer === 'openai' ? 'OpenAI (GPT-4o)' : 'Gemini')}`);
    console.log(`    ${theme.dim('Arbitrator:')}  ${state.enableArbitration ? theme.primary(state.arbitrator === 'openai' ? 'OpenAI' : 'Gemini') : theme.dim('Disabled')}`);
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
    ['/config reviewer', 'Set reviewer (openai/gemini)'],
    ['/config arbitrator', 'Set arbitrator (openai/gemini/off)'],
    ['/lang <lang>', 'Set language (python/typescript)'],
    ['/new <idea>', 'Force start a new project (skips existing check)'],
    ['/resume', 'Resume interrupted project'],
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

      case '/new':
        // Force start a new project even if existing projects found
        if (args.length === 0) {
          printError('Usage: /new <project idea>');
          printInfo('Example: /new todo app with user authentication');
        } else {
          await handleNewProject(args.join(' '), state);
        }
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
          if (newReviewer === 'openai' || newReviewer === 'gemini') {
            if (newReviewer === 'gemini' && !state.geminiAuth) {
              printWarning('Gemini API not authenticated. Run /auth first.');
              return;
            }
            state.reviewer = newReviewer as AIProvider;
            // Save to config
            await saveConsensusConfig(state);
            printSuccess(`Reviewer set to ${newReviewer}`);
          } else {
            printError('Invalid reviewer. Use: openai or gemini');
          }
        } else {
          printKeyValue('Reviewer', state.reviewer);
          printInfo('Use: /config reviewer <openai|gemini>');
        }
        return;

      case 'arbitrator':
        if (args.length > 1) {
          const newArbitrator = args[1].toLowerCase();
          if (newArbitrator === 'openai' || newArbitrator === 'gemini') {
            if (newArbitrator === 'gemini' && !state.geminiAuth) {
              printWarning('Gemini API not authenticated. Run /auth first.');
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
            printError('Invalid arbitrator. Use: openai, gemini, or off');
          }
        } else {
          printKeyValue('Arbitrator', state.enableArbitration ? state.arbitrator : 'disabled');
          printInfo('Use: /config arbitrator <openai|gemini|off>');
        }
        return;

      case 'language':
      case 'lang':
        if (args.length > 1) {
          const lang = args[1].toLowerCase() as OutputLanguage;
          if (['python', 'typescript'].includes(lang)) {
            state.language = lang;
            printSuccess(`Language set to ${lang}`);
          } else {
            printError('Invalid language. Use: python or typescript');
          }
        } else {
          printKeyValue('Language', state.language);
        }
        return;

      default:
        printError(`Unknown config option: ${subcommand}`);
        printInfo('Options: reviewer, arbitrator, language');
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
  console.log();
  console.log(theme.primary.bold('  AI Configuration:'));
  console.log(`    ${theme.dim('Reviewer:')}   ${theme.primary(state.reviewer === 'openai' ? 'OpenAI (GPT-4o)' : 'Gemini')}`);
  console.log(`    ${theme.dim('Arbitrator:')} ${state.enableArbitration ? theme.primary(state.arbitrator === 'openai' ? 'OpenAI' : 'Gemini') : theme.dim('Disabled')}`);
  console.log();
  console.log(theme.primary.bold('  Consensus:'));
  console.log(`    ${theme.dim('Threshold:')}  ${config.consensus.threshold}%`);
  console.log(`    ${theme.dim('Max Iters:')}  ${config.consensus.max_disagreements}`);
  console.log();
  console.log(theme.secondary('  Change settings:'));
  console.log(theme.dim('    /config reviewer <openai|gemini>'));
  console.log(theme.dim('    /config arbitrator <openai|gemini|off>'));
  console.log(theme.dim('    /config language <python|typescript>'));
  console.log();
}

/**
 * Handle /language command
 */
function handleLanguage(args: string[], state: SessionState): void {
  if (args.length === 0) {
    console.log();
    printKeyValue('Current language', state.language);
    printInfo('Use /language <python|typescript> to change');
    return;
  }

  const lang = args[0].toLowerCase() as OutputLanguage;
  if (!['python', 'typescript'].includes(lang)) {
    printError('Invalid language. Use: python or typescript');
    return;
  }

  state.language = lang;
  console.log();
  printSuccess(`Language set to ${lang}`);
}

/**
 * Handle /model command
 */
function handleModel(args: string[], state: SessionState): void {
  const validModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'];

  if (args.length === 0) {
    console.log();
    printKeyValue('Current model', state.model);
    printInfo(`Available: ${validModels.join(', ')}`);
    return;
  }

  const model = args[0] as OpenAIModel;
  if (!validModels.includes(model)) {
    printError(`Invalid model. Use one of: ${validModels.join(', ')}`);
    return;
  }

  state.model = model;
  console.log();
  printSuccess(`Model set to ${model}`);
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

  // Now check for formal project state at the selected/current directory
  if (!state.projectDir) {
    printError('No project directory set');
    return;
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

    // If project says complete but isn't, inform user we'll continue
    if (verification.isComplete) {
      console.log();
      printSuccess('Project is fully complete!');
      printInfo(`All ${progressAnalysis.totalTasks} tasks across ${progressAnalysis.totalMilestones} milestones are done.`);
      return;
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

      printSuccess('Workflow completed!');
      console.log(`    ${theme.dim('Location:')} ${state.projectDir}`);
    } else {
      printError(result.error || 'Workflow failed');
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
    openaiModel: state.model,
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
 * Generate a meaningful project name from an idea
 * Extracts key nouns and creates a kebab-case name
 */
function generateProjectName(idea: string): string {
  // Common words to filter out
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'create', 'build', 'make', 'develop', 'write', 'implement',
    'want', 'like', 'please', 'help', 'me', 'i', 'my', 'we', 'our', 'you',
    'your', 'that', 'which', 'who', 'what', 'where', 'when', 'why', 'how',
    'this', 'these', 'those', 'it', 'its', 'simple', 'basic', 'new',
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

  // Generate a meaningful project name
  const projectName = generateProjectName(idea);
  const projectDir = path.join(cwd, projectName);

  console.log();
  console.log(theme.primary.bold('  Creating Project'));
  console.log(`    ${theme.dim('Idea:')} ${idea}`);
  console.log(`    ${theme.dim('Name:')} ${theme.primary(projectName)}`);
  console.log(`    ${theme.dim('Language:')} ${theme.primary(state.language)}`);
  console.log(`    ${theme.dim('Model:')} ${theme.secondary(state.model)}`);
  console.log();

  const spec: ProjectSpec = {
    idea,
    name: projectName,
    language: state.language,
    openaiModel: state.model,
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
      geminiModel: state.geminiModel,
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

  // Generate a meaningful project name
  const projectName = generateProjectName(idea);
  const projectDir = path.join(cwd, projectName);

  console.log();
  console.log(theme.primary.bold('  Creating New Project'));
  console.log(`    ${theme.dim('Idea:')} ${idea}`);
  console.log(`    ${theme.dim('Name:')} ${theme.primary(projectName)}`);
  console.log(`    ${theme.dim('Language:')} ${theme.primary(state.language)}`);
  console.log(`    ${theme.dim('Model:')} ${theme.secondary(state.model)}`);
  console.log();

  const spec: ProjectSpec = {
    idea,
    name: projectName,
    language: state.language,
    openaiModel: state.model,
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
      geminiModel: state.geminiModel,
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
    model: config.apis.openai.model,
    geminiModel: 'gemini-2.0-flash',
    claudeAuth: false,
    openaiAuth: false,
    geminiAuth: false,
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
  console.log(theme.dim('  You can choose OpenAI or Gemini as reviewer/arbitrator during setup.'));
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
