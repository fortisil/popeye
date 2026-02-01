/**
 * Google Gemini API authentication module
 * Handles API key validation and storage
 */

import * as readline from 'node:readline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getGeminiCredential,
  setGeminiCredential,
  deleteGeminiCredential,
  maskCredential,
} from './keychain.js';

/**
 * Gemini authentication status
 */
export interface GeminiAuthStatus {
  authenticated: boolean;
  keyLastFour?: string;
  error?: string;
}

/**
 * Validate a Gemini API key by making a test API call
 *
 * @param apiKey - The API key to validate
 * @returns True if the key is valid
 */
export async function validateGeminiToken(apiKey: string): Promise<boolean> {
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    // Test the key by making a simple request
    await model.generateContent('Say "OK"');
    return true;
  } catch (error) {
    // Check for authentication errors
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
      return false;
    }
    // For other errors, assume the key might be valid
    console.warn('Could not fully validate Gemini key:', error);
    return true;
  }
}

/**
 * Check if Gemini is already authenticated
 * Checks keychain first, then environment variable
 */
export async function checkGeminiAuth(): Promise<GeminiAuthStatus> {
  try {
    const apiKey = await getGeminiCredential();

    if (!apiKey) {
      return { authenticated: false };
    }

    // Validate the key
    const isValid = await validateGeminiToken(apiKey);

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
export async function promptForGeminiAPIKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nGet your API key from: https://aistudio.google.com/app/apikey\n');

    rl.question('Enter your Gemini API key: ', (answer) => {
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
 * Authenticate with Gemini API
 *
 * @returns True if authentication was successful
 */
export async function authenticateGemini(): Promise<boolean> {
  // Check if already authenticated
  const existingAuth = await checkGeminiAuth();
  if (existingAuth.authenticated) {
    console.log('Already authenticated with Gemini API');
    return true;
  }

  console.log('Gemini API key required for arbitration.');

  try {
    // Prompt for the API key
    const apiKey = await promptForGeminiAPIKey();

    if (!apiKey) {
      console.error('\nNo API key provided');
      return false;
    }

    // Validate the token
    console.log('\nValidating API key...');
    const isValid = await validateGeminiToken(apiKey);

    if (!isValid) {
      console.error('Invalid Gemini API key');
      return false;
    }

    // Store the token
    await setGeminiCredential(apiKey);
    console.log('Gemini API authenticated successfully!\n');

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
export async function authenticateGeminiWithKey(apiKey: string): Promise<boolean> {
  // Validate the token
  const isValid = await validateGeminiToken(apiKey);

  if (!isValid) {
    console.error('Invalid Gemini API key');
    return false;
  }

  // Store the token
  await setGeminiCredential(apiKey);
  console.log('Gemini API authenticated successfully!\n');

  return true;
}

/**
 * Logout from Gemini API
 * Removes stored credentials
 */
export async function logoutGemini(): Promise<void> {
  const deleted = await deleteGeminiCredential();
  if (deleted) {
    console.log('Gemini API credentials removed.');
  } else {
    console.log('No Gemini API credentials found.');
  }
}

/**
 * Get the Gemini API key for API calls
 */
export async function getGeminiToken(): Promise<string | null> {
  return getGeminiCredential();
}

/**
 * Ensure Gemini is authenticated
 * Prompts for authentication if not already authenticated
 */
export async function ensureGeminiAuth(): Promise<boolean> {
  const status = await checkGeminiAuth();

  if (status.authenticated) {
    return true;
  }

  return authenticateGemini();
}
