/**
 * Upgrade path handlers
 * Implements specific upgrade transitions between project types
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OutputLanguage, ProjectSpec } from '../types/project.js';
import { generateWebsiteProject } from '../generators/website.js';
import { generatePythonProject } from '../generators/python.js';
import { generateTypeScriptProject } from '../generators/typescript.js';
import {
  generateAllWorkspaceJson,
  generateRootPackageJson,
  generateAllDockerCompose,
  generateDesignTokensPackage,
  generateUiPackage,
} from '../generators/all.js';
import {
  generateWorkspaceJson,
  generateRootDockerCompose,
} from '../generators/templates/fullstack.js';
import { loadState, saveState } from '../state/persistence.js';
import type { UpgradeResult } from './index.js';

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
 * Update state.json language field
 *
 * @param projectDir - Project directory
 * @param newLanguage - New language value
 */
export async function updateStateLanguage(
  projectDir: string,
  newLanguage: OutputLanguage,
): Promise<void> {
  const state = await loadState(projectDir);
  if (state) {
    state.language = newLanguage;
    await saveState(projectDir, state);
  }
}

/**
 * Update popeye.md language field
 *
 * @param projectDir - Project directory
 * @param newLanguage - New language value
 */
export async function updatePopeyeLanguage(
  projectDir: string,
  newLanguage: OutputLanguage,
): Promise<void> {
  const configPath = path.join(projectDir, 'popeye.md');
  try {
    let content = await fs.readFile(configPath, 'utf-8');
    content = content.replace(
      /language:\s*.+/,
      `language: ${newLanguage}`,
    );
    await fs.writeFile(configPath, content, 'utf-8');
  } catch {
    // popeye.md doesn't exist, skip
  }
}

/**
 * Update workspace.json for target language (idempotent)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param targetLanguage - Target language
 */
export async function updateWorkspaceJson(
  projectDir: string,
  projectName: string,
  targetLanguage: OutputLanguage,
): Promise<void> {
  const workspacePath = path.join(projectDir, '.popeye', 'workspace.json');
  await ensureDir(path.dirname(workspacePath));

  if (targetLanguage === 'all') {
    const content = generateAllWorkspaceJson(projectName);
    await fs.writeFile(workspacePath, content, 'utf-8');
  } else if (targetLanguage === 'fullstack') {
    const content = JSON.stringify(generateWorkspaceJson(projectName), null, 2);
    await fs.writeFile(workspacePath, content, 'utf-8');
  }
}

/**
 * Update root package.json workspaces (idempotent)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param targetLanguage - Target language
 */
export async function updateRootPackageJson(
  projectDir: string,
  projectName: string,
  targetLanguage: OutputLanguage,
): Promise<void> {
  const pkgPath = path.join(projectDir, 'package.json');

  if (targetLanguage === 'all') {
    await fs.writeFile(pkgPath, generateRootPackageJson(projectName), 'utf-8');
  } else {
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      if (!pkg.workspaces) {
        pkg.workspaces = ['apps/*'];
      } else if (!pkg.workspaces.includes('apps/*')) {
        pkg.workspaces.push('apps/*');
      }
      pkg.private = true;
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
    } catch {
      const pkg = {
        name: `@${projectName}/root`,
        private: true,
        workspaces: ['apps/*'],
      };
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
    }
  }
}

/**
 * Update docker-compose.yml (idempotent)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param targetLanguage - Target language
 */
export async function updateDockerCompose(
  projectDir: string,
  projectName: string,
  targetLanguage: OutputLanguage,
): Promise<void> {
  const content = targetLanguage === 'all'
    ? generateAllDockerCompose(projectName)
    : targetLanguage === 'fullstack'
      ? generateRootDockerCompose(projectName)
      : null;

  if (content) {
    await fs.writeFile(path.join(projectDir, 'docker-compose.yml'), content, 'utf-8');
    await ensureDir(path.join(projectDir, 'infra', 'docker'));
    await fs.writeFile(
      path.join(projectDir, 'infra', 'docker', 'docker-compose.yml'),
      content,
      'utf-8',
    );
  }
}

/**
 * Generate shared packages for 'all' projects (idempotent)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @returns List of created files
 */
export async function generateSharedPackages(
  projectDir: string,
  projectName: string,
): Promise<string[]> {
  const filesCreated: string[] = [];

  const tokensDir = path.join(projectDir, 'packages', 'design-tokens');
  if (!(await pathExists(tokensDir))) {
    const designTokens = generateDesignTokensPackage(projectName);
    for (const file of designTokens.files) {
      const filePath = path.join(tokensDir, file.path);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content, 'utf-8');
      filesCreated.push(filePath);
    }
  }

  const uiDir = path.join(projectDir, 'packages', 'ui');
  if (!(await pathExists(uiDir))) {
    const uiPackage = generateUiPackage(projectName);
    for (const file of uiPackage.files) {
      const filePath = path.join(uiDir, file.path);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content, 'utf-8');
      filesCreated.push(filePath);
    }
  }

  const contractsDir = path.join(projectDir, 'packages', 'contracts');
  if (!(await pathExists(contractsDir))) {
    await ensureDir(contractsDir);
    await fs.writeFile(path.join(contractsDir, '.gitkeep'), '', 'utf-8');
    filesCreated.push(path.join(contractsDir, '.gitkeep'));
  }

  return filesCreated;
}

/**
 * Initialize plan storage directories for new apps
 *
 * @param projectDir - Project directory
 * @param newApps - New app types
 */
export async function initPlanStorageDirs(
  projectDir: string,
  newApps: string[],
): Promise<void> {
  const docsDir = path.join(projectDir, 'docs');
  await ensureDir(docsDir);
  await ensureDir(path.join(docsDir, 'plans'));
  await ensureDir(path.join(docsDir, 'tests'));

  for (const app of newApps) {
    await ensureDir(path.join(docsDir, 'plans', app));
    await ensureDir(path.join(docsDir, 'tests', app));
  }
}

/**
 * Move directory contents to a new location, excluding infrastructure dirs
 *
 * @param src - Source directory
 * @param dest - Destination directory
 * @param excludeDirs - Additional directories to exclude
 * @returns List of moved items
 */
export async function moveDirectoryContents(
  src: string,
  dest: string,
  excludeDirs: string[] = [],
): Promise<string[]> {
  const moved: string[] = [];
  await ensureDir(dest);

  const entries = await fs.readdir(src, { withFileTypes: true });
  const excludeSet = new Set([
    ...excludeDirs,
    'node_modules', '.git', '__pycache__', 'apps', 'packages',
    '.popeye', 'docs', 'popeye.md',
  ]);

  for (const entry of entries) {
    if (excludeSet.has(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    await fs.rename(srcPath, destPath);
    moved.push(`${entry.name} -> ${path.relative(src, destPath)}`);
  }

  return moved;
}

/**
 * Perform fullstack -> all upgrade
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @returns Upgrade result
 */
export async function upgradeFullstackToAll(
  projectDir: string,
  projectName: string,
): Promise<UpgradeResult> {
  const filesCreated: string[] = [];

  const websiteDir = path.join(projectDir, 'apps', 'website');
  if (!(await pathExists(websiteDir))) {
    const spec: ProjectSpec = {
      idea: 'Marketing website',
      name: projectName,
      language: 'all',
      openaiModel: 'gpt-4o',
    };

    const result = await generateWebsiteProject(spec, projectDir, {
      baseDir: websiteDir,
      workspaceMode: true,
      skipDocker: true,
      skipReadme: true,
    });

    if (!result.success) {
      return {
        success: false, from: 'fullstack', to: 'all',
        filesCreated, filesMoved: [],
        error: result.error || 'Failed to generate website app',
      };
    }
    filesCreated.push(...result.filesCreated);
  }

  const sharedFiles = await generateSharedPackages(projectDir, projectName);
  filesCreated.push(...sharedFiles);

  await updateWorkspaceJson(projectDir, projectName, 'all');
  await updateRootPackageJson(projectDir, projectName, 'all');
  await updateDockerCompose(projectDir, projectName, 'all');
  await updateStateLanguage(projectDir, 'all');
  await updatePopeyeLanguage(projectDir, 'all');
  await initPlanStorageDirs(projectDir, ['website']);

  return { success: true, from: 'fullstack', to: 'all', filesCreated, filesMoved: [] };
}

/**
 * Perform single-app to fullstack upgrade (requires restructure)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param from - Current language
 * @returns Upgrade result
 */
export async function upgradeSingleToFullstack(
  projectDir: string,
  projectName: string,
  from: OutputLanguage,
): Promise<UpgradeResult> {
  const filesCreated: string[] = [];
  const filesMoved: string[] = [];

  await ensureDir(path.join(projectDir, 'apps'));

  if (from === 'python') {
    const backendDir = path.join(projectDir, 'apps', 'backend');
    if (!(await pathExists(backendDir))) {
      const moved = await moveDirectoryContents(projectDir, backendDir);
      filesMoved.push(...moved);
    }

    const frontendDir = path.join(projectDir, 'apps', 'frontend');
    if (!(await pathExists(frontendDir))) {
      const spec: ProjectSpec = {
        idea: 'Frontend application', name: projectName,
        language: 'fullstack', openaiModel: 'gpt-4o',
      };
      const result = await generateTypeScriptProject(spec, path.join(projectDir, 'apps'), {
        baseDir: frontendDir,
      });
      if (result.success) filesCreated.push(...result.filesCreated);
    }
  } else if (from === 'typescript') {
    const frontendDir = path.join(projectDir, 'apps', 'frontend');
    if (!(await pathExists(frontendDir))) {
      const moved = await moveDirectoryContents(projectDir, frontendDir);
      filesMoved.push(...moved);
    }

    const backendDir = path.join(projectDir, 'apps', 'backend');
    if (!(await pathExists(backendDir))) {
      const spec: ProjectSpec = {
        idea: 'Backend API', name: projectName,
        language: 'fullstack', openaiModel: 'gpt-4o',
      };
      const result = await generatePythonProject(spec, path.join(projectDir, 'apps'), {
        baseDir: backendDir,
      });
      if (result.success) filesCreated.push(...result.filesCreated);
    }
  }

  await updateWorkspaceJson(projectDir, projectName, 'fullstack');
  await updateRootPackageJson(projectDir, projectName, 'fullstack');
  await updateDockerCompose(projectDir, projectName, 'fullstack');
  await updateStateLanguage(projectDir, 'fullstack');
  await updatePopeyeLanguage(projectDir, 'fullstack');
  await initPlanStorageDirs(projectDir, ['frontend', 'backend']);

  return { success: true, from, to: 'fullstack', filesCreated, filesMoved };
}

/**
 * Perform single-app to all upgrade (delegates to fullstack then all)
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param from - Current language
 * @returns Upgrade result
 */
export async function upgradeSingleToAll(
  projectDir: string,
  projectName: string,
  from: OutputLanguage,
): Promise<UpgradeResult> {
  const fsResult = await upgradeSingleToFullstack(projectDir, projectName, from);
  if (!fsResult.success) return { ...fsResult, to: 'all' };

  const allResult = await upgradeFullstackToAll(projectDir, projectName);
  return {
    success: allResult.success, from, to: 'all',
    filesCreated: [...fsResult.filesCreated, ...allResult.filesCreated],
    filesMoved: fsResult.filesMoved,
    error: allResult.error,
  };
}

/**
 * Perform website -> all upgrade
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @returns Upgrade result
 */
export async function upgradeWebsiteToAll(
  projectDir: string,
  projectName: string,
): Promise<UpgradeResult> {
  const filesCreated: string[] = [];
  const filesMoved: string[] = [];

  await ensureDir(path.join(projectDir, 'apps'));
  const websiteDir = path.join(projectDir, 'apps', 'website');
  if (!(await pathExists(websiteDir))) {
    const moved = await moveDirectoryContents(projectDir, websiteDir);
    filesMoved.push(...moved);
  }

  const frontendDir = path.join(projectDir, 'apps', 'frontend');
  if (!(await pathExists(frontendDir))) {
    const spec: ProjectSpec = {
      idea: 'Frontend application', name: projectName,
      language: 'all', openaiModel: 'gpt-4o',
    };
    const result = await generateTypeScriptProject(spec, path.join(projectDir, 'apps'), {
      baseDir: frontendDir,
    });
    if (result.success) filesCreated.push(...result.filesCreated);
  }

  const backendDir = path.join(projectDir, 'apps', 'backend');
  if (!(await pathExists(backendDir))) {
    const spec: ProjectSpec = {
      idea: 'Backend API', name: projectName,
      language: 'all', openaiModel: 'gpt-4o',
    };
    const result = await generatePythonProject(spec, path.join(projectDir, 'apps'), {
      baseDir: backendDir,
    });
    if (result.success) filesCreated.push(...result.filesCreated);
  }

  const sharedFiles = await generateSharedPackages(projectDir, projectName);
  filesCreated.push(...sharedFiles);

  await updateWorkspaceJson(projectDir, projectName, 'all');
  await updateRootPackageJson(projectDir, projectName, 'all');
  await updateDockerCompose(projectDir, projectName, 'all');
  await updateStateLanguage(projectDir, 'all');
  await updatePopeyeLanguage(projectDir, 'all');
  await initPlanStorageDirs(projectDir, ['frontend', 'backend', 'website']);

  return { success: true, from: 'website', to: 'all', filesCreated, filesMoved };
}
