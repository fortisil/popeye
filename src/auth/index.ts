/**
 * Authentication orchestration module
 * Coordinates authentication for Claude CLI, OpenAI API, Gemini API, and Grok API
 */

import { checkClaudeCLIAuth, authenticateClaude, logoutClaude, type ClaudeAuthStatus } from './claude.js';
import { checkOpenAIAuth, authenticateOpenAI, logoutOpenAI, type OpenAIAuthStatus } from './openai.js';
import { checkGeminiAuth, authenticateGemini, logoutGemini, type GeminiAuthStatus } from './gemini.js';
import { checkGrokAuth, authenticateGrok, logoutGrok, type GrokAuthStatus } from './grok.js';
import { clearAllCredentials, deleteCredential } from './keychain.js';
import type { AuthStatus } from '../types/index.js';

// Re-export individual auth modules
export * from './claude.js';
export * from './openai.js';
export * from './gemini.js';
export * from './grok.js';
export * from './keychain.js';
export * from './server.js';

/**
 * Combined authentication status
 */
export interface CombinedAuthStatus {
  claude: ClaudeAuthStatus;
  openai: OpenAIAuthStatus;
  gemini: GeminiAuthStatus;
  grok: GrokAuthStatus;
  fullyAuthenticated: boolean;
  hasArbitrator: boolean;
}

/**
 * Get the authentication status for all services
 */
export async function getAuthStatus(): Promise<CombinedAuthStatus> {
  const [claudeStatus, openaiStatus, geminiStatus, grokStatus] = await Promise.all([
    checkClaudeCLIAuth(),
    checkOpenAIAuth(),
    checkGeminiAuth(),
    checkGrokAuth(),
  ]);

  return {
    claude: claudeStatus,
    openai: openaiStatus,
    gemini: geminiStatus,
    grok: grokStatus,
    fullyAuthenticated: claudeStatus.authenticated && openaiStatus.authenticated,
    hasArbitrator: geminiStatus.authenticated || openaiStatus.authenticated || grokStatus.authenticated,
  };
}

/**
 * Get auth status formatted for CLI display
 */
export async function getAuthStatusForDisplay(): Promise<AuthStatus> {
  const status = await getAuthStatus();

  return {
    claude: {
      authenticated: status.claude.authenticated,
      user: status.claude.user,
      expires: status.claude.expires,
    },
    openai: {
      authenticated: status.openai.authenticated,
      keyLastFour: status.openai.keyLastFour,
      modelAccess: status.openai.modelAccess,
    },
    gemini: {
      authenticated: status.gemini.authenticated,
      keyLastFour: status.gemini.keyLastFour,
    },
    grok: {
      authenticated: status.grok.authenticated,
      keyLastFour: status.grok.keyLastFour,
    },
  };
}

/**
 * Ensure both services are authenticated
 * Prompts for authentication if either is missing
 *
 * @returns True if both services are authenticated
 */
export async function ensureAuthenticated(): Promise<boolean> {
  const status = await getAuthStatus();

  if (status.fullyAuthenticated) {
    return true;
  }

  let success = true;

  // Authenticate Claude if needed
  if (!status.claude.authenticated) {
    console.log('\n--- Claude CLI Authentication ---\n');
    const claudeSuccess = await authenticateClaude();
    if (!claudeSuccess) {
      success = false;
    }
  }

  // Authenticate OpenAI if needed
  if (!status.openai.authenticated) {
    console.log('\n--- OpenAI API Authentication ---\n');
    const openaiSuccess = await authenticateOpenAI();
    if (!openaiSuccess) {
      success = false;
    }
  }

  return success;
}

/**
 * Authenticate a specific service
 *
 * @param service - The service to authenticate ('claude', 'openai', 'gemini', 'grok', or 'all')
 * @returns True if authentication was successful
 */
export async function authenticateService(
  service: 'claude' | 'openai' | 'gemini' | 'grok' | 'all'
): Promise<boolean> {
  switch (service) {
    case 'claude':
      return authenticateClaude();
    case 'openai':
      return authenticateOpenAI();
    case 'gemini':
      return authenticateGemini();
    case 'grok':
      return authenticateGrok();
    case 'all':
      return ensureAuthenticated();
  }
}

/**
 * Logout from a specific service or all services
 *
 * @param service - The service to logout from ('claude', 'openai', 'gemini', 'grok', or 'all')
 */
export async function logout(service: 'claude' | 'openai' | 'gemini' | 'grok' | 'all'): Promise<void> {
  switch (service) {
    case 'claude':
      await logoutClaude();
      break;
    case 'openai':
      await logoutOpenAI();
      break;
    case 'gemini':
      await logoutGemini();
      break;
    case 'grok':
      await logoutGrok();
      break;
    case 'all':
      await clearAllCredentials();
      // Also clear grok credential
      await deleteCredential('grok-api');
      console.log('All credentials removed.');
      break;
  }
}

/**
 * Check if a specific service is authenticated
 *
 * @param service - The service to check
 * @returns True if the service is authenticated
 */
export async function isAuthenticated(service: 'claude' | 'openai' | 'gemini' | 'grok' | 'both' | 'all'): Promise<boolean> {
  const status = await getAuthStatus();

  switch (service) {
    case 'claude':
      return status.claude.authenticated;
    case 'openai':
      return status.openai.authenticated;
    case 'gemini':
      return status.gemini.authenticated;
    case 'grok':
      return status.grok.authenticated;
    case 'both':
      return status.fullyAuthenticated;
    case 'all':
      return status.fullyAuthenticated && status.gemini.authenticated;
  }
}

/**
 * Require authentication, throwing an error if not authenticated
 *
 * @throws Error if not authenticated
 */
export async function requireAuth(): Promise<void> {
  const status = await getAuthStatus();

  if (!status.claude.authenticated) {
    throw new Error('Claude CLI authentication required. Run: popeye-cli auth claude');
  }

  if (!status.openai.authenticated) {
    throw new Error('OpenAI API authentication required. Run: popeye-cli auth openai');
  }
}
