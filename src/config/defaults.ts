/**
 * Default configuration values
 * Matches popeye-cli-spec.md section 9.1 exactly
 */

import type { Config } from './schema.js';

/**
 * Default configuration object
 */
export const DEFAULT_CONFIG: Config = {
  consensus: {
    threshold: 95,
    max_disagreements: 10,
    escalation_action: 'pause',
    reviewer: 'openai',
    arbitrator: 'off',
    enable_arbitration: false,
  },
  apis: {
    openai: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 4096,
      available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
    },
    claude: {
      model: 'claude-sonnet-4-20250514',
    },
    grok: {
      model: 'grok-3',
      temperature: 0.3,
      max_tokens: 4096,
      api_url: 'https://api.x.ai/v1',
    },
  },
  project: {
    default_language: 'python',
    python: {
      package_manager: 'pip',
      test_framework: 'pytest',
      min_version: '3.10',
    },
    typescript: {
      package_manager: 'npm',
      test_framework: 'jest',
      min_version: '18',
    },
  },
  directories: {
    docs: 'docs',
    tests: 'docs/tests',
    plans: 'docs/plans',
  },
  output: {
    format: 'markdown',
    verbose: false,
    timestamps: true,
    show_consensus_dialog: true,
  },
};

/**
 * Configuration file names to search for
 */
export const CONFIG_FILE_NAMES = [
  'popeye.config.yaml',
  'popeye.config.yml',
  '.popeyerc.yaml',
  '.popeyerc.yml',
  '.popeyerc',
];

/**
 * Global config directory path
 */
export const GLOBAL_CONFIG_DIR = '.popeye';

/**
 * State file name
 */
export const STATE_FILE_NAME = 'state.json';

/**
 * Config file name in .popeye directory
 */
export const CONFIG_FILE_NAME = 'config.yaml';

/**
 * Service name for keychain
 */
export const SERVICE_NAME = 'popeye-cli';

/**
 * Keychain account names
 */
export const KEYCHAIN_ACCOUNTS = {
  CLAUDE: 'claude-cli',
  OPENAI: 'openai-api',
  GEMINI: 'gemini-api',
  GROK: 'grok-api',
} as const;

/**
 * Environment variable names
 */
export const ENV_VARS = {
  OPENAI_KEY: 'POPEYE_OPENAI_KEY',
  ANTHROPIC_KEY: 'POPEYE_ANTHROPIC_KEY',
  GEMINI_KEY: 'POPEYE_GEMINI_KEY',
  GROK_KEY: 'POPEYE_GROK_KEY',
  DEFAULT_LANGUAGE: 'POPEYE_DEFAULT_LANGUAGE',
  OPENAI_MODEL: 'POPEYE_OPENAI_MODEL',
  GEMINI_MODEL: 'POPEYE_GEMINI_MODEL',
  GROK_MODEL: 'POPEYE_GROK_MODEL',
  CONSENSUS_REVIEWER: 'POPEYE_CONSENSUS_REVIEWER',
  CONSENSUS_ARBITRATOR: 'POPEYE_CONSENSUS_ARBITRATOR',
  CONSENSUS_THRESHOLD: 'POPEYE_CONSENSUS_THRESHOLD',
  MAX_DISAGREEMENTS: 'POPEYE_MAX_DISAGREEMENTS',
  LOG_LEVEL: 'POPEYE_LOG_LEVEL',
} as const;

/**
 * CLI version
 */
export const CLI_VERSION = '1.0.2';

/**
 * State file version
 */
export const STATE_VERSION = '1.0.0';
