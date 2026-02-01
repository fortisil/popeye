/**
 * Configuration management module
 * Handles loading, merging, and validating configuration from multiple sources
 */

import { cosmiconfig } from 'cosmiconfig';
import { parse as parseYaml } from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { ConfigSchema, type Config } from './schema.js';
import {
  DEFAULT_CONFIG,
  GLOBAL_CONFIG_DIR,
  CONFIG_FILE_NAME,
  ENV_VARS,
} from './defaults.js';

// Re-export schema types
export * from './schema.js';
export * from './defaults.js';

/**
 * Configuration loader using cosmiconfig
 */
const explorer = cosmiconfig('popeye', {
  searchPlaces: [
    'popeye.config.yaml',
    'popeye.config.yml',
    '.popeyerc.yaml',
    '.popeyerc.yml',
    '.popeyerc',
    '.popeye/config.yaml',
    '.popeye/config.yml',
  ],
  loaders: {
    '.yaml': (_filepath: string, content: string) => parseYaml(content),
    '.yml': (_filepath: string, content: string) => parseYaml(content),
    noExt: (_filepath: string, content: string) => parseYaml(content),
  },
});

/**
 * Load global configuration from ~/.popeye/config.yaml
 */
async function loadGlobalConfig(): Promise<Partial<Config>> {
  const globalConfigPath = path.join(homedir(), GLOBAL_CONFIG_DIR, CONFIG_FILE_NAME);

  try {
    const content = await fs.readFile(globalConfigPath, 'utf-8');
    const parsed = parseYaml(content);
    return parsed || {};
  } catch {
    // Global config doesn't exist, return empty
    return {};
  }
}

/**
 * Load project-specific configuration
 */
async function loadProjectConfig(cwd?: string): Promise<Partial<Config>> {
  try {
    const result = await explorer.search(cwd);
    if (result && !result.isEmpty) {
      return result.config;
    }
  } catch {
    // Project config doesn't exist or is invalid
  }
  return {};
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  // OpenAI model
  const openaiModel = process.env[ENV_VARS.OPENAI_MODEL];
  if (openaiModel) {
    config.apis = {
      openai: {
        ...DEFAULT_CONFIG.apis.openai,
        model: openaiModel as Config['apis']['openai']['model'],
      },
      claude: DEFAULT_CONFIG.apis.claude,
    };
  }

  // Default language
  const defaultLanguage = process.env[ENV_VARS.DEFAULT_LANGUAGE];
  if (defaultLanguage && (defaultLanguage === 'python' || defaultLanguage === 'typescript')) {
    config.project = {
      ...DEFAULT_CONFIG.project,
      default_language: defaultLanguage,
    };
  }

  // Consensus threshold
  const threshold = process.env[ENV_VARS.CONSENSUS_THRESHOLD];
  if (threshold) {
    const parsed = parseInt(threshold, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      config.consensus = {
        ...DEFAULT_CONFIG.consensus,
        ...(config.consensus || {}),
        threshold: parsed,
      };
    }
  }

  // Max disagreements
  const maxDisagreements = process.env[ENV_VARS.MAX_DISAGREEMENTS];
  if (maxDisagreements) {
    const parsed = parseInt(maxDisagreements, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      config.consensus = {
        ...DEFAULT_CONFIG.consensus,
        ...(config.consensus || {}),
        max_disagreements: parsed,
      };
    }
  }

  // Reviewer
  const reviewer = process.env[ENV_VARS.CONSENSUS_REVIEWER];
  if (reviewer && (reviewer === 'openai' || reviewer === 'gemini')) {
    config.consensus = {
      ...DEFAULT_CONFIG.consensus,
      ...(config.consensus || {}),
      reviewer,
    };
  }

  // Arbitrator
  const arbitrator = process.env[ENV_VARS.CONSENSUS_ARBITRATOR];
  if (arbitrator && (arbitrator === 'openai' || arbitrator === 'gemini' || arbitrator === 'off')) {
    config.consensus = {
      ...DEFAULT_CONFIG.consensus,
      ...(config.consensus || {}),
      arbitrator,
      enable_arbitration: arbitrator !== 'off',
    };
  }

  // Verbose/log level
  const logLevel = process.env[ENV_VARS.LOG_LEVEL];
  if (logLevel === 'debug') {
    config.output = {
      ...DEFAULT_CONFIG.output,
      verbose: true,
    };
  }

  return config;
}

/**
 * Deep merge configuration objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Load and merge configuration from all sources
 * Priority: env vars > project config > global config > defaults
 */
export async function loadConfig(cwd?: string): Promise<Config> {
  // Load from all sources
  const globalConfig = await loadGlobalConfig();
  const projectConfig = await loadProjectConfig(cwd);
  const envConfig = loadEnvConfig();

  // Merge in priority order
  let merged = deepMerge(DEFAULT_CONFIG, globalConfig);
  merged = deepMerge(merged, projectConfig);
  merged = deepMerge(merged, envConfig);

  // Validate final config
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    console.warn('Configuration validation warnings:', result.error.format());
    // Return defaults if validation fails
    return DEFAULT_CONFIG;
  }

  return result.data;
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Partial<Config>, global = false): Promise<void> {
  const { stringify: stringifyYaml } = await import('yaml');

  const configPath = global
    ? path.join(homedir(), GLOBAL_CONFIG_DIR, CONFIG_FILE_NAME)
    : path.join(process.cwd(), '.popeye', CONFIG_FILE_NAME);

  // Ensure directory exists
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  // Write config
  const content = stringifyYaml(config);
  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Get a specific config value by path
 */
export function getConfigValue<T>(config: Config, keyPath: string): T | undefined {
  const keys = keyPath.split('.');
  let current: unknown = config;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current as T;
}

/**
 * Set a config value by path
 */
export function setConfigValue(config: Config, keyPath: string, value: unknown): Config {
  const keys = keyPath.split('.');
  const result = JSON.parse(JSON.stringify(config)) as Config;
  let current: Record<string, unknown> = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;

  return result;
}

/**
 * Cached config path from last search
 */
let cachedConfigPath: string | null = null;

/**
 * Get the path to the currently loaded config file (or null if using defaults)
 */
export function getConfigPath(): string | null {
  return cachedConfigPath;
}

/**
 * Search for and cache the config path
 */
export async function findConfigPath(cwd?: string): Promise<string | null> {
  try {
    const result = await explorer.search(cwd);
    if (result && result.filepath) {
      cachedConfigPath = result.filepath;
      return result.filepath;
    }
  } catch {
    // Ignore errors
  }
  cachedConfigPath = null;
  return null;
}

/**
 * Popeye config type alias for CLI compatibility
 */
export interface PopeyeConfig extends Config {
  consensus: Config['consensus'] & {
    threshold: number;
    maxIterations: number;
    temperature: number;
    maxTokens: number;
  };
  apis: Config['apis'] & {
    openai: Config['apis']['openai'] & {
      model: string;
      timeout: number;
    };
  };
  project: Config['project'] & {
    defaultLanguage: 'python' | 'typescript';
    defaultName: string;
  };
  directories: Config['directories'] & {
    output: string;
    state: string;
  };
  output: Config['output'] & {
    colors: boolean;
    progress: boolean;
  };
}

/**
 * Schema for the Popeye config type used by CLI
 */
export const PopeyeConfigSchema = ConfigSchema;
