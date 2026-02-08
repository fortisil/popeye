/**
 * Project type upgrade orchestrator
 * Handles transactional upgrades between project types with rollback support
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OutputLanguage } from '../types/project.js';
import { loadState } from '../state/persistence.js';
import { getTransitionDetails } from './transitions.js';
import type { UpgradeTransition } from './transitions.js';
import {
  upgradeFullstackToAll,
  upgradeSingleToFullstack,
  upgradeSingleToAll,
  upgradeWebsiteToAll,
} from './handlers.js';

/**
 * Result of an upgrade operation
 */
export interface UpgradeResult {
  success: boolean;
  from: OutputLanguage;
  to: OutputLanguage;
  filesCreated: string[];
  filesMoved: string[];
  error?: string;
}

/**
 * Backup entry for rollback
 */
interface BackupEntry {
  path: string;
  content: string;
}

/**
 * Create a directory if it doesn't exist
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Backup critical files for rollback
 *
 * @param projectDir - Project directory
 * @returns Array of backup entries
 */
async function createBackup(projectDir: string): Promise<BackupEntry[]> {
  const backups: BackupEntry[] = [];
  const filesToBackup = [
    '.popeye/state.json',
    '.popeye/workspace.json',
    'popeye.md',
    'package.json',
    'docker-compose.yml',
    'infra/docker/docker-compose.yml',
  ];

  for (const file of filesToBackup) {
    const filePath = path.join(projectDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      backups.push({ path: filePath, content });
    } catch {
      // File doesn't exist, skip
    }
  }

  return backups;
}

/**
 * Restore files from backup
 *
 * @param backups - Backup entries to restore
 */
async function restoreBackup(backups: BackupEntry[]): Promise<void> {
  for (const backup of backups) {
    await ensureDir(path.dirname(backup.path));
    await fs.writeFile(backup.path, backup.content, 'utf-8');
  }
}

/**
 * Validate the upgrade result by checking expected directories exist
 *
 * @param projectDir - Project directory
 * @param transition - Transition details
 * @returns Validation result
 */
async function validateUpgrade(
  projectDir: string,
  transition: UpgradeTransition,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check state.json is valid
  const state = await loadState(projectDir);
  if (!state) {
    issues.push('state.json is missing or invalid');
  } else if (state.language !== transition.to) {
    issues.push(`state.json language is '${state.language}', expected '${transition.to}'`);
  }

  // Check workspace.json exists for workspace types
  if (transition.to === 'fullstack' || transition.to === 'all') {
    const wsPath = path.join(projectDir, '.popeye', 'workspace.json');
    if (!(await pathExists(wsPath))) {
      issues.push('workspace.json is missing');
    }
  }

  // Check new app directories exist
  for (const app of transition.newApps) {
    const appDir = path.join(projectDir, 'apps', app);
    if (!(await pathExists(appDir))) {
      issues.push(`apps/${app}/ directory is missing`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Upgrade a project from one type to another
 * Transactional: creates backup, applies changes, validates, rolls back on failure
 *
 * @param projectDir - Project directory
 * @param targetLanguage - Target project language
 * @returns Upgrade result
 */
export async function upgradeProject(
  projectDir: string,
  targetLanguage: OutputLanguage,
): Promise<UpgradeResult> {
  // Load current state
  const state = await loadState(projectDir);
  if (!state) {
    return {
      success: false,
      from: 'python',
      to: targetLanguage,
      filesCreated: [],
      filesMoved: [],
      error: 'No project state found. Is this a Popeye project?',
    };
  }

  const currentLanguage = state.language;
  const transition = getTransitionDetails(currentLanguage, targetLanguage);

  if (!transition) {
    return {
      success: false,
      from: currentLanguage,
      to: targetLanguage,
      filesCreated: [],
      filesMoved: [],
      error: `Cannot upgrade from '${currentLanguage}' to '${targetLanguage}'`,
    };
  }

  const projectName = state.name || path.basename(projectDir);

  // Create backup for rollback
  const backups = await createBackup(projectDir);

  try {
    let result: UpgradeResult;

    // Dispatch to appropriate upgrade handler
    if (currentLanguage === 'fullstack' && targetLanguage === 'all') {
      result = await upgradeFullstackToAll(projectDir, projectName);
    } else if (currentLanguage === 'website' && targetLanguage === 'all') {
      result = await upgradeWebsiteToAll(projectDir, projectName);
    } else if (
      (currentLanguage === 'python' || currentLanguage === 'typescript') &&
      targetLanguage === 'fullstack'
    ) {
      result = await upgradeSingleToFullstack(projectDir, projectName, currentLanguage);
    } else if (
      (currentLanguage === 'python' || currentLanguage === 'typescript') &&
      targetLanguage === 'all'
    ) {
      result = await upgradeSingleToAll(projectDir, projectName, currentLanguage);
    } else {
      return {
        success: false,
        from: currentLanguage,
        to: targetLanguage,
        filesCreated: [],
        filesMoved: [],
        error: `Upgrade path '${currentLanguage}' -> '${targetLanguage}' is not implemented`,
      };
    }

    if (!result.success) {
      await restoreBackup(backups);
      return result;
    }

    // Validate
    const validation = await validateUpgrade(projectDir, transition);
    if (!validation.valid) {
      await restoreBackup(backups);
      return {
        success: false,
        from: currentLanguage,
        to: targetLanguage,
        filesCreated: result.filesCreated,
        filesMoved: result.filesMoved,
        error: `Validation failed: ${validation.issues.join(', ')}`,
      };
    }

    return result;
  } catch (error) {
    await restoreBackup(backups);
    return {
      success: false,
      from: currentLanguage,
      to: targetLanguage,
      filesCreated: [],
      filesMoved: [],
      error: error instanceof Error ? error.message : 'Unknown error during upgrade',
    };
  }
}
