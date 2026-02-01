/**
 * OpenAI API authentication module
 * Handles API key validation and storage
 */

import * as readline from 'node:readline';
import OpenAI from 'openai';
import {
  getOpenAICredential,
  setOpenAICredential,
  deleteOpenAICredential,
  maskCredential,
} from './keychain.js';

/**
 * OpenAI authentication status
 */
export interface OpenAIAuthStatus {
  authenticated: boolean;
  keyLastFour?: string;
  modelAccess?: string[];
  error?: string;
}

/**
 * Validate an OpenAI API key by making a test API call
 *
 * @param apiKey - The API key to validate
 * @returns True if the key is valid
 */
export async function validateOpenAIToken(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({ apiKey });
    // Test the key by listing models
    await client.models.list();
    return true;
  } catch (error) {
    // 401 means invalid key, other errors might be rate limits etc
    if (error instanceof OpenAI.AuthenticationError) {
      return false;
    }
    // For other errors, assume the key might be valid
    // (could be rate limiting, network issues, etc)
    console.warn('Could not fully validate OpenAI key:', error);
    return true;
  }
}

/**
 * Get available models for an API key
 *
 * @param apiKey - The API key
 * @returns List of available model IDs
 */
export async function getAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const client = new OpenAI({ apiKey });
    const models = await client.models.list();

    // Filter for GPT and O1 models
    return models.data
      .filter(
        (m) =>
          m.id.includes('gpt-4') ||
          m.id.includes('gpt-3.5') ||
          m.id.startsWith('o1')
      )
      .map((m) => m.id)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Check if OpenAI is already authenticated
 * Checks keychain first, then environment variable
 */
export async function checkOpenAIAuth(): Promise<OpenAIAuthStatus> {
  try {
    const apiKey = await getOpenAICredential();

    if (!apiKey) {
      return { authenticated: false };
    }

    // Validate the key
    const isValid = await validateOpenAIToken(apiKey);

    if (!isValid) {
      return {
        authenticated: false,
        error: 'Stored API key is invalid',
      };
    }

    // Get available models
    const models = await getAvailableModels(apiKey);

    return {
      authenticated: true,
      keyLastFour: maskCredential(apiKey),
      modelAccess: models,
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
export async function promptForAPIKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nGet your API key from: https://platform.openai.com/api-keys\n');

    rl.question('Enter your OpenAI API key (starts with sk-): ', (answer) => {
      rl.close();
      const key = answer.trim();
      if (key && key.startsWith('sk-')) {
        resolve(key);
      } else if (key) {
        console.log('\nWarning: Key does not start with "sk-", but trying anyway...');
        resolve(key);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Authenticate with OpenAI API
 *
 * @returns True if authentication was successful
 */
export async function authenticateOpenAI(): Promise<boolean> {
  // Check if already authenticated
  const existingAuth = await checkOpenAIAuth();
  if (existingAuth.authenticated) {
    console.log('Already authenticated with OpenAI API');
    return true;
  }

  console.log('OpenAI API key required.');

  try {
    // Prompt for the API key
    const apiKey = await promptForAPIKey();

    if (!apiKey) {
      console.error('\nNo API key provided');
      return false;
    }

    // Validate the token
    console.log('\nValidating API key...');
    const isValid = await validateOpenAIToken(apiKey);

    if (!isValid) {
      console.error('Invalid OpenAI API key');
      return false;
    }

    // Store the token
    await setOpenAICredential(apiKey);
    console.log('OpenAI API authenticated successfully!\n');

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
export async function authenticateOpenAIWithKey(apiKey: string): Promise<boolean> {
  // Validate the token
  const isValid = await validateOpenAIToken(apiKey);

  if (!isValid) {
    console.error('Invalid OpenAI API key');
    return false;
  }

  // Store the token
  await setOpenAICredential(apiKey);
  console.log('OpenAI API authenticated successfully!\n');

  return true;
}

/**
 * Logout from OpenAI API
 * Removes stored credentials
 */
export async function logoutOpenAI(): Promise<void> {
  const deleted = await deleteOpenAICredential();
  if (deleted) {
    console.log('OpenAI API credentials removed.');
  } else {
    console.log('No OpenAI API credentials found.');
  }
}

/**
 * Get the OpenAI API key for API calls
 */
export async function getOpenAIToken(): Promise<string | null> {
  return getOpenAICredential();
}

/**
 * Ensure OpenAI is authenticated
 * Prompts for authentication if not already authenticated
 */
export async function ensureOpenAIAuth(): Promise<boolean> {
  const status = await checkOpenAIAuth();

  if (status.authenticated) {
    return true;
  }

  return authenticateOpenAI();
}

/**
 * Create an OpenAI client with the stored credentials
 */
export async function createOpenAIClient(): Promise<OpenAI | null> {
  const apiKey = await getOpenAIToken();

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}
