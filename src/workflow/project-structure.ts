/**
 * Project structure scanner for build verification context enrichment
 * Scans project directory and returns a concise summary for embedding in AI prompts
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isWorkspace, languageToApps, type OutputLanguage } from '../types/project.js';

/**
 * Summary of a project's directory structure
 */
export interface ProjectStructureSummary {
  tree: string;
  fileCounts: Record<string, number>;
  appFileCounts?: Record<string, Record<string, number>>;
  workspaceApps: Array<{ name: string; path: string; exists: boolean }>;
  totalSourceFiles: number;
  tsconfigInfo?: string;
  formatted: string;
}

/** Directories to skip during scanning */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv',
  '.next', '.turbo', '.cache', 'coverage', 'out', '.vercel',
]);

/** Source file extensions to count */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);

/** Maximum tree entries before truncation */
const MAX_TREE_ENTRIES = 30;

/**
 * Recursively scan a directory up to a given depth, building a tree and counting files
 *
 * @param dir - Directory to scan
 * @param depth - Current recursion depth
 * @param maxDepth - Maximum depth to recurse
 * @returns Tree lines and file counts by extension
 */
async function scanDirectory(
  dir: string,
  depth: number,
  maxDepth: number
): Promise<{ lines: string[]; counts: Record<string, number> }> {
  const lines: string[] = [];
  const counts: Record<string, number> = {};

  if (depth > maxDepth) return { lines, counts };

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const sorted = entries.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (SKIP_DIRS.has(entry.name)) continue;

      const indent = '  '.repeat(depth);
      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`);
        const sub = await scanDirectory(path.join(dir, entry.name), depth + 1, maxDepth);
        lines.push(...sub.lines);
        for (const [ext, count] of Object.entries(sub.counts)) {
          counts[ext] = (counts[ext] || 0) + count;
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SOURCE_EXTENSIONS.has(ext)) {
          counts[ext] = (counts[ext] || 0) + 1;
        }
        lines.push(`${indent}${entry.name}`);
      }
    }
  } catch {
    // Directory access error - ignore
  }

  return { lines, counts };
}

/**
 * Count source files within a specific directory (shallow recursion, max 5 levels)
 *
 * @param dir - Directory to count files in
 * @returns File counts by extension
 */
async function countSourceFiles(dir: string): Promise<Record<string, number>> {
  const result = await scanDirectory(dir, 0, 5);
  return result.counts;
}

/**
 * Read and summarize tsconfig.json if present
 *
 * @param projectDir - Project root directory
 * @returns Brief tsconfig summary string or undefined
 */
async function summarizeTsconfig(projectDir: string): Promise<string | undefined> {
  try {
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    const content = await fs.readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);

    const parts: string[] = ['tsconfig: exists'];

    if (tsconfig.references) {
      parts.push(`references=${tsconfig.references.length}`);
    }
    if (tsconfig.include) {
      const includeStr = JSON.stringify(tsconfig.include);
      parts.push(`include=${includeStr.length > 60 ? includeStr.slice(0, 57) + '...' : includeStr}`);
    }
    if (tsconfig.exclude) {
      parts.push(`exclude=${tsconfig.exclude.length} entries`);
    }
    if (tsconfig.compilerOptions?.baseUrl) {
      parts.push(`baseUrl="${tsconfig.compilerOptions.baseUrl}"`);
    }
    if (tsconfig.compilerOptions?.paths) {
      parts.push('paths=true');
    }

    return parts.join(', ');
  } catch {
    return undefined;
  }
}

/**
 * Scan a project directory and return a concise summary for embedding in AI prompts
 *
 * @param projectDir - Root directory of the project
 * @param language - Project language type
 * @returns Project structure summary with tree, counts, and formatted string
 */
export async function getProjectStructureSummary(
  projectDir: string,
  language: string
): Promise<ProjectStructureSummary> {
  // Scan directory tree (max 3 levels deep)
  const { lines: treeLines, counts: fileCounts } = await scanDirectory(projectDir, 0, 3);

  // Truncate tree if too large
  let tree: string;
  if (treeLines.length > MAX_TREE_ENTRIES) {
    const extra = treeLines.length - MAX_TREE_ENTRIES;
    tree = treeLines.slice(0, MAX_TREE_ENTRIES).join('\n') + `\n... (+${extra} more)`;
  } else {
    tree = treeLines.join('\n');
  }

  const totalSourceFiles = Object.values(fileCounts).reduce((sum, c) => sum + c, 0);

  // Workspace app detection
  const workspaceApps: ProjectStructureSummary['workspaceApps'] = [];
  let appFileCounts: Record<string, Record<string, number>> | undefined;

  if (isWorkspace(language as OutputLanguage)) {
    const apps = languageToApps(language as OutputLanguage);
    appFileCounts = {};

    for (const appType of apps) {
      const appPath = path.join('apps', appType);
      const absolutePath = path.join(projectDir, appPath);
      let exists = false;
      try {
        await fs.access(absolutePath);
        exists = true;
      } catch {
        // App directory doesn't exist
      }
      workspaceApps.push({ name: appType, path: appPath, exists });

      if (exists) {
        appFileCounts[appType] = await countSourceFiles(absolutePath);
      }
    }
  }

  // tsconfig awareness
  const tsconfigInfo = await summarizeTsconfig(projectDir);

  // Assemble formatted summary
  const formattedParts: string[] = [];
  formattedParts.push(`Source files: ${totalSourceFiles} total`);

  const countEntries = Object.entries(fileCounts).filter(([, c]) => c > 0);
  if (countEntries.length > 0) {
    formattedParts.push(`Extensions: ${countEntries.map(([ext, c]) => `${ext}=${c}`).join(', ')}`);
  }

  if (workspaceApps.length > 0) {
    const appSummary = workspaceApps
      .map(a => `${a.name}: ${a.exists ? 'exists' : 'MISSING'}`)
      .join(', ');
    formattedParts.push(`Workspace apps: ${appSummary}`);

    if (appFileCounts) {
      for (const [appName, counts] of Object.entries(appFileCounts)) {
        const appCountStr = Object.entries(counts)
          .filter(([, c]) => c > 0)
          .map(([ext, c]) => `${ext}=${c}`)
          .join(', ');
        if (appCountStr) {
          formattedParts.push(`  ${appName}: ${appCountStr}`);
        }
      }
    }
  }

  if (tsconfigInfo) {
    formattedParts.push(tsconfigInfo);
  }

  const formatted = formattedParts.join('\n');

  return {
    tree,
    fileCounts,
    appFileCounts,
    workspaceApps,
    totalSourceFiles,
    tsconfigInfo,
    formatted,
  };
}
