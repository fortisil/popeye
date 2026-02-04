/**
 * xAI Grok API authentication module
 * Handles API key validation and storage
 */

import * as readline from 'node:readline';
import OpenAI from 'openai';
import {
  getCredential,
  setCredential,
  deleteCredential,
  maskCredential,
} from './keychain.js';
import { ENV_VARS } from '../config/defaults.js';

/**
 * Grok API URL (OpenAI-compatible)
 */
export const GROK_API_URL = 'https://api.x.ai/v1';

/**
 * Keychain account for Grok
 */
const GROK_ACCOUNT = 'grok-api';

/**
 * Grok authentication status
 */
export interface GrokAuthStatus {
  authenticated: boolean;
  keyLastFour?: string;
  error?: string;
}

/**
 * Validate a Grok API key by making a test API call
 *
 * @param apiKey - The API key to validate
 * @returns True if the key is valid
 */
export async function validateGrokToken(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: GROK_API_URL,
    });

    // Test the key by making a simple request
    await client.chat.completions.create({
      model: 'grok-3',
      messages: [{ role: 'user', content: 'Say "OK"' }],
      max_tokens: 5,
    });

    return true;
  } catch (error) {
    // Check for authentication errors
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('Invalid API') ||
      errorMessage.includes('Unauthorized')
    ) {
      return false;
    }
    // For other errors (e.g., rate limits), assume the key might be valid
    console.warn('Could not fully validate Grok key:', error);
    return true;
  }
}

/**
 * Get the Grok API credential
 */
export async function getGrokCredential(): Promise<string | null> {
  // First check file storage
  const stored = await getCredential(GROK_ACCOUNT);
  if (stored) return stored;

  // Fallback to environment variable
  return process.env[ENV_VARS.GROK_KEY] || null;
}

/**
 * Set the Grok API credential
 */
export async function setGrokCredential(apiKey: string): Promise<void> {
  return setCredential(GROK_ACCOUNT, apiKey);
}

/**
 * Delete the Grok API credential
 */
export async function deleteGrokCredential(): Promise<boolean> {
  return deleteCredential(GROK_ACCOUNT);
}

/**
 * Check if Grok is already authenticated
 */
export async function checkGrokAuth(): Promise<GrokAuthStatus> {
  try {
    const apiKey = await getGrokCredential();

    if (!apiKey) {
      return { authenticated: false };
    }

    // Validate the key
    const isValid = await validateGrokToken(apiKey);

    if (!isValid) {
      return {
        authenticated: false,
        error: 'Stored API key is invalid',
      };
    }

    return {
      authenticated: true,
      keyLastFour: maskCredential(apiKey),
    };
  } catch (error) {
    return {
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Prompt for API key in the terminal
 *
 * @returns The entered API key or null if cancelled
 */
export async function promptForGrokAPIKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nGet your API key from: https://console.x.ai/\n');

    rl.question('Enter your Grok API key: ', (answer) => {
      rl.close();
      const key = answer.trim();
      if (key) {
        resolve(key);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Authenticate with Grok API
 *
 * @returns True if authentication was successful
 */
export async function authenticateGrok(): Promise<boolean> {
  // Check if already authenticated
  const existingAuth = await checkGrokAuth();
  if (existingAuth.authenticated) {
    console.log('Already authenticated with Grok API');
    return true;
  }

  console.log('Grok API key required for AI reviews.');

  try {
    // Prompt for the API key
    const apiKey = await promptForGrokAPIKey();

    if (!apiKey) {
      console.error('\nNo API key provided');
      return false;
    }

    // Validate the token
    console.log('\nValidating API key...');
    const isValid = await validateGrokToken(apiKey);

    if (!isValid) {
      console.error('Invalid Grok API key');
      return false;
    }

    // Store the token
    await setGrokCredential(apiKey);
    console.log('Grok API authenticated successfully!\n');

    return true;
  } catch (error) {
    console.error(`Authentication error: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * Authenticate with a provided API key (for CLI --api-key option)
 *
 * @param apiKey - The API key to use
 * @returns True if authentication was successful
 */
export async function authenticateGrokWithKey(apiKey: string): Promise<boolean> {
  // Validate the token
  const isValid = await validateGrokToken(apiKey);

  if (!isValid) {
    console.error('Invalid Grok API key');
    return false;
  }

  // Store the token
  await setGrokCredential(apiKey);
  console.log('Grok API authenticated successfully!\n');

  return true;
}

/**
 * Logout from Grok API
 * Removes stored credentials
 */
export async function logoutGrok(): Promise<void> {
  const deleted = await deleteGrokCredential();
  if (deleted) {
    console.log('Grok API credentials removed.');
  } else {
    console.log('No Grok API credentials found.');
  }
}

/**
 * Get the Grok API key for API calls
 */
export async function getGrokToken(): Promise<string | null> {
  return getGrokCredential();
}

/**
 * Ensure Grok is authenticated
 * Prompts for authentication if not already authenticated
 */
export async function ensureGrokAuth(): Promise<boolean> {
  const status = await checkGrokAuth();

  if (status.authenticated) {
    return true;
  }

  return authenticateGrok();
}
