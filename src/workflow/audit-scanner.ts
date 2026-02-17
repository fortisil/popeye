/**
 * Deterministic project scanner for the audit system.
 *
 * Scans the filesystem to detect workspace composition, per-component structure,
 * dependency manifests, route files, LOC, and FE<->BE wiring mismatches.
 * Reads docs in priority order: CLAUDE.md -> README.md -> other docs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isWorkspace, type OutputLanguage } from '../types/project.js';
import type {
  ComponentKind,
  ComponentScan,
  DependencyManifest,
  FileEntry,
  FileExcerpt,
  ProjectScanResult,
  WiringMatrix,
  WiringMismatch,
} from '../types/audit.js';

// ---------------------------------------------------------------------------
// Constants (mirrors project-structure.ts patterns)
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv',
  '.next', '.turbo', '.cache', 'coverage', 'out', '.vercel', '.popeye',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /test_.*\.py$/,
  /.*_test\.py$/,
  /tests?\/.*\.[jt]sx?$/,
  /tests?\/.*\.py$/,
];

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  '.env.example', '.env.local.example', '.eslintrc.json', '.eslintrc.js',
  'jest.config.ts', 'jest.config.js', 'vitest.config.ts',
]);

const FE_API_ENV_PATTERNS = [
  /^VITE_API_URL$/i,
  /^NEXT_PUBLIC_API_URL$/i,
  /^REACT_APP_API_URL$/i,
  /^VITE_API_BASE_URL$/i,
  /^NEXT_PUBLIC_API_BASE_URL$/i,
  /^VITE_BACKEND_URL$/i,
  /^NEXT_PUBLIC_BACKEND_URL$/i,
];

const MAX_TREE_ENTRIES = 50;
const MAX_FILE_EXCERPT = 2000;
const MAX_DOC_READ = 8000;

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

/**
 * Check if a path exists on the filesystem.
 *
 * @param p - Path to check.
 * @returns True if the path exists.
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file and return its content, truncated to maxLen.
 *
 * @param filePath - Absolute file path.
 * @param maxLen - Maximum characters to return.
 * @returns File content string, or undefined if unreadable.
 */
async function safeRead(filePath: string, maxLen = MAX_DOC_READ): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.length > maxLen ? content.slice(0, maxLen) + '\n... (truncated)' : content;
  } catch {
    return undefined;
  }
}

/**
 * Count lines in a file.
 *
 * @param filePath - Absolute file path.
 * @returns Number of lines, or 0 on error.
 */
async function countFileLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Check if a relative path matches test file patterns.
 *
 * @param relPath - Relative file path.
 * @returns True if the path looks like a test file.
 */
function isTestFile(relPath: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(relPath));
}

// ---------------------------------------------------------------------------
// Recursive directory walker
// ---------------------------------------------------------------------------

interface WalkEntry {
  relativePath: string;
  absolutePath: string;
  isDir: boolean;
}

/**
 * Recursively walk a directory, yielding files and subdirectories.
 *
 * @param rootDir - Root directory to walk.
 * @param maxDepth - Maximum recursion depth.
 * @returns Array of WalkEntry objects.
 */
async function walkDir(rootDir: string, maxDepth = 8): Promise<WalkEntry[]> {
  const results: WalkEntry[] = [];

  async function recurse(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(rootDir, abs);
      results.push({ relativePath: rel, absolutePath: abs, isDir: entry.isDirectory() });
      if (entry.isDirectory()) {
        await recurse(abs, depth + 1);
      }
    }
  }

  await recurse(rootDir, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Workspace composition detection
// ---------------------------------------------------------------------------

/**
 * Detect workspace composition from the filesystem.
 *
 * Examines directory structure for signals of frontend, backend, website,
 * shared, and infra components. Does NOT trust state.language — derives
 * composition purely from filesystem evidence.
 *
 * @param projectDir - Project root directory.
 * @returns Array of detected ComponentKind values.
 */
export async function detectWorkspaceComposition(
  projectDir: string
): Promise<ComponentKind[]> {
  const kinds: ComponentKind[] = [];

  // Reason: Check apps/ subdirectories as primary workspace signal
  const appsDir = path.join(projectDir, 'apps');
  const appsExists = await pathExists(appsDir);

  if (appsExists) {
    // Frontend signals
    const feDirs = ['apps/frontend', 'apps/web', 'apps/client'];
    for (const d of feDirs) {
      if (await pathExists(path.join(projectDir, d, 'package.json'))) {
        kinds.push('frontend');
        break;
      }
    }

    // Backend signals
    const beDirs = ['apps/backend', 'apps/api', 'apps/server'];
    for (const d of beDirs) {
      const hasPy = await pathExists(path.join(projectDir, d, 'requirements.txt'))
        || await pathExists(path.join(projectDir, d, 'pyproject.toml'));
      const hasNode = await pathExists(path.join(projectDir, d, 'package.json'));
      if (hasPy || hasNode) {
        kinds.push('backend');
        break;
      }
    }

    // Website signals
    const webDirs = ['apps/website', 'apps/landing'];
    for (const d of webDirs) {
      if (await pathExists(path.join(projectDir, d))) {
        kinds.push('website');
        break;
      }
    }
  } else {
    // Non-workspace: single-component project
    const hasPkgJson = await pathExists(path.join(projectDir, 'package.json'));
    const hasPyProject = await pathExists(path.join(projectDir, 'requirements.txt'))
      || await pathExists(path.join(projectDir, 'pyproject.toml'));

    if (hasPkgJson && hasPyProject) {
      kinds.push('frontend', 'backend');
    } else if (hasPkgJson) {
      kinds.push('frontend');
    } else if (hasPyProject) {
      kinds.push('backend');
    }
  }

  // Shared directory
  if (await pathExists(path.join(projectDir, 'packages'))
    || await pathExists(path.join(projectDir, 'libs'))
    || await pathExists(path.join(projectDir, 'shared'))) {
    kinds.push('shared');
  }

  // Infra signals
  if (await pathExists(path.join(projectDir, 'infra'))
    || await pathExists(path.join(projectDir, 'docker-compose.yml'))
    || await pathExists(path.join(projectDir, 'docker-compose.yaml'))
    || await pathExists(path.join(projectDir, 'Dockerfile'))) {
    kinds.push('infra');
  }

  return kinds;
}

// ---------------------------------------------------------------------------
// Per-component scanning
// ---------------------------------------------------------------------------

/**
 * Detect the likely framework from a package.json or file structure.
 *
 * @param componentDir - Component root directory.
 * @returns Framework name or undefined.
 */
async function detectFramework(componentDir: string): Promise<string | undefined> {
  try {
    const pkgPath = path.join(componentDir, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps['next']) return 'next';
    if (allDeps['@remix-run/react']) return 'remix';
    if (allDeps['react']) return 'react';
    if (allDeps['vue']) return 'vue';
    if (allDeps['svelte']) return 'svelte';
    if (allDeps['express']) return 'express';
    if (allDeps['fastify']) return 'fastify';
    if (allDeps['hono']) return 'hono';
  } catch {
    // No package.json or unparseable
  }

  // Python framework detection
  try {
    const reqPath = path.join(componentDir, 'requirements.txt');
    const content = await fs.readFile(reqPath, 'utf-8');
    if (/fastapi/i.test(content)) return 'fastapi';
    if (/django/i.test(content)) return 'django';
    if (/flask/i.test(content)) return 'flask';
  } catch {
    // No requirements.txt
  }

  return undefined;
}

/**
 * Scan a single component directory for files, routes, entry points, and deps.
 *
 * @param componentDir - Absolute path to component root.
 * @param kind - Component kind.
 * @param language - Language hint (e.g., 'typescript', 'python').
 * @returns ComponentScan result.
 */
export async function scanComponent(
  componentDir: string,
  kind: ComponentKind,
  language: 'typescript' | 'python' | 'mixed',
  projectDir?: string
): Promise<ComponentScan> {
  const entries = await walkDir(componentDir);
  const sourceFiles: FileEntry[] = [];
  const testFiles: FileEntry[] = [];
  const entryPoints: string[] = [];
  const routeFiles: string[] = [];
  const depManifests: DependencyManifest[] = [];

  for (const entry of entries) {
    if (entry.isDir) continue;
    const ext = path.extname(entry.relativePath);

    if (SOURCE_EXTENSIONS.has(ext)) {
      const fe: FileEntry = { path: entry.relativePath, extension: ext };

      if (isTestFile(entry.relativePath)) {
        testFiles.push(fe);
      } else {
        sourceFiles.push(fe);
      }

      // Entry point detection
      const base = path.basename(entry.relativePath);
      if (['main.ts', 'main.tsx', 'index.ts', 'index.tsx', 'app.ts', 'app.tsx',
        'main.py', 'app.py', 'server.ts', 'server.js'].includes(base)) {
        entryPoints.push(entry.relativePath);
      }

      // Route file detection
      if (/route[rs]?\.[jt]sx?$/i.test(base)
        || /router\.[jt]sx?$/i.test(base)
        || entry.relativePath.includes('/routes/')
        || entry.relativePath.includes('/api/')
        || /urls\.py$/.test(base)
        || /routes\.py$/.test(base)
        || /router\.py$/.test(base)) {
        routeFiles.push(entry.relativePath);
      }
    }

    // Dependency manifests
    const baseName = path.basename(entry.relativePath);
    if (baseName === 'package.json' && !entry.relativePath.includes('node_modules')) {
      depManifests.push(await parseDependencyFile(entry.absolutePath, 'package.json'));
    } else if (baseName === 'requirements.txt') {
      depManifests.push(await parseDependencyFile(entry.absolutePath, 'requirements.txt'));
    } else if (baseName === 'pyproject.toml') {
      depManifests.push(await parseDependencyFile(entry.absolutePath, 'pyproject.toml'));
    }
  }

  // Reason: rootDir must be relative to the project root for correct LOC path resolution.
  // Using parent dir gives just "frontend" instead of "apps/frontend".
  const rootDir = projectDir
    ? (path.relative(projectDir, componentDir) || '.')
    : (path.relative(path.dirname(componentDir), componentDir) || '.');
  const framework = await detectFramework(componentDir);

  return {
    kind,
    rootDir,
    language,
    framework,
    entryPoints,
    routeFiles,
    testFiles,
    sourceFiles,
    dependencyManifests: depManifests,
  };
}

// ---------------------------------------------------------------------------
// Dependency parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single dependency manifest file.
 *
 * @param filePath - Absolute path to the file.
 * @param type - Manifest type.
 * @returns DependencyManifest with parsed dependencies.
 */
async function parseDependencyFile(
  filePath: string,
  type: DependencyManifest['type']
): Promise<DependencyManifest> {
  const relPath = path.basename(filePath);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (type === 'package.json') {
      const pkg = JSON.parse(content);
      return {
        file: relPath,
        type,
        dependencies: pkg.dependencies ?? {},
        devDependencies: pkg.devDependencies ?? {},
      };
    }
    if (type === 'requirements.txt') {
      const deps: Record<string, string> = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~].+)?$/);
        if (match) {
          deps[match[1]] = match[2] ?? '*';
        }
      }
      return { file: relPath, type, dependencies: deps };
    }
    // pyproject.toml — simplified parsing
    return { file: relPath, type: 'pyproject.toml' };
  } catch {
    return { file: relPath, type };
  }
}

/**
 * Parse all dependency manifests found in the project.
 *
 * @param projectDir - Project root directory.
 * @param language - Project language.
 * @returns Array of dependency manifests.
 */
export async function parseDependencies(
  projectDir: string,
  _language: string
): Promise<DependencyManifest[]> {
  const manifests: DependencyManifest[] = [];
  const entries = await walkDir(projectDir, 3);

  for (const entry of entries) {
    if (entry.isDir) continue;
    const base = path.basename(entry.relativePath);
    if (base === 'package.json' && !entry.relativePath.includes('node_modules')) {
      manifests.push(await parseDependencyFile(entry.absolutePath, 'package.json'));
    } else if (base === 'requirements.txt') {
      manifests.push(await parseDependencyFile(entry.absolutePath, 'requirements.txt'));
    } else if (base === 'pyproject.toml') {
      manifests.push(await parseDependencyFile(entry.absolutePath, 'pyproject.toml'));
    }
  }
  return manifests;
}

// ---------------------------------------------------------------------------
// Route file detection
// ---------------------------------------------------------------------------

/**
 * Find all route-like files in the project.
 *
 * @param projectDir - Project root directory.
 * @param language - Project language.
 * @returns Array of relative paths to route files.
 */
export async function findRouteFiles(
  projectDir: string,
  _language: string
): Promise<string[]> {
  const routes: string[] = [];
  const entries = await walkDir(projectDir);

  for (const entry of entries) {
    if (entry.isDir) continue;
    const base = path.basename(entry.relativePath);
    const rel = entry.relativePath;

    if (/route[rs]?\.[jt]sx?$/i.test(base)
      || /router\.[jt]sx?$/i.test(base)
      || rel.includes('/routes/')
      || rel.includes('/api/')
      || /urls\.py$/.test(base)
      || /routes\.py$/.test(base)
      || /router\.py$/.test(base)) {
      routes.push(rel);
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Priority doc reads
// ---------------------------------------------------------------------------

/**
 * Read project documentation in priority order: CLAUDE.md -> README.md -> docs.
 *
 * @param projectDir - Project root directory.
 * @returns Priority doc contents and docs index.
 */
export async function readPriorityDocs(projectDir: string): Promise<{
  claudeMd?: string;
  readme?: string;
  docsIndex: string[];
  keyFiles: FileExcerpt[];
}> {
  const docsIndex: string[] = [];
  const keyFiles: FileExcerpt[] = [];

  // 1. CLAUDE.md (highest priority)
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  const claudeMd = await safeRead(claudeMdPath);
  if (claudeMd) docsIndex.push('CLAUDE.md');

  // 2. README.md
  const readmePath = path.join(projectDir, 'README.md');
  const readme = await safeRead(readmePath);
  if (readme) docsIndex.push('README.md');

  // 3. Other root-level .md files (excluding README and CLAUDE)
  try {
    const rootEntries = await fs.readdir(projectDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile()
        && entry.name.endsWith('.md')
        && entry.name !== 'README.md'
        && entry.name !== 'CLAUDE.md') {
        docsIndex.push(entry.name);
        const content = await safeRead(path.join(projectDir, entry.name), MAX_FILE_EXCERPT);
        if (content) {
          keyFiles.push({ path: entry.name, content });
        }
      }
    }
  } catch {
    // Root dir read error
  }

  // 4. docs/ directory
  const docsDir = path.join(projectDir, 'docs');
  if (await pathExists(docsDir)) {
    const docEntries = await walkDir(docsDir, 3);
    for (const entry of docEntries) {
      if (!entry.isDir && entry.relativePath.endsWith('.md')) {
        const relFromRoot = path.join('docs', entry.relativePath);
        docsIndex.push(relFromRoot);
        const content = await safeRead(entry.absolutePath, MAX_FILE_EXCERPT);
        if (content) {
          keyFiles.push({ path: relFromRoot, content });
        }
      }
    }
  }

  return { claudeMd, readme, docsIndex, keyFiles };
}

// ---------------------------------------------------------------------------
// Wiring matrix (deterministic FE<->BE check)
// ---------------------------------------------------------------------------

/**
 * Build a wiring matrix from the project, checking FE<->BE env keys,
 * CORS origins, and API prefixes for mismatches.
 *
 * @param projectDir - Project root directory.
 * @param components - Already-scanned component list.
 * @returns WiringMatrix with detected mismatches.
 */
export async function buildWiringMatrix(
  projectDir: string,
  components: ComponentScan[]
): Promise<WiringMatrix> {
  const feApiKeys: string[] = [];
  let feApiResolved: string | undefined;
  let beCorsOrigins: string[] | undefined;
  let beApiPrefix: string | undefined;
  const mismatches: WiringMismatch[] = [];

  // Scan .env.example for FE API env keys
  const envFiles = ['.env.example', '.env.local.example', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(projectDir, envFile);
    const content = await safeRead(envPath, 4000);
    if (!content) continue;

    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (FE_API_ENV_PATTERNS.some((p) => p.test(key))) {
        feApiKeys.push(key);
        if (value && !feApiResolved) {
          feApiResolved = value.replace(/["']/g, '').trim();
        }
      }
    }
  }

  // Scan backend component files for CORS origins
  const beComponent = components.find((c) => c.kind === 'backend');
  if (beComponent) {
    const beDir = path.join(projectDir, beComponent.rootDir === '.' ? '' : beComponent.rootDir);
    const beEntries = await walkDir(beDir, 4);
    for (const entry of beEntries) {
      if (entry.isDir) continue;
      const ext = path.extname(entry.relativePath);
      if (!['.ts', '.js', '.py'].includes(ext)) continue;

      const content = await safeRead(entry.absolutePath, 6000);
      if (!content) continue;

      // CORS origins extraction
      const corsMatch = content.match(/cors.*origins?\s*[=:]\s*\[([^\]]+)\]/is);
      if (corsMatch) {
        beCorsOrigins = corsMatch[1]
          .split(',')
          .map((s) => s.replace(/["'`\s]/g, ''))
          .filter(Boolean);
      }

      // API prefix extraction
      const prefixMatch = content.match(/(?:prefix|api_prefix|apiPrefix)\s*[=:]\s*["'`]([^"'`]+)["'`]/i);
      if (prefixMatch) {
        beApiPrefix = prefixMatch[1];
      }
    }
  }

  // Detect mismatches
  if (feApiResolved && beCorsOrigins && beCorsOrigins.length > 0) {
    try {
      const feUrl = new URL(feApiResolved);
      const feOrigin = feUrl.origin;
      // Reason: Check if the frontend's expected API origin is in the backend's CORS list
      const corsHasFe = beCorsOrigins.some(
        (o) => o === '*' || o === feOrigin
      );
      if (!corsHasFe) {
        mismatches.push({
          type: 'cors-origin-mismatch',
          details: `Frontend expects API at ${feApiResolved} but backend CORS does not include origin ${feOrigin}`,
          evidence: [
            { file: '.env.example', snippet: `${feApiKeys[0]}=${feApiResolved}` },
          ],
        });
      }
    } catch {
      // Invalid URL in env — not a wiring mismatch
    }
  }

  return {
    frontendApiBaseEnvKeys: feApiKeys,
    frontendApiBaseResolved: feApiResolved,
    backendCorsOrigins: beCorsOrigins,
    backendApiPrefix: beApiPrefix,
    potentialMismatches: mismatches,
  };
}

// ---------------------------------------------------------------------------
// LOC counting
// ---------------------------------------------------------------------------

/**
 * Count lines of code and test code in the given file lists.
 *
 * @param sourceFiles - Array of source file entries.
 * @param testFiles - Array of test file entries.
 * @param projectDir - Project root for resolving paths.
 * @returns Total lines of code and test code.
 */
export async function countLines(
  sourceFiles: FileEntry[],
  testFiles: FileEntry[],
  projectDir: string
): Promise<{ code: number; tests: number }> {
  let code = 0;
  let tests = 0;

  const countBatch = async (files: FileEntry[], baseDir: string): Promise<number> => {
    let total = 0;
    for (const f of files) {
      total += await countFileLines(path.join(baseDir, f.path));
    }
    return total;
  };

  code = await countBatch(sourceFiles, projectDir);
  tests = await countBatch(testFiles, projectDir);
  return { code, tests };
}

// ---------------------------------------------------------------------------
// Tree builder
// ---------------------------------------------------------------------------

/**
 * Build a truncated tree string from the project directory.
 *
 * @param projectDir - Project root directory.
 * @returns Indented tree string.
 */
async function buildTree(projectDir: string): Promise<string> {
  const entries = await walkDir(projectDir, 3);
  const lines: string[] = [];

  for (const entry of entries) {
    if (lines.length >= MAX_TREE_ENTRIES) {
      lines.push(`... (+${entries.length - MAX_TREE_ENTRIES} more entries)`);
      break;
    }
    const depth = entry.relativePath.split(path.sep).length - 1;
    const indent = '  '.repeat(depth);
    const name = path.basename(entry.relativePath);
    lines.push(`${indent}${name}${entry.isDir ? '/' : ''}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

/**
 * Scan the entire project and produce a structured ProjectScanResult.
 *
 * @param projectDir - Project root directory.
 * @param language - Language from state.json.
 * @param onProgress - Optional progress callback.
 * @returns ProjectScanResult with all scan data.
 */
export async function scanProject(
  projectDir: string,
  language: string,
  onProgress?: (message: string) => void
): Promise<ProjectScanResult> {
  onProgress?.('Detecting workspace composition...');
  const detectedComposition = await detectWorkspaceComposition(projectDir);

  // Determine if state.language and detected composition agree
  const isWs = isWorkspace(language as OutputLanguage);
  const hasMultipleComponents = detectedComposition.filter(
    (k) => k !== 'shared' && k !== 'infra'
  ).length > 1;
  const compositionMismatch = isWs !== hasMultipleComponents;

  onProgress?.('Reading priority documentation...');
  const docs = await readPriorityDocs(projectDir);

  onProgress?.('Scanning components...');
  const components: ComponentScan[] = [];

  // Determine component language hint
  const langHint = (kind: ComponentKind): 'typescript' | 'python' | 'mixed' => {
    if (kind === 'backend' && ['python', 'fullstack', 'all'].includes(language)) return 'python';
    if (kind === 'frontend' || kind === 'website') return 'typescript';
    return 'mixed';
  };

  if (isWs) {
    // Workspace: scan each apps/ subdirectory
    const appDirMap: Record<string, string[]> = {
      frontend: ['apps/frontend', 'apps/web', 'apps/client'],
      backend: ['apps/backend', 'apps/api', 'apps/server'],
      website: ['apps/website', 'apps/landing'],
    };

    for (const kind of detectedComposition) {
      if (kind === 'shared' || kind === 'infra') continue;
      const candidates = appDirMap[kind] ?? [];
      for (const candidate of candidates) {
        const absCandidate = path.join(projectDir, candidate);
        if (await pathExists(absCandidate)) {
          components.push(
            await scanComponent(absCandidate, kind, langHint(kind), projectDir)
          );
          break;
        }
      }
    }
  } else {
    // Single-component project: scan root
    const kind = detectedComposition[0] ?? 'frontend';
    components.push(await scanComponent(projectDir, kind, langHint(kind), projectDir));
  }

  // Aggregate files from all components
  const allSource: FileEntry[] = [];
  const allTest: FileEntry[] = [];
  const allEntryPoints: string[] = [];
  const allRouteFiles: string[] = [];
  const allDeps: DependencyManifest[] = [];

  for (const comp of components) {
    // Reason: Component file paths are relative to the component dir.
    // For LOC counting, we need them relative to the project root.
    const prefix = comp.rootDir === '.' ? '' : comp.rootDir;
    const prefixPath = (p: string) => prefix ? path.join(prefix, p) : p;

    allSource.push(...comp.sourceFiles.map((f) => ({ ...f, path: prefixPath(f.path) })));
    allTest.push(...comp.testFiles.map((f) => ({ ...f, path: prefixPath(f.path) })));
    allEntryPoints.push(...comp.entryPoints.map(prefixPath));
    allRouteFiles.push(...comp.routeFiles.map(prefixPath));
    allDeps.push(...comp.dependencyManifests);
  }

  // Config files detection
  onProgress?.('Scanning config files...');
  const configFiles: string[] = [];
  try {
    const rootEntries = await fs.readdir(projectDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && CONFIG_FILES.has(entry.name)) {
        configFiles.push(entry.name);
      }
    }
  } catch {
    // Root dir error
  }

  // LOC counting
  onProgress?.('Counting lines of code...');
  const locResult = await countLines(allSource, allTest, projectDir);

  // Tree
  const tree = await buildTree(projectDir);

  // Config content reads
  const envExampleContent = await safeRead(path.join(projectDir, '.env.example'), 4000);
  const dockerComposeContent = await safeRead(
    path.join(projectDir, 'docker-compose.yml'),
    4000
  ) ?? await safeRead(path.join(projectDir, 'docker-compose.yaml'), 4000);

  // Wiring matrix
  onProgress?.('Building wiring matrix...');
  const hasFe = components.some((c) => c.kind === 'frontend');
  const hasBe = components.some((c) => c.kind === 'backend');
  const wiring = (hasFe && hasBe) ? await buildWiringMatrix(projectDir, components) : undefined;

  onProgress?.(`Scan complete: ${allSource.length} source files, ${locResult.code} LOC`);

  return {
    tree,
    components,
    detectedComposition,
    stateLanguage: language,
    compositionMismatch,
    sourceFiles: allSource,
    testFiles: allTest,
    configFiles,
    entryPoints: allEntryPoints,
    routeFiles: allRouteFiles,
    dependencies: allDeps,
    totalSourceFiles: allSource.length,
    totalTestFiles: allTest.length,
    totalLinesOfCode: locResult.code,
    totalLinesOfTests: locResult.tests,
    language,
    claudeMdContent: docs.claudeMd,
    readmeContent: docs.readme,
    docsIndex: docs.docsIndex,
    keyFileSnippets: docs.keyFiles,
    wiring,
    envExampleContent,
    dockerComposeContent,
  };
}
