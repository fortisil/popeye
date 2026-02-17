/**
 * Workspace root detection
 * Resolves the workspace root directory by walking up the directory tree,
 * looking for Popeye config, monorepo indicators, or package.json with workspaces
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Resolve the workspace root directory from a given working directory
 *
 * Heuristic priority:
 * 1. Walk ancestors: first dir containing `.popeye/` -> workspace root
 * 2. First dir containing `package.json` with "workspaces" field
 * 3. First dir containing `pnpm-workspace.yaml` or `turbo.json`
 * 4. `cwd` (fallback)
 *
 * @param cwd - The current working directory
 * @returns The resolved workspace root path
 */
export async function resolveWorkspaceRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  const root = path.parse(current).root;

  while (current !== root) {
    // Check for .popeye/ directory
    if (await dirExists(path.join(current, '.popeye'))) {
      return current;
    }

    // Check for package.json with "workspaces" field
    const pkgJsonPath = path.join(current, 'package.json');
    if (await fileExists(pkgJsonPath)) {
      try {
        const content = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        if (pkg.workspaces) {
          return current;
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Check for pnpm-workspace.yaml or turbo.json
    if (
      (await fileExists(path.join(current, 'pnpm-workspace.yaml'))) ||
      (await fileExists(path.join(current, 'turbo.json')))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  return cwd;
}

/**
 * Build a list of directories to scan for docs and brand assets
 * Includes workspace root, its parent, and relevant subdirectories
 *
 * @param cwd - The current working directory
 * @returns Array of directories to scan (deduplicated)
 */
export async function getScanDirectories(cwd: string): Promise<string[]> {
  const workspaceRoot = await resolveWorkspaceRoot(cwd);
  const parentDir = path.dirname(workspaceRoot);

  const candidates = [workspaceRoot, parentDir];
  const subdirs = ['docs', 'brand', 'assets'];

  for (const base of [workspaceRoot, parentDir]) {
    for (const sub of subdirs) {
      candidates.push(path.join(base, sub));
    }
  }

  // Deduplicate by resolved path and filter to existing directories
  const seen = new Set<string>();
  const result: string[] = [];

  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    if (await dirExists(resolved)) {
      result.push(resolved);
    }
  }

  return result;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
