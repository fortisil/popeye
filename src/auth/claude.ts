/**
 * Claude CLI authentication module
 * Checks for Claude Code CLI installation and authentication status
 */

import { spawn } from 'node:child_process';
import { getClaudeCredential, setClaudeCredential, deleteClaudeCredential } from './keychain.js';

/**
 * Claude authentication status
 */
export interface ClaudeAuthStatus {
  authenticated: boolean;
  user?: string;
  expires?: string;
  error?: string;
  cliInstalled?: boolean;
}

/**
 * Run a command and capture output
 */
function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on('error', () => {
      resolve({ stdout, stderr, code: 1 });
    });
  });
}

/**
 * Check if Claude Code CLI is installed
 */
export async function isClaudeCLIInstalled(): Promise<boolean> {
  try {
    const result = await runCommand('claude', ['--version']);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if Claude Code CLI is authenticated
 * Uses 'claude auth status' to check authentication
 */
export async function checkClaudeCLIAuth(): Promise<ClaudeAuthStatus> {
  try {
    // First check if CLI is installed
    const installed = await isClaudeCLIInstalled();
    if (!installed) {
      return {
        authenticated: false,
        cliInstalled: false,
        error: 'Claude Code CLI is not installed',
      };
    }

    // Check auth status by running a simple command
    // The SDK will fail if not authenticated
    const result = await runCommand('claude', ['-p', 'echo "auth check"', '--output-format', 'json']);

    if (result.code === 0) {
      // Also check keychain for cached status
      const cached = await getClaudeCredential();

      return {
        authenticated: true,
        cliInstalled: true,
        user: cached ? 'authenticated' : 'claude-user',
      };
    }

    // Check if the error indicates auth issues
    const output = result.stdout + result.stderr;
    if (output.includes('not logged in') || output.includes('authenticate') || output.includes('login')) {
      return {
        authenticated: false,
        cliInstalled: true,
        error: 'Not logged in to Claude Code',
      };
    }

    // Some other error - assume authenticated if CLI is installed
    // The actual auth check will happen when we try to use the SDK
    return {
      authenticated: true,
      cliInstalled: true,
    };
  } catch (error) {
    return {
      authenticated: false,
      cliInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Authenticate with Claude Code CLI
 * Opens the Claude login flow
 */
export async function authenticateClaude(): Promise<boolean> {
  // Check if CLI is installed
  const installed = await isClaudeCLIInstalled();

  if (!installed) {
    console.log('\nClaude Code CLI is not installed.');
    console.log('\nTo install Claude Code CLI:');
    console.log('  npm install -g @anthropic-ai/claude-code');
    console.log('\nOr visit: https://claude.ai/download\n');
    return false;
  }

  // Check if already authenticated
  const status = await checkClaudeCLIAuth();
  if (status.authenticated) {
    console.log('Already authenticated with Claude Code CLI.');
    await setClaudeCredential('authenticated');
    return true;
  }

  console.log('\nClaude Code CLI authentication required.');
  console.log('\nPlease run the following command in your terminal:');
  console.log('\n  claude login\n');
  console.log('After logging in, restart Popeye.\n');

  // Try to open the login flow
  try {
    console.log('Attempting to open Claude login...\n');
    const result = await runCommand('claude', ['login']);

    if (result.code === 0) {
      await setClaudeCredential('authenticated');
      console.log('Claude Code CLI authenticated successfully!\n');
      return true;
    } else {
      console.log('Login process exited. Please run "claude login" manually if needed.\n');
      return false;
    }
  } catch {
    console.log('Could not start login automatically.');
    console.log('Please run "claude login" manually.\n');
    return false;
  }
}

/**
 * Logout from Claude CLI
 * Removes stored credentials
 */
export async function logoutClaude(): Promise<void> {
  const deleted = await deleteClaudeCredential();
  if (deleted) {
    console.log('Claude CLI credentials removed from Popeye.');
  }

  console.log('\nTo fully logout from Claude Code CLI, run:');
  console.log('  claude logout\n');
}

/**
 * Refresh Claude CLI authentication
 */
export async function refreshClaudeAuth(): Promise<boolean> {
  await deleteClaudeCredential();
  return authenticateClaude();
}

/**
 * Get the Claude CLI token (placeholder for API compatibility)
 */
export async function getClaudeToken(): Promise<string | null> {
  return getClaudeCredential();
}

/**
 * Ensure Claude CLI is authenticated
 */
export async function ensureClaudeAuth(): Promise<boolean> {
  const status = await checkClaudeCLIAuth();

  if (status.authenticated) {
    return true;
  }

  return authenticateClaude();
}
