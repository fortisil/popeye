/**
 * Credential storage module
 * Uses file-based storage in ~/.popeye/ directory
 * Falls back to environment variables
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SERVICE_NAME, KEYCHAIN_ACCOUNTS, ENV_VARS } from '../config/defaults.js';

/**
 * Get the credentials file path
 */
function getCredentialsPath(): string {
  const popeyeDir = path.join(os.homedir(), '.popeye');

  // Ensure directory exists
  if (!fs.existsSync(popeyeDir)) {
    fs.mkdirSync(popeyeDir, { mode: 0o700, recursive: true });
  }

  return path.join(popeyeDir, 'credentials.json');
}

/**
 * Load credentials from file
 */
function loadCredentials(): Record<string, string> {
  try {
    const filePath = getCredentialsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, return empty
  }
  return {};
}

/**
 * Save credentials to file
 */
function saveCredentials(credentials: Record<string, string>): void {
  const filePath = getCredentialsPath();
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), {
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Get a credential from storage
 * Falls back to environment variable if not found
 *
 * @param account - The account name (e.g., 'claude-cli', 'openai-api')
 * @returns The stored credential or null if not found
 */
export async function getCredential(account: string): Promise<string | null> {
  // First check file storage
  const credentials = loadCredentials();
  const key = `${SERVICE_NAME}:${account}`;

  if (credentials[key]) {
    return credentials[key];
  }

  // Fallback to environment variables
  if (account === KEYCHAIN_ACCOUNTS.OPENAI) {
    return process.env[ENV_VARS.OPENAI_KEY] || null;
  }
  if (account === KEYCHAIN_ACCOUNTS.CLAUDE) {
    return process.env[ENV_VARS.ANTHROPIC_KEY] || null;
  }
  if (account === KEYCHAIN_ACCOUNTS.GEMINI) {
    return process.env[ENV_VARS.GEMINI_KEY] || null;
  }

  return null;
}

/**
 * Store a credential
 *
 * @param account - The account name
 * @param password - The credential to store
 */
export async function setCredential(account: string, password: string): Promise<void> {
  const credentials = loadCredentials();
  const key = `${SERVICE_NAME}:${account}`;
  credentials[key] = password;
  saveCredentials(credentials);
}

/**
 * Delete a credential from storage
 *
 * @param account - The account name
 * @returns True if the credential was deleted, false if it didn't exist
 */
export async function deleteCredential(account: string): Promise<boolean> {
  const credentials = loadCredentials();
  const key = `${SERVICE_NAME}:${account}`;

  if (credentials[key]) {
    delete credentials[key];
    saveCredentials(credentials);
    return true;
  }

  return false;
}

/**
 * Check if a credential exists
 *
 * @param account - The account name
 * @returns True if the credential exists
 */
export async function hasCredential(account: string): Promise<boolean> {
  const credential = await getCredential(account);
  return credential !== null;
}

/**
 * Get the Claude CLI credential
 */
export async function getClaudeCredential(): Promise<string | null> {
  return getCredential(KEYCHAIN_ACCOUNTS.CLAUDE);
}

/**
 * Set the Claude CLI credential
 */
export async function setClaudeCredential(token: string): Promise<void> {
  return setCredential(KEYCHAIN_ACCOUNTS.CLAUDE, token);
}

/**
 * Delete the Claude CLI credential
 */
export async function deleteClaudeCredential(): Promise<boolean> {
  return deleteCredential(KEYCHAIN_ACCOUNTS.CLAUDE);
}

/**
 * Get the OpenAI API credential
 */
export async function getOpenAICredential(): Promise<string | null> {
  return getCredential(KEYCHAIN_ACCOUNTS.OPENAI);
}

/**
 * Set the OpenAI API credential
 */
export async function setOpenAICredential(apiKey: string): Promise<void> {
  return setCredential(KEYCHAIN_ACCOUNTS.OPENAI, apiKey);
}

/**
 * Delete the OpenAI API credential
 */
export async function deleteOpenAICredential(): Promise<boolean> {
  return deleteCredential(KEYCHAIN_ACCOUNTS.OPENAI);
}

/**
 * Get the Gemini API credential
 */
export async function getGeminiCredential(): Promise<string | null> {
  return getCredential(KEYCHAIN_ACCOUNTS.GEMINI);
}

/**
 * Set the Gemini API credential
 */
export async function setGeminiCredential(apiKey: string): Promise<void> {
  return setCredential(KEYCHAIN_ACCOUNTS.GEMINI, apiKey);
}

/**
 * Delete the Gemini API credential
 */
export async function deleteGeminiCredential(): Promise<boolean> {
  return deleteCredential(KEYCHAIN_ACCOUNTS.GEMINI);
}

/**
 * Clear all stored credentials
 */
export async function clearAllCredentials(): Promise<void> {
  await deleteClaudeCredential();
  await deleteOpenAICredential();
  await deleteGeminiCredential();
}

/**
 * Get the last 4 characters of a credential for display purposes
 */
export function maskCredential(credential: string): string {
  if (credential.length <= 4) {
    return '****';
  }
  return `****${credential.slice(-4)}`;
}
