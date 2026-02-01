/**
 * Config command
 * Manage CLI configuration
 */

import { Command } from 'commander';
import path from 'node:path';
import { loadConfig, getConfigPath } from '../../config/index.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';
import {
  printHeader,
  printSection,
  printSuccess,
  printError,
  printInfo,
  printKeyValue,
} from '../output.js';

/**
 * Create the config command
 */
export function createConfigCommand(): Command {
  const config = new Command('config')
    .description('Manage CLI configuration');

  // Show current config
  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const loadedConfig = await loadConfig();
        const configPath = getConfigPath();

        if (options.json) {
          console.log(JSON.stringify(loadedConfig, null, 2));
          return;
        }

        printHeader('Current Configuration');

        if (configPath) {
          printInfo(`Config file: ${configPath}`);
        } else {
          printInfo('Using default configuration');
        }

        console.log();
        printConfigSection('Consensus', loadedConfig.consensus);
        printConfigSection('APIs', loadedConfig.apis);
        printConfigSection('Project', loadedConfig.project);
        printConfigSection('Directories', loadedConfig.directories);
        printConfigSection('Output', loadedConfig.output);
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Show defaults
  config
    .command('defaults')
    .description('Show default configuration values')
    .option('--json', 'Output as JSON')
    .action((options) => {
      if (options.json) {
        console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
        return;
      }

      printHeader('Default Configuration');

      printConfigSection('Consensus', DEFAULT_CONFIG.consensus);
      printConfigSection('APIs', DEFAULT_CONFIG.apis);
      printConfigSection('Project', DEFAULT_CONFIG.project);
      printConfigSection('Directories', DEFAULT_CONFIG.directories);
      printConfigSection('Output', DEFAULT_CONFIG.output);
    });

  // Get a specific config value
  config
    .command('get')
    .description('Get a specific configuration value')
    .argument('<key>', 'Configuration key (e.g., consensus.threshold)')
    .action(async (key: string) => {
      try {
        const loadedConfig = await loadConfig();
        const value = getNestedValue(loadedConfig, key);

        if (value === undefined) {
          printError(`Configuration key not found: ${key}`);
          process.exit(1);
        }

        if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Show config file path
  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      const configPath = getConfigPath();

      if (configPath) {
        console.log(configPath);
      } else {
        printInfo('No configuration file found');
        printInfo('Create one at: .popeyerc, .popeyerc.json, .popeyerc.yaml, or popeye.config.js');
      }
    });

  // Init config file
  config
    .command('init')
    .description('Create a configuration file')
    .option('-f, --format <format>', 'Config format (json, yaml)', 'json')
    .action(async (options) => {
      const { promises: fs } = await import('node:fs');

      const format = options.format;
      let filename: string;
      let content: string;

      if (format === 'yaml') {
        filename = '.popeyerc.yaml';
        content = generateYamlConfig();
      } else {
        filename = '.popeyerc.json';
        content = JSON.stringify(DEFAULT_CONFIG, null, 2);
      }

      const filepath = path.join(process.cwd(), filename);

      try {
        // Check if file exists
        try {
          await fs.access(filepath);
          printError(`Configuration file already exists: ${filepath}`);
          process.exit(1);
        } catch {
          // File doesn't exist, good to create
        }

        await fs.writeFile(filepath, content, 'utf-8');
        printSuccess(`Created configuration file: ${filepath}`);
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to create config file');
        process.exit(1);
      }
    });

  return config;
}

/**
 * Print a configuration section
 */
function printConfigSection(name: string, section: Record<string, unknown>): void {
  printSection(name);

  for (const [key, value] of Object.entries(section)) {
    if (typeof value === 'object' && value !== null) {
      console.log(`  ${key}:`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        printKeyValue(`    ${subKey}`, String(subValue));
      }
    } else {
      printKeyValue(`  ${key}`, String(value));
    }
  }

  console.log();
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Generate YAML configuration content
 */
function generateYamlConfig(): string {
  return `# Popeye CLI Configuration
# See documentation for all available options

# Consensus settings
consensus:
  threshold: 95
  maxIterations: 5
  temperature: 0.3
  maxTokens: 4096

# API settings
apis:
  openai:
    model: gpt-4o
    timeout: 120000

# Project defaults
project:
  defaultLanguage: python
  defaultName: my-project

# Directory settings
directories:
  output: ./output
  state: .popeye

# Output settings
output:
  verbose: false
  colors: true
  progress: true
`;
}
