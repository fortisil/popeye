/**
 * State persistence module
 * Handles atomic read/write operations for project state
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ProjectStateSchema, type ProjectState } from '../types/workflow.js';

/**
 * Default state directory name
 */
export const STATE_DIR = '.popeye';

/**
 * State file name
 */
export const STATE_FILE = 'state.json';

/**
 * Get the state directory path for a project
 *
 * @param projectDir - The project root directory
 * @returns The state directory path
 */
export function getStateDir(projectDir: string): string {
  return path.join(projectDir, STATE_DIR);
}

/**
 * Get the state file path for a project
 *
 * @param projectDir - The project root directory
 * @returns The state file path
 */
export function getStatePath(projectDir: string): string {
  return path.join(getStateDir(projectDir), STATE_FILE);
}

/**
 * Ensure the state directory exists
 *
 * @param projectDir - The project root directory
 */
export async function ensureStateDir(projectDir: string): Promise<void> {
  const stateDir = getStateDir(projectDir);
  await fs.mkdir(stateDir, { recursive: true });
}

/**
 * Check if a state file exists for a project
 *
 * @param projectDir - The project root directory
 * @returns True if state file exists
 */
export async function stateExists(projectDir: string): Promise<boolean> {
  try {
    const statePath = getStatePath(projectDir);
    await fs.access(statePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load project state from disk
 *
 * @param projectDir - The project root directory
 * @returns The project state or null if not found
 */
export async function loadState(projectDir: string): Promise<ProjectState | null> {
  try {
    const statePath = getStatePath(projectDir);
    const content = await fs.readFile(statePath, 'utf-8');
    const data = JSON.parse(content);

    // Validate with Zod schema
    const result = ProjectStateSchema.safeParse(data);

    if (!result.success) {
      console.error('Invalid state file format:', result.error.message);
      return null;
    }

    return result.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save project state to disk using atomic write
 * Uses temp file + rename pattern to prevent corruption
 *
 * @param projectDir - The project root directory
 * @param state - The state to save
 */
export async function saveState(projectDir: string, state: ProjectState): Promise<void> {
  // Ensure state directory exists
  await ensureStateDir(projectDir);

  const statePath = getStatePath(projectDir);
  const tempPath = `${statePath}.tmp.${Date.now()}`;

  // Update the updatedAt timestamp
  const stateToSave: ProjectState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  // Validate before saving
  const result = ProjectStateSchema.safeParse(stateToSave);
  if (!result.success) {
    throw new Error(`Invalid state: ${result.error.message}`);
  }

  // Write to temp file
  const content = JSON.stringify(stateToSave, null, 2);
  await fs.writeFile(tempPath, content, 'utf-8');

  // Atomic rename
  await fs.rename(tempPath, statePath);
}

/**
 * Delete project state
 *
 * @param projectDir - The project root directory
 * @returns True if state was deleted
 */
export async function deleteState(projectDir: string): Promise<boolean> {
  try {
    const statePath = getStatePath(projectDir);
    await fs.unlink(statePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Create a backup of the current state
 *
 * @param projectDir - The project root directory
 * @returns The backup file path or null if no state exists
 */
export async function backupState(projectDir: string): Promise<string | null> {
  const state = await loadState(projectDir);

  if (!state) {
    return null;
  }

  const stateDir = getStateDir(projectDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(stateDir, `state.backup.${timestamp}.json`);

  const content = JSON.stringify(state, null, 2);
  await fs.writeFile(backupPath, content, 'utf-8');

  return backupPath;
}

/**
 * List all state backups
 *
 * @param projectDir - The project root directory
 * @returns List of backup file paths
 */
export async function listBackups(projectDir: string): Promise<string[]> {
  try {
    const stateDir = getStateDir(projectDir);
    const files = await fs.readdir(stateDir);

    return files
      .filter((f) => f.startsWith('state.backup.') && f.endsWith('.json'))
      .map((f) => path.join(stateDir, f))
      .sort()
      .reverse(); // Most recent first
  } catch {
    return [];
  }
}

/**
 * Restore state from a backup
 *
 * @param backupPath - Path to the backup file
 * @param projectDir - The project root directory
 */
export async function restoreFromBackup(
  backupPath: string,
  projectDir: string
): Promise<ProjectState> {
  const content = await fs.readFile(backupPath, 'utf-8');
  const data = JSON.parse(content);

  const result = ProjectStateSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid backup file: ${result.error.message}`);
  }

  await saveState(projectDir, result.data);
  return result.data;
}

/**
 * Clean up old backups, keeping only the most recent N
 *
 * @param projectDir - The project root directory
 * @param keepCount - Number of backups to keep (default 5)
 */
export async function cleanupBackups(projectDir: string, keepCount: number = 5): Promise<void> {
  const backups = await listBackups(projectDir);

  if (backups.length <= keepCount) {
    return;
  }

  // Delete old backups
  const toDelete = backups.slice(keepCount);
  await Promise.all(toDelete.map((backup) => fs.unlink(backup)));
}
