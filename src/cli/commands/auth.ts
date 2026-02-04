/**
 * Authentication commands
 * Handles login, logout, and status for Claude, OpenAI, Gemini, and Grok
 */

import { Command } from 'commander';
import {
  getAuthStatusForDisplay,
  authenticateService,
  logout,
  isAuthenticated,
} from '../../auth/index.js';
import { authenticateOpenAIWithKey } from '../../auth/openai.js';
import { authenticateGeminiWithKey } from '../../auth/gemini.js';
import { authenticateGrokWithKey } from '../../auth/grok.js';
import {
  printHeader,
  printAuthStatus,
  printSuccess,
  printError,
  printInfo,
  startSpinner,
  succeedSpinner,
  failSpinner,
} from '../output.js';

/**
 * Create the auth command
 */
export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage authentication for Claude CLI and OpenAI API');

  // Status subcommand
  auth
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      startSpinner('Checking authentication status...');

      try {
        const status = await getAuthStatusForDisplay();
        succeedSpinner('Status retrieved');

        printAuthStatus(status);

        if (!status.claude.authenticated || !status.openai.authenticated) {
          console.log();
          printInfo('Run "popeye-cli auth login" to authenticate missing services.');
        }
        if (status.grok && !status.grok.authenticated) {
          printInfo('Run "popeye-cli auth grok" to authenticate Grok (optional).');
        }
      } catch (error) {
        failSpinner('Failed to check status');
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Login subcommand
  auth
    .command('login')
    .description('Authenticate with services')
    .argument('[service]', 'Service to authenticate (claude, openai, gemini, grok, all)', 'all')
    .option('--api-key <key>', 'API key (for openai, gemini, or grok service)')
    .action(async (service: 'claude' | 'openai' | 'gemini' | 'grok' | 'all', options) => {
      // Validate service
      if (!['claude', 'openai', 'gemini', 'grok', 'all'].includes(service)) {
        printError(`Invalid service: ${service}. Use 'claude', 'openai', 'gemini', 'grok', or 'all'.`);
        process.exit(1);
      }

      printHeader('Authentication');

      try {
        // Handle API key for OpenAI
        if ((service === 'openai' || service === 'all') && options.apiKey) {
          startSpinner('Validating OpenAI API key...');
          const success = await authenticateOpenAIWithKey(options.apiKey);

          if (success) {
            succeedSpinner('OpenAI API authenticated');
          } else {
            failSpinner('OpenAI API authentication failed');
            if (service === 'openai') {
              process.exit(1);
            }
          }

          // If only OpenAI was requested, we're done
          if (service === 'openai') {
            return;
          }

          // Continue with Claude if 'all'
          if (service === 'all') {
            service = 'claude';
          }
        }

        // Interactive authentication
        const success = await authenticateService(service);

        if (success) {
          printSuccess('Authentication complete!');
        } else {
          printError('Authentication failed');
          process.exit(1);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Logout subcommand
  auth
    .command('logout')
    .description('Remove stored credentials')
    .argument('[service]', 'Service to logout from (claude, openai, gemini, grok, all)', 'all')
    .action(async (service: 'claude' | 'openai' | 'gemini' | 'grok' | 'all') => {
      // Validate service
      if (!['claude', 'openai', 'gemini', 'grok', 'all'].includes(service)) {
        printError(`Invalid service: ${service}. Use 'claude', 'openai', 'gemini', 'grok', or 'all'.`);
        process.exit(1);
      }

      try {
        await logout(service);
        printSuccess(`Logged out from ${service === 'all' ? 'all services' : service}`);
      } catch (error) {
        printError(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Claude-specific subcommand
  auth
    .command('claude')
    .description('Authenticate with Claude CLI')
    .action(async () => {
      printHeader('Claude CLI Authentication');

      const alreadyAuth = await isAuthenticated('claude');
      if (alreadyAuth) {
        printInfo('Already authenticated with Claude CLI');
        return;
      }

      const success = await authenticateService('claude');

      if (success) {
        printSuccess('Claude CLI authenticated!');
      } else {
        printError('Claude CLI authentication failed');
        process.exit(1);
      }
    });

  // OpenAI-specific subcommand
  auth
    .command('openai')
    .description('Authenticate with OpenAI API')
    .option('--api-key <key>', 'OpenAI API key')
    .action(async (options) => {
      printHeader('OpenAI API Authentication');

      if (options.apiKey) {
        startSpinner('Validating API key...');
        const success = await authenticateOpenAIWithKey(options.apiKey);

        if (success) {
          succeedSpinner('OpenAI API authenticated!');
        } else {
          failSpinner('Invalid API key');
          process.exit(1);
        }
        return;
      }

      const alreadyAuth = await isAuthenticated('openai');
      if (alreadyAuth) {
        printInfo('Already authenticated with OpenAI API');
        return;
      }

      const success = await authenticateService('openai');

      if (success) {
        printSuccess('OpenAI API authenticated!');
      } else {
        printError('OpenAI API authentication failed');
        process.exit(1);
      }
    });

  // Gemini-specific subcommand
  auth
    .command('gemini')
    .description('Authenticate with Gemini API')
    .option('--api-key <key>', 'Gemini API key')
    .action(async (options) => {
      printHeader('Gemini API Authentication');

      if (options.apiKey) {
        startSpinner('Validating API key...');
        const success = await authenticateGeminiWithKey(options.apiKey);

        if (success) {
          succeedSpinner('Gemini API authenticated!');
        } else {
          failSpinner('Invalid API key');
          process.exit(1);
        }
        return;
      }

      const alreadyAuth = await isAuthenticated('gemini');
      if (alreadyAuth) {
        printInfo('Already authenticated with Gemini API');
        return;
      }

      const success = await authenticateService('gemini');

      if (success) {
        printSuccess('Gemini API authenticated!');
      } else {
        printError('Gemini API authentication failed');
        process.exit(1);
      }
    });

  // Grok-specific subcommand
  auth
    .command('grok')
    .description('Authenticate with xAI Grok API')
    .option('--api-key <key>', 'Grok API key')
    .action(async (options) => {
      printHeader('Grok API Authentication');

      if (options.apiKey) {
        startSpinner('Validating API key...');
        const success = await authenticateGrokWithKey(options.apiKey);

        if (success) {
          succeedSpinner('Grok API authenticated!');
        } else {
          failSpinner('Invalid API key');
          process.exit(1);
        }
        return;
      }

      const alreadyAuth = await isAuthenticated('grok');
      if (alreadyAuth) {
        printInfo('Already authenticated with Grok API');
        return;
      }

      const success = await authenticateService('grok');

      if (success) {
        printSuccess('Grok API authenticated!');
      } else {
        printError('Grok API authentication failed');
        process.exit(1);
      }
    });

  return auth;
}
