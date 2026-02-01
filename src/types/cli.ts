/**
 * CLI-related type definitions
 * Defines command options, interactive mode state, and output formats
 */

import type { OutputLanguage, OpenAIModel } from './project.js';

/**
 * Global CLI options available on all commands
 */
export interface GlobalOptions {
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
}

/**
 * Options for the `create` command
 */
export interface CreateOptions extends GlobalOptions {
  language: OutputLanguage;
  openaiModel: OpenAIModel;
  output?: string;
  name?: string;
}

/**
 * Options for the `resume` command
 */
export interface ResumeOptions extends GlobalOptions {
  projectPath: string;
}

/**
 * Options for the `status` command
 */
export interface StatusOptions extends GlobalOptions {
  projectPath?: string;
  json: boolean;
}

/**
 * Options for the `auth` command
 */
export interface AuthOptions extends GlobalOptions {
  service?: 'claude' | 'openai' | 'all';
}

/**
 * Options for the `config` command
 */
export interface ConfigOptions extends GlobalOptions {
  global: boolean;
}

/**
 * Authentication status for display
 */
export interface AuthStatus {
  claude: {
    authenticated: boolean;
    user?: string;
    expires?: string;
  };
  openai: {
    authenticated: boolean;
    keyLastFour?: string;
    modelAccess?: string[];
  };
  gemini?: {
    authenticated: boolean;
    keyLastFour?: string;
  };
}

/**
 * Interactive mode session state
 */
export interface InteractiveSession {
  connected: boolean;
  language: OutputLanguage;
  openaiModel: OpenAIModel;
  currentProject?: string;
  history: string[];
}

/**
 * Slash command definition for interactive mode
 */
export interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: (args: string[], session: InteractiveSession) => Promise<void>;
}

/**
 * Progress display information
 */
export interface ProgressInfo {
  phase: string;
  milestone?: number;
  totalMilestones?: number;
  task?: number;
  totalTasks?: number;
  consensusIteration?: number;
  consensusScore?: number;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
}

/**
 * Console output styles/colors
 */
export interface OutputStyles {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  dim: string;
  bold: string;
}

/**
 * Banner configuration
 */
export interface BannerConfig {
  version: string;
  language: OutputLanguage;
  openaiModel: OpenAIModel;
  sessionId?: string;
}

/**
 * CLI exit codes
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  AUTH_REQUIRED: 2,
  INVALID_INPUT: 3,
  CONSENSUS_FAILED: 4,
  TEST_FAILED: 5,
  INTERRUPTED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
